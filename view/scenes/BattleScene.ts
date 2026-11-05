/**
 * 战斗场景：只做「状态 → 视图」的适配。
 * 规则全部在 engine/**；这里负责相机、输入、粒子、音效、HUD 同步。
 */

import Phaser from 'phaser';
import { AIM, SIM, WORLD } from '../../config/game.const';
import { HERO_BY_ID, WEAPON_DEFS } from '../../config/roster';
import { getMap } from '../../config/maps';
import { chooseCommand } from '../../engine/ai';
import type { Event } from '../../engine/events';
import { simulateShot } from '../../engine/projectile';
import { step } from '../../engine/sim';
import { snapshotBattle } from '../../engine/snapshot';
import { activeUnit, type SimState } from '../../engine/state';
import { computeAim } from '../aim';
import type { BattleSetup } from '../../progress/economy';
import type { AppContext } from '../app-context';
import { CameraShake } from '../render/CameraShake';
import { Fx } from '../render/Fx';
import { TerrainSprite } from '../render/TerrainSprite';
import { UnitView } from '../render/UnitView';
import type { OverlayScene } from './OverlayScene';

const FONT = 'system-ui, -apple-system, "Noto Sans SC", sans-serif';

export interface BattleSceneData {
  state: SimState;
  setup: BattleSetup;
}

interface UnitMove {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  dur: number;
}

export class BattleScene extends Phaser.Scene {
  private state!: SimState;
  private setup!: BattleSetup;
  private terrainSprite!: TerrainSprite;
  private unitViews = new Map<string, UnitView>();
  private fx!: Fx;
  private shake!: CameraShake;
  private overlay!: OverlayScene;
  private aimG!: Phaser.GameObjects.Graphics;
  private projG!: Phaser.GameObjects.Graphics;
  private aimText!: Phaser.GameObjects.Text;
  private activeG!: Phaser.GameObjects.Graphics;
  private trails = new Map<number, { x: number; y: number }[]>();
  private moves = new Map<string, UnitMove>();
  private accum = 0;
  private aiDelay = 0;
  private hitStop = 0;
  private aiming = false;
  private aimPointerId = -1;
  private aimAngle = 45;
  private aimPower = 0.6;
  private dragStartX = 0;
  private dragStartY = 0;
  private finished = false;
  private resultTimer: Phaser.Time.TimerEvent | null = null;

  constructor(private app: AppContext) {
    super('BattleScene');
  }

  init(data: BattleSceneData): void {
    this.state = data.state;
    this.setup = data.setup;
    this.unitViews = new Map();
    this.trails = new Map();
    this.moves = new Map();
    this.accum = 0;
    this.aiDelay = 0;
    this.aiming = false;
    this.aimPointerId = -1;
    this.finished = false;
    this.resultTimer = null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#070b16');
    this.add.image(0, 0, 'sky').setOrigin(0, 0).setDepth(-10);

    this.terrainSprite = new TerrainSprite(this, this.state.terrain, 'terrain', getMap(this.state.mapId).colors);
    for (const u of this.state.units) this.unitViews.set(u.id, new UnitView(this, u));

    this.fx = new Fx(this, this.app.quality());
    this.shake = new CameraShake(this, this.app.quality());
    this.shake.setEnabled(this.app.shakeEnabled());

    this.aimG = this.add.graphics().setDepth(20);
    this.activeG = this.add.graphics().setDepth(11);
    this.projG = this.add.graphics().setDepth(21);
    this.aimText = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffe9b0',
        stroke: '#0a0f1e',
        strokeThickness: 3,
        align: 'center',
      })
      .setDepth(22)
      .setOrigin(0.5, 1)
      .setVisible(false);

    this.scene.launch('OverlayScene');
    this.overlay = this.scene.get('OverlayScene') as OverlayScene;

    this.app.hud.buildBattleHud(this.state);
    this.app.hud.showBattle();
    this.app.hud.updateBattle(this.state);
    this.app.save.setSnapshot(snapshotBattle(this.state));
    this.app.save.flush();

    this.applyCamera();
    this.scale.on('resize', this.applyCamera, this);
    this.setupInput();

    if (this.state.side === 'a') this.aiDelay = 40;
    this.time.delayedCall(260, () => {
      this.overlay?.showBanner('第 1 回合', '#ffd166', '按住向后拉弓 · 松手发射');
    });
    this.events.once('shutdown', () => this.dispose());
  }

  // ---------- 相机 ----------
  private applyCamera(): void {
    if (!this.cameras || !this.cameras.main) return;
    const cam = this.cameras.main;
    const s = this.app.layout.scale;
    cam.setZoom(s);
    cam.centerOn(WORLD.w / 2, WORLD.h / 2);
  }

  // ---------- 输入 ----------
  private toWorld(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private setupInput(): void {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerCancel, this);
  }

  private canAim(pointer: Phaser.Input.Pointer): boolean {
    if (this.finished || this.app.hud.isModalOpen()) return false;
    if (this.state.phase !== 'aim' || this.state.side !== 'p') return false;
    const l = this.app.layout;
    if (pointer.y < Math.max(AIM.dragTopY, l.topH) || pointer.y > l.vh - l.bottomH) return false;
    return true;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.canAim(pointer) || this.aiming) return;
    this.aiming = true;
    this.aimPointerId = pointer.id;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.aimAngle = 45;
    this.aimPower = 0;
    this.app.audio.unlock();
    this.app.requestFullscreen();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.aiming || pointer.id !== this.aimPointerId) return;
    this.updateAim(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.aiming) return;
    if (pointer.id !== this.aimPointerId) return;
    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const aim = computeAim(dx, dy);
    this.aiming = false;
    this.aimG.clear();
    this.aimText.setVisible(false);
    this.aimPointerId = -1;
    if (aim.pull < AIM.cancelDragPx) return;
    if (aim.power < AIM.minPower) return;
    this.aimAngle = aim.angle;
    this.aimPower = aim.power;
    this.fire();
  }

  private onPointerCancel(): void {
    this.aiming = false;
    this.aimPointerId = -1;
    this.aimG.clear();
    this.aimText.setVisible(false);
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    const aim = computeAim(pointer.x - this.dragStartX, pointer.y - this.dragStartY);
    this.aimAngle = aim.angle;
    this.aimPower = aim.power;
  }

  private fire(): void {
    if (this.state.phase !== 'aim' || this.state.side !== 'p') return;
    const u = activeUnit(this.state);
    const events = step(this.state, {
      c: 'fire',
      unitId: u.id,
      angle: this.aimAngle,
      power: this.aimPower,
      weaponId: u.weaponId,
    });
    this.applyEvents(events);
  }

  // ---------- 驱动模拟 ----------
  update(_time: number, delta: number): void {
    const dt = Math.min(80, delta);
    this.accum += dt;
    let n = 0;
    while (this.accum >= SIM.dtMs && n < 5) {
      this.accum -= SIM.dtMs;
      this.tick();
      n++;
    }
    this.sync();
    this.drawAim();
    this.drawActiveMarker();
    this.drawProjectiles();
    this.app.hud.updateBattle(this.state);
  }

  private tick(): void {
    if (this.finished) return;
    // 爆炸命中停顿：让打击感更实
    if (this.hitStop > 0) {
      this.hitStop--;
      return;
    }
    const st = this.state;
    if (st.phase === 'over') return;
    if (st.phase === 'aim') {
      if (st.side !== 'a') return;
      if (this.aiDelay > 0) {
        this.aiDelay--;
        return;
      }
      const cmd = chooseCommand(st, st.difficulty);
      this.applyEvents(step(st, cmd));
      return;
    }
    this.applyEvents(step(st, { c: 'skip' }));
  }

  private applyEvents(events: Event[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          this.app.audio.play('shot');
          const u = this.state.units.find((x) => x.id === e.unitId);
          if (u) this.fx.muzzle(u.x, u.y - 22, e.angle);
          this.shake.shake(0.25, 120);
          this.aimG.clear();
          this.aimText.setVisible(false);
          this.aiming = false;
          break;
        }
        case 'step': {
          const arr = this.trails.get(e.id) ?? [];
          arr.push({ x: e.x, y: e.y });
          if (arr.length > 14) arr.shift();
          this.trails.set(e.id, arr);
          break;
        }
        case 'impact': {
          this.fx.impactDust(e.x, e.y);
          break;
        }
        case 'explosion': {
          this.fx.explosion(e.x, e.y, e.r, e.secondary);
          this.app.audio.play('explosion');
          this.shake.shake(Math.min(1, e.r / 55), e.secondary ? 200 : 320);
          this.hitStop = Math.max(this.hitStop, e.secondary ? 2 : 4);
          // 相机冲击：轻微推近再回弹
          const cam = this.cameras.main;
          const base = this.app.layout.scale;
          this.tweens.killTweensOf(cam);
          cam.setZoom(base * 1.035);
          this.tweens.add({ targets: cam, zoom: base, duration: 190, ease: 'Quad.easeOut' });
          if (e.r >= 40) this.overlay?.screenFlash(0xfff2cc, 0.12, 120);
          break;
        }
        case 'terrain': {
          this.terrainSprite.sync();
          break;
        }
        case 'unitDamaged': {
          const v = this.unitViews.get(e.id);
          if (v) {
            v.hitFlash();
            const u = this.state.units.find((x) => x.id === e.id);
            if (u) this.fx.damageNumber(u.x, u.y - 42, e.dmg);
          }
          break;
        }
        case 'unitHealed': {
          const u = this.state.units.find((x) => x.id === e.id);
          if (u) this.fx.healNumber(u.x, u.y - 42, e.amount);
          this.app.audio.play('heal');
          break;
        }
        case 'settled': {
          const now = this.time.now;
          for (const mv of e.moves) {
            this.moves.set(mv.id, {
              fromX: mv.from[0],
              fromY: mv.from[1],
              toX: mv.to[0],
              toY: mv.to[1],
              start: now,
              dur: mv.cause === 'lift' ? 160 : 220 + Math.min(400, Math.hypot(mv.to[0] - mv.from[0], mv.to[1] - mv.from[1]) * 3),
            });
          }
          break;
        }
        case 'unitDead': {
          const v = this.unitViews.get(e.id);
          const u = this.state.units.find((x) => x.id === e.id);
          if (u && v) {
            this.fx.smokePuff(u.x, u.y - 10, 0x8a9bb8);
            this.overlay?.showBanner('英雄倒下', '#ff9aa6', '', 700);
          }
          break;
        }
        case 'turnChanged': {
          this.app.audio.play('turn');
          if (e.side === 'p') {
            this.overlay?.showBanner('你的回合', '#4fc3f7', `第 ${e.round} 回合 · ${HERO_BY_ID[this.state.units.find((u) => u.id === e.unitId)!.heroId].name}`, 800);
            this.saveSnapshot();
          } else {
            this.overlay?.showBanner('敌方回合', '#ff8b9e', '', 700);
            this.aiDelay = 46;
          }
          break;
        }
        case 'unitSelected': {
          this.app.audio.play('ui');
          break;
        }
        case 'wind': {
          break;
        }
        case 'suddenDeath': {
          this.overlay?.showBanner('猝死时刻', '#ff5d73', '每回合全体掉血', 1200);
          this.app.audio.play('block');
          break;
        }
        case 'gameOver': {
          this.finish(e.winner);
          break;
        }
      }
    }
  }

  private saveSnapshot(): void {
    this.app.save.setSnapshot(snapshotBattle(this.state));
    this.app.save.flush();
  }

  private finish(winner: 'p' | 'a'): void {
    if (this.finished) return;
    this.finished = true;
    this.aiming = false;
    this.aimG.clear();
    this.aimText.setVisible(false);
    this.overlay?.showBanner(winner === 'p' ? '攻陷成功' : '攻城失败', winner === 'p' ? '#ffd166' : '#ff5d73', '', 1600);
    this.app.audio.play(winner === 'p' ? 'win' : 'lose');
    this.resultTimer = this.time.delayedCall(1500, () => {
      this.app.finishBattle(this.state, winner);
    });
  }

  // ---------- 视图同步 ----------
  private sync(): void {
    this.terrainSprite.sync();
    const now = this.time.now;
    for (const u of this.state.units) {
      const v = this.unitViews.get(u.id);
      if (!v) continue;
      const mv = this.moves.get(u.id);
      if (mv) {
        const k = Math.min(1, (now - mv.start) / mv.dur);
        const e = 1 - (1 - k) * (1 - k);
        v.update(u);
        v.place(mv.fromX + (mv.toX - mv.fromX) * e, mv.fromY + (mv.toY - mv.fromY) * e);
        if (k >= 1) this.moves.delete(u.id);
      } else {
        v.update(u);
      }
    }
  }

  private drawActiveMarker(): void {
    const g = this.activeG;
    g.clear();
    if (this.state.phase === 'over') return;
    const u = activeUnit(this.state);
    if (!u || u.state !== 'alive') return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.006);
    const color = this.state.side === 'p' ? 0x4fc3f7 : 0xff5d73;
    g.lineStyle(2, color, 0.35 + pulse * 0.4);
    g.strokeEllipse(u.x, u.y + 1, 26 + pulse * 4, 9 + pulse * 2);
    if (this.state.side === 'p' && !this.aiming) {
      g.fillStyle(color, 0.12);
      g.fillEllipse(u.x, u.y + 1, 26, 9);
    }
  }

  private drawAim(): void {
    const g = this.aimG;
    g.clear();
    const aimUnitId = this.aiming && this.state.side === 'p' ? this.state.activeId : null;
    for (const [id, view] of this.unitViews) view.setAim(id === aimUnitId ? this.aimAngle : null);
    if (!this.aiming || this.state.phase !== 'aim' || this.state.side !== 'p') {
      this.aimText.setVisible(false);
      return;
    }
    const u = activeUnit(this.state);
    const def = WEAPON_DEFS[u.weaponId];
    const cx = u.x;
    const cy = u.y - 13;
    const r = AIM.ringRadius;
    // 力度环
    g.lineStyle(4, 0x0a0f1e, 0.55);
    g.strokeCircle(cx, cy, r);
    const powerColor = this.aimPower > 0.8 ? 0xff7a3d : this.aimPower > 0.45 ? 0xffd166 : 0x6ee7a0;
    g.lineStyle(4, powerColor, 0.95);
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, this.aimPower), false);
    g.strokePath();
    // 预测弹道（同一个积分器）
    const muzzle = { x: u.x, y: u.y - 22 };
    const sim = simulateShot(this.state, muzzle, this.aimAngle, this.aimPower, u.weaponId, this.state.wind, 300);
    const pts = sim.points.filter((_, i) => i % SIM.predictStride === 0);
    for (let i = 0; i < pts.length; i++) {
      const t = i / Math.max(1, pts.length - 1);
      const alpha = 0.95 - t * 0.75;
      const size = 3.2 - t * 1.6;
      g.fillStyle(0xffe9b0, alpha);
      g.fillCircle(pts[i].x, pts[i].y, Math.max(1, size));
    }
    if (sim.impact) {
      g.lineStyle(1.5, 0xffb347, 0.55);
      g.strokeCircle(sim.impact.x, sim.impact.y, def.blastR);
      g.fillStyle(0xffb347, 0.1);
      g.fillCircle(sim.impact.x, sim.impact.y, def.blastR);
    }
    // 角度/力度读数
    this.aimText
      .setVisible(true)
      .setPosition(cx, u.y - 58)
      .setText(`${Math.round(this.aimAngle)}° · ${Math.round(this.aimPower * 100)}%`);
  }

  private drawProjectiles(): void {
    const g = this.projG;
    g.clear();
    for (const p of this.state.projectiles) {
      const def = WEAPON_DEFS[p.weaponId];
      const trail = this.trails.get(p.id) ?? [];
      for (let i = 0; i < trail.length; i++) {
        const t = i / Math.max(1, trail.length - 1);
        g.fillStyle(def.tint, 0.12 + t * 0.5);
        g.fillCircle(trail[i].x, trail[i].y, 1.2 + t * 1.8);
      }
      g.fillStyle(def.tint, 0.35);
      g.fillCircle(p.x, p.y, def.radius + 4);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(p.x, p.y, Math.max(2, def.radius * 0.6));
    }
    for (const s of this.state.secondaries) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.02);
      g.lineStyle(2, 0xb79cff, 0.5 + pulse * 0.4);
      g.strokeCircle(s.x, s.y, 10 + pulse * 6);
    }
  }

  /** 玩家点击英雄头像切换当前出手单位（仅本回合可操作时有效） */
  selectUnit(unitId: string): void {
    if (this.finished || this.state.phase !== 'aim' || this.state.side !== 'p') return;
    this.aiming = false;
    this.aimG.clear();
    this.aimText.setVisible(false);
    this.applyEvents(step(this.state, { c: 'select', unitId }));
  }

  /** 设置变更后立即生效（画质 / 震屏） */
  applySettings(): void {
    this.fx.setQuality(this.app.quality());
    this.shake.setQuality(this.app.quality());
    this.shake.setEnabled(this.app.shakeEnabled());
  }

  /** HUD「跳过」按钮 */
  skipTurn(): void {
    if (this.finished || this.state.phase !== 'aim' || this.state.side !== 'p') return;
    this.aiming = false;
    this.aimG.clear();
    this.aimText.setVisible(false);
    this.applyEvents(step(this.state, { c: 'skip' }));
  }

  private dispose(): void {
    this.scale.off('resize', this.applyCamera, this);
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);
    this.input.off('pointerupoutside', this.onPointerCancel, this);
    if (this.resultTimer) this.resultTimer.remove(false);
    this.terrainSprite.destroy();
    for (const v of this.unitViews.values()) v.destroy();
    this.unitViews.clear();
    this.fx?.destroy();
  }
}

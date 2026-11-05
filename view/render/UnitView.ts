/**
 * 单位视图：程序化剪影英雄（形状 + 队色 + 武器件），纯表现，状态来自 SimState。
 */

import Phaser from 'phaser';
import { HERO_BY_ID, type HeroId } from '../../config/roster';
import type { Unit } from '../../engine/state';

export class UnitView {
  readonly container: Phaser.GameObjects.Container;
  private art: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private hpG: Phaser.GameObjects.Graphics;
  private weaponG: Phaser.GameObjects.Graphics;
  private lastHp = -1;
  private lastLevel = 0;
  private facing: 1 | -1;
  private dead = false;

  constructor(
    private scene: Phaser.Scene,
    private unit: Unit,
  ) {
    const def = HERO_BY_ID[unit.heroId as HeroId];
    this.facing = unit.side === 'p' ? 1 : -1;
    this.container = scene.add.container(unit.x, unit.y).setDepth(12);
    this.art = scene.add.container(0, 0);
    this.body = scene.add.graphics();
    this.hpG = scene.add.graphics();
    this.weaponG = scene.add.graphics();
    this.art.add([this.body, this.weaponG, this.hpG]);
    this.art.setScale(1.3);
    this.container.add(this.art);
    this.drawBody();
    this.drawHp();
    scene.tweens.add({
      targets: this.art,
      y: { from: 0, to: -2 },
      duration: 900 + (unit.side === 'p' ? 0 : 130),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawBody(): void {
    const u = this.unit;
    const def = HERO_BY_ID[u.heroId as HeroId];
    const g = this.body;
    const f = this.facing;
    const sideColor = u.side === 'p' ? 0x4fc3f7 : 0xff5d73;
    g.clear();
    // 影子
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(u.x * 0, 0, 16, 6);
    // 腿
    g.fillStyle(0x22283a, 1);
    g.fillRect(-5, -8, 4, 8);
    g.fillRect(2, -8, 4, 8);
    // 躯干（不同英雄不同剪影）
    const torsoW = def.shape === 'bulk' ? 15 : def.shape === 'slim' ? 10 : 12;
    const torsoH = def.shape === 'slim' ? 13 : 15;
    g.fillStyle(def.color, 1);
    g.fillRoundedRect(-torsoW / 2, -9 - torsoH, torsoW, torsoH, 3);
    g.lineStyle(1, 0x121a2a, 0.85);
    g.strokeRoundedRect(-torsoW / 2, -9 - torsoH, torsoW, torsoH, 3);
    // 肩甲 / 队色
    g.fillStyle(sideColor, 0.95);
    g.fillRect(-torsoW / 2, -9 - torsoH, torsoW, 3);
    // 头
    g.fillStyle(0xf0d2b0, 1);
    g.fillCircle(0, -9 - torsoH - 6, 6);
    // 头盔
    g.fillStyle(def.accent, 1);
    g.slice(0, -9 - torsoH - 6, 7, Math.PI, Math.PI * 2, false);
    g.fillPath();
    g.fillStyle(0x1a2233, 1);
    g.fillRect(-5, -9 - torsoH - 7, 10, 2);
    // 眼睛
    g.fillStyle(0x101520, 1);
    g.fillRect(1 * f, -9 - torsoH - 6, 2, 2);
    // 武器件（单独一层，瞄准时可以转）
    const wg = this.weaponG;
    wg.clear();
    wg.setPosition(2 * f, -18);
    this.drawWeapon(wg, def.shape, f, def.accent);
  }

  /** 武器件的局部坐标（原点在肩部，+x 为面朝方向），便于瞄准旋转 */
  private drawWeapon(g: Phaser.GameObjects.Graphics, shape: string, f: number, accent: number): void {
    switch (shape) {
      case 'bulk':
        g.fillStyle(0x2b3444, 1);
        g.fillCircle(8 * f, 0, 5);
        g.fillStyle(accent, 1);
        g.fillCircle(8 * f, 0, 2.4);
        break;
      case 'slim':
        g.fillStyle(0x2b3444, 1);
        g.fillRoundedRect(3 * f, -2, 8 * f, 6, 2);
        g.fillStyle(accent, 1);
        for (let i = 0; i < 3; i++) g.fillCircle(5 * f, -1 + i * 2, 1.2);
        break;
      case 'cloak':
        g.fillStyle(0x2b2350, 0.95);
        g.fillTriangle(-6 * f, -2, 6 * f, -2, 0, -16);
        g.fillStyle(accent, 0.9);
        g.fillCircle(7 * f, 0, 2.6);
        break;
      case 'rifle':
        g.fillStyle(0x33404f, 1);
        g.fillRect(0, -1.5, 15 * f, 3);
        g.fillStyle(accent, 1);
        g.fillRect(13 * f, -1.5, 4 * f, 3);
        break;
      case 'cross':
        g.fillStyle(0xffffff, 0.95);
        g.fillRect(5 * f, -6, 3, 10);
        g.fillRect(3 * f, -3, 10 * f, 3);
        break;
    }
  }

  /** 瞄准时武器跟着角度转（null 复位） */
  setAim(angleDeg: number | null): void {
    if (angleDeg === null) {
      this.weaponG.setRotation(0);
      return;
    }
    const rad = (-angleDeg * Math.PI) / 180;
    this.weaponG.setRotation(rad);
  }

  private drawHp(): void {
    const u = this.unit;
    const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp));
    const g = this.hpG;
    g.clear();
    g.fillStyle(0x0a0f1e, 0.85);
    g.fillRect(-11, -47, 22, 4);
    const color = ratio > 0.55 ? 0x6ee7a0 : ratio > 0.25 ? 0xffcf5c : 0xff6b6b;
    g.fillStyle(color, 1);
    g.fillRect(-10, -46, 20 * ratio, 2);
  }

  update(u: Unit): void {
    this.unit = u;
    this.container.x = u.x;
    this.container.y = u.y;
    if (u.hp !== this.lastHp) {
      this.lastHp = u.hp;
      this.drawHp();
    }
    if (u.level !== this.lastLevel) this.lastLevel = u.level;
    if (u.state === 'dead' && !this.dead) this.playDeath();
  }

  place(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  hitFlash(): void {
    this.scene.tweens.add({ targets: this.art, alpha: 0.35, duration: 50, yoyo: true, repeat: 2 });
    this.scene.tweens.add({ targets: this.container, x: this.container.x + 2 * this.facing, duration: 40, yoyo: true, repeat: 2 });
  }

  private playDeath(): void {
    if (this.dead) return;
    this.dead = true;
    this.container.setAlpha(1);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      angle: 78 * this.facing,
      y: this.container.y + 10,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => this.container.setVisible(false),
    });
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

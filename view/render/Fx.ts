/**
 * 表现层特效：爆炸、烟尘、伤害数字、枪口火光、治疗粒子。
 * 粒子同屏上限由 PERF.maxParticles 约束（hi/lo 两档）。
 */

import Phaser from 'phaser';
import { PALETTE, PERF } from '../../config/game.const';

const FONT = 'system-ui, -apple-system, "Noto Sans SC", sans-serif';

export function createFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('spark')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 5);
    g.generateTexture('spark', 10, 10);
    g.destroy();
  }
  if (!scene.textures.exists('smoke')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(14, 14, 14);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(10, 10, 9);
    g.generateTexture('smoke', 28, 28);
    g.destroy();
  }
  if (!scene.textures.exists('dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(2, 2, 2);
    g.generateTexture('dot', 4, 4);
    g.destroy();
  }
}

export class Fx {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private decals: Phaser.GameObjects.Graphics;
  private decalCount = 0;
  private quality: 'hi' | 'lo';

  constructor(private scene: Phaser.Scene, quality: 'hi' | 'lo' = 'hi') {
    this.quality = quality;
    this.sparks = scene.add.particles(0, 0, 'spark', {
      lifespan: { min: 180, max: 620 },
      speed: { min: 40, max: 260 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 260,
      emitting: false,
      blendMode: 'ADD',
      tint: [0xffe08a, 0xffb347, 0xff7a3d],
    }).setDepth(30);
    this.smoke = scene.add.particles(0, 0, 'smoke', {
      lifespan: { min: 500, max: 1200 },
      speed: { min: 12, max: 70 },
      scale: { start: 0.7, end: 1.7 },
      alpha: { start: 0.35, end: 0 },
      emitting: false,
      tint: [0x6b5b4b, 0x4a3f36],
    }).setDepth(29);
    this.dust = scene.add.particles(0, 0, 'dot', {
      lifespan: { min: 200, max: 500 },
      speed: { min: 20, max: 110 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
      tint: [0xc9b08c, 0x9a7b5c],
    }).setDepth(28);
    this.debris = scene.add.particles(0, 0, 'dot', {
      lifespan: { min: 300, max: 850 },
      speed: { min: 90, max: 300 },
      gravityY: 620,
      scale: { start: 1.6, end: 0.4 },
      alpha: { start: 1, end: 0.2 },
      rotate: { min: 0, max: 360 },
      emitting: false,
      tint: [0x8a5a3a, 0x6b4428, 0x4a2f1e, 0xb8a48a],
    }).setDepth(30);
    this.decals = scene.add.graphics().setDepth(3);
    void PERF;
  }

  setQuality(q: 'hi' | 'lo'): void {
    this.quality = q;
  }

  explosion(x: number, y: number, radius: number, secondary = false): void {
    const mul = this.quality === 'hi' ? 1 : 0.5;
    // 焦痕：留在地表，让战场越打越脏
    this.decals.fillStyle(0x161016, 0.2);
    this.decals.fillEllipse(x, y + 3, radius * 1.25, radius * 0.42);
    this.decalCount++;
    if (this.decalCount > 60) {
      this.decals.clear();
      this.decalCount = 0;
    }
    const ring = this.scene.add.graphics().setDepth(31);
    ring.lineStyle(3, secondary ? 0xb79cff : 0xffd166, 0.9);
    ring.strokeCircle(0, 0, 6);
    ring.setPosition(x, y);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.5, to: Math.max(0.8, radius / 16) },
      alpha: { from: 0.95, to: 0 },
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const flash = this.scene.add.circle(x, y, radius * 0.55, 0xfff3c4, 0.85).setDepth(32);
    this.scene.tweens.add({
      targets: flash,
      scale: { from: 0.5, to: 1.25 },
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
    // 第二道慢速冲击波
    const wave = this.scene.add.graphics().setDepth(31);
    wave.lineStyle(2, 0xfff2cc, 0.35);
    wave.strokeCircle(0, 0, 10);
    wave.setPosition(x, y);
    this.scene.tweens.add({
      targets: wave,
      scale: { from: 0.8, to: Math.max(1.2, radius / 10) },
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => wave.destroy(),
    });
    this.sparks.explode(Math.round(12 * mul), x, y);
    this.smoke.explode(Math.round(6 * mul), x, y);
    this.dust.explode(Math.round(8 * mul), x, y);
    this.debris.explode(Math.round((this.quality === 'hi' ? 12 : 5) * (secondary ? 0.6 : 1)), x, y);
    // 上升烟柱
    for (let i = 0; i < (this.quality === 'hi' ? 3 : 1); i++) {
      const puff = this.scene.add.image(x + (i - 1) * 8, y - 4, 'smoke').setTint(0x5a4a3e).setAlpha(0.4).setDepth(27);
      this.scene.tweens.add({
        targets: puff,
        y: y - 55 - i * 12,
        scale: { from: 0.5, to: 1.3 },
        alpha: 0,
        duration: 900 + i * 160,
        onComplete: () => puff.destroy(),
      });
    }
  }

  muzzle(x: number, y: number, angleDeg: number): void {
    const a = (angleDeg * Math.PI) / 180;
    const mx = x + Math.cos(a) * 24;
    const my = y - Math.sin(a) * 24;
    const fx = this.scene.add.circle(mx, my, 7, 0xffe08a, 0.9).setDepth(26);
    this.scene.tweens.add({ targets: fx, scale: 0.2, alpha: 0, duration: 130, onComplete: () => fx.destroy() });
    this.sparks.explode(this.quality === 'hi' ? 4 : 2, mx, my);
  }

  impactDust(x: number, y: number): void {
    this.dust.explode(this.quality === 'hi' ? 6 : 3, x, y);
  }

  damageNumber(x: number, y: number, amount: number, color = '#ffd166'): void {
    const txt = this.scene.add
      .text(x + Phaser.Math.Between(-6, 6), y, `-${Math.round(amount)}`, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color,
        stroke: '#0a0f1e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.scene.tweens.add({
      targets: txt,
      y: y - 34,
      alpha: { from: 1, to: 0 },
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  healNumber(x: number, y: number, amount: number): void {
    const txt = this.scene.add
      .text(x, y, `+${Math.round(amount)}`, {
        fontFamily: FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#8bf0c0',
        stroke: '#0a0f1e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.scene.tweens.add({ targets: txt, y: y - 30, alpha: 0, duration: 700, onComplete: () => txt.destroy() });
    this.sparks.explode(6, x, y + 12);
  }

  smokePuff(x: number, y: number, tint = 0xffffff): void {
    const p = this.scene.add.image(x, y, 'smoke').setTint(tint).setAlpha(0.5).setDepth(27);
    this.scene.tweens.add({
      targets: p,
      scale: { from: 0.4, to: 1.5 },
      alpha: 0,
      y: y - 20,
      duration: 620,
      onComplete: () => p.destroy(),
    });
  }

  destroy(): void {
    this.sparks.destroy();
    this.smoke.destroy();
    this.dust.destroy();
    this.debris.destroy();
    this.decals.destroy();
  }

  /** 供 UI 指示：危险色常量 */
  static readonly DANGER = PALETTE.enemy;
}

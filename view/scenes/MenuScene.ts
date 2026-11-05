/**
 * 菜单背景场景：只画氛围（天空、远山剪影、飘火星），交互全在 DOM。
 */

import Phaser from 'phaser';
import { WORLD } from '../../config/game.const';
import type { AppContext } from '../app-context';

export class MenuScene extends Phaser.Scene {
  private hills?: Phaser.GameObjects.Graphics;
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private app: AppContext) {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#070b16');
    if (this.textures.exists('sky')) {
      this.add.image(0, 0, 'sky').setOrigin(0, 0).setDepth(0);
    }
    const g = this.add.graphics().setDepth(1);
    this.hills = g;
    this.drawHills(g);

    this.embers = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: WORLD.w },
      y: { min: WORLD.h * 0.5, max: WORLD.h },
      lifespan: { min: 2200, max: 5200 },
      speedY: { min: -26, max: -8 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xffb347, 0xff7a3d, 0xffd166],
      frequency: 220,
      blendMode: 'ADD',
      quantity: 1,
    }).setDepth(2);

    this.applyCamera();
    this.scale.on('resize', this.applyCamera, this);
    this.events.once('shutdown', () => this.shutdown());
    this.scheduleDemo(1400);
  }

  private drawHills(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    // 远山
    g.fillStyle(0x141a2e, 1);
    g.beginPath();
    g.moveTo(0, 470);
    for (let x = 0; x <= WORLD.w; x += 40) {
      const y = 430 + Math.sin(x * 0.004) * 26 + Math.sin(x * 0.011 + 2) * 14;
      g.lineTo(x, y);
    }
    g.lineTo(WORLD.w, WORLD.h);
    g.lineTo(0, WORLD.h);
    g.closePath();
    g.fillPath();
    // 近处岩柱剪影（战场已无城堡）
    g.fillStyle(0x0d1322, 1);
    for (const [x, w, h] of [[120, 42, 120], [190, 22, 74], [1010, 26, 92], [1080, 46, 132]] as const) {
      g.fillRect(x, 470 + 90 - h, w, h);
      g.fillTriangle(x, 560 - h, x + w / 2, 560 - h - 26, x + w, 560 - h);
    }
    // 地面
    g.fillStyle(0x0a0f1a, 1);
    g.fillRect(0, 556, WORLD.w, WORLD.h - 556);
  }

  /** 背景里周期性打一发演示弹道，让菜单不静止 */
  private scheduleDemo(delay = 4200): void {
    this.time.delayedCall(delay, () => {
      if (!this.scene.isActive()) return;
      this.spawnDemoShot();
      this.scheduleDemo(3800 + (this.time.now % 2600));
    });
  }

  private spawnDemoShot(): void {
    const fromLeft = this.time.now % 2 < 1;
    const sx = fromLeft ? 250 : 1030;
    const sy = fromLeft ? 452 : 452;
    const tx = fromLeft ? 900 + (this.time.now % 130) : 380 - (this.time.now % 130);
    const g = this.add.graphics().setDepth(3);
    const steps = 26;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = sx + (tx - sx) * t;
      const y = 452 - Math.sin(Math.PI * t) * 150 + 40 * t;
      g.fillStyle(0xffe9b0, 0.5 * (1 - t * 0.6));
      g.fillCircle(x, y, 2.2 - t);
    }
    const burst = this.add.circle(tx, 492, 4, 0xffd166, 0.8).setDepth(3);
    this.tweens.add({ targets: burst, radius: 26, alpha: 0, duration: 520, onComplete: () => burst.destroy() });
    this.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 300, onComplete: () => g.destroy() });
  }

  private applyCamera(): void {
    if (!this.cameras || !this.cameras.main) return;
    const cam = this.cameras.main;
    const s = this.app.layout.scale;
    cam.setZoom(s);
    cam.centerOn(WORLD.w / 2, WORLD.h / 2);
  }

  shutdown(): void {
    this.scale.off('resize', this.applyCamera, this);
    this.embers?.destroy();
    this.tweens.killAll();
    this.time.removeAllEvents();
  }
}

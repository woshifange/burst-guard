/**
 * 相机震动：只做表现，不影响模拟。
 */

import Phaser from 'phaser';

export class CameraShake {
  private enabled = true;
  private strength: number;

  constructor(private scene: Phaser.Scene, quality: 'hi' | 'lo' = 'hi') {
    this.strength = quality === 'hi' ? 1 : 0.45;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setQuality(q: 'hi' | 'lo'): void {
    this.strength = q === 'hi' ? 1 : 0.45;
  }

  /** intensity 0..1，按爆炸规模传入 */
  shake(intensity = 0.6, duration = 260): void {
    if (!this.enabled) return;
    const cam = this.scene.cameras.main;
    const i = Math.max(0.05, Math.min(1, intensity)) * 0.012 * this.strength;
    cam.shake(duration, i);
  }

  flash(color = 0xfff2cc, duration = 90): void {
    if (!this.enabled) return;
    this.scene.cameras.main.flash(duration, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, true);
  }
}

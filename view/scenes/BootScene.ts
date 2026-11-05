/**
 * 启动场景：程序化生成全部纹理（天空、粒子、点），无外部美术文件。
 */

import Phaser from 'phaser';
import { WORLD } from '../../config/game.const';
import { createFxTextures } from '../render/Fx';
import type { AppContext } from '../app-context';

export class BootScene extends Phaser.Scene {
  constructor(private app: AppContext) {
    super('BootScene');
  }

  create(): void {
    this.makeSky();
    createFxTextures(this);
    this.scene.start('MenuScene', { app: this.app });
  }

  private makeSky(): void {
    const key = 'sky';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, WORLD.w, WORLD.h);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD.h);
    grad.addColorStop(0, '#070b18');
    grad.addColorStop(0.45, '#141a33');
    grad.addColorStop(0.72, '#2b1c33');
    grad.addColorStop(1, '#3a2230');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    // 落日
    const sun = ctx.createRadialGradient(880, 390, 8, 880, 390, 220);
    sun.addColorStop(0, 'rgba(255, 190, 110, 0.55)');
    sun.addColorStop(0.4, 'rgba(255, 130, 80, 0.18)');
    sun.addColorStop(1, 'rgba(255, 100, 60, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.fillStyle = 'rgba(255, 220, 170, 0.9)';
    ctx.beginPath();
    ctx.arc(880, 390, 26, 0, Math.PI * 2);
    ctx.fill();
    // 星点
    let seed = 1337;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 90; i++) {
      const x = rnd() * WORLD.w;
      const y = rnd() * WORLD.h * 0.55;
      const a = 0.15 + rnd() * 0.55;
      ctx.fillStyle = `rgba(200, 220, 255, ${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    tex.refresh();
  }
}

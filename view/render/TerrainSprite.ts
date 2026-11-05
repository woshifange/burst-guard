/**
 * 地形渲染：掩码 → CanvasTexture，只重绘脏矩形。
 */

import Phaser from 'phaser';
import { PALETTE } from '../../config/game.const';
import type { MapColors } from '../../config/maps';
import type { BBox, Terrain } from '../../engine/terrain';

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function noise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % 15;
}

export class TerrainSprite {
  readonly image: Phaser.GameObjects.Image;
  private texture: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private scene: Phaser.Scene,
    private terrain: Terrain,
    key = 'terrain',
    private colors: MapColors = {
      grass: PALETTE.grass,
      grassHi: 0x8ee08a,
      grassDark: PALETTE.grassDark,
      dirt: PALETTE.dirt,
      dirtDark: PALETTE.dirtDark,
      rock: PALETTE.rock,
    },
  ) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, terrain.w, terrain.h);
    if (!tex) throw new Error('cannot create terrain canvas texture');
    this.texture = tex;
    this.ctx = tex.getContext();
    this.fullRedraw();
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
    this.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  fullRedraw(): void {
    this.paint(0, 0, this.terrain.w, this.terrain.h);
  }

  redraw(bbox: BBox): void {
    this.paint(bbox.x0, bbox.y0, bbox.x1, bbox.y1);
  }

  private paint(x0: number, y0: number, x1: number, y1: number): void {
    const t = this.terrain;
    const w = t.w;
    const iw = Math.max(1, x1 - x0);
    const ih = Math.max(1, y1 - y0);
    const img = this.ctx.createImageData(iw, ih);
    const data = img.data;
    const grass = rgb(this.colors.grass);
    const grassHi = rgb(this.colors.grassHi);
    const grassDark = rgb(this.colors.grassDark);
    const dirt = rgb(this.colors.dirt);
    const dirtDark = rgb(this.colors.dirtDark);
    const rock = rgb(this.colors.rock);
    for (let y = y0; y < y1; y++) {
      const rowBase = y * w;
      for (let x = x0; x < x1; x++) {
        if (t.mask[rowBase + x] === 0) continue;
        const depth = y - t.support[x];
        let c: [number, number, number];
        if (depth <= 1) c = grassHi;
        else if (depth <= 7) c = grass;
        else if (depth <= 13) c = grassDark;
        else if (depth < 60) c = dirt;
        else if (depth < 140) c = dirtDark;
        else c = rock;
        // 土层分带：每 13px 一条明暗条带，制造沉积岩层
        if (depth > 13) {
          const band = Math.floor((depth - 13) / 13) % 3;
          if (band === 1) c = [Math.round(c[0] * 0.9), Math.round(c[1] * 0.9), Math.round(c[2] * 0.9)];
          else if (band === 2) c = [Math.min(255, Math.round(c[0] * 1.08)), Math.min(255, Math.round(c[1] * 1.06)), Math.min(255, Math.round(c[2] * 1.05))];
        }
        // 边缘：上方是空 → 地表高光；崖壁/洞穴边缘压暗
        const upEmpty = y > 0 && t.mask[(y - 1) * w + x] === 0;
        const leftEmpty = x > 0 && t.mask[y * w + x - 1] === 0;
        const rightEmpty = x < w - 1 && t.mask[y * w + x + 1] === 0;
        if (upEmpty) {
          c = depth <= 1 ? grassHi : [Math.min(255, Math.round(c[0] * 1.18)), Math.min(255, Math.round(c[1] * 1.16)), Math.min(255, Math.round(c[2] * 1.1))];
        } else if (leftEmpty || rightEmpty) {
          c = [Math.round(c[0] * 0.78), Math.round(c[1] * 0.78), Math.round(c[2] * 0.82)];
        }
        const n = noise(x, y) - 7;
        const o = ((y - y0) * iw + (x - x0)) * 4;
        data[o] = Math.max(0, Math.min(255, c[0] + n));
        data[o + 1] = Math.max(0, Math.min(255, c[1] + n));
        data[o + 2] = Math.max(0, Math.min(255, c[2] + n));
        data[o + 3] = 255;
      }
    }
    this.ctx.putImageData(img, x0, y0);
    this.texture.refresh();
  }

  /** 地形变化后的统一入口：消费 terrain.dirty */
  sync(): boolean {
    const d = this.terrain.dirty;
    if (!d) return false;
    this.terrain.dirty = null;
    this.redraw(d);
    return true;
  }

  destroy(): void {
    this.image.destroy();
    if (this.scene.textures.exists(this.texture.key)) this.scene.textures.remove(this.texture.key);
  }
}

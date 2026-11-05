import { describe, expect, it } from 'vitest';
import {
  battlefieldSurface,
  carveCrater,
  consumeDirty,
  createTerrain,
  solidArea,
  solidAt,
  supportAt,
} from '../engine/terrain';

describe('terrain: 像素掩码 + 派生 support', () => {
  it('support 必须等于每列最上实像素', () => {
    const t = createTerrain(1280, 640, battlefieldSurface);
    for (let x = 0; x < t.w; x++) {
      let first = t.h;
      for (let y = 0; y < t.h; y++) {
        if (t.mask[y * t.w + x] !== 0) {
          first = y;
          break;
        }
      }
      expect(t.support[x]).toBe(first);
    }
  });

  it('地表上下取样正确', () => {
    const t = createTerrain(1280, 640, battlefieldSurface);
    const surface = Math.round(battlefieldSurface(100));
    expect(solidAt(t, 100, surface)).toBe(true);
    expect(solidAt(t, 100, surface - 1)).toBe(false);
    expect(supportAt(t, 100)).toBe(surface);
  });

  it('crater 面积 ≈ πr² ±5%', () => {
    const t = createTerrain(1280, 640, battlefieldSurface);
    const before = solidArea(t);
    const r = 40;
    const bbox = carveCrater(t, 640, 590, r);
    expect(bbox).not.toBeNull();
    const removed = before - solidArea(t);
    const expected = Math.PI * r * r;
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.05);
    // 脏矩形必须覆盖弹坑
    const dirty = consumeDirty(t);
    expect(dirty).not.toBeNull();
    expect(dirty!.x0).toBeLessThanOrEqual(640 - r);
    expect(dirty!.x1).toBeGreaterThanOrEqual(640 + r);
  });

  it('炸穿地表后 support 下移，索引仍自洽', () => {
    const t = createTerrain(1280, 640, battlefieldSurface);
    const before = supportAt(t, 640);
    carveCrater(t, 640, before + 6, 24);
    const after = supportAt(t, 640);
    expect(after).toBeGreaterThan(before);
    for (let x = 600; x < 680; x++) {
      let first = t.h;
      for (let y = 0; y < t.h; y++) {
        if (t.mask[y * t.w + x] !== 0) {
          first = y;
          break;
        }
      }
      expect(t.support[x]).toBe(first);
    }
  });

  it('同一坑重复炸不产生脏矩形', () => {
    const t = createTerrain(1280, 640, battlefieldSurface);
    carveCrater(t, 640, 600, 20);
    consumeDirty(t);
    const again = carveCrater(t, 640, 600, 20);
    expect(again).toBeNull();
    expect(consumeDirty(t)).toBeNull();
  });
});

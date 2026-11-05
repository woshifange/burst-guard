/**
 * 可破坏地形：像素掩码是唯一真相，support 是派生索引（每列最上实像素）。
 * 不依赖 Phaser / DOM。
 */

export interface BBox {
  /** 含左含上，不含右不含下 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Terrain {
  w: number;
  h: number;
  mask: Uint32Array;
  /** 每列最上实像素的 y；无实心则为 h */
  support: Int32Array;
  /** 每次地形变化自增，供视图判断重绘 */
  revision: number;
  /** 未消费的脏矩形并集 */
  dirty: BBox | null;
}

export function createTerrain(w: number, h: number, surface: (x: number) => number): Terrain {
  const mask = new Uint32Array(w * h);
  const support = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    const top = Math.max(0, Math.min(h, Math.round(surface(x))));
    support[x] = top;
    // 用 1 填实心（留给未来材质位）
    for (let y = top; y < h; y++) mask[y * w + x] = 1;
  }
  return { w, h, mask, support, revision: 1, dirty: null };
}

export function solidAt(t: Terrain, x: number, y: number): boolean {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= t.w || yi >= t.h) return false;
  return t.mask[yi * t.w + xi] !== 0;
}

/** 从 fromY 向下找到第一个实心 y（找不到返回 h） */
export function solidColumnFrom(t: Terrain, x: number, fromY: number): number {
  const xi = x | 0;
  if (xi < 0 || xi >= t.w) return t.h;
  const y0 = Math.max(0, Math.min(t.h, fromY | 0));
  for (let y = y0; y < t.h; y++) {
    if (t.mask[y * t.w + xi] !== 0) return y;
  }
  return t.h;
}

export function supportAt(t: Terrain, x: number): number {
  const xi = Math.max(0, Math.min(t.w - 1, x | 0));
  return t.support[xi];
}

/** 某点以下是否还有任何实心像素（用于坠底死亡判定） */
export function hasGroundBelow(t: Terrain, x: number, y: number): boolean {
  return solidColumnFrom(t, x, y) < t.h;
}

export function markDirty(t: Terrain, b: BBox): void {
  if (!t.dirty) {
    t.dirty = { ...b };
  } else {
    t.dirty.x0 = Math.min(t.dirty.x0, b.x0);
    t.dirty.y0 = Math.min(t.dirty.y0, b.y0);
    t.dirty.x1 = Math.max(t.dirty.x1, b.x1);
    t.dirty.y1 = Math.max(t.dirty.y1, b.y1);
  }
  t.revision++;
}

export function consumeDirty(t: Terrain): BBox | null {
  const d = t.dirty;
  t.dirty = null;
  return d;
}

/** 圆坑：O(r²) 清零，并刷新受影响列的 support */
export function carveCrater(t: Terrain, cx: number, cy: number, r: number): BBox | null {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(t.w, Math.ceil(cx + r) + 1);
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(t.h, Math.ceil(cy + r) + 1);
  let changed = false;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    const dy2 = dy * dy;
    if (dy2 > r2) continue;
    const span = Math.sqrt(r2 - dy2);
    const sx = Math.max(x0, Math.ceil(cx - span));
    const ex = Math.min(x1, Math.floor(cx + span) + 1);
    if (ex <= sx) continue;
    const row = y * t.w;
    for (let x = sx; x < ex; x++) {
      if (t.mask[row + x] !== 0) {
        t.mask[row + x] = 0;
        changed = true;
      }
    }
  }
  if (!changed) return null;
  recomputeSupport(t, x0, x1);
  const bbox = { x0, y0, x1, y1 };
  markDirty(t, bbox);
  return bbox;
}

/** 只刷新指定列区间的 support（用于爆炸后） */
export function recomputeSupport(t: Terrain, x0: number, x1: number): void {
  const from = Math.max(0, x0 | 0);
  const to = Math.min(t.w, x1 | 0);
  for (let x = from; x < to; x++) {
    let y = 0;
    for (; y < t.h; y++) {
      if (t.mask[y * t.w + x] !== 0) break;
    }
    t.support[x] = y;
  }
}

/** 全量重算（测试 / 载入存档用） */
export function recomputeSupportAll(t: Terrain): void {
  recomputeSupport(t, 0, t.w);
}

/** 实心像素总数（测试用） */
export function solidArea(t: Terrain): number {
  let n = 0;
  for (let i = 0; i < t.mask.length; i++) if (t.mask[i] !== 0) n++;
  return n;
}

export function cloneTerrain(t: Terrain): Terrain {
  return {
    w: t.w,
    h: t.h,
    mask: new Uint32Array(t.mask),
    support: new Int32Array(t.support),
    revision: t.revision,
    dirty: t.dirty ? { ...t.dirty } : null,
  };
}

/** 默认地图（黄昏高地）：两侧高地 + 中间低谷 + 中央小丘 */
export function battlefieldSurface(x: number): number {
  const plateau = 468;
  const valley = 556;
  const smooth = (u: number): number => {
    const c = Math.max(0, Math.min(1, u));
    return c * c * (3 - 2 * c);
  };
  if (x <= 292) return plateau;
  if (x < 372) return plateau + (valley - plateau) * smooth((x - 292) / 80);
  if (x >= 988) return plateau;
  if (x > 908) return valley + (plateau - valley) * smooth((x - 908) / 80);
  // 中间缓坡低谷 + 620 附近的小丘
  const hill = 42 * Math.exp(-(((x - 640) / 120) ** 2));
  return valley - hill;
}

/**
 * 确定性随机流。
 * 全项目禁止 Math.random。所有随机都从 (seed, turn, purposeTag) 派生。
 */

export type Purpose = 'aim' | 'crater' | 'scatter' | 'aiJitter' | 'wind' | 'ai' | 'turret' | 'reward';

const TAG: Record<Purpose, number> = {
  aim: 0x1,
  crater: 0x2,
  scatter: 0x3,
  aiJitter: 0x4,
  wind: 0x5,
  ai: 0x6,
  turret: 0x7,
  reward: 0x8,
};

export interface Rng {
  /** [0,1) */
  next(): number;
  /** [0,n) 整数 */
  int(n: number): number;
  /** [a,b) 浮点 */
  range(a: number, b: number): number;
  /** 单位球内均匀点 */
  unit(): [number, number];
}

/** mulberry32：小、快、跨平台一致（全整数位运算） */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(n: number): number {
      return Math.floor(next() * n) % Math.max(1, n);
    },
    range(a2: number, b: number): number {
      return a2 + next() * (b - a2);
    },
    unit(): [number, number] {
      // 极坐标，避免开方分布偏差
      const r = Math.sqrt(next());
      const th = next() * Math.PI * 2;
      return [Math.cos(th) * r, Math.sin(th) * r];
    },
  };
}

/** 派生流种子：seed ^ (turn*2654435761) ^ tag */
export function deriveSeed(seed: number, turn: number, purpose: Purpose): number {
  return (seed ^ Math.imul(turn | 0, 2654435761) ^ Math.imul(TAG[purpose], 0x9e3779b1)) >>> 0;
}

export function rngFor(seed: number, turn: number, purpose: Purpose): Rng {
  return makeRng(deriveSeed(seed, turn, purpose));
}

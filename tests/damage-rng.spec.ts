import { describe, expect, it } from 'vitest';
import { deriveSeed, makeRng, rngFor } from '../engine/rng';
import { damageAt, falloffFactor } from '../engine/damage';

describe('rng: 确定性流', () => {
  it('同种子同序列', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('不同用途派生不同流', () => {
    const a = rngFor(99, 3, 'scatter');
    const b = rngFor(99, 3, 'wind');
    const c = rngFor(99, 4, 'scatter');
    expect(a.next()).not.toBe(b.next());
    expect(deriveSeed(99, 3, 'scatter')).not.toBe(deriveSeed(99, 4, 'scatter'));
    expect(deriveSeed(99, 3, 'scatter')).not.toBe(deriveSeed(99, 3, 'wind'));
    void c;
  });
  it('输出范围 [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('damage: 距离衰减单调', () => {
  it('linear 曲线', () => {
    expect(falloffFactor(0, 50, 'linear')).toBe(1);
    expect(falloffFactor(25, 50, 'linear')).toBeCloseTo(0.5, 6);
    expect(falloffFactor(50, 50, 'linear')).toBe(0);
    let prev = Infinity;
    for (let d = 0; d <= 50; d += 2.5) {
      const v = damageAt(40, d, 50, 'linear');
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
  it('sq 曲线', () => {
    expect(falloffFactor(0, 50, 'sq')).toBe(1);
    expect(falloffFactor(25, 50, 'sq')).toBeCloseTo(0.25, 6);
    expect(falloffFactor(52, 50, 'sq')).toBe(0);
    let prev = Infinity;
    for (let d = 0; d <= 50; d += 2.5) {
      const v = damageAt(40, d, 50, 'sq');
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

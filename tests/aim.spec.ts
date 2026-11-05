import { describe, expect, it } from 'vitest';
import { computeAim } from '../view/aim';
import { AIM } from '../config/game.const';

describe('aim: 反向拉弓', () => {
  it('向左拉 → 向右打（0°）', () => {
    const a = computeAim(-120, 0);
    expect(a.angle).toBeCloseTo(0, 5);
    expect(a.power).toBeCloseTo(Math.min(1, 120 / AIM.maxDragPx), 5);
  });

  it('向下拉 → 向上打（90°）', () => {
    expect(computeAim(0, 120).angle).toBeCloseTo(90, 5);
  });

  it('左下 → 右上 45°', () => {
    expect(computeAim(-100, 100).angle).toBeCloseTo(45, 5);
    expect(computeAim(-100, 100).power).toBeCloseTo(Math.min(1, Math.hypot(100, 100) / AIM.maxDragPx), 5);
  });

  it('反向（右/上）被夹到玩家合法角度内，不会朝自己打', () => {
    expect(computeAim(120, 0).angle).toBe(AIM.angleMax);
    expect(computeAim(-100, -100).angle).toBe(AIM.angleMin);
  });

  it('力度按最大拖拽长度 clamp 到 1', () => {
    expect(computeAim(-400, 0).power).toBe(1);
    expect(computeAim(0, 0).power).toBe(0);
  });
});

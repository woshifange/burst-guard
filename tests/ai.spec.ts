import { describe, expect, it } from 'vitest';
import { WORLD } from '../config/game.const';
import { hashEvents } from '../engine/events';
import { chooseCommand, generateCandidates, playAutoBattle } from '../engine/ai';
import type { Difficulty } from '../engine/state';
import { testBattle } from './helpers';

describe('ai: 候选合法性', () => {
  it('全部候选落点合法、无 NaN', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const s = testBattle(101, difficulty);
      const cands = generateCandidates(s, difficulty);
      expect(cands.length).toBeGreaterThan(10);
      for (const c of cands) {
        expect(Number.isFinite(c.angle)).toBe(true);
        expect(Number.isFinite(c.power)).toBe(true);
        expect(Number.isFinite(c.score)).toBe(true);
        expect(c.angle).toBeGreaterThanOrEqual(0);
        expect(c.angle).toBeLessThanOrEqual(180);
        expect(c.power).toBeGreaterThan(0);
        expect(c.power).toBeLessThanOrEqual(1);
        expect(c.impact).not.toBeNull();
        expect(c.impact!.x).toBeGreaterThan(-120);
        expect(c.impact!.x).toBeLessThan(WORLD.w + 120);
      }
    }
  });

  it('选出的命令在合法范围内且指向当前单位', () => {
    const s = testBattle(102, 'normal');
    const cmd = chooseCommand(s, 'normal');
    expect(cmd.c).toBe('fire');
    if (cmd.c === 'fire') {
      expect(cmd.unitId).toBe(s.activeId);
      expect(cmd.power).toBeGreaterThanOrEqual(0.2);
      expect(cmd.power).toBeLessThanOrEqual(1);
      expect(Number.isFinite(cmd.angle)).toBe(true);
    }
  });
});

describe('ai: 自战', () => {
  it('Easy / Hard 自战能有限步终局（10 局）', () => {
    const results: { winner: string | null; rounds: number; shots: number; ms: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      const s = testBattle(2000 + i, 'hard');
      const { state, shots } = playAutoBattle(s, 'hard', 'easy');
      expect(state.phase).toBe('over');
      expect(state.winner).toBeTruthy();
      expect(shots).toBeLessThan(500);
      expect(state.round).toBeLessThan(80);
      results.push({ winner: state.winner, rounds: state.round, shots, ms: Date.now() - t0 });
    }
    // 每局都必须在有限步内结束（不断言墙钟时间，避免 CI/负载抖动误报）
    for (const r of results) expect(r.shots).toBeLessThan(500);
  });

  it('AI 决策确定性：同 seed 两次自战事件哈希一致', () => {
    const a = playAutoBattle(testBattle(777, 'normal'), 'normal', 'normal');
    const b = playAutoBattle(testBattle(777, 'normal'), 'normal', 'normal');
    expect(hashEvents(a.events)).toBe(hashEvents(b.events));
  });
});

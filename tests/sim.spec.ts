import { describe, expect, it } from 'vitest';
import { SIM } from '../config/game.const';
import { HERO_BY_ID } from '../config/roster';
import { resolveExplosion } from '../engine/damage';
import { hashEvents } from '../engine/events';
import { step } from '../engine/sim';
import { activeUnit } from '../engine/state';
import { settleInvariantViolations } from '../engine/support';
import { hashTerrain, heroes, hpSnapshot, runScriptedBattle, testBattle } from './helpers';

describe('sim: 初始化（无城堡）', () => {
  it('双方各 3 单位并站在地面上', () => {
    const s = testBattle(5);
    expect(s.units.length).toBe(6);
    expect(s.phase).toBe('aim');
    expect(s.side).toBe('p');
    expect(s.wind).toBeGreaterThanOrEqual(-1);
    expect(s.wind).toBeLessThanOrEqual(1);
    for (const u of s.units) {
      expect(u.state).toBe('alive');
      expect(u.hp).toBe(u.maxHp);
    }
    expect(settleInvariantViolations(s)).toEqual([]);
  });
});

describe('sim: 一次完整发射', () => {
  it('fire → flight → settle → AI 回合', () => {
    const s = testBattle(7);
    const ev1 = step(s, { c: 'fire', unitId: 'p0', angle: 45, power: 0.8, weaponId: 'bomb' });
    expect(ev1.some((e) => e.t === 'shot')).toBe(true);
    expect(s.phase).toBe('flight');
    const events = [...ev1];
    let n = 0;
    while (s.phase !== 'aim' && s.phase !== 'over' && n++ < 3000) events.push(...step(s, { c: 'skip' }));
    expect(events.some((e) => e.t === 'explosion')).toBe(true);
    expect(events.some((e) => e.t === 'terrain')).toBe(true);
    expect(s.phase).toBe('aim');
    expect(s.side).toBe('a');
    expect(s.turnIdx).toBe(1);
    expect(s.round).toBe(1);
    expect(s.activeId).toBe('a0');
    expect(settleInvariantViolations(s)).toEqual([]);
  });

  it('跳过回合也会正常流转', () => {
    const s = testBattle(8);
    step(s, { c: 'skip' });
    expect(s.phase).toBe('settle');
    step(s, { c: 'skip' });
    expect(s.phase).toBe('aim');
    expect(s.side).toBe('a');
    expect(s.turnIdx).toBe(1);
  });

  it('一轮结束换风并进入玩家回合', () => {
    const s = testBattle(9);
    for (let i = 0; i < 4; i++) step(s, { c: 'skip' });
    expect(s.side).toBe('p');
    expect(s.round).toBe(2);
    expect(s.turnIdx).toBe(2);
  });
});

describe('sim: 玩家点选英雄', () => {
  it('select 可切换当前出手英雄并用其开火', () => {
    const s = testBattle(20);
    expect(s.activeId).toBe('p0');
    const sel = step(s, { c: 'select', unitId: 'p2' });
    expect(sel.some((e) => e.t === 'unitSelected' && e.unitId === 'p2')).toBe(true);
    expect(s.activeId).toBe('p2');
    const ev = step(s, { c: 'fire', unitId: 'p2', angle: 45, power: 0.7, weaponId: '' });
    expect(ev.some((e) => e.t === 'shot' && e.unitId === 'p2')).toBe(true);
  });

  it('不能选敌方 / 已阵亡 / 非行动方单位', () => {
    const s = testBattle(21);
    step(s, { c: 'select', unitId: 'a1' });
    expect(s.activeId).toBe('p0');
    s.units.find((u) => u.id === 'p1')!.state = 'dead';
    step(s, { c: 'select', unitId: 'p1' });
    expect(s.activeId).toBe('p0');
    step(s, { c: 'skip' });
    step(s, { c: 'skip' });
    expect(s.side).toBe('a');
    step(s, { c: 'select', unitId: 'p0' });
    expect(s.activeId).toBe('a0');
  });
});

describe('sim: 武器差异', () => {
  it('侦察 = 一次 15 枚散布弹', () => {
    const s = testBattle(10);
    s.cursor.p = 1;
    s.activeId = 'p1';
    const ev = step(s, { c: 'fire', unitId: 'p1', angle: 55, power: 0.7, weaponId: 'scout_cluster' });
    const shot = ev.find((e) => e.t === 'shot');
    expect(shot && shot.t === 'shot' && shot.count).toBe(15);
    expect(s.projectiles.length).toBe(15);
    const events = [...ev];
    let n = 0;
    while (s.phase !== 'aim' && s.phase !== 'over' && n++ < 4000) events.push(...step(s, { c: 'skip' }));
    expect(events.filter((e) => e.t === 'impact').length).toBe(15);
    expect(events.filter((e) => e.t === 'explosion').length).toBeGreaterThanOrEqual(11);
  });

  it('乌鸦 = 落点后延迟二次爆炸', () => {
    const s = testBattle(12, 'normal', heroes(['demolisher', 'scout', 'raven']));
    s.cursor.p = 2;
    s.activeId = 'p2';
    const events = [...step(s, { c: 'fire', unitId: 'p2', angle: 50, power: 0.75, weaponId: 'raven_bomb' })];
    let n = 0;
    while (s.phase !== 'aim' && s.phase !== 'over' && n++ < 4000) events.push(...step(s, { c: 'skip' }));
    expect(events.some((e) => e.t === 'explosion' && e.secondary === true)).toBe(true);
  });

  it('医疗爆炸给己方回血', () => {
    const s = testBattle(13);
    const p1 = s.units.find((u) => u.id === 'p1')!;
    p1.hp = 20;
    const events: import('../engine/events').Event[] = [];
    resolveExplosion(
      s,
      { x: p1.x, y: p1.y - 13, radius: 26, terrainRadius: 26, dmg: 0, falloff: 'linear', side: 'p', ownerId: 'p2', weaponId: 'medic_shot', selfHeal: 16, secondary: false },
      events,
    );
    expect(events.filter((e) => e.t === 'unitHealed').length).toBeGreaterThan(0);
    expect(p1.hp).toBe(36);
  });
});

describe('sim: 确定性', () => {
  it('同 seed + 同命令序列 → 事件/地形/血量全等', () => {
    const a = runScriptedBattle(testBattle(4242));
    const b = runScriptedBattle(testBattle(4242));
    expect(hashEvents(a.events)).toBe(hashEvents(b.events));
    expect(a.shots).toBeGreaterThan(3);
    const sa = runScriptedBattle(testBattle(4242));
    const sb = runScriptedBattle(testBattle(4242));
    expect(hashTerrain(sa.state)).toBe(hashTerrain(sb.state));
    expect(hpSnapshot(sa.state)).toBe(hpSnapshot(sb.state));
    expect(sa.state.round).toBe(sb.state.round);
  });

  it('不同 seed 结果不同', () => {
    const a = runScriptedBattle(testBattle(1));
    const b = runScriptedBattle(testBattle(2));
    expect(hashEvents(a.events)).not.toBe(hashEvents(b.events));
  });
});

describe('sim: 胜负与猝死', () => {
  it('敌方全灭 → 我方胜', () => {
    const s = testBattle(14);
    for (const u of s.units) if (u.side === 'a') u.state = 'dead';
    step(s, { c: 'skip' });
    step(s, { c: 'skip' });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p');
  });

  it('同批全灭判当前行动方负', () => {
    const s = testBattle(15);
    for (const u of s.units) u.state = 'dead';
    step(s, { c: 'skip' });
    step(s, { c: 'skip' });
    expect(s.winner).toBe('a');
  });

  it('打满回合必然进入猝死并有限步终局', () => {
    const s = testBattle(16);
    const events = [];
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 4000) events.push(...step(s, { c: 'skip' }));
    expect(s.phase).toBe('over');
    expect(s.winner).toBeTruthy();
    expect(events.some((e) => e.t === 'suddenDeath')).toBe(true);
    expect(events.some((e) => e.t === 'gameOver')).toBe(true);
    expect(s.round).toBeLessThanOrEqual(SIM.hardRoundCap);
  });

  it('英雄数值来自 roster（星级成长）', () => {
    const s = testBattle(17);
    const u = s.units.find((x) => x.id === 'p0')!;
    const def = HERO_BY_ID.demolisher;
    expect(u.maxHp).toBe(def.hpBase);
    expect(s.units.find((x) => x.id === 'p1')!.weaponId).toBe('scout_cluster');
    void activeUnit;
  });
});

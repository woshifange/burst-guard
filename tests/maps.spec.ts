import { describe, expect, it } from 'vitest';
import { MAPS, getMap } from '../config/maps';
import { createBattle, aliveCount, type BattleConfig } from '../engine/state';
import { snapshotBattle, restoreBattle } from '../engine/snapshot';
import { step } from '../engine/sim';

const TEAM = [
  { id: 'demolisher' as const, level: 1 },
  { id: 'scout' as const, level: 1 },
  { id: 'medic' as const, level: 1 },
];

function cfg(mapId: string): BattleConfig {
  return { seed: 123, difficulty: 'normal', player: TEAM, enemy: TEAM, mapId };
}

describe('maps: 4 张地图', () => {
  it('每张地图都能开局且单位站在地面上', () => {
    for (const map of MAPS) {
      const s = createBattle(cfg(map.id));
      expect(s.mapId).toBe(map.id);
      expect(aliveCount(s, 'p')).toBe(3);
      expect(aliveCount(s, 'a')).toBe(3);
      for (const u of s.units) {
        expect(u.state).toBe('alive');
        expect(Math.abs(u.y - s.terrain.support[Math.round(u.x)])).toBeLessThan(1.5);
      }
      // 空结算不会自己死人/死地形
      step(s, { c: 'skip' });
      step(s, { c: 'skip' });
      expect(aliveCount(s, 'p')).toBe(3);
      expect(aliveCount(s, 'a')).toBe(3);
    }
  });

  it('地图中段地形确实不同（内容不单一）', () => {
    const samples = MAPS.map((m) => [600, 640, 700].map((x) => Math.round(getMap(m.id).surface(x))));
    expect(new Set(samples.map((v) => v.join(','))).size).toBe(MAPS.length);
  });

  it('快照保留地图', () => {
    const s = createBattle(cfg('canyon'));
    const snap = snapshotBattle(s);
    expect(snap.mapId).toBe('canyon');
    const restored = restoreBattle(snap);
    expect(restored.mapId).toBe('canyon');
    expect(aliveCount(restored, 'p')).toBe(3);
  });
});

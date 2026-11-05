/**
 * 战斗快照：用于「战斗中刷新 → 恢复」。地形用 RLE 压缩。
 */

import { SIM } from '../config/game.const';
import { rngFor } from './rng';
import { DEFAULT_MODS, createBattle, type BattleStats, type Difficulty, type SideMods, type SimState, type TeamMember } from './state';
import { recomputeSupportAll } from './terrain';

export interface BattleSnapshot {
  v: 1;
  seed: number;
  mapId?: string;
  difficulty: Difficulty;
  player: TeamMember[];
  enemy: TeamMember[];
  mods?: Record<'p' | 'a', SideMods>;
  round: number;
  turnIdx: number;
  side: 'p' | 'a';
  cursor: { p: number; a: number };
  activeId: string;
  wind: number;
  suddenDeath: boolean;
  tick: number;
  terrainRuns: number[];
  units: { id: string; hp: number; x: number; y: number; state: 'alive' | 'dead' }[];
  stats: BattleStats;
}

export function encodeRLE(mask: Uint32Array): number[] {
  const runs: number[] = [];
  if (mask.length === 0) return runs;
  let value = mask[0];
  let count = 1;
  for (let i = 1; i < mask.length; i++) {
    if (mask[i] === value) count++;
    else {
      runs.push(value, count);
      value = mask[i];
      count = 1;
    }
  }
  runs.push(value, count);
  return runs;
}

export function decodeRLE(runs: number[], length: number): Uint32Array {
  const out = new Uint32Array(length);
  let i = 0;
  for (let r = 0; r + 1 < runs.length; r += 2) {
    const v = runs[r];
    const n = runs[r + 1];
    for (let k = 0; k < n && i < length; k++) out[i++] = v;
  }
  return out;
}

export function snapshotBattle(state: SimState): BattleSnapshot {
  return {
    v: 1,
    seed: state.seed,
    mapId: state.mapId,
    difficulty: state.difficulty,
    player: state.units.filter((u) => u.side === 'p').map((u) => ({ id: u.heroId, level: u.level })),
    enemy: state.units.filter((u) => u.side === 'a').map((u) => ({ id: u.heroId, level: u.level })),
    mods: { p: { ...state.mods.p }, a: { ...state.mods.a } },
    round: state.round,
    turnIdx: state.turnIdx,
    side: state.side,
    cursor: { ...state.cursor },
    activeId: state.activeId,
    wind: state.wind,
    suddenDeath: state.suddenDeath,
    tick: state.tick,
    terrainRuns: encodeRLE(state.terrain.mask),
    units: state.units.map((u) => ({ id: u.id, hp: u.hp, x: u.x, y: u.y, state: u.state })),
    stats: {
      damageDealt: { ...state.stats.damageDealt },
      kills: { ...state.stats.kills },
      shots: { ...state.stats.shots },
    },
  };
}

export function isSnapshotValid(snap: unknown): snap is BattleSnapshot {
  if (!snap || typeof snap !== 'object') return false;
  const s = snap as Partial<BattleSnapshot>;
  if (s.v !== 1) return false;
  if (typeof s.seed !== 'number' || !Array.isArray(s.terrainRuns)) return false;
  if (!Array.isArray(s.units) || s.units.length === 0) return false;
  if (!Array.isArray(s.player) || s.player.length === 0) return false;
  return true;
}

export function restoreBattle(snap: BattleSnapshot): SimState {
  const state = createBattle({
    seed: snap.seed,
    difficulty: snap.difficulty,
    player: snap.player,
    enemy: snap.enemy,
    mapId: snap.mapId,
    mods: snap.mods ?? { p: DEFAULT_MODS, a: DEFAULT_MODS },
  });
  state.terrain.mask = decodeRLE(snap.terrainRuns, state.terrain.mask.length);
  recomputeSupportAll(state.terrain);
  state.terrain.revision++;
  state.terrain.dirty = { x0: 0, y0: 0, x1: state.terrain.w, y1: state.terrain.h };

  for (const snapUnit of snap.units) {
    const u = state.units.find((x) => x.id === snapUnit.id);
    if (!u) continue;
    u.hp = snapUnit.hp;
    u.x = snapUnit.x;
    u.y = snapUnit.y;
    u.state = snapUnit.state;
  }
  state.round = Math.min(snap.round, SIM.hardRoundCap);
  state.turnIdx = snap.turnIdx;
  state.side = snap.side;
  state.cursor = { ...snap.cursor };
  state.wind = typeof snap.wind === 'number' ? snap.wind : rngFor(snap.seed, 1, 'wind').range(-1, 1);
  state.suddenDeath = !!snap.suddenDeath;
  state.tick = snap.tick;
  state.stats = {
    damageDealt: { ...snap.stats.damageDealt },
    kills: { ...snap.stats.kills },
    shots: { ...snap.stats.shots },
  };
  state.phase = 'aim';
  const active = state.units.find((u) => u.id === snap.activeId && u.state === 'alive');
  state.activeId = active ? active.id : state.units.find((u) => u.side === snap.side && u.state === 'alive')?.id ?? snap.activeId;
  return state;
}

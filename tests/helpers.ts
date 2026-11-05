import { createBattle, type SimState, type TeamMember, type Difficulty } from '../engine/state';
import type { Event } from '../engine/events';
import { step } from '../engine/sim';
import type { HeroId } from '../config/roster';

export const PLAYER_TEAM: TeamMember[] = [
  { id: 'demolisher', level: 1 },
  { id: 'scout', level: 1 },
  { id: 'medic', level: 1 },
];
export const ENEMY_TEAM: TeamMember[] = [
  { id: 'raven', level: 1 },
  { id: 'gunner', level: 1 },
  { id: 'demolisher', level: 1 },
];

export function testBattle(seed = 1, difficulty: Difficulty = 'normal', player = PLAYER_TEAM, enemy = ENEMY_TEAM): SimState {
  return createBattle({
    seed,
    difficulty,
    player: player.map((m) => ({ ...m })),
    enemy: enemy.map((m) => ({ ...m })),
  });
}

/** 用固定公式产生命令，跑完整局（确定性回归用） */
export function runScriptedBattle(state: SimState, maxShots = 400): { events: Event[]; shots: number; state: SimState } {
  const events: Event[] = [];
  let shots = 0;
  let guard = 0;
  while (state.phase !== 'over' && shots < maxShots && guard++ < 100000) {
    if (state.phase === 'aim') {
      const unit = state.units.find((u) => u.id === state.activeId)!;
      const angle = state.side === 'p' ? 30 + ((state.turnIdx * 19) % 55) : 95 + ((state.turnIdx * 23) % 55);
      const power = 0.45 + ((state.turnIdx * 13) % 50) / 100;
      shots++;
      events.push(...step(state, { c: 'fire', unitId: unit.id, angle, power, weaponId: unit.weaponId }));
    } else {
      events.push(...step(state, { c: 'skip' }));
    }
  }
  return { events, shots, state };
}

export function hashTerrain(state: SimState): string {
  let h = 0x811c9dc5;
  const mask = state.terrain.mask;
  for (let i = 0; i < mask.length; i += 7) {
    h ^= mask[i] + i;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function hpSnapshot(state: SimState): string {
  return state.units.map((u) => `${u.id}:${u.hp}`).join(',');
}

export const heroes = (ids: HeroId[]): TeamMember[] => ids.map((id) => ({ id, level: 1 }));

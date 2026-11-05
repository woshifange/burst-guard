/**
 * 回合末结算：悬空 / 埋入 / 滑落 / 坠底；猝死掉血。全部一次性结算。
 */

import { SIM, UNIT } from '../config/game.const';
import type { Event } from './events';
import { applyUnitDamage } from './damage';
import type { SimState } from './state';
import { supportAt, solidAt } from './terrain';

function footSamples(terrain: SimState['terrain'], x: number, y: number): number {
  let n = 0;
  for (const dx of [-3, 0, 3]) {
    const sx = Math.max(0, Math.min(terrain.w - 1, Math.round(x + dx)));
    if (solidAt(terrain, sx, y + 1)) n++;
  }
  return n;
}

function findGroundDir(terrain: SimState['terrain'], x: number, y: number): -1 | 0 | 1 {
  let best = 0;
  let bestD = 99;
  for (let d = 1; d <= 10; d++) {
    for (const dir of [-1, 1] as const) {
      const sx = Math.round(x + dir * d);
      if (sx < 4 || sx >= terrain.w - 4) continue;
      const sup = supportAt(terrain, sx);
      if (sup < terrain.h && Math.abs(sup - y) <= 10) {
        const cost = d + Math.abs(sup - y) * 0.5;
        if (cost < bestD) {
          bestD = cost;
          best = dir;
        }
      }
    }
  }
  return best as -1 | 0 | 1;
}

function slideDir(terrain: SimState['terrain'], x: number, y: number): -1 | 0 | 1 {
  const left = solidAt(terrain, Math.round(x - 6), y + 1);
  const right = solidAt(terrain, Math.round(x + 6), y + 1);
  if (!left && right) return -1;
  if (left && !right) return 1;
  return 0;
}

export function settleUnits(state: SimState, events: Event[]): void {
  const moves: { id: string; from: [number, number]; to: [number, number]; cause: 'fall' | 'slide' | 'lift' }[] = [];
  for (const u of state.units) {
    if (u.state !== 'alive') continue;
    const fx = u.x;
    const fy = u.y;
    let cause: 'fall' | 'slide' | 'lift' | null = null;
    let steps = 0;
    while (steps++ < UNIT.slideMaxSteps) {
      const t = state.terrain;
      u.x = Math.max(6, Math.min(t.w - 6, u.x));
      const sup = supportAt(t, u.x);
      if (sup >= t.h) {
        const dir = findGroundDir(t, u.x, u.y);
        if (dir === 0) {
          applyUnitDamage(state, u, 9999, 'void', events);
          cause = null;
          break;
        }
        u.x += dir;
        cause = 'slide';
        continue;
      }
      if (u.y < sup - 1) {
        u.y = sup;
        cause = 'fall';
        continue;
      }
      if (u.y > sup + 1) {
        u.y = sup;
        cause = 'lift';
        continue;
      }
      if (footSamples(t, u.x, u.y) < UNIT.slideSolidMin) {
        const dir = slideDir(t, u.x, u.y);
        if (dir !== 0) {
          u.x += dir;
          cause = 'slide';
          continue;
        }
      }
      break;
    }
    if (u.state === 'alive' && (Math.abs(u.x - fx) > 0.01 || Math.abs(u.y - fy) > 0.01)) {
      moves.push({ id: u.id, from: [fx, fy], to: [u.x, u.y], cause: cause ?? 'fall' });
    }
  }
  if (moves.length > 0) events.push({ t: 'settled', moves });
}

export function settleInvariantViolations(state: SimState): string[] {
  const out: string[] = [];
  for (const u of state.units) {
    if (u.state !== 'alive') continue;
    const sup = supportAt(state.terrain, u.x);
    if (sup >= state.terrain.h) out.push(`${u.id} over void`);
    else if (Math.abs(u.y - sup) > 1.5) out.push(`${u.id} y=${u.y.toFixed(1)} support=${sup}`);
  }
  return out;
}

export function suddenDeathDamage(state: SimState, round: number, events: Event[]): void {
  const dmg = SIM.suddenDeathUnitDmg + Math.max(0, round - SIM.suddenDeathAtRound) * 2;
  for (const u of state.units) {
    if (u.state !== 'alive') continue;
    applyUnitDamage(state, u, dmg, 'dmg', events);
  }
}

export function unitIsSettled(u: { state: string; x: number; y: number }, terrain: SimState['terrain']): boolean {
  return u.state === 'alive' && Math.abs(u.y - supportAt(terrain, u.x)) <= 1.5;
}

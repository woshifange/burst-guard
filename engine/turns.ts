/**
 * 回合流转、猝死、胜负判定（无城堡：全灭对方即胜）。
 */

import { SIM } from '../config/game.const';
import type { Event } from './events';
import { rngFor } from './rng';
import { aliveCount, sideHp, type SimState, type Side, type Unit } from './state';
import { suddenDeathDamage } from './support';

function unitsOf(state: SimState, side: Side): Unit[] {
  return state.units.filter((u) => u.side === side);
}

export function nextAliveCursor(state: SimState, side: Side): number {
  const list = unitsOf(state, side);
  for (let i = 1; i <= list.length; i++) {
    const idx = (state.cursor[side] + i) % list.length;
    if (list[idx].state === 'alive') return idx;
  }
  return state.cursor[side];
}

export function activeUnitOf(state: SimState, side: Side): Unit | null {
  const list = unitsOf(state, side);
  const cur = list[state.cursor[side]];
  if (cur && cur.state === 'alive') return cur;
  return list.find((u) => u.state === 'alive') ?? null;
}

export function rollWind(state: SimState): number {
  return Number(rngFor(state.seed, state.round + 1, 'wind').range(-1, 1).toFixed(3));
}

export function checkVictory(state: SimState, events: Event[]): boolean {
  if (state.phase === 'over') return true;
  const pAlive = aliveCount(state, 'p');
  const aAlive = aliveCount(state, 'a');
  if (pAlive > 0 && aAlive > 0) {
    if (state.round > SIM.hardRoundCap) {
      const winner: Side = sideHp(state, 'p') === sideHp(state, 'a')
        ? (state.side === 'p' ? 'a' : 'p')
        : sideHp(state, 'p') > sideHp(state, 'a') ? 'p' : 'a';
      state.winner = winner;
      state.phase = 'over';
      events.push({ t: 'gameOver', winner });
      return true;
    }
    return false;
  }
  const winner: Side = pAlive === 0 && aAlive === 0 ? (state.side === 'p' ? 'a' : 'p') : aAlive === 0 ? 'p' : 'a';
  state.winner = winner;
  state.phase = 'over';
  events.push({ t: 'gameOver', winner });
  return true;
}

export function endTurn(state: SimState, events: Event[]): void {
  const justActed = state.side;
  state.cursor[justActed] = nextAliveCursor(state, justActed);

  if (justActed === 'p') {
    state.side = 'a';
  } else {
    if (state.round >= state.maxRound) state.suddenDeath = true;
    if (state.suddenDeath && state.round > state.maxRound) {
      events.push({ t: 'suddenDeath', round: state.round });
      suddenDeathDamage(state, state.round, events);
    }
    if (checkVictory(state, events)) return;
    state.round++;
    state.wind = rollWind(state);
    state.side = 'p';
    events.push({ t: 'wind', v: state.wind, round: state.round });
  }

  if (checkVictory(state, events)) return;
  const active = activeUnitOf(state, state.side);
  if (!active) {
    const winner: Side = state.side === 'p' ? 'a' : 'p';
    state.winner = winner;
    state.phase = 'over';
    events.push({ t: 'gameOver', winner });
    return;
  }
  state.turnIdx++;
  state.activeId = active.id;
  state.phase = 'aim';
  events.push({ t: 'turnChanged', unitId: active.id, side: state.side, round: state.round, turnIdx: state.turnIdx });
}

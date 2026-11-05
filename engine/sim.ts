/**
 * 模拟入口：step(state, cmd) -> events[]
 * 确定性 reducer：同 seed + 同命令序列 → 同事件哈希。
 *
 * 设计说明（与“纯函数”的偏差）：地形掩码 3.2MB，逐 tick 深拷贝不可接受，
 * 因此 state 是可变工作副本；determinism 由“无 Math.random / 固定 dt / 有序意图队列”保证。
 * 需要并行的测试请用 cloneStateForTest。
 */

import { AIM, SIM } from '../config/game.const';
import type { WeaponId } from '../config/roster';
import type { Event } from './events';
import { resolveExplosion } from './damage';
import { activeUnit, type SimState } from './state';
import { stepProjectiles, stepSecondaries } from './projectile';
import { settleUnits } from './support';
import { checkVictory, endTurn } from './turns';
import { fireWeapon } from './weapons';

export type Cmd =
  | { c: 'fire'; unitId: string; angle: number; power: number; weaponId: string }
  | { c: 'select'; unitId: string }
  | { c: 'skip' };

export function flushIntents(state: SimState, events: Event[]): void {
  while (state.intents.length > 0) {
    const intent = state.intents.shift()!;
    resolveExplosion(state, intent, events);
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function step(state: SimState, cmd: Cmd): Event[] {
  const events: Event[] = [];
  if (state.phase === 'over') return events;
  state.tick++;

  if (state.phase === 'aim') {
    if (cmd.c === 'select') {
      const list = state.units.filter((u) => u.side === state.side);
      const idx = list.findIndex((u) => u.id === cmd.unitId && u.state === 'alive');
      if (idx >= 0 && state.side === 'p') {
        state.cursor.p = idx;
        state.activeId = cmd.unitId;
        events.push({ t: 'unitSelected', unitId: cmd.unitId, side: 'p' });
      }
      return events;
    }
    if (cmd.c === 'fire') {
      const u = activeUnit(state);
      if (cmd.unitId !== u.id || u.state !== 'alive') return events;
      const def = u.weaponId;
      const weaponId = (cmd.weaponId || def) as WeaponId;
      const angle = clamp(cmd.angle, AIM.angleMin, 180);
      const power = clamp(cmd.power, 0, 1);
      fireWeapon(state, u, angle, power, events);
      void weaponId;
      state.phase = 'flight';
    } else if (cmd.c === 'skip') {
      state.phase = 'settle';
    }
    return events;
  }

  if (state.phase === 'flight') {
    stepSecondaries(state, events);
    stepProjectiles(state, events);
    flushIntents(state, events);
    if (state.projectiles.length === 0 && state.secondaries.length === 0 && state.intents.length === 0) {
      state.phase = 'settle';
    }
    return events;
  }

  if (state.phase === 'settle') {
    flushIntents(state, events);
    settleUnits(state, events);
    if (!checkVictory(state, events)) endTurn(state, events);
    return events;
  }

  return events;
}

/** 测试/工具：一直推进到指定阶段（不做决策） */
export function advance(state: SimState, maxTicks = SIM.predictSteps * 4): void {
  let n = 0;
  while (state.phase !== 'aim' && state.phase !== 'over' && n++ < maxTicks) {
    step(state, { c: 'skip' });
  }
}

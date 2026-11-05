/**
 * AI 对手：候选 = 角度 bin × 力度档，用同一积分器预演，按评分取 top-K。
 * 无城堡后评分只关心：打伤害、拿击杀、别自伤、别过量、别被风带偏。
 */

import { AI, WORLD } from '../config/game.const';
import { WEAPON_DEFS, type WeaponId } from '../config/roster';
import { falloffFactor } from './damage';
import type { Event } from './events';
import { simulateShot } from './projectile';
import { rngFor } from './rng';
import { activeUnit, type Difficulty, type SimState, type Unit } from './state';
import { step, type Cmd } from './sim';

const KILL_VALUE = 90;

export interface BlastEval {
  enemyDmg: number;
  ownDmg: number;
  kills: number;
  overkill: number;
}

function evalBlast(state: SimState, self: Unit, x: number, y: number, radius: number, baseDmg: number, mode: 'linear' | 'sq'): BlastEval {
  const out: BlastEval = { enemyDmg: 0, ownDmg: 0, kills: 0, overkill: 0 };
  const r2 = radius * radius;
  for (const u of state.units) {
    if (u.state !== 'alive') continue;
    const dx = u.x - x;
    const dy = u.y - 13 - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const dmg = baseDmg * falloffFactor(Math.sqrt(d2), radius, mode);
    if (u.side === self.side) out.ownDmg += dmg;
    else {
      out.enemyDmg += dmg;
      if (dmg >= u.hp) out.kills += 1;
      out.overkill += Math.max(0, dmg - u.hp) * 0.6;
    }
  }
  return out;
}

function combinedScore(state: SimState, unit: Unit, ix: number, iy: number): number {
  const def = WEAPON_DEFS[unit.weaponId as WeaponId];
  const dmg = def.dmg * unit.dmgMul;
  const countMul = def.count > 1 ? Math.min(1 + (def.count - 1) * 0.22, 4) : 1;
  const e = evalBlast(state, unit, ix, iy, def.blastR, dmg * countMul, def.falloff);
  let score = 1.0 * e.enemyDmg + 1.6 * KILL_VALUE * e.kills - 1.2 * e.ownDmg - 0.4 * e.overkill;
  if (def.secondary) {
    const e2 = evalBlast(state, unit, ix, iy, def.secondary.radius, def.secondary.dmg * unit.dmgMul, def.falloff);
    score += 0.9 * (1.0 * e2.enemyDmg + 1.6 * KILL_VALUE * e2.kills - 1.2 * e2.ownDmg - 0.4 * e2.overkill);
  }
  return score;
}

export interface Candidate {
  angle: number;
  power: number;
  score: number;
  impact: { x: number; y: number } | null;
}

export function generateCandidates(state: SimState, difficulty: Difficulty): Candidate[] {
  const unit = activeUnit(state);
  if (!unit) return [];
  const cfg = AI.difficulty[difficulty];
  const bins = Math.max(6, Math.round(AI.angleBins * cfg.candidateScale));
  const out: Candidate[] = [];
  const origin = { x: unit.x, y: unit.y - 22 };
  for (let i = 0; i < bins; i++) {
    const t = (i + 0.5) / bins;
    const angle = state.side === 'p' ? 90 - t * 82 : 90 + t * 82;
    for (const power of AI.powerTiers) {
      const res = simulateShot(state, origin, angle, power, unit.weaponId as WeaponId, state.wind, 260);
      if (!res.impact || res.impact.kind === 'out') continue;
      out.push({ angle, power, score: combinedScore(state, unit, res.impact.x, res.impact.y), impact: { x: res.impact.x, y: res.impact.y } });
    }
  }
  return out;
}

function gaussian(rngNext: () => number): number {
  const u = Math.max(1e-9, rngNext());
  const v = rngNext();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function chooseCommand(state: SimState, difficulty: Difficulty): Cmd {
  const unit = activeUnit(state);
  if (!unit) return { c: 'skip' };
  const cfg = AI.difficulty[difficulty];
  const candidates = generateCandidates(state, difficulty);
  if (candidates.length === 0) return { c: 'skip' };
  candidates.sort((a, b) => b.score - a.score || b.angle - a.angle || b.power - a.power);
  const rng = rngFor(state.seed, state.turnIdx, 'ai');
  const topK = Math.min(cfg.keep, candidates.length);
  const pick = candidates[rng.int(topK)];
  let angle = pick.angle + gaussian(() => rng.next()) * cfg.angleNoiseDeg;
  let power = pick.power;
  if (cfg.powerJitter > 0) power += (rng.int(cfg.powerJitter * 2 + 1) - cfg.powerJitter) * 0.05;
  angle = Math.max(2, Math.min(178, angle));
  power = Math.max(0.2, Math.min(1, power));
  return { c: 'fire', unitId: unit.id, angle, power, weaponId: unit.weaponId };
}

export function playAutoBattle(
  state: SimState,
  pDifficulty: Difficulty,
  aDifficulty: Difficulty,
  maxShots = 500,
): { state: SimState; events: Event[]; shots: number } {
  const allEvents: Event[] = [];
  let shots = 0;
  let guard = 0;
  while (state.phase !== 'over' && shots < maxShots && guard++ < 200000) {
    if (state.phase === 'aim') {
      const cmd = chooseCommand(state, state.side === 'p' ? pDifficulty : aDifficulty);
      if (cmd.c === 'skip') for (const e of step(state, { c: 'skip' })) allEvents.push(e);
      else {
        shots++;
        for (const e of step(state, cmd)) allEvents.push(e);
      }
    } else {
      for (const e of step(state, { c: 'skip' })) allEvents.push(e);
    }
  }
  return { state, events: allEvents, shots };
}

void WORLD;

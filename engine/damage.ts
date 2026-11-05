/**
 * 伤害曲线、爆炸结算、单位受伤（无城堡：只打人 + 挖地形）。
 */

import type { Falloff } from '../config/roster';
import { carveCrater } from './terrain';
import type { Event } from './events';
import type { ExplosionIntent, SimState, Unit } from './state';

export function falloffFactor(dist: number, radius: number, mode: Falloff): number {
  if (radius <= 0 || dist >= radius) return 0;
  const u = 1 - Math.max(0, dist) / radius;
  return mode === 'linear' ? u : u * u;
}

export function damageAt(base: number, dist: number, radius: number, mode: Falloff): number {
  return base * falloffFactor(dist, radius, mode);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function unitsInBlast(units: readonly Unit[], x: number, y: number, radius: number): Unit[] {
  const r2 = radius * radius;
  const out: Unit[] = [];
  for (const u of units) {
    if (u.state !== 'alive') continue;
    if (dist2(u.x, u.y - 13, x, y) <= r2) out.push(u);
  }
  return out;
}

export function unitExplosionDamage(base: number, u: Unit, x: number, y: number, radius: number, mode: Falloff): number {
  const d = Math.sqrt(dist2(u.x, u.y - 13, x, y));
  return Math.round(damageAt(base, d, radius, mode));
}

export function applyUnitDamage(state: SimState, u: Unit, dmg: number, cause: 'dmg' | 'void', events: Event[]): void {
  if (u.state !== 'alive' || dmg <= 0) return;
  const real = Math.min(u.hp, Math.max(0, Math.round(dmg)));
  if (real <= 0) return;
  u.hp -= real;
  const attacker = u.side === 'p' ? 'a' : 'p';
  state.stats.damageDealt[attacker] += real;
  events.push({ t: 'unitDamaged', id: u.id, dmg: real, hp: u.hp });
  if (u.hp <= 0) {
    u.hp = 0;
    u.state = 'dead';
    state.stats.kills[attacker] += 1;
    events.push({ t: 'unitDead', id: u.id, cause });
  }
}

/** 结算一条爆炸意图：地形 → 单位 → 医疗 */
export function resolveExplosion(state: SimState, intent: ExplosionIntent, events: Event[]): void {
  const bbox = carveCrater(state.terrain, intent.x, intent.y, intent.terrainRadius);
  if (bbox) events.push({ t: 'terrain', bbox: [bbox.x0, bbox.y0, bbox.x1, bbox.y1] });
  for (const u of unitsInBlast(state.units, intent.x, intent.y, intent.radius)) {
    const dmg = unitExplosionDamage(intent.dmg, u, intent.x, intent.y, intent.radius, intent.falloff);
    if (dmg > 0) applyUnitDamage(state, u, dmg, 'dmg', events);
  }
  if (intent.selfHeal > 0) {
    const healR = Math.max(96, intent.radius * 2);
    for (const u of state.units) {
      if (u.side !== intent.side || u.state !== 'alive') continue;
      const d = Math.sqrt(dist2(u.x, u.y - 13, intent.x, intent.y));
      if (d > healR || u.hp >= u.maxHp) continue;
      const amount = Math.min(u.maxHp - u.hp, Math.round(intent.selfHeal));
      if (amount <= 0) continue;
      u.hp += amount;
      events.push({ t: 'unitHealed', id: u.id, amount, hp: u.hp });
    }
  }
}

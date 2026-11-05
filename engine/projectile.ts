/**
 * 抛体积分 + 碰撞 + 弹道预演（无城堡：只与单位/地形碰撞）。
 */

import { SIM, WIND, WORLD } from '../config/game.const';
import { WEAPON_DEFS, type WeaponId } from '../config/roster';
import { solidAt } from './terrain';
import type { ExplosionIntent, Projectile, SecondaryBlast, SimState, Unit } from './state';

export interface Impact {
  x: number;
  y: number;
  kind: 'terrain' | 'unit' | 'out';
  unit?: Unit;
}

export function windAccel(wind: number): number {
  return wind * WIND.accel;
}

function hitUnit(state: SimState, x: number, y: number, radius: number): Unit | null {
  for (const u of state.units) {
    if (u.state !== 'alive') continue;
    const dx = u.x - x;
    const dy = u.y - 13 - y;
    const rr = 9 + radius;
    if (dx * dx + dy * dy <= rr * rr) return u;
  }
  return null;
}

function isCollision(state: SimState, x: number, y: number, radius: number): Impact | null {
  if (x < -80 || x > WORLD.w + 80 || y > WORLD.h + 80) return { x, y, kind: 'out' };
  const u = hitUnit(state, x, y, radius);
  if (u) return { x, y, kind: 'unit', unit: u };
  if (solidAt(state.terrain, x, y)) return { x, y, kind: 'terrain' };
  return null;
}

function pushBlast(
  state: SimState,
  p: { x: number; y: number; weaponId: WeaponId; side: 'p' | 'a'; ownerId: string; dmgMul: number },
  secondary: boolean,
  events: import('./events').Event[],
): void {
  const def = WEAPON_DEFS[p.weaponId];
  const blast = secondary && def.secondary ? def.secondary : null;
  const baseR = blast ? blast.radius : def.blastR;
  const terrainMul = (blast ? 1 : def.terrainMul) * state.mods[p.side].terrainMul;
  const intent: ExplosionIntent = {
    x: p.x,
    y: p.y,
    radius: baseR,
    terrainRadius: baseR * terrainMul,
    dmg: (blast ? blast.dmg : def.dmg) * p.dmgMul,
    falloff: def.falloff,
    side: p.side,
    ownerId: p.ownerId,
    weaponId: p.weaponId,
    selfHeal: secondary ? 0 : def.selfHeal,
    secondary,
  };
  state.intents.push(intent);
  events.push({
    t: 'explosion', x: p.x, y: p.y, r: intent.radius, dmg: Math.round(intent.dmg),
    side: p.side, weaponId: p.weaponId, secondary,
  });
  if (!secondary && def.secondary) {
    const sb: SecondaryBlast = {
      x: p.x, y: p.y, radius: def.secondary.radius, dmg: def.secondary.dmg * p.dmgMul,
      side: p.side, ownerId: p.ownerId, weaponId: p.weaponId, atTick: state.tick + def.secondary.delayTicks,
    };
    state.secondaries.push(sb);
  }
}

export function stepProjectiles(state: SimState, events: import('./events').Event[]): void {
  if (state.projectiles.length === 0) return;
  const dt = SIM.dtMs / 1000 / SIM.subSteps;
  const ax = windAccel(state.wind);
  for (const p of state.projectiles) {
    if (p.dead) continue;
    let impact: Impact | null = null;
    for (let s = 0; s < SIM.subSteps; s++) {
      p.vx += ax * dt;
      p.vy += SIM.gravity * p.gravityScale * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      impact = isCollision(state, p.x, p.y, p.radius);
      if (impact) break;
    }
    p.age++;
    if (impact) {
      p.dead = true;
      events.push({ t: 'impact', id: p.id, x: impact.x, y: impact.y });
      if (impact.kind !== 'out') pushBlast(state, { ...p, x: impact.x, y: impact.y }, false, events);
      continue;
    }
    events.push({ t: 'step', id: p.id, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, vy: p.vy });
    if (p.age > 420) p.dead = true;
  }
  state.projectiles = state.projectiles.filter((p) => !p.dead);
}

export function stepSecondaries(state: SimState, events: import('./events').Event[]): void {
  if (state.secondaries.length === 0) return;
  const due = state.secondaries.filter((s) => state.tick >= s.atTick);
  if (due.length === 0) return;
  state.secondaries = state.secondaries.filter((s) => state.tick < s.atTick);
  for (const s of due) {
    state.intents.push({
      x: s.x, y: s.y, radius: s.radius, terrainRadius: s.radius, dmg: s.dmg,
      falloff: WEAPON_DEFS[s.weaponId].falloff, side: s.side, ownerId: s.ownerId,
      weaponId: s.weaponId, selfHeal: 0, secondary: true,
    });
    events.push({ t: 'explosion', x: s.x, y: s.y, r: s.radius, dmg: Math.round(s.dmg), side: s.side, weaponId: s.weaponId, secondary: true });
  }
}

export interface SimShotResult {
  impact: Impact | null;
  points: { x: number; y: number }[];
}

export function simulateShot(
  state: SimState,
  origin: { x: number; y: number },
  angleDeg: number,
  power: number,
  weaponId: WeaponId,
  wind: number,
  maxSteps = SIM.predictSteps * 2,
): SimShotResult {
  const def = WEAPON_DEFS[weaponId];
  const a = (angleDeg * Math.PI) / 180;
  const speed = def.speed * (0.35 + 0.65 * Math.max(0, Math.min(1, power)));
  let x = origin.x + Math.cos(a) * 22;
  let y = origin.y - Math.sin(a) * 22;
  let vx = Math.cos(a) * speed;
  let vy = -Math.sin(a) * speed;
  const dt = SIM.dtMs / 1000 / SIM.subSteps;
  const ax = windAccel(wind);
  const points: { x: number; y: number }[] = [];
  for (let step = 0; step < maxSteps; step++) {
    let hit: Impact | null = null;
    for (let s = 0; s < SIM.subSteps; s++) {
      vx += ax * dt;
      vy += SIM.gravity * def.gravityScale * dt;
      x += vx * dt;
      y += vy * dt;
      hit = isCollision(state, x, y, def.radius);
      if (hit) break;
    }
    points.push({ x, y });
    if (hit) return { impact: hit, points };
    if (x < -80 || x > WORLD.w + 80 || y > WORLD.h + 80) return { impact: { x, y, kind: 'out' }, points };
  }
  return { impact: null, points };
}

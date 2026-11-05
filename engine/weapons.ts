/**
 * 武器发射：把 fire 命令变成弹体（含散布）。
 */

import { WIND } from '../config/game.const';
import { WEAPON_DEFS, type WeaponId } from '../config/roster';
import type { Event } from './events';
import { rngFor } from './rng';
import type { Projectile, SimState, Unit } from './state';

export function launchSpeed(defSpeed: number, power: number): number {
  return defSpeed * (0.35 + 0.65 * Math.max(0, Math.min(1, power)));
}

export function fireWeapon(state: SimState, unit: Unit, angleDeg: number, power: number, events: Event[]): void {
  const def = WEAPON_DEFS[unit.weaponId as WeaponId];
  const rng = rngFor(state.seed, state.turnIdx, 'scatter');
  const muzzleX = unit.x;
  const muzzleY = unit.y - 22;
  const count = def.count;
  for (let i = 0; i < count; i++) {
    const jitterA = (rng.next() * 2 - 1) * def.spreadDeg;
    const jitterS = 1 + (rng.next() * 2 - 1) * 0.025;
    const a = ((angleDeg + jitterA) * Math.PI) / 180;
    const speed = launchSpeed(def.speed, power) * jitterS;
    const p: Projectile = {
      id: state.nextProjectileId++,
      weaponId: def.id,
      side: unit.side,
      ownerId: unit.id,
      x: muzzleX + Math.cos(a) * 22,
      y: muzzleY - Math.sin(a) * 22,
      vx: Math.cos(a) * speed,
      vy: -Math.sin(a) * speed,
      radius: def.radius,
      age: 0,
      gravityScale: def.gravityScale,
      dmgMul: unit.dmgMul,
      dead: false,
    };
    state.projectiles.push(p);
  }
  state.stats.shots[unit.side]++;
  events.push({
    t: 'shot',
    side: unit.side,
    unitId: unit.id,
    weaponId: def.id,
    angle: angleDeg,
    power,
    count,
  });
  // 后坐力表现：引擎不做位移，view 自己抖一下
  void WIND;
}

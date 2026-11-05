/**
 * 战斗状态模型 + 初始化（无城堡版：胜负只取决于英雄存活）。
 */

import { SIM, UNIT, WIND } from '../config/game.const';
import { getMap } from '../config/maps';
import { HERO_BY_ID, type HeroId, type Side, type WeaponId, heroDmg, heroHp } from '../config/roster';
import { rngFor } from './rng';
import { createTerrain, type Terrain } from './terrain';

export type { Side } from '../config/roster';
export type Phase = 'aim' | 'flight' | 'settle' | 'over';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Unit {
  id: string;
  side: Side;
  heroId: HeroId;
  /** 星级 1..5 */
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: 'alive' | 'dead';
  weaponId: WeaponId;
  dmgMul: number;
}

export interface Projectile {
  id: number;
  weaponId: WeaponId;
  side: Side;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  age: number;
  gravityScale: number;
  dmgMul: number;
  dead: boolean;
}

export interface SecondaryBlast {
  x: number;
  y: number;
  radius: number;
  dmg: number;
  side: Side;
  ownerId: string;
  weaponId: WeaponId;
  atTick: number;
}

export interface ExplosionIntent {
  x: number;
  y: number;
  radius: number;
  /** 地形挖掘半径（工兵/训练加成） */
  terrainRadius: number;
  dmg: number;
  falloff: 'linear' | 'sq';
  side: Side;
  ownerId: string;
  weaponId: WeaponId;
  selfHeal: number;
  secondary: boolean;
}

export interface BattleStats {
  damageDealt: Record<Side, number>;
  kills: Record<Side, number>;
  shots: Record<Side, number>;
}

export interface SideMods {
  hpMul: number;
  dmgMul: number;
  terrainMul: number;
}

export const DEFAULT_MODS: SideMods = { hpMul: 1, dmgMul: 1, terrainMul: 1 };

export interface SimState {
  seed: number;
  mapId: string;
  tick: number;
  round: number;
  maxRound: number;
  turnIdx: number;
  side: Side;
  phase: Phase;
  wind: number;
  terrain: Terrain;
  units: Unit[];
  projectiles: Projectile[];
  secondaries: SecondaryBlast[];
  intents: ExplosionIntent[];
  cursor: Record<Side, number>;
  activeId: string;
  winner: Side | null;
  suddenDeath: boolean;
  stats: BattleStats;
  difficulty: Difficulty;
  nextProjectileId: number;
  mods: Record<Side, SideMods>;
}

export type TeamMember = { id: HeroId; level: number };

export interface BattleConfig {
  seed: number;
  difficulty: Difficulty;
  player: TeamMember[];
  enemy: TeamMember[];
  mapId?: string;
  mods?: Partial<Record<Side, Partial<SideMods>>>;
}

export function sideUnits(state: SimState, side: Side): Unit[] {
  return state.units.filter((u) => u.side === side);
}

export function activeUnit(state: SimState): Unit {
  const u = state.units.find((x) => x.id === state.activeId);
  if (!u) throw new Error('no active unit');
  return u;
}

export function aliveCount(state: SimState, side: Side): number {
  let n = 0;
  for (const u of state.units) if (u.side === side && u.state === 'alive') n++;
  return n;
}

export function sideHp(state: SimState, side: Side): number {
  let hp = 0;
  for (const u of state.units) if (u.side === side && u.state === 'alive') hp += u.hp;
  return Math.round(hp);
}

export function sideMaxHp(state: SimState, side: Side): number {
  let hp = 0;
  for (const u of state.units) if (u.side === side) hp += u.maxHp;
  return Math.round(hp);
}

/** 每边站位：按人数居中排开，保证都站在固定的边缘高地上 */
const POS: Record<Side, number[]> = {
  p: [196, 224, 252, 280],
  a: [1084, 1056, 1028, 1000],
};
const POS_BY_COUNT: Record<number, Record<Side, number[]>> = {
  2: { p: [210, 252], a: [1070, 1028] },
  3: { p: [200, 232, 264], a: [1080, 1048, 1016] },
  4: POS,
};

function unitXs(side: Side, count: number): number[] {
  return POS_BY_COUNT[count]?.[side] ?? POS[side].slice(0, Math.max(2, count));
}

function createUnits(side: Side, team: TeamMember[], terrain: Terrain, mods: SideMods): Unit[] {
  const xs = unitXs(side, Math.min(UNIT.maxTeam, Math.max(UNIT.minTeam, team.length)));
  return team.slice(0, UNIT.maxTeam).map((m, i) => {
    const def = HERO_BY_ID[m.id];
    const x = xs[i] ?? xs[xs.length - 1];
    const maxHp = Math.round(heroHp(def, m.level) * mods.hpMul);
    return {
      id: `${side}${i}`,
      side,
      heroId: def.id,
      level: m.level,
      hp: maxHp,
      maxHp,
      x,
      y: terrain.support[Math.round(x)],
      state: 'alive' as const,
      weaponId: def.weaponIds[0],
      dmgMul: heroDmg(m.level) * mods.dmgMul,
    };
  });
}

export function createBattle(cfg: BattleConfig): SimState {
  const map = getMap(cfg.mapId);
  const terrain = createTerrain(1280, 640, map.surface);
  const mods: Record<Side, SideMods> = {
    p: { ...DEFAULT_MODS, ...(cfg.mods?.p ?? {}) },
    a: { ...DEFAULT_MODS, ...(cfg.mods?.a ?? {}) },
  };
  const units = [...createUnits('p', cfg.player, terrain, mods.p), ...createUnits('a', cfg.enemy, terrain, mods.a)];
  const wind = Number(rngFor(cfg.seed, 0, 'wind').range(-WIND.max, WIND.max).toFixed(3));
  const first = units.find((u) => u.side === 'p');
  return {
    seed: cfg.seed >>> 0,
    mapId: map.id,
    tick: 0,
    round: 1,
    maxRound: SIM.maxRound,
    turnIdx: 0,
    side: 'p',
    phase: 'aim',
    wind,
    terrain,
    units,
    projectiles: [],
    secondaries: [],
    intents: [],
    cursor: { p: 0, a: 0 },
    activeId: first?.id ?? 'p0',
    winner: null,
    suddenDeath: false,
    stats: { damageDealt: { p: 0, a: 0 }, kills: { p: 0, a: 0 }, shots: { p: 0, a: 0 } },
    difficulty: cfg.difficulty,
    nextProjectileId: 1,
    mods,
  };
}

/** 深拷贝（测试用） */
export function cloneStateForTest(state: SimState): SimState {
  return {
    ...state,
    units: state.units.map((u) => ({ ...u })),
    projectiles: state.projectiles.map((p) => ({ ...p })),
    secondaries: state.secondaries.map((s) => ({ ...s })),
    intents: state.intents.map((i) => ({ ...i })),
    cursor: { ...state.cursor },
    stats: {
      damageDealt: { ...state.stats.damageDealt },
      kills: { ...state.stats.kills },
      shots: { ...state.stats.shots },
    },
    mods: { p: { ...state.mods.p }, a: { ...state.mods.a } },
    terrain: {
      ...state.terrain,
      mask: new Uint32Array(state.terrain.mask),
      support: new Int32Array(state.terrain.support),
      dirty: state.terrain.dirty ? { ...state.terrain.dirty } : null,
    },
  };
}

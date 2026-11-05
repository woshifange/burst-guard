import { ECONOMY } from './game.const';

export type Side = 'p' | 'a';
export type WeaponId =
  | 'bomb'
  | 'scout_cluster'
  | 'raven_bomb'
  | 'gunner_shard'
  | 'medic_shot'
  | 'mortar_shell'
  | 'sapper_charge';
export type HeroId = 'demolisher' | 'scout' | 'raven' | 'gunner' | 'medic' | 'mortar' | 'sapper';
export type Falloff = 'linear' | 'sq';

export interface SecondaryBlast {
  delayTicks: number;
  radius: number;
  dmg: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  mass: number;
  radius: number;
  blastR: number;
  dmg: number;
  falloff: Falloff;
  count: number;
  scatterR: number;
  spreadDeg: number;
  speed: number;
  gravityScale: number;
  secondary: SecondaryBlast | null;
  selfHeal: number;
  /** 地形挖掘倍率（工兵/攻城弹 > 1） */
  terrainMul: number;
  tint: number;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  weaponIds: WeaponId[];
  hpBase: number;
  cost: { shard: number };
  tag: 'damager' | 'scout' | 'raven' | 'gunner' | 'medic' | 'mortar' | 'sapper';
  color: number;
  accent: number;
  shape: 'bulk' | 'slim' | 'cloak' | 'rifle' | 'cross';
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  bomb: {
    id: 'bomb', name: '重炮炸弹', mass: 1, radius: 7, blastR: 52, dmg: 38,
    falloff: 'linear', count: 1, scatterR: 0, spreadDeg: 0, speed: 950,
    gravityScale: 1, secondary: null, selfHeal: 0, terrainMul: 1, tint: 0xffb347,
  },
  scout_cluster: {
    id: 'scout_cluster', name: '侦察集束', mass: 0.6, radius: 3.2, blastR: 26, dmg: 12,
    falloff: 'sq', count: 15, scatterR: 52, spreadDeg: 6.5, speed: 830,
    gravityScale: 1, secondary: null, selfHeal: 0, terrainMul: 1, tint: 0x7ee787,
  },
  raven_bomb: {
    id: 'raven_bomb', name: '乌鸦双爆', mass: 0.9, radius: 6, blastR: 34, dmg: 22,
    falloff: 'linear', count: 2, scatterR: 14, spreadDeg: 2.2, speed: 900,
    gravityScale: 1, secondary: { delayTicks: 26, radius: 40, dmg: 20 },
    selfHeal: 0, terrainMul: 1, tint: 0x9d8cff,
  },
  gunner_shard: {
    id: 'gunner_shard', name: '枪手穿甲', mass: 0.5, radius: 4, blastR: 14, dmg: 14,
    falloff: 'sq', count: 1, scatterR: 0, spreadDeg: 0.6, speed: 1500,
    gravityScale: 0.12, secondary: null, selfHeal: 0, terrainMul: 1, tint: 0x6ee7ff,
  },
  medic_shot: {
    id: 'medic_shot', name: '医疗弹', mass: 0.8, radius: 6, blastR: 26, dmg: 10,
    falloff: 'linear', count: 1, scatterR: 0, spreadDeg: 0, speed: 900,
    gravityScale: 1, secondary: null, selfHeal: 16, terrainMul: 1, tint: 0x8bf0c0,
  },
  mortar_shell: {
    id: 'mortar_shell', name: '迫击重弹', mass: 1.4, radius: 8, blastR: 58, dmg: 44,
    falloff: 'sq', count: 1, scatterR: 0, spreadDeg: 0, speed: 760,
    gravityScale: 1.15, secondary: null, selfHeal: 0, terrainMul: 1.2, tint: 0xff9d5c,
  },
  sapper_charge: {
    id: 'sapper_charge', name: '工兵爆破', mass: 1, radius: 7, blastR: 34, dmg: 16,
    falloff: 'linear', count: 1, scatterR: 0, spreadDeg: 0, speed: 880,
    gravityScale: 1, secondary: null, selfHeal: 0, terrainMul: 1.7, tint: 0xd9a066,
  },
};

export const HERO_DEFS: HeroDef[] = [
  { id: 'demolisher', name: '破坏者', title: '一锤定音', weaponIds: ['bomb'], hpBase: 110, cost: { shard: 0 }, tag: 'damager', color: 0xff8a3d, accent: 0xffd166, shape: 'bulk' },
  { id: 'scout', name: '侦察', title: '弹雨覆盖', weaponIds: ['scout_cluster'], hpBase: 85, cost: { shard: 0 }, tag: 'scout', color: 0x7ee787, accent: 0xd2ff8f, shape: 'slim' },
  { id: 'gunner', name: '枪手', title: '直线压制', weaponIds: ['gunner_shard'], hpBase: 90, cost: { shard: 0 }, tag: 'gunner', color: 0x6ee7ff, accent: 0xc0f4ff, shape: 'rifle' },
  { id: 'raven', name: '乌鸦', title: '延迟处刑', weaponIds: ['raven_bomb'], hpBase: 95, cost: { shard: ECONOMY.unlockShards.raven }, tag: 'raven', color: 0x9d8cff, accent: 0xd6ccff, shape: 'cloak' },
  { id: 'medic', name: '医疗', title: '边打边奶', weaponIds: ['medic_shot'], hpBase: 90, cost: { shard: ECONOMY.unlockShards.medic }, tag: 'medic', color: 0x8bf0c0, accent: 0xe0fff2, shape: 'cross' },
  { id: 'mortar', name: '迫击', title: '超远重击', weaponIds: ['mortar_shell'], hpBase: 100, cost: { shard: ECONOMY.unlockShards.mortar }, tag: 'mortar', color: 0xff9d5c, accent: 0xffd9b0, shape: 'bulk' },
  { id: 'sapper', name: '工兵', title: '挖穿地形', weaponIds: ['sapper_charge'], hpBase: 95, cost: { shard: ECONOMY.unlockShards.sapper }, tag: 'sapper', color: 0xd9a066, accent: 0xfff0cc, shape: 'slim' },
];

export const HERO_BY_ID = Object.fromEntries(HERO_DEFS.map((h) => [h.id, h])) as Record<HeroId, HeroDef>;
export const WEAPON_BY_ID = WEAPON_DEFS;

/** 星级解锁阈值：全队星数达到即解锁（也可用碎片直接解锁） */
export const HERO_UNLOCK_STARS: Record<HeroId, number> = {
  demolisher: 0,
  scout: 0,
  gunner: 0,
  raven: 5,
  medic: 7,
  mortar: 10,
  sapper: 14,
};

export function heroHp(def: HeroDef, stars: number): number {
  return Math.round(def.hpBase * (1 + 0.18 * (stars - 1)));
}
export function heroDmg(stars: number): number {
  return 1 + 0.12 * (stars - 1);
}

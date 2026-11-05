/**
 * 存档 schema v3：无城堡、纯击杀。
 * 新增：英雄星级（heroStars）、队伍训练（firepower/armor/siege）、按星级/胜场解锁上场名额。
 */

import type { HeroId } from '../config/roster';
import type { BattleSnapshot } from '../engine/snapshot';

export type Quality = 'hi' | 'lo';

export interface SaveSettings {
  sound: boolean;
  shake: boolean;
  quality: Quality;
}

export interface SaveProfile {
  name: string;
  battles: number;
  wins: number;
}

export interface TrainingLevels {
  firepower: number;
  armor: number;
  siege: number;
}

export type TrainingKey = keyof TrainingLevels;

export interface SaveProgression {
  coins: number;
  shards: number;
  ownedHeroes: HeroId[];
  /** 英雄星级 1..5（旧版 heroLevels 迁移而来） */
  heroStars: Record<string, number>;
  training: TrainingLevels;
  /** 出战阵容（长度 = 当前上场名额，2..4） */
  team: HeroId[];
  battleIndex: number;
}

/** v1 档 */
export interface SaveFileV1 {
  version: 1;
  settings: SaveSettings;
  profile: { name: string };
  progression: {
    coins: number;
    shards: number;
    ownedHeroes: string[];
    heroLevels: Record<string, number>;
    castleLevels: Record<string, number>;
  };
  lastBattleSnapshot: string | null;
}

/** v2 档（有城堡） */
export interface SaveFileV2 {
  version: 2;
  settings: SaveSettings;
  profile: SaveProfile;
  progression: {
    coins: number;
    shards: number;
    ownedHeroes: string[];
    heroLevels: Record<string, number>;
    castleLevels: { wall: number; core: number; turret: number };
    team: HeroId[];
    battleIndex: number;
  };
  lastBattleSnapshot: BattleSnapshot | null;
}

export interface SaveFile {
  version: 3;
  settings: SaveSettings;
  profile: SaveProfile;
  progression: SaveProgression;
  lastBattleSnapshot: BattleSnapshot | null;
}

export const SAVE_VERSION = 3 as const;

export function defaultSave(): SaveFile {
  return {
    version: 3,
    settings: { sound: true, shake: true, quality: 'hi' },
    profile: { name: '攻城手', battles: 0, wins: 0 },
    progression: {
      coins: 60,
      shards: 2,
      ownedHeroes: ['demolisher', 'scout', 'gunner'],
      heroStars: { demolisher: 1, scout: 1, gunner: 1, raven: 1, medic: 1, mortar: 1, sapper: 1 },
      training: { firepower: 1, armor: 1, siege: 1 },
      team: ['demolisher', 'scout'],
      battleIndex: 0,
    },
    lastBattleSnapshot: null,
  };
}

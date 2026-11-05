/**
 * 存档迁移：v1 -> v2 -> v3；未知/坏结构降级为默认档。
 * v3 变化：城堡等级 → 队伍训练三条线；英雄等级 → 星级；按星级/胜场修整上场阵容。
 */

import { HERO_BY_ID, HERO_UNLOCK_STARS, type HeroId } from '../config/roster';
import { defaultSave, type SaveFile, type SaveFileV1, type SaveFileV2, type SaveSettings, type TrainingLevels } from './schema';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeSettings(raw: unknown, fallback: SaveSettings): SaveSettings {
  if (!isRecord(raw)) return { ...fallback };
  return {
    sound: typeof raw.sound === 'boolean' ? raw.sound : fallback.sound,
    shake: typeof raw.shake === 'boolean' ? raw.shake : fallback.shake,
    quality: raw.quality === 'lo' ? 'lo' : raw.quality === 'hi' ? 'hi' : fallback.quality,
  };
}

function normalizeStars(raw: unknown, owned: HeroId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of Object.values(HERO_BY_ID)) out[h.id] = clampInt(isRecord(raw) ? raw[h.id] : 1, 1, 5, 1);
  for (const id of owned) if (!(id in out)) out[id] = 1;
  return out;
}

function normalizeOwned(raw: unknown): HeroId[] {
  const ids = new Set<HeroId>();
  if (Array.isArray(raw)) for (const v of raw) if (typeof v === 'string' && v in HERO_BY_ID) ids.add(v as HeroId);
  if (ids.size === 0) ids.add('demolisher');
  return [...ids];
}

function normalizeTraining(raw: unknown): TrainingLevels {
  const fb = defaultSave().progression.training;
  if (!isRecord(raw)) return { ...fb };
  return {
    firepower: clampInt(raw.firepower, 1, 3, fb.firepower),
    armor: clampInt(raw.armor, 1, 3, fb.armor),
    siege: clampInt(raw.siege, 1, 3, fb.siege),
  };
}

/** 站位名额：星数或胜场达标 */
export function slotsFor(stars: number, wins: number): number {
  let slots = 2;
  if (stars >= 4 || wins >= 3) slots++;
  if (stars >= 10 || wins >= 8) slots++;
  return Math.min(4, slots);
}

function starTotalOf(stars: Record<string, number>, owned: HeroId[]): number {
  return owned.reduce((n, id) => n + (stars[id] ?? 1), 0);
}

function normalizeTeam(raw: unknown, owned: HeroId[], slots: number): HeroId[] {
  const valid: HeroId[] = [];
  if (Array.isArray(raw)) for (const v of raw) if (typeof v === 'string' && v in HERO_BY_ID && owned.includes(v as HeroId)) valid.push(v as HeroId);
  if (valid.length === 0) valid.push(...owned);
  const team: HeroId[] = [];
  for (let i = 0; i < slots; i++) team.push(valid[i % valid.length]);
  return team;
}

export function normalizeV3(raw: Record<string, unknown>): SaveFile {
  const base = defaultSave();
  const settings = normalizeSettings(raw.settings, base.settings);
  const profileRaw = isRecord(raw.profile) ? raw.profile : {};
  const progRaw = isRecord(raw.progression) ? raw.progression : {};
  const owned = normalizeOwned(progRaw.ownedHeroes);
  const heroStars = normalizeStars(progRaw.heroStars, owned);
  const training = normalizeTraining(progRaw.training);
  const stars = starTotalOf(heroStars, owned);
  const wins = clampInt(profileRaw.wins, 0, 1e9, 0);
  const slots = slotsFor(stars, wins);
  return {
    version: 3,
    settings,
    profile: {
      name: typeof profileRaw.name === 'string' && profileRaw.name.trim() ? profileRaw.name.slice(0, 24) : base.profile.name,
      battles: clampInt(profileRaw.battles, 0, 1e9, 0),
      wins,
    },
    progression: {
      coins: clampInt(progRaw.coins, 0, 1e9, base.progression.coins),
      shards: clampInt(progRaw.shards, 0, 1e9, base.progression.shards),
      ownedHeroes: owned,
      heroStars,
      training,
      team: normalizeTeam(progRaw.team, owned, slots),
      battleIndex: clampInt(progRaw.battleIndex, 0, 1e6, 0),
    },
    lastBattleSnapshot: isRecord(raw.lastBattleSnapshot) ? (raw.lastBattleSnapshot as unknown as SaveFile['lastBattleSnapshot']) : null,
  };
}

/** v1 -> v2（纯保留，城堡字段暂留） */
export function v1ToV2(v1: SaveFileV1): SaveFileV2 {
  const base = defaultSave();
  const owned = normalizeOwned(v1.progression?.ownedHeroes);
  const levels = normalizeStars(v1.progression?.heroLevels, owned);
  const castle = (isRecord(v1.progression?.castleLevels) ? v1.progression.castleLevels : {}) as Record<string, unknown>;
  return {
    version: 2,
    settings: normalizeSettings(v1.settings, base.settings),
    profile: {
      name: typeof v1.profile?.name === 'string' && v1.profile.name.trim() ? v1.profile.name.slice(0, 24) : base.profile.name,
      battles: 0,
      wins: 0,
    },
    progression: {
      coins: clampInt(v1.progression?.coins, 0, 1e9, base.progression.coins),
      shards: clampInt(v1.progression?.shards, 0, 1e9, base.progression.shards),
      ownedHeroes: owned,
      heroLevels: levels,
      castleLevels: {
        wall: clampInt(castle.wall, 1, 3, 1),
        core: clampInt(castle.core, 1, 3, 1),
        turret: clampInt(castle.turret, 1, 3, 1),
      },
      team: normalizeTeam(owned, owned, 3),
      battleIndex: 0,
    },
    lastBattleSnapshot: null,
  };
}

/** v2 -> v3：城堡三条线映射到训练三条线，heroLevels -> heroStars */
export function v2ToV3(v2: SaveFileV2): SaveFile {
  const base = defaultSave();
  const owned = normalizeOwned(v2.progression?.ownedHeroes);
  const heroStars = normalizeStars(v2.progression?.heroLevels, owned);
  const castle = (isRecord(v2.progression?.castleLevels) ? v2.progression.castleLevels : {}) as Record<string, unknown>;
  const training: TrainingLevels = {
    // 城墙→护甲、核心→火力、炮塔→工兵
    armor: clampInt(castle.wall, 1, 3, 1),
    firepower: clampInt(castle.core, 1, 3, 1),
    siege: clampInt(castle.turret, 1, 3, 1),
  };
  const profile: SaveFile['profile'] = {
    name: typeof v2.profile?.name === 'string' && v2.profile.name.trim() ? v2.profile.name.slice(0, 24) : base.profile.name,
    battles: clampInt(v2.profile?.battles, 0, 1e9, 0),
    wins: clampInt(v2.profile?.wins, 0, 1e9, 0),
  };
  const stars = starTotalOf(heroStars, owned);
  const slots = slotsFor(stars, profile.wins);
  return {
    version: 3,
    settings: normalizeSettings(v2.settings, base.settings),
    profile,
    progression: {
      coins: clampInt(v2.progression?.coins, 0, 1e9, base.progression.coins),
      shards: clampInt(v2.progression?.shards, 0, 1e9, base.progression.shards),
      ownedHeroes: owned,
      heroStars,
      training,
      team: normalizeTeam(v2.progression?.team, owned, slots),
      battleIndex: clampInt(v2.progression?.battleIndex, 0, 1e6, 0),
    },
    lastBattleSnapshot: null,
  };
}

export function migrate(raw: unknown): SaveFile {
  if (!isRecord(raw)) return defaultSave();
  if (raw.version === 1) return v2ToV3(v1ToV2(raw as unknown as SaveFileV1));
  if (raw.version === 2) return v2ToV3(raw as unknown as SaveFileV2);
  if (raw.version === 3) return normalizeV3(raw);
  return defaultSave();
}

export { HERO_UNLOCK_STARS };

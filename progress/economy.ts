/**
 * 经济与养成（无城堡）：队伍训练三条线 + 英雄升星/碎片解锁 + 星级/胜场解锁上场名额。
 */

import { ECONOMY } from '../config/game.const';
import { HERO_BY_ID, HERO_DEFS, HERO_UNLOCK_STARS, type HeroId, type Side } from '../config/roster';
import { mapForBattle } from '../config/maps';
import type { BattleConfig, Difficulty, SimState, TeamMember } from '../engine/state';
import type { SaveFile, TrainingKey } from './schema';

export function heroStars(save: SaveFile, id: HeroId): number {
  return Math.max(1, Math.min(5, save.progression.heroStars[id] ?? 1));
}

export function starTotal(save: SaveFile): number {
  return save.progression.ownedHeroes.reduce((n, id) => n + heroStars(save, id), 0);
}

/** 上场名额：星数或累计胜场达标 */
export function teamSlots(save: SaveFile): number {
  const stars = starTotal(save);
  const wins = save.profile.wins;
  let slots = 2;
  if (stars >= ECONOMY.slotStars[1] || wins >= ECONOMY.slotWins[1]) slots++;
  if (stars >= ECONOMY.slotStars[2] || wins >= ECONOMY.slotWins[2]) slots++;
  return Math.min(4, slots);
}

export function nextSlotHint(save: SaveFile): string {
  const slots = teamSlots(save);
  if (slots >= 4) return '已解锁 4 人上阵';
  const idx = slots - 1; // 下一个名额对应的阈值下标：2 人→index1（4★/3胜）
  const stars = starTotal(save);
  const wins = save.profile.wins;
  return `再获得 ${Math.max(0, ECONOMY.slotStars[idx] - stars)} 星或 ${Math.max(0, ECONOMY.slotWins[idx] - wins)} 胜可解锁第 ${slots + 1} 个名额`;
}

export function heroUpgradeCost(stars: number): number {
  return Math.round(ECONOMY.heroUpgradeBase * ECONOMY.heroUpgradeGrowth ** (stars - 1));
}

export function trainingCost(level: number): number {
  return Math.round(ECONOMY.trainingBase * ECONOMY.trainingGrowth ** (level - 1));
}

export function heroUnlockCost(id: HeroId): number {
  return ECONOMY.unlockShards[id] ?? 0;
}

/** 达标免费解锁（升星总数解锁角色）；返回本次新解锁的英雄 id */
export function refreshUnlocks(save: SaveFile): HeroId[] {
  const stars = starTotal(save);
  const unlocked: HeroId[] = [];
  for (const h of HERO_DEFS) {
    if (save.progression.ownedHeroes.includes(h.id)) continue;
    if (stars >= HERO_UNLOCK_STARS[h.id] && HERO_UNLOCK_STARS[h.id] > 0) {
      save.progression.ownedHeroes.push(h.id);
      if (!save.progression.heroStars[h.id]) save.progression.heroStars[h.id] = 1;
      unlocked.push(h.id);
    }
  }
  return unlocked;
}

/** 保证阵容长度 = 当前名额，且成员都已拥有 */
export function ensureTeam(save: SaveFile): void {
  const slots = teamSlots(save);
  const owned = save.progression.ownedHeroes;
  const team = save.progression.team.filter((id) => owned.includes(id));
  const fill = owned.filter((id) => !team.includes(id));
  let i = 0;
  while (team.length < slots) {
    team.push(fill[i] ?? owned[team.length % Math.max(1, owned.length)]);
    i++;
  }
  while (team.length > slots) team.pop();
  save.progression.team = team;
}

export function isOwned(save: SaveFile, id: HeroId): boolean {
  return save.progression.ownedHeroes.includes(id);
}

export function upgradeHero(save: SaveFile, id: HeroId): boolean {
  if (!isOwned(save, id)) return false;
  const stars = heroStars(save, id);
  if (stars >= 5) return false;
  const cost = heroUpgradeCost(stars);
  if (save.progression.coins < cost) return false;
  save.progression.coins -= cost;
  save.progression.heroStars[id] = stars + 1;
  refreshUnlocks(save);
  ensureTeam(save);
  return true;
}

export function unlockHero(save: SaveFile, id: HeroId): boolean {
  if (isOwned(save, id)) return false;
  // 星级达标 → 免费解锁
  if (starTotal(save) >= HERO_UNLOCK_STARS[id]) {
    save.progression.ownedHeroes.push(id);
    ensureTeam(save);
    return true;
  }
  const cost = heroUnlockCost(id);
  if (save.progression.shards < cost) return false;
  save.progression.shards -= cost;
  save.progression.ownedHeroes.push(id);
  if (!save.progression.heroStars[id]) save.progression.heroStars[id] = 1;
  ensureTeam(save);
  return true;
}

export function trainingLevel(save: SaveFile, key: TrainingKey): number {
  return Math.max(1, Math.min(ECONOMY.trainingMax, save.progression.training[key] ?? 1));
}

export function upgradeTraining(save: SaveFile, key: TrainingKey): boolean {
  const level = trainingLevel(save, key);
  if (level >= ECONOMY.trainingMax) return false;
  const cost = trainingCost(level);
  if (save.progression.coins < cost) return false;
  save.progression.coins -= cost;
  save.progression.training[key] = level + 1;
  return true;
}

export function toggleTeam(save: SaveFile, id: HeroId): void {
  if (!isOwned(save, id)) return;
  const team = save.progression.team;
  const idx = team.indexOf(id);
  const slots = teamSlots(save);
  if (idx >= 0) {
    if (team.length <= 1) return;
    team.splice(idx, 1);
  } else if (team.length < slots) {
    team.push(id);
  } else if (slots > 0) {
    team[slots - 1] = id;
  }
  ensureTeam(save);
}

export interface PlayerMods {
  hpMul: number;
  dmgMul: number;
  terrainMul: number;
}

export function playerMods(save: SaveFile): PlayerMods {
  return {
    hpMul: 1 + 0.08 * (trainingLevel(save, 'armor') - 1),
    dmgMul: 1 + 0.06 * (trainingLevel(save, 'firepower') - 1),
    terrainMul: 1 + 0.1 * (trainingLevel(save, 'siege') - 1),
  };
}

export interface RewardLine {
  label: string;
  coins: number;
  shards: number;
}

export interface Rewards {
  coins: number;
  shards: number;
  lines: RewardLine[];
}

export function computeRewards(state: SimState, won: boolean, difficulty: Difficulty): Rewards {
  const lines: RewardLine[] = [];
  lines.push({ label: won ? '团灭对手' : '小队溃败', coins: won ? ECONOMY.winCoins : ECONOMY.loseCoins, shards: 0 });
  const dmg = Math.floor(state.stats.damageDealt.p * ECONOMY.coinPerDamage);
  if (dmg > 0) lines.push({ label: `造成伤害 ${Math.round(state.stats.damageDealt.p)}`, coins: dmg, shards: 0 });
  if (won) {
    lines.push({ label: '胜利战利品', coins: 0, shards: ECONOMY.winShards });
    const kills = state.stats.kills.p;
    if (kills > 0) lines.push({ label: `击杀 ${kills} 人`, coins: 0, shards: kills * ECONOMY.shardPerKill });
    if (difficulty === 'hard') lines.push({ label: '困难难度加成', coins: 8, shards: 1 });
  } else {
    lines.push({ label: '败者保底', coins: ECONOMY.pityCoins, shards: 0 });
  }
  return {
    coins: lines.reduce((n, l) => n + l.coins, 0),
    shards: lines.reduce((n, l) => n + l.shards, 0),
    lines,
  };
}

export function applyRewards(save: SaveFile, rewards: Rewards, won: boolean): void {
  save.progression.coins += rewards.coins;
  save.progression.shards += rewards.shards;
  save.profile.battles += 1;
  if (won) save.profile.wins += 1;
  refreshUnlocks(save);
  ensureTeam(save);
}

const ALL_IDS: HeroId[] = HERO_DEFS.map((h) => h.id);

export function buildPlayerTeam(save: SaveFile): TeamMember[] {
  ensureTeam(save);
  return save.progression.team.map((id) => ({ id, level: heroStars(save, id) }));
}

/** 对手人数跟随玩家名额：简单少 1、普通相同、困难多 1（2..4） */
function enemySlots(difficulty: Difficulty, playerSlots: number): number {
  const base = difficulty === 'easy' ? playerSlots - 1 : difficulty === 'hard' ? playerSlots + 1 : playerSlots;
  return Math.min(4, Math.max(2, base));
}

function enemyStarLevel(difficulty: Difficulty, battleIndex: number): number {
  const offset = difficulty === 'easy' ? 0 : difficulty === 'hard' ? 2 : 1;
  return Math.min(5, 1 + offset + Math.floor(battleIndex / 4));
}

export function buildEnemyTeam(save: SaveFile, difficulty: Difficulty, playerSlots = 3): TeamMember[] {
  const idx = save.progression.battleIndex;
  const slots = enemySlots(difficulty, playerSlots);
  const level = enemyStarLevel(difficulty, idx);
  const comp: HeroId[] = [];
  for (let i = 0; i < slots; i++) comp.push(ALL_IDS[(idx + i * 2 + (difficulty === 'hard' ? 3 : 0)) % ALL_IDS.length]);
  return comp.map((id) => ({ id, level }));
}

export function enemyMods(save: SaveFile, difficulty: Difficulty): PlayerMods {
  const level = 1 + Math.floor(save.progression.battleIndex / 4) + (difficulty === 'hard' ? 1 : 0);
  return {
    hpMul: 1 + 0.06 * level,
    dmgMul: 1 + 0.05 * level,
    terrainMul: 1,
  };
}

export interface BattleSetup {
  config: BattleConfig;
  player: TeamMember[];
  enemy: TeamMember[];
  mapId: string;
  mapName: string;
  slots: number;
  mods: PlayerMods;
  enemyMods: PlayerMods;
}

export function buildBattleSetup(save: SaveFile, difficulty: Difficulty, seed: number): BattleSetup {
  ensureTeam(save);
  const player = buildPlayerTeam(save);
  const enemy = buildEnemyTeam(save, difficulty, teamSlots(save));
  const map = mapForBattle(save.progression.battleIndex);
  const mods = playerMods(save);
  const eMods = enemyMods(save, difficulty);
  return {
    config: {
      seed,
      difficulty,
      player,
      enemy,
      mapId: map.id,
      mods: { p: mods, a: eMods },
    },
    player,
    enemy,
    mapId: map.id,
    mapName: map.name,
    slots: teamSlots(save),
    mods,
    enemyMods: eMods,
  };
}

export const ALL_HEROES = HERO_DEFS;
export { HERO_BY_ID };
export type { Side };

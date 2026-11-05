import { describe, expect, it } from 'vitest';
import { SAVE } from '../config/game.const';
import { defaultSave, type SaveFileV1, type SaveFileV2 } from '../progress/schema';
import { migrate, slotsFor, v1ToV2, v2ToV3 } from '../progress/migrate';
import { memoryStorage, SaveStore } from '../progress/store';
import {
  applyRewards,
  buildBattleSetup,
  computeRewards,
  ensureTeam,
  heroStars,
  heroUpgradeCost,
  playerMods,
  refreshUnlocks,
  starTotal,
  teamSlots,
  trainingCost,
  trainingLevel,
  unlockHero,
  upgradeHero,
  upgradeTraining,
} from '../progress/economy';
import { isSnapshotValid, restoreBattle, snapshotBattle } from '../engine/snapshot';
import { testBattle } from './helpers';
import { step } from '../engine/sim';

const V1_SAMPLE: SaveFileV1 = {
  version: 1,
  settings: { sound: false, shake: true, quality: 'lo' },
  profile: { name: '老玩家' },
  progression: {
    coins: 321,
    shards: 7,
    ownedHeroes: ['demolisher', 'scout', 'raven'],
    heroLevels: { demolisher: 3, scout: 2, raven: 4 },
    castleLevels: { wall: 2, core: 1, turret: 3 },
  },
  lastBattleSnapshot: null,
};

const V2_SAMPLE: SaveFileV2 = {
  version: 2,
  settings: { sound: true, shake: true, quality: 'hi' },
  profile: { name: '城堡时代', battles: 9, wins: 4 },
  progression: {
    coins: 200,
    shards: 5,
    ownedHeroes: ['demolisher', 'scout', 'gunner'],
    heroLevels: { demolisher: 2, scout: 2, gunner: 2 },
    castleLevels: { wall: 2, core: 3, turret: 1 },
    team: ['demolisher', 'scout', 'gunner'],
    battleIndex: 7,
  },
  lastBattleSnapshot: null,
};

describe('save: v1/v2 -> v3 迁移', () => {
  it('v1 字段保留，城堡等级映射到训练，等级映射到星级', () => {
    const v3 = migrate(V1_SAMPLE);
    expect(v3.version).toBe(3);
    expect(v3.settings.sound).toBe(false);
    expect(v3.profile.name).toBe('老玩家');
    expect(v3.progression.coins).toBe(321);
    expect(v3.progression.shards).toBe(7);
    expect(v3.progression.heroStars.demolisher).toBe(3);
    expect(v3.progression.heroStars.raven).toBe(4);
    expect(v3.progression.training).toEqual({ armor: 2, firepower: 1, siege: 3 });
    expect(v3.progression.team.length).toBeGreaterThanOrEqual(2);
    expect(v3.progression.team.length).toBeLessThanOrEqual(4);
  });

  it('v2 -> v3：城墙→护甲、核心→火力、炮塔→工兵；阵容按名额修整', () => {
    const v3 = migrate(V2_SAMPLE);
    expect(v3.progression.training).toEqual({ armor: 2, firepower: 3, siege: 1 });
    expect(v3.progression.heroStars.gunner).toBe(2);
    expect(v3.progression.battleIndex).toBe(7);
    expect(v3.profile.wins).toBe(4);
    const slots = teamSlots(v3);
    expect(v3.progression.team.length).toBe(slots);
    expect(slotsFor(starTotal(v3), v3.profile.wins)).toBe(slots);
  });

  it('未知版本 / 坏结构 → 默认档', () => {
    expect(migrate(null).version).toBe(3);
    expect(migrate('oops').version).toBe(3);
    expect(migrate({ version: 99 }).progression.coins).toBe(defaultSave().progression.coins);
    void v1ToV2;
    void v2ToV3;
  });
});

describe('save: store 持久化', () => {
  it('写入后可重新读出', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.update((s) => {
      s.progression.coins = 1234;
    });
    store.flush();
    expect(new SaveStore(storage).data.progression.coins).toBe(1234);
  });

  it('坏 JSON → 全新档不崩', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE.key, '{not json');
    const store = new SaveStore(storage);
    expect(store.data.version).toBe(3);
    expect(store.data.progression.coins).toBeGreaterThan(0);
  });

  it('resetProgress 保留 settings，清空养成', () => {
    const store = new SaveStore(memoryStorage());
    store.update((s) => {
      s.settings.sound = false;
      s.progression.coins = 999;
      s.progression.heroStars.demolisher = 4;
    });
    store.resetProgress();
    expect(store.data.settings.sound).toBe(false);
    expect(store.data.progression.heroStars.demolisher).toBe(1);
    expect(store.data.progression.coins).toBe(defaultSave().progression.coins);
  });
});

describe('economy: 升星/训练/名额/奖励', () => {
  it('英雄升星花费按 1.6 增长，满星后拒绝', () => {
    const store = new SaveStore(memoryStorage());
    store.data.progression.coins = 10000;
    expect(heroUpgradeCost(1)).toBe(40);
    expect(heroUpgradeCost(2)).toBe(64);
    expect(upgradeHero(store.data, 'demolisher')).toBe(true);
    expect(heroStars(store.data, 'demolisher')).toBe(2);
    store.data.progression.heroStars.demolisher = 5;
    expect(upgradeHero(store.data, 'demolisher')).toBe(false);
  });

  it('训练三条线可升级且影响队伍属性', () => {
    const store = new SaveStore(memoryStorage());
    store.data.progression.coins = 10000;
    expect(trainingCost(1)).toBe(30);
    expect(upgradeTraining(store.data, 'firepower')).toBe(true);
    expect(trainingLevel(store.data, 'firepower')).toBe(2);
    expect(playerMods(store.data).dmgMul).toBeCloseTo(1.06, 5);
    expect(upgradeTraining(store.data, 'armor')).toBe(true);
    expect(playerMods(store.data).hpMul).toBeCloseTo(1.08, 5);
    expect(upgradeTraining(store.data, 'siege')).toBe(true);
    expect(playerMods(store.data).terrainMul).toBeCloseTo(1.1, 5);
  });

  it('升星总数解锁新英雄（免费）', () => {
    const store = new SaveStore(memoryStorage());
    store.data.progression.ownedHeroes = ['demolisher', 'scout', 'gunner'];
    store.data.progression.heroStars = { demolisher: 3, scout: 2, gunner: 1 };
    expect(starTotal(store.data)).toBe(6);
    const unlocked = refreshUnlocks(store.data);
    expect(unlocked).toContain('raven');
    expect(store.data.progression.ownedHeroes).toContain('raven');
  });

  it('碎片可直接解锁未达标英雄', () => {
    const store = new SaveStore(memoryStorage());
    store.data.progression.shards = 20;
    expect(unlockHero(store.data, 'sapper')).toBe(true);
    expect(store.data.progression.ownedHeroes).toContain('sapper');
  });

  it('星数/胜场解锁上场名额并自动修整阵容', () => {
    const store = new SaveStore(memoryStorage());
    expect(teamSlots(store.data)).toBe(2);
    store.data.progression.heroStars = { demolisher: 2, scout: 2, gunner: 2 };
    refreshUnlocks(store.data);
    ensureTeam(store.data);
    expect(teamSlots(store.data)).toBe(3);
    expect(store.data.progression.team.length).toBe(3);
    store.data.profile.wins = 10;
    ensureTeam(store.data);
    expect(teamSlots(store.data)).toBe(4);
    expect(store.data.progression.team.length).toBe(4);
  });

  it('战败也有保底 coin，胜利给碎片', () => {
    const s = testBattle(31);
    const loss = computeRewards(s, false, 'normal');
    expect(loss.coins).toBeGreaterThanOrEqual(6);
    const win = computeRewards(s, true, 'normal');
    expect(win.shards).toBeGreaterThanOrEqual(2);
    const store = new SaveStore(memoryStorage());
    const before = store.data.progression.coins;
    applyRewards(store.data, loss, false);
    expect(store.data.progression.coins).toBeGreaterThan(before);
    expect(store.data.profile.battles).toBe(1);
  });

  it('对手随难度/场次变强，配置合法', () => {
    const store = new SaveStore(memoryStorage());
    const easy = buildBattleSetup(store.data, 'easy', 1);
    const hard = buildBattleSetup(store.data, 'hard', 1);
    expect(easy.enemy.length).toBe(2);
    expect(hard.enemy.length).toBeGreaterThanOrEqual(3);
    expect(hard.enemy[0].level).toBeGreaterThan(easy.enemy[0].level);
    expect(hard.enemyMods.hpMul).toBeGreaterThan(easy.enemyMods.hpMul);
    expect(easy.player.length).toBe(teamSlots(store.data));
  });
});

describe('snapshot: 战斗恢复', () => {
  it('RLE 快照可完整恢复地形与状态', () => {
    const s = testBattle(55);
    step(s, { c: 'fire', unitId: s.activeId, angle: 42, power: 0.9, weaponId: 'bomb' });
    let n = 0;
    while (s.phase !== 'aim' && s.phase !== 'over' && n++ < 3000) step(s, { c: 'skip' });
    const snap = snapshotBattle(s);
    expect(isSnapshotValid(snap)).toBe(true);
    expect(JSON.stringify(snap).length).toBeLessThan(400000);
    const restored = restoreBattle(snap);
    let diff = 0;
    for (let i = 0; i < restored.terrain.mask.length; i += 13) if (restored.terrain.mask[i] !== s.terrain.mask[i]) diff++;
    expect(diff).toBe(0);
    expect(restored.round).toBe(s.round);
    expect(restored.turnIdx).toBe(s.turnIdx);
    expect(restored.units.map((u) => u.hp)).toEqual(s.units.map((u) => u.hp));
    step(restored, { c: 'skip' });
    step(restored, { c: 'skip' });
    expect(['aim', 'over']).toContain(restored.phase);
  });
});

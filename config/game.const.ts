/**
 * 唯一硬数值表 —— 全部可调参数只在这里改。
 * engine/** 只允许 import 本文件与 engine 内部模块，禁止 import phaser / DOM。
 */

export const WORLD = {
  /** 逻辑世界尺寸（恒定，不随屏幕拉伸） */
  w: 1280,
  h: 640,
  /** 地形掩码尺寸 */
  maskW: 1280,
  maskH: 640,
} as const;

export const SIM = {
  /** 固定步长（毫秒），整数累加，禁止浮点除 */
  dtMs: 16,
  /** 抛体每步细分数（防穿透） */
  subSteps: 4,
  /** 一局最多回合数（双方各行动一次算一回合） */
  maxRound: 14,
  /** 超过该回合进入猝死 */
  suddenDeathAtRound: 15,
  /** 猝死每回合全体掉血（随回合递增） */
  suddenDeathUnitDmg: 7,
  /** 决出胜负最长回合（测试用硬上限） */
  hardRoundCap: 60,
  gravity: 780,
  /** 弹道预测：采样步数与跨度 */
  predictSteps: 62,
  predictStride: 2,
} as const;

export const AIM = {
  /** 拖拽满力度需要的像素 */
  maxDragPx: 180,
  minPower: 0.06,
  /** 玩家可发射角度（度，屏幕坐标系向上为正） */
  angleMin: -6,
  angleMax: 100,
  /** AI 发射角度范围 */
  aiAngleMin: 80,
  aiAngleMax: 172,
  /** 力度环半径（世界像素） */
  ringRadius: 58,
  /** 拖拽起点低于 HUD 才生效 */
  dragTopY: 96,
  /** 过短拖拽视为取消 */
  cancelDragPx: 14,
} as const;

export const WIND = {
  /** 风力 -1..1 */
  max: 1,
  /** 满风力对应横向加速度 px/s^2 */
  accel: 140,
  /** AI 预演叠加的扰动组 */
  aiPerturbations: [-0.45, 0, 0.45] as const,
} as const;

export const UNIT = {
  width: 16,
  height: 26,
  /** 每边最少/最多上场人数（由星级或胜场解锁） */
  minTeam: 2,
  maxTeam: 4,
  /** 立足采样半宽（格） */
  footSample: 3,
  /** 滑落判定：3 点采样中实心点 < 2 即滑 */
  slideSolidMin: 2,
  /** 一次结算最多滑落格数 */
  slideMaxSteps: 40,
  /** 1 级英雄基础血量修正（见 roster） */
  hpPerLevel: 0.18,
  dmgPerLevel: 0.12,
  maxLevel: 5,
} as const;

export const ECONOMY = {
  /** 英雄升星花费 = round(base * growth^(stars-1)) */
  heroUpgradeBase: 40,
  heroUpgradeGrowth: 1.6,
  /** 队伍训练花费 = round(base * growth^(level-1)) */
  trainingBase: 30,
  trainingGrowth: 1.55,
  trainingMax: 3,
  /** 胜利 / 失败资源 */
  winCoins: 26,
  loseCoins: 9,
  winShards: 2,
  loseShards: 0,
  /** 伤害换算 */
  coinPerDamage: 0.18,
  /** 击杀额外碎片 */
  shardPerKill: 1,
  /** 保底 */
  pityCoins: 6,
  /** 直接解锁英雄的碎片花费（也可以靠升星总数免费解锁） */
  unlockShards: { demolisher: 0, scout: 0, gunner: 0, raven: 3, medic: 4, mortar: 6, sapper: 8 } as Record<string, number>,
  /** 上场名额解锁：全队星数或累计胜场达标（2→3→4 人） */
  slotStars: [0, 4, 10] as const,
  slotWins: [0, 3, 8] as const,
} as const;

export const AI = {
  /** 角度 bin 数 */
  angleBins: 24,
  powerTiers: [0.55, 0.75, 0.95] as const,
  /** 候选数量乘以难度系数 */
  difficulty: {
    easy: { keep: 12, angleNoiseDeg: 4, powerJitter: 2, candidateScale: 0.6 },
    normal: { keep: 4, angleNoiseDeg: 0, powerJitter: 0, candidateScale: 1 },
    hard: { keep: 1, angleNoiseDeg: 0, powerJitter: 0, candidateScale: 2 },
  },
} as const;

export const PERF = {
  dprCap: 2,
  maxParticles: 120,
  lowFps: 45,
  lowFpsWindowMs: 2000,
  simBudgetMs: 0.5,
  terrainBudgetMs: 2,
} as const;

export const UI = {
  /** 触控目标最小尺寸 */
  touchMin: 44,
  hudTopH: 96,
  hudBottomH: 96,
  /** 弹窗打开时 gate 掉战斗输入的根节点 id */
  hudRootId: 'hud-root',
  gameRootId: 'game',
} as const;

export const SAVE = {
  key: 'bg:save:v1',
  debounceMs: 300,
  version: 3,
} as const;

/** 渲染调色板 */
export const PALETTE = {
  skyTop: 0x0a0f1e,
  skyBottom: 0x2a1a2e,
  bg: 0x0b1020,
  grass: 0x5fbf6a,
  grassDark: 0x2f7a46,
  dirt: 0x7a4a32,
  dirtDark: 0x4a2a1e,
  rock: 0x3a3340,
  gold: 0xffb847,
  player: 0x4fc3f7,
  enemy: 0xff5d73,
  core: 0xffd166,
  wall: 0xb8a48a,
  turret: 0x8fa3b8,
  ui: 0x141b2e,
  text: 0xf2f4f8,
} as const;

/**
 * 战场地图：边缘高地固定（城堡/英雄站位不变），中段地形各不同。
 * 默认地图 'dusk' 与 tests 里的战场一致，保证确定性回归不受影响。
 */

export interface MapColors {
  grass: number;
  grassHi: number;
  grassDark: number;
  dirt: number;
  dirtDark: number;
  rock: number;
}

export interface MapDef {
  id: string;
  name: string;
  subtitle: string;
  colors: MapColors;
  surface: (x: number) => number;
}

const smooth = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};

const PLATEAU = 468;
const VALLEY = 556;

/** 黄昏高地（默认，与 engine/terrain.ts 的 battlefieldSurface 相同） */
const dusk: MapDef = {
  id: 'dusk',
  name: '黄昏高地',
  subtitle: '经典对称战场',
  colors: { grass: 0x5fbf6a, grassHi: 0x8ee08a, grassDark: 0x2f7a46, dirt: 0x7a4a32, dirtDark: 0x4a2a1e, rock: 0x3a3340 },
  surface: (x: number) => {
    if (x <= 292) return PLATEAU;
    if (x < 372) return PLATEAU + (VALLEY - PLATEAU) * smooth((x - 292) / 80);
    if (x >= 988) return PLATEAU;
    if (x > 908) return VALLEY + (PLATEAU - VALLEY) * smooth((x - 908) / 80);
    const hill = 42 * Math.exp(-(((x - 640) / 120) ** 2));
    return VALLEY - hill;
  },
};

/** 裂谷：中央深谷 + 谷底石柱，逼迫吊射 */
const canyon: MapDef = {
  id: 'canyon',
  name: '碎骨裂谷',
  subtitle: '中央深谷 · 吊射为王',
  colors: { grass: 0x6fbf6a, grassHi: 0x9be08a, grassDark: 0x377a3e, dirt: 0x8a5636, dirtDark: 0x4f2c1c, rock: 0x453b47 },
  surface: (x: number) => {
    if (x <= 300) return PLATEAU;
    if (x < 430) return PLATEAU + (612 - PLATEAU) * smooth((x - 300) / 130);
    if (x > 980) return PLATEAU;
    if (x > 850) return 612 + (PLATEAU - 612) * smooth((x - 850) / 130);
    // 谷底 + 中段石柱
    const spire = 64 * Math.exp(-(((x - 610) / 34) ** 2));
    const spire2 = 40 * Math.exp(-(((x - 700) / 22) ** 2));
    return 600 - spire - spire2;
  },
};

/** 双峰：两座高丘夹一条浅谷 */
const twin: MapDef = {
  id: 'twin',
  name: '双峰隘口',
  subtitle: '两丘遮蔽 · 越过山头',
  colors: { grass: 0x63b98a, grassHi: 0x95e0aa, grassDark: 0x2f7a56, dirt: 0x6f4a3a, dirtDark: 0x3f2a22, rock: 0x3a3a4a },
  surface: (x: number) => {
    if (x <= 296) return PLATEAU;
    if (x >= 984) return PLATEAU;
    if (x < 372) return PLATEAU + (560 - PLATEAU) * smooth((x - 296) / 76);
    if (x > 908) return 560 + (PLATEAU - 560) * smooth((x - 908) / 76);
    const h1 = 92 * Math.exp(-(((x - 500) / 90) ** 2));
    const h2 = 92 * Math.exp(-(((x - 780) / 90) ** 2));
    return 560 - h1 - h2;
  },
};

/** 台地：中央高台，适合直射拆墙 */
const mesa: MapDef = {
  id: 'mesa',
  name: '赤岩台地',
  subtitle: '中央高台 · 直射拆墙',
  colors: { grass: 0x7fb86a, grassHi: 0xb4e08a, grassDark: 0x4a7a3a, dirt: 0x9a5a34, dirtDark: 0x5a3018, rock: 0x4a3a30 },
  surface: (x: number) => {
    if (x <= 294) return PLATEAU;
    if (x >= 986) return PLATEAU;
    if (x < 380) return PLATEAU + (556 - PLATEAU) * smooth((x - 294) / 86);
    if (x > 900) return 556 + (PLATEAU - 556) * smooth((x - 900) / 86);
    // 中央台地 + 两侧陡坎
    const stepIn = smooth((x - 520) / 30) * smooth((740 - x) / 30);
    return 556 - 62 * stepIn;
  },
};

export const MAPS: MapDef[] = [dusk, canyon, twin, mesa];
export const DEFAULT_MAP_ID = 'dusk';

export function getMap(id: string | undefined): MapDef {
  return MAPS.find((m) => m.id === id) ?? dusk;
}

/** 可选地图（按已打场次轮换） */
export function mapForBattle(battleIndex: number): MapDef {
  const pool = MAPS;
  return pool[Math.abs(battleIndex) % pool.length];
}

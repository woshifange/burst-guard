# 10 · 战斗规格（v3 无城堡 · 纯击杀）

> 目标：照本文可实现当前战斗。所有数值来源：`config/game.const.ts`、`config/roster.ts`、`config/maps.ts`、`engine/*.ts`。

## 1. 世界与时间

- 世界固定 1280×640；地形掩码同尺寸（`Uint32Array`，1=实心）。
- 固定 tick `dt=16ms`，抛体每 tick 4 个子步；`SimState.tick` 每 step 自增。
- 一局最多 14 回合（`SIM.maxRound`）；超过后进入猝死（第 15 回合起，`round > maxRound` 的每回合末结算）。
- 硬上限 `hardRoundCap=60`：极端情况按剩余总血量判胜。

## 2. 地图（4 张）

`config/maps.ts`，每张地图只改中段地形，两侧 x≤~296 / x≥~984 固定为 468 高地，保证站位与公平：

| id | 名称 | 中段特征 |
|---|---|---|
| dusk | 黄昏高地 | 谷底 556 + 中央 42px 小丘 |
| canyon | 碎骨裂谷 | 深谷 600–612 + 两座石柱 |
| twin | 双峰隘口 | 两座 92px 高丘（x≈500 / 780） |
| mesa | 赤岩台地 | 中央 62px 台阶台地 |

`mapForBattle(battleIndex)` 轮换。

## 3. 单位

- 每边 2–4 人，按人数取站位：
  - 2 人：p [210,252]，a [1070,1028]
  - 3 人：p [200,232,264]，a [1080,1048,1016]
  - 4 人：p [196,224,252,280]，a [1084,1056,1028,1000]
- 脚底 y = 该列 `support`；单位高度 26，身体中心 `(x, y-13)`。
- 星级 n（1–5）：`maxHp = round(hpBase × (1+0.18(n-1)) × armorMul)`；`dmgMul = (1+0.12(n-1)) × firepowerMul`。
- 训练乘区：护甲 `hpMul=1+0.08(L-1)`、火力 `dmgMul=1+0.06(L-1)`、工兵 `terrainMul=1+0.10(L-1)`；对手按场次/难度另算。

## 4. 武器

| id | 名称 | speed | gravityScale | blastR | dmg | falloff | count | terrainMul |
|---|---|---|---|---|---|---|---|---|
| bomb | 重炮炸弹 | 950 | 1 | 52 | 38 | linear | 1 | 1 |
| scout_cluster | 侦察集束 | 830 | 1 | 26 | 12 | sq | 15 | 1 |
| gunner_shard | 枪手穿甲 | 1500 | 0.12 | 14 | 14 | sq | 1 | 1 |
| raven_bomb | 乌鸦双爆 | 900 | 1 | 34 | 22 | linear | 2 | 1（次爆 r40/dmg20，延迟 26 tick） |
| medic_shot | 医疗弹 | 900 | 1 | 26 | 10 | linear | 1 | 1（自愈 16） |
| mortar_shell | 迫击重弹 | 760 | 1.15 | 58 | 44 | sq | 1 | 1.2 |
| sapper_charge | 工兵爆破 | 880 | 1 | 34 | 16 | linear | 1 | 1.7 |

出膛速度 = `speed × (0.35 + 0.65×power)`；散布见 `spreadDeg`。

### 4.1 英雄（`HERO_DEFS`）

| 英雄 | hpBase | 武器 | 初始 | 星数免费解锁 | 碎片解锁 |
|---|---|---|---|---|---|
| demolisher | 110 | bomb | 拥有 | — | — |
| scout | 85 | scout_cluster | 拥有 | — | — |
| gunner | 90 | gunner_shard | 拥有 | — | — |
| raven | 95 | raven_bomb | 锁 | 5★ | 3 |
| medic | 90 | medic_shot | 锁 | 7★ | 4 |
| mortar | 100 | mortar_shell | 锁 | 10★ | 6 |
| sapper | 95 | sapper_charge | 锁 | 14★ | 8 |

- 升星花费 `round(40×1.6^(n-1))`：40/64/102/164；上限 5★。
- 训练上限 3 级，花费 `round(30×1.55^(n-1))`：30/47/72；玩家乘区见 §3。
- 上场名额 2–4：全队星数达 4/10 或胜场达 3/8 各 +1；`ensureTeam` 自动补/裁。

## 5. 爆炸结算

一条 `ExplosionIntent` 按序处理：

1. **地形**：`carveCrater(x,y,terrainRadius)`，`terrainRadius = blastR × weapon.terrainMul × 落点方 terrainMul`（训练/敌方加成）；产出 `terrain` 事件脏矩形。
2. **单位伤害**：半径内单位按身体中心距离取 falloff：
   - linear：`1 - d/r`
   - sq：`(1 - d/r)²`
   伤害 = `round(baseDmg × falloff)`；自伤/友伤照算，伤害归属记到受击方**反方**。
3. **医疗**：`selfHeal>0` 时，己方半径 `max(96, blastR×2)` 内存活单位回血（上限 maxHp）。
4. 单位 hp≤0 → 标记 dead、发出 `unitDead`，击杀数记给反方。

## 6. 回合结算顺序

`sim.step`：

- `aim`：`select`（玩家换人）/ `fire`（发射，phase→flight）/ `skip`（phase→settle）。
- `flight`：推进次爆 → 推进弹体（每子步检测单位/地形/出界）→ 立即结算爆炸意图；弹体与次爆都空 → `settle`。
- `settle`：清空意图 → **单位支撑结算**（悬空落到 support、埋入上抬、斜坡滑落、无地坠底死亡）→ 胜负判定 → `endTurn`。

**单位支撑结算**（一次性，无逐帧振荡）：
- 脚宽 3 点采样（x-3/x/x+3）；support 不存在 → 向左右 10px 找落脚，找不到则坠底死亡。
- 脚底 y < support → 落到 support；y > support → 抬到 support；采样实心 <2 → 向有地一侧滑一格（最多 40 步）。

`endTurn`：推进当前方 cursor → 若刚行动方是 p 则切 a；否则回合末：
1. 若 `round >= maxRound` 置 `suddenDeath`，且 `round > maxRound` 时全体掉血 `7 + 2×max(0, round-15)`（第 15 回合末首次 7 点，之后每回合 +2）。
2. 胜负判定（任一方 0 存活 → 结束；同批 0 存活 → 当前行动方负）。
3. `round++`、换风（`rngFor(seed, round+1, 'wind')`）、切回 p，发 `wind` 与 `turnChanged`。

## 7. 胜负

- 一方全部英雄 `state==='dead'` → 另一方胜。
- 同批全灭（同一 settle 内双方都 0 存活）→ 当前行动方判负（先手方负）。
- 超过 hardRoundCap 仍双方有人 → 总血量高者胜（相等时当前行动方负）。
- 猝死保证有限步终局（测试断言 `round <= 60`）。

## 8. AI

`engine/ai.ts`：

- 候选：角度 24 bins × 力度 3 档（`AI.powerTiers`），按难度 `candidateScale` 缩放 bins；每条用 `simulateShot` 预演。
- 评分：`1.0×敌伤 + 1.6×90×击杀 − 1.2×自伤 − 0.4×过量`（多弹 `countMul=min(1+(count-1)×0.22,4)`；乌鸦次爆按 0.9 权重再算一遍）。
- 难度：easy keep=12 + 4° 高斯 + 力度抖动；normal keep=4；hard keep=1、候选 ×2。
- 选人：AI 只按 cursor 轮转，不换人；难度不加伤害。

## 9. 存档 v3 与迁移

`progress/schema.ts`：

```
SaveFile { version:3, settings, profile{name,battles,wins},
  progression{ coins, shards, ownedHeroes, heroStars:{id:1..5},
               training{firepower,armor,siege}, team:HeroId[], battleIndex },
  lastBattleSnapshot }
```

迁移映射：

- v1 → v2：保留字段，`heroLevels`→星级，城堡字段暂留。
- v2 → v3：`heroLevels`→`heroStars`；`castleLevels` → `training`（wall→armor / core→firepower / turret→siege）；`team` 按名额（星数/胜场）修整。
- 坏 JSON / 未知版本 → 默认档；存档键 `bg:save:v1` 不变。

战斗快照：`engine/snapshot.ts`，地形 RLE + 单位 + 回合/风/统计 + mapId + mods，无 castles；恢复后从 aim 继续。

## 10. 确定性契约

- 禁止 `Math.random`；随机流 `seed ^ (turn×2654435761) ^ purposeTag`。
- 事件流可 JSON 序列化并做 FNV-1a 哈希；同 seed + 同命令序列必须事件/地形/血量全等（`tests/sim.spec.ts`）。
- 固定 16ms tick、整数累加；地形是唯一可变大对象，其余状态可深拷贝。

---

## 11. 事件表（view 消费契约）

| 事件 | 关键字段 | 何时 |
|---|---|---|
| `wind` | `v, round` | 新回合 |
| `shot` | `side, unitId, weaponId, angle, power, count` | 发射 |
| `step` | `id,x,y,vx,vy` | 弹体每 tick 未命中 |
| `impact` | `id,x,y` | 命中/出界 |
| `explosion` | `x,y,r,dmg,side,weaponId,secondary` | 爆炸入队时 |
| `terrain` | `bbox` | 弹坑真的改了地形 |
| `unitDamaged` / `unitHealed` | `id,dmg,hp` / `id,amount,hp` | 掉血/回血 |
| `settled` | `moves[]` | 位置被结算修正 |
| `unitDead` | `id, cause:'dmg'|'void'` | 死亡 |
| `unitSelected` | `unitId, side` | 玩家点选英雄 |
| `turnChanged` | `unitId,side,round,turnIdx` | 进入下一行动 |
| `suddenDeath` / `gameOver` | `round` / `winner` | 猝死开始 / 胜负 |

无 `block*`/`core*` 事件（城堡已删）。

## 12. 视图/输入层对接

- **反向拉弓**（`view/aim.ts` 纯函数）：`pull=hypot(dx,dy)`，`power=clamp(pull/AIM.maxDragPx,0,1)`，`angle=atan2(dy,-dx)` 转度再 `clamp(AIM.angleMin,AIM.angleMax)`；发射向量=反拖拽向量。
- **即时反馈**：以身体中心画力度环（`ringRadius=58`）、`simulateShot` 300 步按 `predictStride=2` 抽点画预演、命中点画 `blastR` 圆；武器件随角度旋转。
- **点选**：HUD 底部 chip 点击 → `{c:'select'}`；仅玩家回合、存活单位可选；选中高亮，可换人 chip 有下划线。
- **门控**：`canAim` 检查 `finished / hud.isModalOpen() / phase==='aim' / side==='p' / 指针在 max(AIM.dragTopY,topH)..vh-bottomH`；单指 ID 锁定，`pointerupoutside` 取消。
- **节奏**：16ms 累加、单帧最多 5 step；AI 回合延迟 46 tick；爆炸有 2–4 tick hitStop 与相机 zoom 冲击（纯表现）。
- **HUD 存活面板**：左右显示 `存活/总数` 与队伍总血条；中间回合 `x/14`、地图名、风向箭头；底部英雄 chips（名字/星级/血条）；结算标题 `全歼成功/小队覆灭`。
- **全屏**：`startBattle` 与首次 pointerdown 调 `requestFullscreen({navigationUI:'hide'})`，不支持时静默失败。

## 13. 与配置/直觉不一致清单

1. `SIM.suddenDeathCoreDmg`、`SIM.settleMaxPasses` 未接线（城堡删除后的历史常量）。
2. `AIM.angleMax=100` 只在 UI 生效；引擎 `sim.ts` 仍 `clamp(angle,-6,180)`。
3. `AIM.aiAngleMin/aiAngleMax`、`WIND.aiPerturbations` 未使用；AI 角度硬编码 `90±t×82`。
4. `Cmd.weaponId` 被 `void` 忽略，永远用 `unit.weaponId`。
5. `WEAPON_DEFS.scatterR` 未使用；散布只来自 `spreadDeg`。
6. `ECONOMY.slotStars[3]=16` 未被 `teamSlots` 读取（只读 [1]=4、[2]=10）；4 人名额实际只看 10★ 或 8 胜。
7. `SAVE.version=3` 只在设置页显示、`ECONOMY.loseShards=0` 未读取；存档键仍是 `bg:save:v1`。
8. 伤害/击杀按受击方反方记账（自伤/友伤算对方），奖励换算可能偏高。
9. 弹体 `age>420` 静默消失；`Fx.coreBanner('核心破碎')` 是未调用的城堡遗留死代码。
10. `PERF` 未接线（`Fx` 里 `void PERF`）；画质/震屏切换即时生效，但粒子上限/低帧降级/DPR 未做。

## 14. 验收清单

| 断言 | 测试 |
|---|---|
| support 自洽、crater 面积 πr²±5%、脏矩形、重复炸无脏区 | `terrain.spec`(5) |
| rng 同种子/用途隔离/范围；linear/sq 单调 | `damage-rng.spec`(5) |
| 无城堡初始化、fire→flight→settle→AI、select 换人、15 集束、乌鸦次爆、医疗回血、确定性、全灭/同批判负、猝死终局、星级成长 | `sim.spec`(15) |
| 反向拉弓方向/角度夹取/力度 clamp | `aim.spec`(5) |
| 4 地图都能开局、中段不同、快照保留 mapId | `maps.spec`(3) |
| v1/v2→v3 迁移、训练/升星/名额/奖励、坏档降级、RLE 快照<400KB | `save.spec`(14) |
| 三难度候选合法、AI 决策可复现、自战有限终局 | `ai.spec`(4) |
| 3 视口布局/反向拉弓/选人/结算/刷新恢复 | `npm run qa`（先 build+preview，默认 `?renderer=canvas`） |

---

本文档由 design-doc 队友编写，基于 2026-11-05 代码快照

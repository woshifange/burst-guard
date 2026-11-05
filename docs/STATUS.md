# STATUS · burst-guard 当前进度（v3 无城堡版，2026-11-05）

> 证据分三类：`tests/*.spec.ts`（单元测试）、`qa/report.json` + `qa/shots/*.png`（真实浏览器 QA）、`qa/ai-report.json`（AI 自战统计）。

## 0. 一句话

v3 已把城堡体系整体移除，玩法变成**纯击杀**：4 张地图、7 英雄、2–4 人上阵、升星 + 队伍训练三条线的养成闭环；vitest **51 项全绿**（7 个 spec）。浏览器 QA 最近一次完整通过为 `ok=true`（2026-11-05T13:05:59Z，3 视口、0 error；740 跑通全灭→结算→刷新恢复）。真机 WebGL/性能仍未验证。

## 0.1 v3 无城堡重构（2026-11-05 第四轮）

**玩家反馈**：英雄全灭本来就结束战斗，城堡只是第二个胜利条件，目标分散、意义不大。

**决策**：删除城堡，所有资源与玩法集中到「击杀人物」。

**删除清单**：`Castle/CastleBlock` 类型与状态、核心血量与胜负判定、城墙/核心/炮塔组件、炮塔每回合伤害、组件连通性崩塌、`CastleView` 渲染、城堡升级与碎片奖励、`config/plans.ts`、存档 v2 的 castleLevels 字段。

**新增体系**：
- 4 张地图（`config/maps.ts`）按 `battleIndex` 轮换。
- 7 英雄 7 武器（新增迫击 `mortar_shell`、工兵 `sapper_charge`）。
- 英雄升星 1–5★（金币），队伍训练三条线：火力 +6% 伤害/级、护甲 +8% 生命/级、工兵 +10% 挖地/级。
- 升星总数免费解锁英雄（5/7/10/14★），也可碎片直接解锁。
- 上场名额 2→4，由**全队星数 4/10** 或**累计胜场 3/8** 解锁（`ECONOMY.slotStars[3]=16`、`slotWins[3]=14` 未被 `teamSlots` 读取）；对手人数随玩家名额与难度浮动。
- 存档 v3：`castleLevels → training`（wall→armor / core→firepower / turret→siege），`heroLevels → heroStars`。

## 1. 测试（vitest 51 项 / 7 个 spec）

| spec | 项数 | 覆盖 |
|---|---|---|
| `terrain.spec.ts` | 5 | support 自洽、crater 面积 πr²±5%、脏矩形 |
| `damage-rng.spec.ts` | 5 | linear/sq 衰减单调、RNG 确定性 |
| `sim.spec.ts` | 15 | 发射/结算/选人/3 类武器差异（集束/双爆/医疗）/确定性/全灭胜负/猝死有限终局 |
| `aim.spec.ts` | 5 | 反向拉弓方向与力度 clamp |
| `maps.spec.ts` | 3 | 4 张地图单位落地、开局不自毁、快照保地图 |
| `save.spec.ts` | 14 | v1/v2→v3 迁移、坏档降级、升星/训练/名额/奖励、快照恢复 |
| `ai.spec.ts` | 4 | 候选合法、自战有限终局、AI 决策可复现 |

## 2. AI 自战（`qa/ai-report.json`）

- Hard(p) vs Easy(a) 200 局：胜率 **1.00**（200 胜），0 未终局、0 异常。
- Easy(p) vs Hard(a) 200 局：胜率 **0.00**（0 胜），0 未终局、0 异常。
- 落盘时间 `2026-11-05T11:59:11Z`；难度只改选点质量（候选密度/keep/噪声），不加伤害。

## 3. 浏览器 QA（`qa/report.json` + `qa/shots/`）

- 3 视口：812×375 / 740×360 / 1280×720，`?renderer=canvas`。
- 覆盖：菜单/训练/设置、开战、点选英雄（activeId=p1）、反向拉弓（松手后弹道 vx>0/vy<0）、回合推进、740 完整闭环（全灭→结算「全歼成功」→返回营地→刷新→继续战斗）；overflow 为空。
- **报告状态**：`qa/report.json` 最新一次 `at=2026-11-05T13:05:59Z`，`ok=true`，3 视口 `errors=[]`；812/1280 松手后 `turnIdx=1`，740 完整闭环（结算「全歼成功」、coins=86、刷新恢复 aim）。此前 1280 截图超时是 headless 环境慢导致的 flake，已在脚本里改为等待模拟状态而不是固定 sleep。
- headless swiftshader 的 WebGL 会 `Framebuffer Unsupported`（与游戏代码无关，WebGL FBO 单测正常），所以 QA 固定 Canvas 路径；**真机仍是 Phaser.AUTO/WebGL，真机 WebGL 与帧率未验证**。

## 4. 构建

- `npm run verify`：typecheck + vitest + build；dist JS gzip **≈367KB**（预算 ≤1.5MB）。
- 单文件离线版：`dist-single/burst-guard.html`（及 `-canvas` 兼容版）。

## 5. 已知缺口

- 真机性能/触控手感未实测；DPR=1（高分屏略糊）。
- `PERF` 常量部分未接线（低帧自动降级未做）。
- 无 BGM，音效为 WebAudio 合成。
- 自动化 QA 使用 Canvas 渲染路径，WebGL 路径仅有代码级保证。

## 6. 复跑命令

```bash
npm i
npm run typecheck
npm test
npm run build
npm run preview   # 4173
npm run qa        # tools/qa-playthrough.mjs（headless）
npm run qa:ai     # tools/ai-selfplay.ts（400 局）
npm run build:single
```

---
*最后更新：v3 无城堡重构（2026-11-05），由 lead 维护。*

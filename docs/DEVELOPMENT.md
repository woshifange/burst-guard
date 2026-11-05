# 开发文档（二次开发）

## 1. 环境

- Node.js ≥ 20（开发环境使用 24）、npm ≥ 10
- 无后端、无数据库；所有状态在浏览器 `localStorage`
- 可选：headless Chromium 用于自动化 QA（`npx playwright-core install chromium` 或复用 Playwright 缓存）

## 2. 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite 开发服务器（HMR），`--host 0.0.0.0` |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览 `dist/`（默认 4173） |
| `npm test` | vitest 单元测试（51 项） |
| `npm run typecheck` | 仅类型检查 |
| `npm run verify` | typecheck + test + build |
| `npm run qa` | headless 浏览器 QA（需先 build + preview） |
| `npm run qa:ai` | AI 自战 400 局并写 `qa/ai-report.json` |
| `npm run build:single` | 生成 `dist-single/burst-guard.html`（离线单文件） |

## 3. 目录职责

```
config/     唯一硬数值：世界/模拟/经济/AI/UI、英雄武器、地图
engine/     纯逻辑：地形掩码、模拟 reducer、AI、快照
progress/   存档 schema/迁移/仓库/经济养成
view/       Phaser 场景与渲染、程序化美术、WebAudio
ui/         DOM HUD/菜单/结算、布局
main.ts     组装 SaveStore + HUD + 4 场景 + 场景流转
tools/      浏览器 QA、AI 自战、单文件打包
tests/      vitest（节点环境，不依赖浏览器）
```

## 4. 一次射击的数据流

```
拖拽（BattleScene 监听 pointer，view/aim.ts 计算反向角度/力度）
  → Cmd { c:'fire', unitId, angle, power }
  → engine/sim.step：生成 Projectile，phase=flight
  → 每 tick 4 子步积分，命中单位/地形 → ExplosionIntent
  → resolveExplosion：carveCrater(terrainRadius) + 单位伤害 + 医疗
  → 弹体清空 → phase=settle：单位悬空/滑落/坠底 → 胜负 → endTurn（换边/猝死/换风）
  → view 消费 Event[]：地形脏矩形重绘、粒子、震屏、HUD 数值
```

## 5. 关键数据

- `SimState`（`engine/state.ts`）是唯一战斗真相；`step()` 原地修改并返回事件。
- 地形：`Uint32Array` 掩码 + 派生 `Int32Array support`（每列最上实心像素）。
- 单位：每边 2–4 人（由存档名额决定），星级 1–5，训练/难度提供 hp/dmg/terrain 乘区。
- 爆炸：伤害半径 `radius`、挖地半径 `terrainRadius = blastR × weapon.terrainMul × 阵营 terrainMul`。

## 6. 养成与存档

- 存档键 `bg:save:v1`，`SaveFile.version=3`。
- 迁移：v1→v2→v3 纯函数（`progress/migrate.ts`）；坏 JSON / 未知版本 → 默认档。
- 战斗快照：`engine/snapshot.ts`（RLE 压缩地形），战斗中刷新可恢复；快照只存可序列化字段。
- 改 schema 必须：升版本、写迁移、补 `tests/save.spec.ts`、验证 `qa` 刷新恢复。

## 7. 测试与 QA

- 单元测试在 `tests/`，运行于 node；禁止 import Phaser 的测试。
- 视觉/交互改动必须跑 `npm run qa`：3 视口截图、反向拉弓方向断言、选人、结算、刷新恢复、横向溢出检查。
- headless WebGL 在 swiftshader 上不稳定，QA 固定 `?renderer=canvas`；真机仍走 WebGL。
- AI 平衡改动跑 `npm run qa:ai`，观察 hard/easy 胜率差是否仍显著。

## 8. 构建与发布

- `npm run build` 产出 `dist/`（静态站点，可直接托管任意静态服务器）。
- `npm run build:single` 产出单文件 HTML（file:// 可直接打开，适合发给人试玩）。
- 包体预算 ≤ 1.5MB gzip（当前约 367KB）。

## 9. 已知限制

- 真机 WebGL / 帧率 / 触控手感未自动化验证。
- 渲染按 CSS 像素（DPR=1）；高分屏略糊。
- 无 BGM；音效为 WebAudio 合成。
- 部分 `PERF` 常量（低帧自动降级）尚未接线。

## 10. 方向路线（欢迎 PR）

- 更多英雄/武器与地图；地图与难度选择界面。
- 训练/升星的特效与音效反馈。
- DPR 画质档与低帧降级。
- 本地双人热座模式、每日挑战（仍然纯本地）。

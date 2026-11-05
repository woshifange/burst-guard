# 贡献指南（Contributing）

感谢你参与 burst-guard！这是一个**纯前端、无后端、可离线运行**的手机弹射对战游戏（Phaser 3 + TypeScript + Vite）。

## 快速开始

```bash
npm i
npm run dev        # 开发服务器（0.0.0.0:5173，手机同局域网可访问）
npm run verify     # typecheck + vitest + build（提交前必跑）
npm run build:single   # 生成可离线打开的单文件 HTML
```

## 提交前检查

1. `npm run typecheck` 通过；
2. `npm test` 全绿（当前 51 项）；
3. `npm run build` 成功；
4. 改动涉及战斗/交互时，跑一遍 `npm run qa`（需要先 `npm run preview`，脚本使用 headless Chromium）。

## 架构红线（重要）

- **`engine/**` 禁止 import Phaser 或 DOM**。规则、数值、存档都必须在纯 TS 层，可在 node 里单测。
- **表现层（`view/**`）不持有规则状态**：sprite/tween/粒子都是可丢弃视图，状态唯一来源是 `SimState`。
- **HUD/菜单/结算放 DOM（`ui/**`）**，不放进 Phaser Scene。
- **确定性**：禁止 `Math.random`；随机必须从 `(seed, turn, purpose)` 派生（`engine/rng.ts`）；固定 16ms tick。
- **数值只改 `config/`**：`game.const.ts`（世界/经济/AI/UI）、`roster.ts`（英雄/武器）、`maps.ts`（地形）。
- **存档兼容**：改存档结构必须升 `SAVE_VERSION` 并在 `progress/migrate.ts` 加纯函数迁移 + 测试。

## 扩展指引

- 加英雄/武器：修改 `config/roster.ts`（`HERO_DEFS` / `WEAPON_DEFS` / `HERO_UNLOCK_STARS`），
  UI 会自动渲染；在 `tests/sim.spec.ts` 补武器行为测试。
- 加地图：`config/maps.ts` 加 `MapDef`（保持两侧 x≈300 高地高度一致），加入 `MAPS`；
  `tests/maps.spec.ts` 会验证单位落地。
- 加养成线：`progress/schema.ts` 字段 + `economy.ts` 读写 + `HudController` 渲染 + `save.spec.ts` 迁移用例。
- 改战斗规则：先写测试（`tests/sim.spec.ts` 的确定性/结算断言），再改 `engine/sim.ts` / `turns.ts`。

## 美术与音效

程序化生成，不接收图片/音频文件 PR（避免包体与版权问题）。新增视觉请用 Canvas/Graphics，
新增音效请用 `view/audio.ts` 的 WebAudio 合成。

## 提交信息

使用 Conventional Commits 风格，例如：

```
feat(hero): 新增英雄「迫击」
fix(save): 修复升星后名额提示错误
docs: 更新开发文档
```

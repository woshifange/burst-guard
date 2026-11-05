# 30 · 资产清单（v3 程序化美术，无外部素材）

> 本版本**没有任何 png/jpg/webp/svg/音频/字体文件**；所有视觉在运行时由 Canvas / Phaser Graphics 绘制，所有音效由 WebAudio 合成。
> 本文按「名称 / 规格 / 来源 / 运行时去向 / 是否外部文件」登记。城堡/核心/组件渲染已随 v3 删除。

## 1. 纹理（运行时生成）

| 资产 | 规格 | 来源 | 去向 | 外部文件 |
|---|---|---|---|---|
| `sky` | 1280×640 Canvas：竖向渐变 + 落日 radial + 90 颗星点 | `view/scenes/BootScene.ts: makeSky()` | Boot 生成，菜单与战斗背景 | 否 |
| `terrain` | 1280×640 CanvasTexture，NEAREST；掩码→像素（土层分带/边缘光/噪点） | `view/render/TerrainSprite.ts` | 战斗地形，脏矩形重绘 | 否 |
| `spark` | 10×10 白色圆 | `view/render/Fx.ts: createFxTextures()` | 火光/火星/治疗/弹道拖尾 | 否 |
| `smoke` | 28×28 半透明圆 | 同上 | 爆炸烟团/烟柱 | 否 |
| `dot` | 4×4 实心点 | 同上 | 尘埃/碎石粒子 | 否 |

## 2. 地形配色（4 张地图）

`config/maps.ts` 的 `MapColors`（grass/grassHi/grassDark/dirt/dirtDark/rock），按地图切换：

| 地图 | 草 | 土 | 岩 |
|---|---|---|---|
| 黄昏高地 dusk | `#5fbf6a` | `#7a4a32` | `#3a3340` |
| 碎骨裂谷 canyon | `#6fbf6a` | `#8a5636` | `#453b47` |
| 双峰隘口 twin | `#63b98a` | `#6f4a3a` | `#3a3a4a` |
| 赤岩台地 mesa | `#7fb86a` | `#9a5a34` | `#4a3a30` |

`TerrainSprite` 用这些颜色渲染：depth≤1 高光草、≤7 草、≤13 暗草、<60 土、<140 暗土、其余岩；每 13px 一条明暗土层带；上方为空的像素提亮（地表），左右为空的像素压暗（崖壁）。

## 3. 英雄剪影（7 人）

`view/render/UnitView.ts`，每种 5 种形状之一（bulk / slim / cloak / rifle / cross）+ 主色/强调色 + 队色（我方 cyan `#4fc3f7` / 敌方 rose `#ff5d73`）：

| 英雄 | 形状 | 主色 |
|---|---|---|
| 破坏者 | bulk | `#ff8a3d` |
| 侦察 | slim | `#7ee787` |
| 枪手 | rifle | `#6ee7ff` |
| 乌鸦 | cloak | `#9d8cff` |
| 医疗 | cross | `#8bf0c0` |
| 迫击 | bulk | `#ff9d5c` |
| 工兵 | slim | `#d9a066` |

绘制内容：影子、腿、躯干（含描边）、队色肩带、头/头盔/眼睛、独立武器层（瞄准时按角度旋转，`setAim()`）、HP 条（绿→黄→红）。

## 4. 特效与 UI 图元

| 资产 | 规格 / 来源 | 去向 |
|---|---|---|
| 爆炸 | Fx：双冲击波环 + 白闪 + 火点 + 烟团 + 碎石（dot）+ 烟柱 + 焦痕 Graphics | 战斗 |
| 弹道预览 | Graphics 点列（靠 `simulateShot` 采样） | 战斗 |
| 力度环 | 圆环 + 弧（颜色随力度绿→金→橙） | 战斗 |
| 伤害/治疗数字 | Phaser Text（system-ui） | 战斗 |
| 横幅/闪光 | OverlayScene Text + 全屏矩形 | 战斗/回合/猝死 |
| 菜单背景 | sky + 远山/岩柱剪影 + 火星粒子 + 循环演示弹道 | 菜单 |
| DOM HUD | `ui/hud.html` + `hud.css`：我方/敌方存活面板（存活数 + 团队血条）、回合/风/地图、英雄头像条（可点选）、跳过/菜单 | 战斗 |
| DOM 菜单 | 英雄页（升星/解锁/上阵/名额提示）、训练页（火力/护甲/工兵）、设置页、难度、开始/继续 | 菜单 |
| DOM 结算 | 标题（全歼成功/小队覆灭）、击杀/回合/地图、奖励行、返回/再战 | 结算 |

## 5. 音效（WebAudio 合成，无文件）

`view/audio.ts`：`shot`（方波扫频 + 噪声）、`explosion`（噪声低通 + 低频正弦）、`heal`（双正弦）、`ui`（短三角波）、`turn`（三角波上行）、`block`（方波下行，用于受击/猝死提示）、`win`/`lose`（琶音）。无 BGM。

## 6. 字体

只用系统字体栈：`system-ui, -apple-system, "Noto Sans SC", "PingFang SC", sans-serif`；不含字体文件。

## 7. 缺口与降级

- 仍然 **0 外部素材**，包体约 367KB gzip（预算 ≤1.5MB）；没有需要剔除的未使用文件。
- ImageGen 未使用：程序化美术是该项目的明确选择，也避免透明底/风格一致性问题。
- headless 浏览器 WebGL 在 swiftshader 上不可用（`Framebuffer Unsupported`），QA 用 `?renderer=canvas`；真机 WebGL 路径未实测。
- DPR=1 渲染（高分屏略糊），可后续加画质档。

---
*最后更新：v3 无城堡重构（2026-11-05）。*

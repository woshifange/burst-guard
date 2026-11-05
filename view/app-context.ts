/**
 * 场景与 App 之间的依赖接口（只放类型，避免 runtime 循环 import）。
 */

import type Phaser from 'phaser';
import type { SaveStore } from '../progress/store';
import type { HudController } from '../ui/HudController';
import type { Layout } from '../ui/layout';
import type { Sfx } from './audio';
import type { Difficulty, SimState } from '../engine/state';

export interface AppContext {
  game: Phaser.Game;
  save: SaveStore;
  hud: HudController;
  audio: Sfx;
  /** 用户手势内请求浏览器全屏（iOS 无 API 时静默失败） */
  requestFullscreen(): void;
  layout: Layout;
  quality(): 'hi' | 'lo';
  shakeEnabled(): boolean;
  startBattle(difficulty: Difficulty, resume: boolean): void;
  finishBattle(state: SimState, winner: 'p' | 'a'): void;
  leaveBattle(): void;
  goMenu(): void;
}

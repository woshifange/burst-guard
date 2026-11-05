/**
 * 屏幕布局：世界坐标恒定 1280×640，按 uniform scale 居中 letterbox；
 * HUD 用屏幕坐标（CSS），战斗输入只在 topH..vh-bottomH 之间生效。
 */

import { WORLD } from '../config/game.const';

export interface Layout {
  vw: number;
  vh: number;
  scale: number;
  ox: number;
  oy: number;
  topH: number;
  bottomH: number;
}

export function computeLayout(vw: number, vh: number): Layout {
  const scale = Math.min(vw / WORLD.w, vh / WORLD.h);
  return {
    vw,
    vh,
    scale,
    ox: (vw - WORLD.w * scale) / 2,
    oy: (vh - WORLD.h * scale) / 2,
    topH: Math.max(48, Math.min(72, vh * 0.14)),
    bottomH: Math.max(56, Math.min(76, vh * 0.17)),
  };
}

export function worldToScreen(l: Layout, x: number, y: number): { x: number; y: number } {
  return { x: l.ox + x * l.scale, y: l.oy + y * l.scale };
}

export function screenToWorld(l: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x - l.ox) / l.scale, y: (y - l.oy) / l.scale };
}

/** 战斗输入区域（屏幕坐标）：避开 HUD 上下条 */
export function playfieldRect(l: Layout): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: 0, y0: l.topH, x1: l.vw, y1: l.vh - l.bottomH };
}

export function watchResize(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  if (typeof visualViewport !== 'undefined' && visualViewport) {
    visualViewport.addEventListener('resize', cb);
  }
  return () => {
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
  };
}

/**
 * 反向拉弓：手指向后拉，炮弹向相反方向飞，避免手指遮挡落点。
 * 纯函数，便于单元测试。
 */

import { AIM } from '../config/game.const';

export interface Aim {
  angle: number;
  power: number;
  pull: number;
}

export function clampAngle(deg: number): number {
  return Math.max(AIM.angleMin, Math.min(AIM.angleMax, deg));
}

/**
 * @param dx 手指相对按下点的屏幕位移（右为正）
 * @param dy 手指相对按下点的屏幕位移（下为正）
 */
export function computeAim(dx: number, dy: number): Aim {
  const pull = Math.hypot(dx, dy);
  const power = Math.max(0, Math.min(1, pull / AIM.maxDragPx));
  // 发射向量 = -拖拽向量；屏幕 y 向下，引擎角度 y 向上
  const raw = (Math.atan2(dy, -dx) * 180) / Math.PI;
  return { angle: clampAngle(raw), power, pull };
}

/**
 * 模拟事件：engine 产出，view 消费。全部可 JSON 序列化。
 */

import type { Side, WeaponId } from '../config/roster';

export type Event =
  | { t: 'wind'; v: number; round: number }
  | { t: 'shot'; side: Side; unitId: string; weaponId: WeaponId; angle: number; power: number; count: number }
  | { t: 'step'; id: number; x: number; y: number; vx: number; vy: number }
  | { t: 'impact'; id: number; x: number; y: number }
  | { t: 'explosion'; x: number; y: number; r: number; dmg: number; side: Side; weaponId: WeaponId; secondary: boolean }
  | { t: 'terrain'; bbox: [number, number, number, number] }
  | { t: 'unitDamaged'; id: string; dmg: number; hp: number }
  | { t: 'unitHealed'; id: string; amount: number; hp: number }
  | { t: 'settled'; moves: { id: string; from: [number, number]; to: [number, number]; cause: 'fall' | 'slide' | 'lift' }[] }
  | { t: 'unitDead'; id: string; cause: 'dmg' | 'void' }
  | { t: 'unitSelected'; unitId: string; side: Side }
  | { t: 'turnChanged'; unitId: string; side: Side; round: number; turnIdx: number }
  | { t: 'suddenDeath'; round: number }
  | { t: 'gameOver'; winner: Side };

export function hashEvents(events: readonly Event[]): string {
  const s = JSON.stringify(events);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type EventSink = (e: Event) => void;

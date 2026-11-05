/**
 * 存档仓：localStorage 单 JSON 信封、300ms 防抖、失败降级为内存态。
 */

import { SAVE } from '../config/game.const';
import type { BattleSnapshot } from '../engine/snapshot';
import { migrate } from './migrate';
import { defaultSave, type SaveFile } from './schema';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

export function detectStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__bg_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    // 隐私模式 / iframe sandbox 禁止 localStorage：降级
  }
  return memoryStorage();
}

export class SaveStore {
  data: SaveFile;
  private storage: StorageLike;
  private fallback: StorageLike = memoryStorage();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(storage?: StorageLike) {
    this.storage = storage ?? detectStorage();
    this.data = this.load();
    // 页面隐藏/刷新前同步落盘，避免 300ms 防抖窗口内丢档
    if (typeof window !== 'undefined') {
      const flush = (): void => this.flush();
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
    }
  }

  load(): SaveFile {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(SAVE.key);
    } catch {
      raw = this.fallback.getItem(SAVE.key);
    }
    if (!raw) return defaultSave();
    try {
      const parsed: unknown = JSON.parse(raw);
      return migrate(parsed);
    } catch {
      // 坏档：重建为全新档（不崩）
      return defaultSave();
    }
  }

  /** 外部直接改 data 后必须调用以触发落盘 */
  touch(): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE.debounceMs);
  }

  update(mutator: (data: SaveFile) => void): SaveFile {
    mutator(this.data);
    this.touch();
    return this.data;
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      this.storage.setItem(SAVE.key, JSON.stringify(this.data));
    } catch {
      // 配额满 / 被禁用：降级内存态，本次会话仍可玩
      try {
        this.storage = this.fallback;
        this.fallback.setItem(SAVE.key, JSON.stringify(this.data));
      } catch {
        /* 完全放弃持久化 */
      }
    }
  }

  setSnapshot(snap: BattleSnapshot | null): void {
    this.data.lastBattleSnapshot = snap;
    this.touch();
  }

  resetProgress(): void {
    const fresh = defaultSave();
    this.data = {
      ...this.data,
      profile: { ...fresh.profile, name: this.data.profile.name },
      progression: { ...fresh.progression },
      lastBattleSnapshot: null,
    };
    this.dirty = true;
    this.flush();
  }

  resetAll(): void {
    this.data = defaultSave();
    this.dirty = true;
    this.flush();
  }
}

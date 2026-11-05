/**
 * 应用入口：存档、HUD、Phaser、场景流转、无城堡纯击杀的养成闭环。
 */

import Phaser from 'phaser';
import { createBattle, type Difficulty, type SimState } from './engine/state';
import { isSnapshotValid, restoreBattle, snapshotBattle } from './engine/snapshot';
import { getMap } from './config/maps';
import type { HeroId } from './config/roster';
import type { TrainingKey } from './progress/schema';
import { SaveStore } from './progress/store';
import {
  applyRewards,
  buildBattleSetup,
  computeRewards,
  ensureTeam,
  refreshUnlocks,
  teamSlots,
  toggleTeam,
  trainingLevel,
  unlockHero,
  upgradeHero,
  upgradeTraining,
  type BattleSetup,
} from './progress/economy';
import { HudController } from './ui/HudController';
import { computeLayout, watchResize, type Layout } from './ui/layout';
import { Sfx } from './view/audio';
import type { AppContext } from './view/app-context';
import { BootScene } from './view/scenes/BootScene';
import { BattleScene } from './view/scenes/BattleScene';
import { MenuScene } from './view/scenes/MenuScene';
import { OverlayScene } from './view/scenes/OverlayScene';

class App implements AppContext {
  game!: Phaser.Game;
  save: SaveStore;
  hud: HudController;
  audio = new Sfx();
  layout: Layout;
  battleScene: BattleScene | null = null;
  private lastDifficulty: Difficulty = 'normal';

  constructor() {
    this.save = new SaveStore();
    this.audio.setEnabled(this.save.data.settings.sound);
    this.layout = computeLayout(window.innerWidth, window.innerHeight);
    refreshUnlocks(this.save.data);
    ensureTeam(this.save.data);

    this.hud = new HudController(document.querySelector('#hud') as HTMLElement, this.save, {
      onStartBattle: (difficulty) => this.startBattle(difficulty, false),
      onResumeBattle: () => this.startBattle('normal', true),
      onUpgradeHero: (id: HeroId) => this.mutateHero(id),
      onUnlockHero: (id: HeroId) => this.mutateUnlock(id),
      onTeamToggle: (id: HeroId) => {
        toggleTeam(this.save.data, id);
        this.save.touch();
        this.save.flush();
      },
      onUpgradeTraining: (key: TrainingKey) => {
        if (upgradeTraining(this.save.data, key)) {
          this.save.touch();
          this.save.flush();
        } else this.hud.toast('金币不足或已满级');
      },
      onToggleSound: () => {
        this.save.data.settings.sound = !this.save.data.settings.sound;
        this.audio.setEnabled(this.save.data.settings.sound);
        this.save.touch();
      },
      onToggleShake: () => {
        this.save.data.settings.shake = !this.save.data.settings.shake;
        this.save.touch();
        this.battleScene?.applySettings();
      },
      onToggleQuality: () => {
        this.save.data.settings.quality = this.save.data.settings.quality === 'hi' ? 'lo' : 'hi';
        this.save.touch();
        this.battleScene?.applySettings();
      },
      onResetProgress: () => {
        this.save.resetProgress();
        this.hud.refreshMenu();
      },
      onResetAll: () => {
        this.save.resetAll();
        this.audio.setEnabled(this.save.data.settings.sound);
        this.hud.refreshMenu();
      },
      onSelectHero: (unitId: string) => this.battleScene?.selectUnit(unitId),
      onSkipTurn: () => this.battleScene?.skipTurn(),
      onLeaveBattle: () => this.leaveBattle(),
      onResultNext: () => this.startBattle(this.lastDifficulty, false),
      onResultMenu: () => this.goMenu(),
    });

    this.setupGame();
    this.setupResize();
    this.game.events.once(Phaser.Core.Events.READY, () => this.hideBootScreen());
  }

  requestFullscreen(): void {
    const el = document.documentElement as HTMLElement & {
      requestFullscreen?: (opts?: { navigationUI?: string }) => Promise<void>;
    };
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      /* iOS Safari / 部分 WebView 不支持 */
    });
  }

  quality(): 'hi' | 'lo' {
    return this.save.data.settings.quality;
  }

  shakeEnabled(): boolean {
    return this.save.data.settings.shake;
  }

  trainingLevelKey(key: TrainingKey): number {
    return trainingLevel(this.save.data, key);
  }

  private mutateHero(id: HeroId): void {
    if (upgradeHero(this.save.data, id)) {
      this.save.touch();
      this.save.flush();
      this.hud.refreshMenu();
    } else this.hud.toast('金币不足或已满星');
  }

  private mutateUnlock(id: HeroId): void {
    if (unlockHero(this.save.data, id)) {
      this.save.touch();
      this.save.flush();
      this.hud.toast('英雄已解锁');
      this.hud.refreshMenu();
    } else this.hud.toast('碎片不足');
  }

  private setupGame(): void {
    const forceCanvas =
      (window as unknown as { __BG_FORCE_CANVAS__?: boolean }).__BG_FORCE_CANVAS__ === true ||
      new URLSearchParams(location.search).get('renderer') === 'canvas';
    const config: Phaser.Types.Core.GameConfig = {
      type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#070b16',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight,
      },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      fps: { target: 60, min: 30 },
    };
    this.game = new Phaser.Game(config);
    this.game.scene.add('BootScene', new BootScene(this), true);
    this.game.scene.add('MenuScene', new MenuScene(this));
    this.game.scene.add('BattleScene', new BattleScene(this));
    this.game.scene.add('OverlayScene', new OverlayScene(this));
  }

  private setupResize(): void {
    watchResize(() => {
      this.layout = computeLayout(window.innerWidth, window.innerHeight);
    });
  }

  private hideBootScreen(): void {
    const boot = document.querySelector('#boot-screen') as HTMLElement | null;
    if (!boot) return;
    setTimeout(() => {
      boot.style.opacity = '0';
      setTimeout(() => boot.remove(), 200);
    }, 30);
  }

  startBattle(difficulty: Difficulty, resume: boolean): void {
    this.requestFullscreen();
    this.lastDifficulty = difficulty;
    let state: SimState | null = null;
    let setup: BattleSetup | null = null;

    if (resume) {
      const snap = this.save.data.lastBattleSnapshot;
      if (isSnapshotValid(snap)) {
        state = restoreBattle(snap);
        const mods = snap.mods?.p ?? { hpMul: 1, dmgMul: 1, terrainMul: 1 };
        const eMods = snap.mods?.a ?? { hpMul: 1, dmgMul: 1, terrainMul: 1 };
        setup = {
          config: { seed: snap.seed, difficulty: snap.difficulty, player: snap.player, enemy: snap.enemy, mapId: snap.mapId, mods: snap.mods },
          player: snap.player,
          enemy: snap.enemy,
          mapId: snap.mapId ?? 'dusk',
          mapName: getMap(snap.mapId).name,
          slots: snap.player.length,
          mods,
          enemyMods: eMods,
        };
        this.hud.toast('已恢复上一场战斗');
      }
    }
    if (!state || !setup) {
      const seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
      setup = buildBattleSetup(this.save.data, difficulty, seed || 1);
      state = createBattle(setup.config);
    }
    this.save.setSnapshot(snapshotBattle(state));
    this.save.flush();

    this.game.scene.stop('BattleScene');
    this.game.scene.stop('OverlayScene');
    this.game.scene.stop('MenuScene');
    this.game.scene.start('BattleScene', { state, setup });
    this.battleScene = this.game.scene.getScene('BattleScene') as BattleScene;
    this.hud.showBattle();
    this.hud.buildBattleHud(state);
  }

  finishBattle(state: SimState, winner: 'p' | 'a'): void {
    const won = winner === 'p';
    const rewards = computeRewards(state, won, state.difficulty);
    this.save.update((d) => {
      applyRewards(d, rewards, won);
      d.progression.battleIndex += 1;
      d.lastBattleSnapshot = null;
    });
    this.save.flush();
    this.game.scene.stop('BattleScene');
    this.game.scene.stop('OverlayScene');
    this.battleScene = null;
    this.hud.showResult(won, rewards, state);
  }

  leaveBattle(): void {
    const scene = this.battleScene as unknown as { state?: SimState } | null;
    const state = scene?.state;
    if (state && state.phase !== 'over') {
      this.save.setSnapshot(snapshotBattle(state));
      this.save.flush();
    }
    this.game.scene.stop('BattleScene');
    this.game.scene.stop('OverlayScene');
    this.battleScene = null;
    this.goMenu();
  }

  goMenu(): void {
    this.game.scene.stop('BattleScene');
    this.game.scene.stop('OverlayScene');
    this.battleScene = null;
    if (!this.game.scene.isActive('MenuScene')) this.game.scene.start('MenuScene');
    refreshUnlocks(this.save.data);
    ensureTeam(this.save.data);
    this.hud.showMenu();
  }

  slots(): number {
    return teamSlots(this.save.data);
  }
}

const app = new App();
(window as unknown as { __BG__: unknown }).__BG__ = {
  app,
  get save() {
    return app.save.data;
  },
  get state() {
    return (app.battleScene as unknown as { state?: SimState } | null)?.state ?? null;
  },
};

export { app };

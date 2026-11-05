/**
 * DOM HUD / 菜单 / 结算（无城堡版）。
 */

import template from './hud.html?raw';
import './hud.css';
import { SAVE } from '../config/game.const';
import { HERO_DEFS, HERO_UNLOCK_STARS, WEAPON_DEFS, type HeroId } from '../config/roster';
import { getMap } from '../config/maps';
import { activeUnit, aliveCount, sideHp, sideMaxHp, type Difficulty, type SimState } from '../engine/state';
import type { Rewards } from '../progress/economy';
import {
  heroStars,
  heroUpgradeCost,
  heroUnlockCost,
  isOwned,
  nextSlotHint,
  starTotal,
  teamSlots,
  trainingCost,
  trainingLevel,
} from '../progress/economy';
import type { SaveStore } from '../progress/store';
import type { SaveFile, TrainingKey } from '../progress/schema';

export interface HudCallbacks {
  onStartBattle: (difficulty: Difficulty) => void;
  onResumeBattle: () => void;
  onUpgradeHero: (id: HeroId) => void;
  onUnlockHero: (id: HeroId) => void;
  onTeamToggle: (id: HeroId) => void;
  onUpgradeTraining: (key: TrainingKey) => void;
  onToggleSound: () => void;
  onToggleShake: () => void;
  onToggleQuality: () => void;
  onResetProgress: () => void;
  onResetAll: () => void;
  onSelectHero: (unitId: string) => void;
  onSkipTurn: () => void;
  onLeaveBattle: () => void;
  onResultNext: () => void;
  onResultMenu: () => void;
}

type Tab = 'heroes' | 'training' | 'settings';

const DIFF_LABEL: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };
const TRAININGS: { key: TrainingKey; name: string; desc: string; color: string }[] = [
  { key: 'firepower', name: '火力训练', desc: '全队伤害 +6%/级', color: '#ff8a3d' },
  { key: 'armor', name: '护甲训练', desc: '全队生命 +8%/级', color: '#4fc3f7' },
  { key: 'siege', name: '工兵训练', desc: '爆炸挖地半径 +10%/级', color: '#d9a066' },
];

function heroColor(id: HeroId): string {
  const c = HERO_DEFS.find((h) => h.id === id)!.color;
  return `#${c.toString(16).padStart(6, '0')}`;
}

export class HudController {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private chips: { chip: HTMLElement; fill: HTMLElement; name: HTMLElement }[] = [];
  private tab: Tab = 'heroes';
  difficulty: Difficulty = 'normal';
  private modal = false;
  private resetArmed = 0;
  private resetAllArmed = 0;
  private lastHudKey = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private hintHidden = false;

  constructor(
    container: HTMLElement,
    private save: SaveStore,
    private cb: HudCallbacks,
  ) {
    container.innerHTML = template;
    this.root = container.querySelector('#hud-root') as HTMLElement;
    this.cache();
    this.bind();
    this.showMenu();
  }

  private cache(): void {
    const ids = [
      'layer-battle', 'layer-menu', 'layer-result',
      'core-hp-p', 'core-fill-p', 'core-hp-a', 'core-fill-a',
      'round-label', 'turn-label', 'map-label', 'wind-arrow', 'wind-val',
      'hero-chips', 'btn-skip', 'btn-leave', 'battle-hint',
      'res-coins', 'res-shards', 'tab-heroes', 'tab-training', 'tab-settings',
      'diff-group', 'btn-start', 'btn-resume', 'btn-back-menu', 'btn-next',
      'result-title', 'result-sub', 'reward-lines', 'toast',
    ];
    for (const id of ids) {
      const el = this.root.querySelector(`#${id}`);
      if (el) this.els[id] = el as HTMLElement;
    }
  }

  private el(id: string): HTMLElement {
    const e = this.els[id];
    if (!e) throw new Error(`missing hud element #${id}`);
    return e;
  }

  private bind(): void {
    this.root.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const tabBtn = target.closest<HTMLElement>('[data-tab]');
      if (tabBtn) {
        this.setTab(tabBtn.dataset.tab as Tab);
        return;
      }
      const diffBtn = target.closest<HTMLElement>('[data-diff]');
      if (diffBtn) {
        this.difficulty = diffBtn.dataset.diff as Difficulty;
        this.refreshMenu();
        return;
      }
      const actBtn = target.closest<HTMLElement>('[data-act]');
      if (actBtn) {
        ev.stopPropagation();
        this.handleAction(actBtn.dataset.act!, actBtn.dataset.id ?? actBtn.dataset.key ?? '');
        return;
      }
      const card = target.closest<HTMLElement>('.hero-card');
      if (card?.dataset.hero) {
        this.cb.onTeamToggle(card.dataset.hero as HeroId);
        this.refreshMenu();
        return;
      }
      switch ((target.closest('button') as HTMLElement | null)?.id) {
        case 'btn-start': this.cb.onStartBattle(this.difficulty); break;
        case 'btn-resume': this.cb.onResumeBattle(); break;
        case 'btn-skip': this.cb.onSkipTurn(); break;
        case 'btn-leave': this.cb.onLeaveBattle(); break;
        case 'btn-next': this.cb.onResultNext(); break;
        case 'btn-back-menu': this.cb.onResultMenu(); break;
        case 'btn-sound': this.cb.onToggleSound(); this.refreshSettings(); break;
        case 'btn-shake': this.cb.onToggleShake(); this.refreshSettings(); break;
        case 'btn-quality': this.cb.onToggleQuality(); this.refreshSettings(); break;
        case 'btn-reset-progress': this.armReset('progress'); break;
        case 'btn-reset-all': this.armReset('all'); break;
      }
    });
    this.el('hero-chips').addEventListener('click', (ev) => {
      const chip = (ev.target as HTMLElement).closest<HTMLElement>('.hero-chip');
      if (!chip?.dataset.unit) return;
      ev.stopPropagation();
      this.cb.onSelectHero(chip.dataset.unit);
    });
  }

  private handleAction(act: string, id: string): void {
    switch (act) {
      case 'hero-upgrade': this.cb.onUpgradeHero(id as HeroId); this.refreshMenu(); break;
      case 'hero-unlock': this.cb.onUnlockHero(id as HeroId); this.refreshMenu(); break;
      case 'training-upgrade': this.cb.onUpgradeTraining(id as TrainingKey); this.refreshMenu(); break;
    }
  }

  private armReset(kind: 'progress' | 'all'): void {
    const now = Date.now();
    const key = kind === 'all' ? 'resetAllArmed' : 'resetArmed';
    if (now - this[key] < 2500) {
      this[key] = 0;
      if (kind === 'all') this.cb.onResetAll();
      else this.cb.onResetProgress();
      this.refreshMenu();
      this.toast(kind === 'all' ? '已重置全部数据' : '养成已重置（设置保留）');
    } else {
      this[key] = now;
      this.toast('再点一次确认重置');
      window.setTimeout(() => {
        this[key] = 0;
        this.refreshSettings();
      }, 2600);
    }
  }

  hideAll(): void {
    for (const id of ['layer-battle', 'layer-menu', 'layer-result']) this.el(id).hidden = true;
    this.modal = false;
  }

  showMenu(): void {
    this.hideAll();
    this.el('layer-menu').hidden = false;
    this.modal = true;
    this.refreshMenu();
  }

  showBattle(): void {
    this.hideAll();
    this.el('layer-battle').hidden = false;
    this.modal = false;
    this.hintHidden = false;
    this.el('battle-hint').style.opacity = '1';
    this.lastHudKey = '';
  }

  showResult(won: boolean, rewards: Rewards, state: SimState): void {
    this.hideAll();
    this.el('layer-result').hidden = false;
    this.modal = true;
    const title = this.el('result-title');
    title.textContent = won ? '全歼成功' : '小队覆灭';
    title.classList.toggle('lose', !won);
    const mapName = getMap(state.mapId).name;
    this.el('result-sub').textContent = won
      ? `第 ${state.round} 回合 · ${mapName} · 击杀 ${state.stats.kills.p} 人`
      : `第 ${state.round} 回合 · ${mapName} · 我方剩 ${aliveCount(state, 'p')} 人`;
    const lines = rewards.lines
      .map((l) => `<li><span>${l.label}</span><b class="gold">${l.coins ? `${l.coins}◉` : ''}${l.shards ? ` ${l.shards}◆` : ''}</b></li>`)
      .join('');
    this.el('reward-lines').innerHTML = `${lines}<li><span>合计</span><b>${rewards.coins}◉ ${rewards.shards}◆</b></li>`;
  }

  isModalOpen(): boolean {
    return this.modal;
  }

  toast(text: string): void {
    const t = this.el('toast');
    t.textContent = text;
    t.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 1600);
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    for (const t of ['heroes', 'training', 'settings'] as Tab[]) this.el(`tab-${t}`).hidden = t !== tab;
    this.renderTab();
  }

  refreshMenu(): void {
    const d = this.save.data;
    this.el('res-coins').textContent = String(d.progression.coins);
    this.el('res-shards').textContent = String(d.progression.shards);
    this.el('btn-resume').hidden = !d.lastBattleSnapshot;
    this.el('diff-group').querySelectorAll<HTMLElement>('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === this.difficulty));
    this.el('btn-start').textContent = `开始战斗 · ${DIFF_LABEL[this.difficulty]}`;
    this.renderTab();
  }

  private renderTab(): void {
    if (this.tab === 'heroes') this.renderHeroes();
    else if (this.tab === 'training') this.renderTraining();
    else this.renderSettings();
  }

  private starText(n: number): string {
    return '★'.repeat(Math.max(1, Math.min(5, n)));
  }

  private renderHeroes(): void {
    const d = this.save.data;
    const team = d.progression.team;
    const slots = teamSlots(d);
    const stars = starTotal(d);
    const html = HERO_DEFS.map((h) => {
      const owned = isOwned(d, h.id);
      const lv = heroStars(d, h.id);
      const inTeam = team.includes(h.id);
      const body = `
        <div class="hc-top">
          <span class="avatar" style="background:${heroColor(h.id)}">${h.name.slice(0, 1)}</span>
          <div class="hc-title"><b>${owned ? `${h.name} ${this.starText(lv)}` : `${h.name} · 未解锁`}</b><i>${h.title} · ${WEAPON_DEFS[h.weaponIds[0]].name}</i></div>
        </div>
        <div class="hc-stats"><span>HP <b>${Math.round(h.hpBase * (1 + 0.18 * (lv - 1)))}</b></span><span>伤害 <b>×${(1 + 0.12 * (lv - 1)).toFixed(2)}</b></span>${inTeam ? '<span class="tag">上阵</span>' : ''}</div>`;
      if (!owned) {
        const needStars = HERO_UNLOCK_STARS[h.id];
        const free = stars >= needStars;
        const cost = heroUnlockCost(h.id);
        return `<div class="hero-card locked" data-hero="${h.id}">
          <span class="tag lock">需 ${needStars}★</span>${body}
          <button class="hc-btn purple" data-act="hero-unlock" data-id="${h.id}" ${free || d.progression.shards >= cost ? '' : 'disabled'}>
            ${free ? '免费解锁' : `解锁 ${cost}◆`}
          </button>
        </div>`;
      }
      const maxed = lv >= 5;
      const cost = heroUpgradeCost(lv);
      const btn = maxed
        ? '<button class="hc-btn" disabled>已满星</button>'
        : `<button class="hc-btn ${d.progression.coins >= cost ? 'gold' : ''}" data-act="hero-upgrade" data-id="${h.id}" ${d.progression.coins < cost ? 'disabled' : ''}>升星 ${cost}◉</button>`;
      return `<div class="hero-card ${inTeam ? 'in-team' : ''}" data-hero="${h.id}">${body}${btn}</div>`;
    }).join('');
    this.el('tab-heroes').innerHTML = `<div class="team-line">出战 ${team.length}/${slots} 人 · 总星数 ${stars} · ${nextSlotHint(d)}</div>${html}`;
  }

  private renderTraining(): void {
    const d = this.save.data;
    const html = TRAININGS.map((t) => {
      const lv = trainingLevel(d, t.key);
      const maxed = lv >= 3;
      const cost = trainingCost(lv);
      const pips = Array.from({ length: 3 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="train-card">
        <div class="hc-top">
          <span class="train-icon" style="color:${t.color}">${t.key === 'firepower' ? '✦' : t.key === 'armor' ? '▣' : '⛏'}</span>
          <div class="hc-title"><b>${t.name} Lv${lv}</b><i>${t.desc}</i></div>
        </div>
        <div class="pips">${pips}</div>
        <p>${t.key === 'firepower' ? '所有英雄伤害提升' : t.key === 'armor' ? '所有英雄生命提升' : '爆炸挖掉更多地形的，制造坠落'}</p>
        <button class="hc-btn ${d.progression.coins >= cost && !maxed ? 'gold' : ''}" data-act="training-upgrade" data-key="${t.key}" ${maxed || d.progression.coins < cost ? 'disabled' : ''}>
          ${maxed ? '已满级' : `训练 ${cost}◉`}
        </button>
      </div>`;
    }).join('');
    this.el('tab-training').innerHTML = `<div class="tab-panel">${html}</div>`;
  }

  private renderSettings(): void {
    const d = this.save.data;
    this.el('tab-settings').innerHTML = `
      <div class="settings-panel">
        <div class="setting-row"><div>音效<small>WebAudio 合成，无音频文件</small></div><button id="btn-sound" class="toggle ${d.settings.sound ? 'on' : ''}">${d.settings.sound ? '开' : '关'}</button></div>
        <div class="setting-row"><div>震屏<small>爆炸时的相机反馈</small></div><button id="btn-shake" class="toggle ${d.settings.shake ? 'on' : ''}">${d.settings.shake ? '开' : '关'}</button></div>
        <div class="setting-row"><div>画质<small>低画质减少粒子与烟尘</small></div><button id="btn-quality" class="toggle ${d.settings.quality === 'hi' ? 'on' : ''}">${d.settings.quality === 'hi' ? '高' : '低'}</button></div>
        <div class="how-to">
          <b>怎么玩</b><br />
          横屏单指按住战场向反方向拉弓：向左下拖 = 向右上打，松手发射。<br />
          点底部英雄头像可换人出手，团灭对方小队即胜；14 回合后进入猝死。<br />
          战后金币升星/练训练，升星总数与胜场解锁新英雄和更多上场名额。
        </div>
        <div class="setting-row"><div>重置养成<small>保留设置与名字，清空金币/星级/训练/快照</small></div><button id="btn-reset-progress" class="toggle">重置</button></div>
        <div class="setting-row"><div>重置全部<small>连设置一起恢复出厂</small></div><button id="btn-reset-all" class="toggle">清空</button></div>
        <div class="how-to">存档键：<b>${SAVE.key}</b> · 版本 v${SAVE.version}</div>
      </div>`;
  }

  private refreshSettings(): void {
    if (this.tab === 'settings') this.renderSettings();
  }

  buildBattleHud(state: SimState): void {
    const heroes = state.units.filter((u) => u.side === 'p');
    this.el('hero-chips').innerHTML = heroes
      .map((u) => `<div class="hero-chip" data-unit="${u.id}">
        <div class="hc-name"><span>${HERO_DEFS.find((h) => h.id === u.heroId)!.name}</span><i>${u.level}★</i></div>
        <div class="hc-bar"><i style="width:100%"></i></div>
      </div>`)
      .join('');
    this.chips = [...this.el('hero-chips').querySelectorAll<HTMLElement>('.hero-chip')].map((chip) => ({
      chip,
      fill: chip.querySelector('.hc-bar i') as HTMLElement,
      name: chip.querySelector('.hc-name span') as HTMLElement,
    }));
    this.lastHudKey = '';
  }

  updateBattle(state: SimState): void {
    const pAlive = aliveCount(state, 'p');
    const aAlive = aliveCount(state, 'a');
    const pTotal = state.units.filter((u) => u.side === 'p').length;
    const aTotal = state.units.filter((u) => u.side === 'a').length;
    const pHp = sideHp(state, 'p');
    const aHp = sideHp(state, 'a');
    const pMax = sideMaxHp(state, 'p') || 1;
    const aMax = sideMaxHp(state, 'a') || 1;
    this.el('core-hp-p').textContent = `${pAlive}/${pTotal}`;
    this.el('core-fill-p').style.width = `${Math.max(0, (pHp / pMax) * 100)}%`;
    this.el('core-hp-a').textContent = `${aAlive}/${aTotal}`;
    this.el('core-fill-a').style.width = `${Math.max(0, (aHp / aMax) * 100)}%`;

    const roundLabel = `回合 ${Math.min(state.round, state.maxRound)}/${state.maxRound}${state.suddenDeath ? ' · 猝死' : ''}`;
    const windVal = (state.wind >= 0 ? '+' : '') + state.wind.toFixed(2);
    const active = activeUnit(state);
    const turnLabel = state.phase === 'over' ? '战斗结束' : state.side === 'p' ? `你的回合 · ${HERO_DEFS.find((h) => h.id === active.heroId)!.name}` : '敌方回合';
    const mapName = getMap(state.mapId).name;
    const key = `${pAlive}|${aAlive}|${pHp}|${aHp}|${roundLabel}|${windVal}|${turnLabel}|${state.side}|${active.id}|${state.phase}|${mapName}`;
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      this.el('round-label').textContent = roundLabel;
      this.el('map-label').textContent = mapName;
      this.el('wind-val').textContent = windVal;
      this.el('wind-arrow').style.transform = `rotate(${state.wind * 42}deg)`;
      const turn = this.el('turn-label');
      turn.textContent = turnLabel;
      turn.style.color = state.side === 'p' ? '#4fc3f7' : '#ff5d73';
      this.el('btn-skip').toggleAttribute('disabled', state.side !== 'p' || state.phase !== 'aim');
      for (const c of this.chips) {
        const u = state.units.find((x) => x.id === c.chip.dataset.unit);
        if (!u) continue;
        c.chip.classList.toggle('active', u.id === state.activeId && state.side === 'p');
        c.chip.classList.toggle('dead', u.state === 'dead');
        c.chip.classList.toggle('selectable', state.side === 'p' && state.phase === 'aim' && u.state === 'alive' && u.id !== state.activeId);
      }
    }
    for (const c of this.chips) {
      const u = state.units.find((x) => x.id === c.chip.dataset.unit);
      if (!u) continue;
      const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp));
      c.fill.style.width = `${ratio * 100}%`;
      c.fill.style.background = ratio > 0.55 ? '#6ee7a0' : ratio > 0.25 ? '#ffcf5c' : '#ff6b6b';
    }
    if (!this.hintHidden && (state.turnIdx > 0 || state.phase !== 'aim')) {
      this.hintHidden = true;
      this.el('battle-hint').style.opacity = '0';
    }
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.refreshMenu();
  }

  getSave(): SaveFile {
    return this.save.data;
  }
}

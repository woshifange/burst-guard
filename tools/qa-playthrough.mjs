/**
 * 真实浏览器 QA（精简快速版，headless swiftshader 友好）：
 *  - 812x375 / 740x360 / 1280x720 三视口：boot → 菜单 → 开战 → 拖拽瞄准 → 发射 → 状态推进 → 截图 → 溢出检查
 *  - 740x360 额外跑完整闭环：结算 → 返回营地 → 刷新恢复
 * 用法：npx vite build && npx vite preview --port 4173 &  → node tools/qa-playthrough.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// headless swiftshader 的 WebGL framebuffer 不稳定，QA 固定走 Canvas 渲染器（真机仍 AUTO/WebGL）
const URL = process.env.QA_URL ?? 'http://127.0.0.1:4173/?renderer=canvas';
const CACHE = path.join(os.homedir(), '.cache/ms-playwright');
const exe = process.env.QA_CHROME ?? path.join(CACHE, 'chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell');
const OUT = path.join(process.cwd(), 'qa', 'shots');
await fs.mkdir(OUT, { recursive: true });

const report = { ok: false, url: URL, exec: exe, at: new Date().toISOString(), viewports: [], overflow: [], errors: [] };
const fail = (msg) => { report.errors.push(msg); };

const VIEWPORTS = [
  { name: '812x375', w: 812, h: 375, full: false },
  { name: '740x360', w: 740, h: 360, full: true },
  { name: '1280x720', w: 1280, h: 720, full: false },
];

const launch = () => chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });

for (const vp of VIEWPORTS) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const entry = { viewport: vp.name, shots: [], errors, states: {} };
  try {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#layer-menu:not([hidden])');
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyScroll: document.body.scrollWidth,
      bodyClient: document.body.clientWidth,
      canvas: (() => { const c = document.querySelector('#game canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    entry.states.overflow = overflow;
    if (overflow.docScroll > overflow.docClient + 1 || overflow.bodyScroll > overflow.bodyClient + 1) { report.overflow.push({ vp: vp.name, overflow }); fail(`${vp.name} 横向溢出`); }
    await page.screenshot({ path: path.join(OUT, `${vp.name}-menu.png`) });
    entry.shots.push(`${vp.name}-menu.png`);

    await page.click('[data-tab="training"]'); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-training.png`) });
    entry.shots.push(`${vp.name}-training.png`);
    await page.click('[data-tab="settings"]'); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-settings.png`) });
    entry.shots.push(`${vp.name}-settings.png`);
    await page.click('[data-tab="heroes"]');

    await page.click('#btn-start');
    await page.waitForSelector('#layer-battle:not([hidden])');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${vp.name}-battle.png`) });
    entry.shots.push(`${vp.name}-battle.png`);
    entry.states.before = await page.evaluate(() => { const s = window.__BG__?.state; return s ? { phase: s.phase, turnIdx: s.turnIdx } : null; });
    if (!entry.states.before) fail(`${vp.name} 战斗状态未暴露`);

    // 点选第 2 个英雄出手
    await page.click('.hero-chip[data-unit="p1"]');
    await page.waitForTimeout(150);
    entry.states.selected = await page.evaluate(() => window.__BG__?.state?.activeId ?? null);
    if (entry.states.selected !== 'p1') fail(`${vp.name} 点选英雄失败（activeId=${entry.states.selected}）`);

    const box = await page.locator('#game canvas').boundingBox();
    // 反向拉弓：起点在中间，向左下方拉 → 炮弹应向右上飞（不遮挡落点）
    const sx = box.x + box.width * 0.5;
    const sy = box.y + box.height * 0.45;
    const pullX = -Math.min(140, box.width * 0.22);
    const pullY = Math.min(90, box.height * 0.28);
    let fired = false;
    for (let attempt = 0; attempt < 2 && !fired; attempt++) {
      await page.mouse.move(sx, sy); await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(sx + (pullX * i) / 10, sy + (pullY * i) / 10);
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-aiming.png`) });
      if (attempt === 0) entry.shots.push(`${vp.name}-aiming.png`);
      await page.mouse.up();
      await page.waitForTimeout(150);
      entry.states.projectile = await page.evaluate(() => {
        const p = window.__BG__?.state?.projectiles?.[0];
        return p ? { vx: Math.round(p.vx), vy: Math.round(p.vy) } : null;
      });
      const st = await page.evaluate(() => {
        const s = window.__BG__?.state;
        return s ? { phase: s.phase, turnIdx: s.turnIdx } : null;
      });
      fired = !!entry.states.projectile || st?.phase === 'flight';
      if (!fired) await page.waitForTimeout(300);
    }
    if (!entry.states.projectile || entry.states.projectile.vx <= 0 || entry.states.projectile.vy >= 0) {
      fail(`${vp.name} 反向瞄准方向错误：${JSON.stringify(entry.states.projectile)}`);
    }
    // 等模拟推进到下一次可操作状态（headless Canvas 帧率低，固定 sleep 不可靠）
    await page.waitForFunction(() => {
      const s = window.__BG__?.state;
      return !!s && (s.phase === 'aim' || s.phase === 'over') && s.turnIdx >= 1;
    }, null, { timeout: 30000 }).catch(() => {});
    if (vp.full) {
      await page.screenshot({ path: path.join(OUT, `${vp.name}-flight.png`) });
      entry.shots.push(`${vp.name}-flight.png`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-after-shot.png`) });
      entry.shots.push(`${vp.name}-after-shot.png`);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-turn2.png`) });
      entry.shots.push(`${vp.name}-turn2.png`);
    }
    entry.states.after = await page.evaluate(() => { const s = window.__BG__?.state; return s ? { phase: s.phase, turnIdx: s.turnIdx, shots: s.stats.shots } : null; });
    if (!entry.states.after || entry.states.after.turnIdx < 1) fail(`${vp.name} 发射未推进回合`);

    if (vp.full) {
      await page.evaluate(() => {
        const s = window.__BG__?.state;
        if (s) for (const u of s.units) if (u.side === 'a') { u.hp = 0; u.state = 'dead'; }
      });
      await page.evaluate(async () => {
        const app = window.__BG__?.app;
        for (let i = 0; i < 24; i++) {
          const st = window.__BG__?.state;
          if (!st || st.phase === 'over') break;
          try { app.battleScene?.skipTurn(); } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, 200));
        }
      });
      await page.waitForSelector('#layer-result:not([hidden])', { timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `${vp.name}-result.png`) });
      entry.shots.push(`${vp.name}-result.png`);
      entry.states.result = await page.evaluate(() => ({
        title: document.querySelector('#result-title')?.textContent ?? '',
        coins: window.__BG__?.save.progression.coins ?? null,
      }));
      await page.click('#btn-back-menu');
      await page.waitForSelector('#layer-menu:not([hidden])');
      await page.click('#btn-start');
      await page.waitForSelector('#layer-battle:not([hidden])');
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#layer-menu:not([hidden])');
      const resume = await page.evaluate(() => { const b = document.querySelector('#btn-resume'); return b ? !b.hasAttribute('hidden') : false; });
      entry.states.resume = resume;
      if (!resume) fail(`${vp.name} 刷新后无继续战斗按钮`);
      else {
        await page.click('#btn-resume');
        await page.waitForSelector('#layer-battle:not([hidden])');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-resume.png`) });
        entry.shots.push(`${vp.name}-resume.png`);
        entry.states.resumed = await page.evaluate(() => { const s = window.__BG__?.state; return s ? { phase: s.phase, turnIdx: s.turnIdx } : null; });
      }
    }
  } catch (e) {
    errors.push('fatal: ' + e.message);
    fail(`${vp.name} fatal: ${e.message}`);
  }
  if (errors.length) { report.errors.push(...errors.map((x) => `${vp.name}: ${x}`)); }
  report.viewports.push(entry);
  await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
}

report.ok = report.errors.length === 0 && report.overflow.length === 0;
await fs.writeFile(path.join(process.cwd(), 'qa', 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, errors: report.errors, viewports: report.viewports.map((v) => ({ vp: v.viewport, shots: v.shots, states: v.states })) }, null, 2));
process.exit(report.ok ? 0 : 1);

/**
 * AI 自战统计：Easy / Hard 各 200 局，检查有限步终局与难度胜率差。
 * 用法：npx vite-node tools/ai-selfplay.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { playAutoBattle } from '../engine/ai';
import { createBattle, type Difficulty, type TeamMember } from '../engine/state';

const TEAM: TeamMember[] = [
  { id: 'demolisher', level: 2 },
  { id: 'scout', level: 2 },
  { id: 'medic', level: 2 },
];
const ENEMY: TeamMember[] = [
  { id: 'raven', level: 2 },
  { id: 'gunner', level: 2 },
  { id: 'demolisher', level: 2 },
];

function runBatch(pDiff: Difficulty, aDiff: Difficulty, games: number, seedBase: number) {
  let pWins = 0;
  let aWins = 0;
  let unfinished = 0;
  let errors = 0;
  let totalRounds = 0;
  let totalShots = 0;
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    try {
      const state = createBattle({
        seed: seedBase + i,
        difficulty: pDiff,
        player: TEAM,
        enemy: ENEMY,

      });
      const { state: end, shots } = playAutoBattle(state, pDiff, aDiff);
      if (end.phase !== 'over' || !end.winner) unfinished++;
      else if (end.winner === 'p') pWins++;
      else aWins++;
      totalRounds += end.round;
      totalShots += shots;
    } catch (e) {
      errors++;
      console.error('game failed', i, (e as Error).message);
    }
  }
  const ms = Date.now() - t0;
  return { pDiff, aDiff, games, pWins, aWins, unfinished, errors, avgRounds: totalRounds / games, avgShots: totalShots / games, ms, pWinRate: pWins / games };
}

const hardVsEasy = runBatch('hard', 'easy', 200, 900000);
const easyVsHard = runBatch('easy', 'hard', 200, 950000);

const report = { hardVsEasy, easyVsHard, at: new Date().toISOString() };
fs.mkdirSync(path.join(process.cwd(), 'qa'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'qa', 'ai-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const problems: string[] = [];
if (hardVsEasy.unfinished > 0 || easyVsHard.unfinished > 0) problems.push('存在未终局对局');
if (hardVsEasy.errors > 0 || easyVsHard.errors > 0) problems.push('存在异常对局');
if (hardVsEasy.pWinRate < 0.6) problems.push(`Hard 胜率 ${hardVsEasy.pWinRate.toFixed(3)} < 0.6`);
if (easyVsHard.pWinRate > 0.4) problems.push(`Easy 胜率 ${easyVsHard.pWinRate.toFixed(3)} > 0.4`);
if (problems.length) {
  console.error('FAILED:', problems.join('; '));
  process.exit(1);
}
console.log('OK: 难度分层成立（Hard ≥ 0.6 vs Easy ≤ 0.4）');

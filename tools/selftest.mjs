// 规则与 AI 自测：无需浏览器，直接跑每个游戏模块
// 用法：npm test 或 node tools/selftest.mjs
import { GAMES } from '../public/js/games/index.js';

const CLEAN = st => {
  const c = { ...st };
  delete c.history;
  delete c.ui;
  return JSON.stringify(c);
};

let failures = 0;

function check(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
}

function playOne(mod, level, limit = 260) {
  const state = mod.create({ mode: 'pvp', level, humanSeat: 0 });
  let steps = 0;
  const t0 = Date.now();
  let slowest = 0;
  while (!state.over && steps < limit) {
    const t = Date.now();
    const move = mod.aiMove(state);
    const cost = Date.now() - t;
    if (cost > slowest) slowest = cost;
    if (!move) break;
    if (!mod.applyMove(state, move)) {
      throw new Error(`非法走法 ${JSON.stringify(move)} @ step ${steps}`);
    }
    steps++;
  }
  return { state, steps, ms: Date.now() - t0, slowest };
}

for (const mod of GAMES) {
  const { meta } = mod;
  console.log(`\n【${meta.name}】${meta.en}`);
  check(typeof meta.id === 'string' && meta.id === meta.id.toLowerCase(), `meta.id 合法 (${meta.id})`);
  check(Array.isArray(meta.rules) && meta.rules.length >= 3, `规则教学条目 ≥ 3 (${meta.rules.length})`);
  check(Array.isArray(meta.tips) && meta.tips.length >= 1, `技巧条目 ≥ 1 (${meta.tips.length})`);
  check(meta.seats === 2, '两人席位');
  check(Array.isArray(meta.seatNames) && meta.seatNames.length === 2, '席位名称');
  check(typeof meta.aspect === 'number' && meta.aspect > 0.2 && meta.aspect < 3, `棋盘比例 ${meta.aspect}`);

  // 人机模式
  const pve = mod.create({ mode: 'pve', level: 2, humanSeat: 0 });
  check(pve.seats[1].ai === true && pve.seats[0].ai === false, '人机座位分配正确');

  // 悔棋往返
  try {
    const state = mod.create({ mode: 'pvp', level: 2 });
    const before = CLEAN(state);
    const move = mod.aiMove(state);
    if (move) {
      mod.applyMove(state, move);
      mod.undo(state);
      check(CLEAN(state) === before, '悔棋可完整回退');
    } else {
      check(false, '悔棋可完整回退（AI 未给出走法）');
    }
  } catch (err) {
    check(false, `悔棋测试异常：${err.message}`);
  }

  // AI 自对弈
  try {
    const r = playOne(mod, 2);
    check(r.state.ply >= 0, `自对弈 ${r.steps} 手（耗时 ${r.ms}ms，最慢单步 ${r.slowest}ms）`);
    check(r.slowest < 4000, '单步思考 < 4s');
    check(r.state.over || r.steps >= 260, r.state.over ? `正常终局：${r.state.result && r.state.result.text}` : '达到测试上限仍未结束（可接受）');
    if (r.state.over) {
      check(!!r.state.result, '终局包含结果文本');
    }
  } catch (err) {
    check(false, `AI 自对弈异常：${err.message}`);
  }
}

console.log(`\n${failures === 0 ? '全部通过' : `失败 ${failures} 项`}`);
process.exit(failures === 0 ? 0 : 1);

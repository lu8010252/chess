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

/** 单人益智（2048 / 华容道 / 数字华容道）：没有电脑对手，测规则、悔棋和可解性 */
function testSolo(mod) {
  const { meta } = mod;
  check(meta.seats === 1 && meta.solo === true, '单人游戏标记');
  check(typeof mod.swipe === 'function' && typeof mod.tap === 'function', '支持点按与滑动');
  for (const v of (meta.variants && meta.variants.length ? meta.variants : [{ id: '' }])) {
    const tag = `${v.label || meta.name}`;
    const state = mod.create({ variant: v.id });
    check(state.seats.length === 1 && state.seats[0].ai === false, `${tag}：单座位且不是电脑`);

    // 悔棋往返：走一步、撤销，棋盘类状态要完全一致
    const keyOf = st => JSON.stringify({ b: st.board, t: st.tiles, p: st.pieces, s: st.score, m: st.moves });
    const before = keyOf(state);
    const mv = mod.aiMove(state);
    if (mv) {
      const ok = mod.applyMove(state, mv);
      check(ok, `${tag}：能走出第一步`);
      mod.undo(state);
      check(keyOf(state) === before, `${tag}：撤销可完整回退`);
    } else {
      check(state.over, `${tag}：已在终局`);
    }

    // 自对弈
    let steps = 0;
    const limit = meta.id === 'klotski' ? 400 : meta.id === 'g2048' ? 6000 : 1500;
    const t0 = Date.now();
    if (meta.id === 'klotski') {
      const path = mod.solve(state);
      check(path !== null, `${tag}：有解`);
      if (path) {
        check(!v.steps || path.length === v.steps, `${tag}：最少 ${path.length} 步${v.steps ? `（标注 ${v.steps}）` : ''}`);
        for (const m of path) {
          const mm = mod.toMove(state, m);
          if (!mm || !mod.applyMove(state, mm)) throw new Error(`${tag} 走法不合法`);
          steps++;
        }
        check(state.over && state.result, `${tag}：按最优解走完后过关`);
      }
    } else {
      while (!state.over && steps < limit) {
        const m = mod.aiMove(state);
        if (!m) break;
        if (!mod.applyMove(state, m)) throw new Error(`${tag} 非法走法 ${JSON.stringify(m)}`);
        steps++;
        if (state.tiles) {
          const sorted = state.tiles.slice().sort((a, b) => a - b);
          if (sorted.some((x, i) => x !== i)) throw new Error(`${tag} 方块丢失`);
        }
      }
      check(steps > 0, `${tag}：自动走了 ${steps} 步（${Date.now() - t0}ms）`);
      if (meta.id === 'g2048') check(state.over, `${tag}：能走到无路可走`);
    }
  }
}

for (const mod of GAMES) {
  const { meta } = mod;
  console.log(`\n【${meta.name}】${meta.en}`);
  if (meta.solo) {
    check(Array.isArray(meta.rules) && meta.rules.length >= 3, `规则教学条目 ≥ 3 (${meta.rules.length})`);
    check(Array.isArray(meta.tips) && meta.tips.length >= 1, `技巧条目 ≥ 1 (${meta.tips.length})`);
    check(typeof meta.aspect === 'number' && meta.aspect > 0.2 && meta.aspect < 3, `棋盘比例 ${meta.aspect}`);
    try {
      testSolo(mod);
    } catch (err) {
      check(false, `测试异常：${err.message}`);
    }
    continue;
  }
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

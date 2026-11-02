// 电脑思考用的 Web Worker：避免长时间搜索阻塞棋盘交互
// 用静态导入（而不是动态 import），这样 esbuild 打包成单个经典 Worker 后旧 WebView 也能运行。
import './polyfills.js';
import { getGame } from '../games/index.js';

self.onmessage = ev => {
  const { id, gameId, state } = ev.data || {};
  if (!id || !gameId || !state) return;
  try {
    const mod = getGame(gameId);
    if (!mod || typeof mod.aiMove !== 'function') throw new Error('未找到游戏：' + gameId);
    const move = mod.aiMove(state);
    self.postMessage({ id, move: move || null });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};

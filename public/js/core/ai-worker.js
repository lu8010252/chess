// 电脑思考用的 Web Worker：避免长时间搜索阻塞棋盘交互
self.onmessage = async ev => {
  const { id, gameId, state } = ev.data || {};
  if (!id || !gameId || !state) return;
  try {
    const mod = await import(`../games/${gameId}.js`);
    const move = mod.aiMove(state);
    self.postMessage({ id, move: move || null });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};

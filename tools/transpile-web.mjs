// 仅 APK 构建用：把 public/js 下的网页脚本降级到老 WebView 能跑的语法（?. / ?? / catch{} 等）
// 老款电视/投影的系统 WebView 常停在 Chrome 6x，遇到新语法会整页白屏。PWA/docker 站点不受影响。
// 用法：node tools/transpile-web.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

let n = 0;
for (const f of walk('public/js')) {
  const out = transformSync(readFileSync(f, 'utf8'), { loader: 'js', format: 'esm', target: 'chrome61' });
  writeFileSync(f, out.code);
  n++;
}
console.log(`已降级 ${n} 个脚本到 chrome61 语法`);

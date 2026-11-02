// APK 启动诊断（经典脚本，ES5）：界面长时间没出来时，把版本/UA/错误直接显示在屏幕上。
// 只在 APK 的 index.html 里引入，网页版不需要。
(function () {
  var errors = [];
  var shown = false;

  function webviewVersion() {
    var m = String(navigator.userAgent || '').match(/Chrome\/(\d+)/);
    return m ? m[1] : '未知';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paint() {
    if (shown) return;
    shown = true;
    var app = document.getElementById('app');
    var grid = document.getElementById('grid');
    var html = '';
    html += '<div style="font-size:22px;font-weight:700;margin-bottom:10px;">棋阁启动失败</div>';
    html += '<div style="color:#ffd479;margin-bottom:16px;">请把这一屏拍照发给开发者，就能定位问题。</div>';
    html += '<div style="margin-bottom:6px;">WebView：Chrome/' + esc(webviewVersion()) + '</div>';
    html += '<div style="margin-bottom:6px;word-break:break-all;">UA：' + esc(navigator.userAgent) + '</div>';
    html += '<div style="margin-bottom:6px;">页面容器：' + (app ? '已创建' : '未创建') + '；首页卡片：' + (grid && grid.children.length ? grid.children.length + ' 个' : '无') + '</div>';
    html += '<div style="margin-top:14px;margin-bottom:6px;color:#8fd6ff;">错误信息</div>';
    html += '<pre style="white-space:pre-wrap;word-break:break-all;background:#111722;padding:12px;border-radius:10px;font:14px/1.6 monospace;margin:0;">' +
      esc(errors.length ? errors.join('\n\n') : '（没有捕获到错误）') + '</pre>';
    var box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;overflow:auto;padding:28px;background:#0a0d12;color:#fff;font:16px/1.7 sans-serif;');
    box.innerHTML = html;
    (document.body || document.documentElement).appendChild(box);
  }

  function add(msg) {
    var s = String(msg || '').trim();
    if (!s) return;
    if (errors.indexOf(s) < 0) {
      if (errors.length >= 6) errors.shift();
      errors.push(s);
    }
  }

  // 捕获脚本运行错误、模块/资源加载失败
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    var msg = (e && (e.message || (t && (t.src || t.href)))) || '';
    if (msg) add(msg);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    add('Promise: ' + ((r && (r.stack || r.message)) || r));
  });

  function check() {
    var grid = document.getElementById('grid');
    if (!grid || !grid.children.length) paint();
  }

  setTimeout(check, 6000);
  setTimeout(check, 3000);
  if (document.readyState === 'complete') setTimeout(check, 2000);
  else window.addEventListener('load', function () { setTimeout(check, 2000); });
})();

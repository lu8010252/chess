// 老设备（安卓 8 投影 / 旧 WebView）运行时兜底：只补齐代码里真实用到的 API。
// 必须用 ES5 写法，保证在被降级打包前也能单独运行；同时兼容主线程和 Web Worker。
(function () {
  var root = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this;
  var hasWindow = typeof window !== 'undefined';

  function isFn(v) {
    return typeof v === 'function';
  }

  // structuredClone（Chrome 98+）：递归拷贝纯对象 / 数组，保留 undefined 属性
  if (!isFn(root.structuredClone)) {
    var clone = function (v) {
      if (v === null || typeof v !== 'object') return v;
      if (Object.prototype.toString.call(v) === '[object Array]') {
        var arr = [];
        for (var i = 0; i < v.length; i++) arr[i] = clone(v[i]);
        return arr;
      }
      if (v instanceof Date) return new Date(v.getTime());
      var out = {};
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = clone(v[k]);
      }
      return out;
    };
    root.structuredClone = function (v) {
      return clone(v);
    };
  }

  // Element.replaceChildren（Chrome 86+）
  if (hasWindow && typeof Element !== 'undefined' && !isFn(Element.prototype.replaceChildren)) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i++) {
        var n = arguments[i];
        if (n === null || n === undefined) continue;
        this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
      }
    };
  }

  // ResizeObserver（Chrome 64+）：没有时用窗口尺寸变化替代，先回调一次保证首次布局
  if (hasWindow && !isFn(window.ResizeObserver)) {
    var RO = function (cb) {
      this._cb = cb;
      this._targets = [];
      var self = this;
      this._fire = function () {
        var entries = [];
        for (var i = 0; i < self._targets.length; i++) {
          entries.push({ target: self._targets[i], contentRect: self._targets[i].getBoundingClientRect() });
        }
        try {
          self._cb(entries, self);
        } catch (e) {}
      };
      window.addEventListener('resize', this._fire);
      window.addEventListener('orientationchange', this._fire);
    };
    RO.prototype.observe = function (el) {
      if (this._targets.indexOf(el) < 0) this._targets.push(el);
      var self = this;
      setTimeout(function () {
        self._fire();
      }, 0);
    };
    RO.prototype.unobserve = function (el) {
      var i = this._targets.indexOf(el);
      if (i >= 0) this._targets.splice(i, 1);
    };
    RO.prototype.disconnect = function () {
      this._targets = [];
      window.removeEventListener('resize', this._fire);
      window.removeEventListener('orientationchange', this._fire);
    };
    window.ResizeObserver = RO;
  }

  // AbortController（Chrome 66+）：旧设备上只保证不报错，超时取消退化为「不取消」
  if (!isFn(root.AbortController)) {
    var AC = function () {
      var listeners = [];
      this.signal = {
        aborted: false,
        addEventListener: function (type, fn) {
          if (type === 'abort' && isFn(fn)) listeners.push(fn);
        },
        removeEventListener: function () {}
      };
      this.abort = function () {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        for (var i = 0; i < listeners.length; i++) {
          try {
            listeners[i].call(null, { type: 'abort' });
          } catch (e) {}
        }
      };
    };
    root.AbortController = AC;
  }
})();

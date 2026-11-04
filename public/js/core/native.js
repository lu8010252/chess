// 取原生插件：APK 的网页里没有打包 @capacitor/core，window.Capacitor 由原生桥注入，
// 老版本桥上没有 registerPlugin，只有 Capacitor.Plugins.<名字>，这里两种都兼容。
export function getPlugin(name) {
  const cap = window.Capacitor;
  if (!cap) return null;
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
  return (cap.Plugins && cap.Plugins[name]) || null;
}

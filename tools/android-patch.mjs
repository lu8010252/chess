// 在 CI 里对 `npx cap add android` 生成的工程做定制：版本号、固定签名、图标、全屏
// 用法：node tools/android-patch.mjs <versionName> <versionCode>
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [versionName, versionCode] = process.argv.slice(2);
if (!versionName || !versionCode) throw new Error('缺少 versionName / versionCode');

const app = 'android/app';
const gradlePath = join(app, 'build.gradle');
let g = readFileSync(gradlePath, 'utf8');

g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
     .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

// 固定签名：每次构建用同一把钥匙，才能直接覆盖安装升级
const signing = `
    signingConfigs {
        qige {
            storeFile file("../../android-signing/qige.keystore")
            storePassword "qige-chess"
            keyAlias "qige"
            keyPassword "qige-chess"
        }
    }
`;
g = g.replace(/android\s*\{/, m => m + signing + `
    lint {
        disable 'HardcodedDebugMode'
    }
`);
g = g.replace(/buildTypes\s*\{\s*release\s*\{/, m => m + '\n            signingConfig signingConfigs.qige');
writeFileSync(gradlePath, g);

// 图标：用仓库里的 PWA 图标生成各分辨率，并去掉自适应图标 xml（避免仍显示 Capacitor 默认图标）
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const py = `
import sys
from PIL import Image
src = Image.open('public/icons/icon-512.png').convert('RGBA')
for d, px in ${JSON.stringify(sizes)}.items():
    im = src.resize((px, px), Image.LANCZOS)
    for name in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'):
        im.save(f'android/app/src/main/res/mipmap-{d}/{name}')
`;
execFileSync('python3', ['-c', py], { stdio: 'inherit' });
const anydpi = join(app, 'src/main/res/mipmap-anydpi-v26');
if (existsSync(anydpi)) rmSync(anydpi, { recursive: true, force: true });

// 沉浸全屏（隐藏状态栏），平板上棋盘更大
const stylesPath = join(app, 'src/main/res/values/styles.xml');
if (existsSync(stylesPath)) {
  let st = readFileSync(stylesPath, 'utf8');
  st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowFullscreen">true</item>');
  writeFileSync(stylesPath, st);
}

// ---------- 电视 / 投影适配 + 在线更新所需的清单与插件 ----------
const manifestPath = join(app, 'src/main/AndroidManifest.xml');
let mf = readFileSync(manifestPath, 'utf8');

// 权限与硬件声明：无触屏设备（电视、投影）也能安装；允许安装下载的 APK；允许 http 更新服务器
mf = mf.replace(
  /(<uses-permission android:name="android\.permission\.INTERNET"\s*\/>)/,
  `$1
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    <uses-feature android:name="android.software.leanback" android:required="false" />`
);
mf = mf.replace('<application', '<application\n        android:name=".QigeApp"\n        android:debuggable="true"\n        android:usesCleartextTraffic="true"\n        android:banner="@drawable/tv_banner"');
// 同时出现在手机桌面和电视主屏
mf = mf.replace(
  /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
  '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />'
);
writeFileSync(manifestPath, mf);

// 电视主屏横幅 320x180
const bannerPy = `
from PIL import Image, ImageDraw
W, H = 320, 180
bg = Image.new('RGBA', (W, H))
d = ImageDraw.Draw(bg)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(28 - 14 * t), int(37 - 18 * t), int(52 - 24 * t), 255))
icon = Image.open('public/icons/icon-512.png').convert('RGBA').resize((124, 124), Image.LANCZOS)
bg.alpha_composite(icon, ((W - 124) // 2, (H - 124) // 2))
bg.convert('RGB').save('android/app/src/main/res/drawable/tv_banner.png')
`;
execFileSync('python3', ['-c', bannerPy], { stdio: 'inherit' });

// 原生插件：下载 APK + 唤起系统安装器
const pkgDir = join(app, 'src/main/java/com/lu8010252/qige');
const plugin = `package com.lu8010252.qige;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "update.apk");
    }

    // 手动跟随重定向（GitHub 下载会 302 到另一个域名，也可能 http 跳 https）
    private HttpURLConnection open(String url) throws IOException {
        String cur = url;
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "qige-chess");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IOException("重定向缺少地址");
                cur = new URL(new URL(cur), loc).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("HTTP " + code);
            }
            return c;
        }
        throw new IOException("重定向次数过多");
    }

    // 不走 api.github.com（国内常被限流/拦截）：直接访问 github.com/<repo>/releases/latest，从跳转地址里取版本号
    @PluginMethod
    public void latest(final PluginCall call) {
        final String repo = call.getString("repo");
        if (repo == null || repo.isEmpty()) {
            call.reject("缺少仓库名");
            return;
        }
        new Thread(() -> {
            try {
                String cur = "https://github.com/" + repo + "/releases/latest";
                String tag = null;
                for (int i = 0; i < 6 && tag == null; i++) {
                    HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("User-Agent", "qige-chess");
                    int code = c.getResponseCode();
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (code >= 300 && code < 400 && loc != null) {
                        cur = new URL(new URL(cur), loc).toString();
                        int k = cur.indexOf("/releases/tag/");
                        if (k >= 0) tag = cur.substring(k + 14);
                    } else {
                        throw new IOException("HTTP " + code);
                    }
                }
                if (tag == null) throw new IOException("没找到最新版本");
                JSObject o = new JSObject();
                o.put("tag", tag);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("访问 GitHub 失败：" + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = open(url);
                long total = conn.getContentLengthLong();
                File out = apkFile();
                long got = 0;
                long last = 0;
                try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fos.write(buf, 0, n);
                        got += n;
                        long now = System.currentTimeMillis();
                        if (now - last > 250) {
                            last = now;
                            JSObject o = new JSObject();
                            o.put("received", got);
                            o.put("total", total);
                            notifyListeners("progress", o);
                        }
                    }
                }
                if (total > 0 && got != total) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    throw new IOException("下载不完整，请重试");
                }
                JSObject o = new JSObject();
                o.put("received", got);
                o.put("total", total > 0 ? total : got);
                notifyListeners("progress", o);
                call.resolve();
            } catch (Exception e) {
                call.reject("下载失败：" + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve();
        if (getActivity() != null) getActivity().finishAffinity();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) {
            call.reject("没有已下载的安装包");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // Android 8+ 需要先给本应用开「安装未知应用」，跳到系统设置页
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("need_permission");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
`;
writeFileSync(join(pkgDir, 'ApkUpdaterPlugin.java'), plugin);

// ---------- 启动取证：把每个启动阶段写进 /sdcard/Android/data/<包名>/files/boot.log ----------
const bootLog = `package com.lu8010252.qige;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

final class BootLog {
    private static File file;
    private static final long T0 = System.currentTimeMillis();

    private BootLog() {
    }

    static synchronized void init(Context ctx) {
        if (file != null) return;
        try {
            File dir = ctx.getExternalFilesDir(null);
            if (dir == null) dir = ctx.getFilesDir();
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            file = new File(dir, "boot.log");
        } catch (Throwable ignored) {
            file = null;
        }
    }

    static synchronized void write(String msg) {
        writeRaw("[" + (System.currentTimeMillis() - T0) + "ms] " + msg);
    }

    static synchronized void writeRaw(String line) {
        try {
            Log.i("QIGE", line);
        } catch (Throwable ignored) {
        }
        if (file == null) return;
        FileOutputStream fo = null;
        try {
            fo = new FileOutputStream(file, true);
            fo.write((line + "\\n").getBytes("UTF-8"));
            fo.flush();
        } catch (Throwable ignored) {
        } finally {
            if (fo != null) {
                try {
                    fo.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    static String trace(Throwable e) {
        try {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            return sw.toString();
        } catch (Throwable t) {
            return String.valueOf(e);
        }
    }
}
`;
writeFileSync(join(pkgDir, 'BootLog.java'), bootLog);

const appClass = `package com.lu8010252.qige;

import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.os.Debug;
import android.webkit.WebSettings;

public class QigeApp extends Application {
    @Override
    public void onCreate() {
        BootLog.init(this);
        BootLog.write("Application.onCreate start");
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            BootLog.write("memoryClass=" + am.getMemoryClass() + "K large=" + am.getLargeMemoryClass()
                    + "K lowRam=" + am.isLowRamDevice() + " maxHeap=" + Runtime.getRuntime().maxMemory() / 1024 + "K");
        } catch (Throwable e) {
            BootLog.write("memory info failed: " + e);
        }

        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            BootLog.writeRaw("FATAL uncaught in thread " + t.getName() + "\\n" + BootLog.trace(e));
            if (prev != null) prev.uncaughtException(t, e);
        });

        new Thread(() -> {
            try {
                BootLog.write("ua=" + WebSettings.getDefaultUserAgent(QigeApp.this));
            } catch (Throwable e) {
                BootLog.write("getDefaultUserAgent failed: " + e);
            }
        }, "qige-ua").start();

        Thread w = new Thread(() -> {
            for (int i = 1; i <= 120; i++) {
                try {
                    Thread.sleep(i <= 12 ? 250 : 1000);
                } catch (InterruptedException e) {
                    return;
                }
                Runtime r = Runtime.getRuntime();
                BootLog.writeRaw("heartbeat #" + i + " native=" + Debug.getNativeHeapAllocatedSize() / 1024
                        + "K java=" + (r.totalMemory() - r.freeMemory()) / 1024 + "K threads=" + Thread.activeCount());
            }
        }, "qige-watchdog");
        w.setDaemon(true);
        w.start();

        super.onCreate();
        BootLog.write("Application.onCreate done");
    }
}
`;
writeFileSync(join(pkgDir, 'QigeApp.java'), appClass);

const mainActivity = `package com.lu8010252.qige;

import android.app.AlertDialog;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String CRASH_FILE = "crash.txt";

    private static String trace(Throwable e) {
        StringWriter sw = new StringWriter();
        e.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }

    private void showText(String title, String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        tv.setPadding(32, 16, 32, 16);
        tv.setTextIsSelectable(true);
        ScrollView sv = new ScrollView(this);
        sv.addView(tv);
        new AlertDialog.Builder(this).setTitle(title).setView(sv).setPositiveButton("知道了", null).show();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        BootLog.init(this);
        BootLog.write("MainActivity.onCreate start");
        // 闪退诊断：把未捕获异常写到文件，下次打开时弹窗显示原因
        final File crashFile = new File(getFilesDir(), CRASH_FILE);
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            BootLog.writeRaw("FATAL uncaught in thread " + t.getName() + "\\n" + trace(e));
            try (FileOutputStream fo = new FileOutputStream(crashFile)) {
                fo.write(trace(e).getBytes(StandardCharsets.UTF_8));
            } catch (Throwable ignored) {
            }
            if (prev != null) prev.uncaughtException(t, e);
        });
        String lastCrash = null;
        try {
            if (crashFile.exists()) {
                lastCrash = new String(java.nio.file.Files.readAllBytes(crashFile.toPath()), StandardCharsets.UTF_8);
                //noinspection ResultOfMethodCallIgnored
                crashFile.delete();
            }
        } catch (Throwable ignored) {
        }

        try {
            registerPlugin(ApkUpdaterPlugin.class);
            BootLog.write("registerPlugin done");
            super.onCreate(savedInstanceState);
            BootLog.write("super.onCreate done bridge=" + (getBridge() != null));
        } catch (Throwable e) {
            BootLog.writeRaw("FATAL onCreate\\n" + trace(e));
            // 启动阶段出错（例如系统 WebView 缺失/太旧）：不闪退，直接把原因显示在屏幕上
            if (savedInstanceState == null) savedInstanceState = new Bundle();
            TextView tv = new TextView(this);
            tv.setText("棋阁启动失败，请把下面的内容发给开发者：\\n\\n" + trace(e));
            tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            tv.setPadding(32, 32, 32, 32);
            ScrollView sv = new ScrollView(this);
            sv.addView(tv);
            setContentView(sv);
            return;
        }
        if (lastCrash != null) {
            BootLog.writeRaw("lastCrash\\n" + lastCrash);
            showText("上次闪退原因", lastCrash);
        }

        // 自己接管返回键（手机返回键/手势、遥控器返回键）：交给网页处理，网页说「已在首页」才退出
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) {
                    finishAffinity();
                    return;
                }
                wv.evaluateJavascript("(function(){try{return window.__qigeBack?window.__qigeBack():false}catch(e){return false}})()", value -> {
                    if (!"true".equals(value)) finishAffinity();
                });
            }
        });

        probe(400);
        probe(900);
        probe(1600);
        probe(2600);
    }

    // 定时看看网页到底有没有跑起来
    private void probe(final long delay) {
        try {
            final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv == null) {
                BootLog.write("probe@" + delay + " bridge=null");
                return;
            }
            wv.postDelayed(() -> {
                BootLog.write("probe@" + delay + " fired");
                wv.evaluateJavascript("(function(){var g=document.getElementById('grid');return JSON.stringify({ready:document.readyState,grid:g?g.children.length:-1,canvas:document.querySelectorAll('canvas').length,body:document.body?document.body.getElementsByTagName('*').length:-1});})()", value -> BootLog.write("probe@" + delay + " js=" + value));
            }, delay);
        } catch (Throwable e) {
            BootLog.write("probe@" + delay + " failed: " + e);
        }
    }

    @Override
    public void onStart() {
        BootLog.write("onStart");
        super.onStart();
    }

    @Override
    public void onResume() {
        BootLog.write("onResume");
        super.onResume();
    }

    @Override
    public void onPause() {
        BootLog.write("onPause");
        super.onPause();
    }

    @Override
    public void onStop() {
        BootLog.write("onStop");
        super.onStop();
    }

    @Override
    public void onDestroy() {
        BootLog.write("onDestroy");
        super.onDestroy();
    }

    @Override
    public void onLowMemory() {
        BootLog.write("onLowMemory");
        super.onLowMemory();
    }

    @Override
    public void onTrimMemory(int level) {
        BootLog.write("onTrimMemory " + level);
        super.onTrimMemory(level);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        BootLog.write("onKeyDown " + keyCode);
        return super.onKeyDown(keyCode, event);
    }
}
`;
writeFileSync(join(pkgDir, 'MainActivity.java'), mainActivity);

// 老设备（安卓 8 投影等）兼容：APK 不加载 ES Module，改加载降级打包好的单个经典脚本，
// 并先插入启动诊断脚本（界面起不来时把 WebView 版本和错误显示在屏幕上）。
const assetsIndex = join(app, 'src/main/assets/public/index.html');
const bundlePath = join(app, 'src/main/assets/public/js/app-bundle.js');
if (!existsSync(bundlePath)) throw new Error('缺少 assets/public/js/app-bundle.js：请先运行 esbuild 打包再 cap sync');
let idx = readFileSync(assetsIndex, 'utf8');
const classicTags = `
    <script>window.__QIGE_CLASSIC__ = true;</script>
    <script src="/js/core/guard.js"></script>
    <script src="/js/app-bundle.js"></script>`;
const moduleTag = /<script\s+type="module"\s+src="\/js\/core\/app\.js"><\/script>/;
if (moduleTag.test(idx)) idx = idx.replace(moduleTag, classicTags);
else idx = idx.replace('</body>', `${classicTags}\n</body>`);
writeFileSync(assetsIndex, idx);

console.log(`已定制 Android 工程：v${versionName} (${versionCode})，res: ${readdirSync(join(app, 'src/main/res')).join(', ')}`);

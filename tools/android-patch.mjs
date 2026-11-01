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
g = g.replace(/android\s*\{/, m => m + signing);
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
mf = mf.replace('<application', '<application\n        android:usesCleartextTraffic="true"\n        android:banner="@drawable/tv_banner"');
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

const mainActivity = `package com.lu8010252.qige;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
writeFileSync(join(pkgDir, 'MainActivity.java'), mainActivity);

console.log(`已定制 Android 工程：v${versionName} (${versionCode})，res: ${readdirSync(join(app, 'src/main/res')).join(', ')}`);

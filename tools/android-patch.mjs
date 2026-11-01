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
console.log(`已定制 Android 工程：v${versionName} (${versionCode})，res: ${readdirSync(join(app, 'src/main/res')).join(', ')}`);

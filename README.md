# 棋阁 · 七种棋类

一个为平板优化的棋类网站：五子棋、象棋、军棋、国际象棋、围棋、跳棋、飞行棋。
支持**同一设备双人对下**与**单人对电脑**，内置中文玩法教学，可离线使用，也可以安装到平板上当 App。

纯前端（原生 ES Module + Canvas 2D），零依赖、无构建步骤；Node 单文件静态服务 + Docker 部署。

## 特性

- **7 种棋**，每种都有完整规则与三档 AI（简单 / 普通 / 困难）
  - 五子棋（15×15，无禁手；另有「连五吃子」玩法：每方 24 子，连五吃对方一子）
  - 象棋（九路十行，含马腿/象眼/将帅照面/将死判负）
  - 军棋（二人陆战棋，暗棋布阵、铁路滑行、工兵拐弯、炸弹同归于尽、夺旗获胜；另有「明棋」玩法）
  - 国际象棋（王车易位、吃过路兵、升变、逼和、50 回合、三次重复、子力不足和棋）
  - 围棋（9 路，数子法计分、贴目 6.5、提子、禁自杀、打劫限制）
  - 跳棋（六角星 121 孔，连跳可换向，先进对家营地者胜）
  - 飞行棋（掷骰起飞、同色跳格/机场飞行、撞子回营、精确到点）
- **大棋盘优先**：棋盘自动占据屏幕最大可用空间，支持一键全屏 / 沉浸模式
- **玩法教学**：每种棋都有分步规则讲解 + 实战小贴士，对局中随时可查
- **悔棋、重开、本地存档**：中途退出再打开可继续上一局
- **电脑不卡界面**：AI 在 Web Worker 内计算
- **离线可用 / 可安装**：PWA（manifest + Service Worker），支持 Android、iPad、桌面浏览器安装

## 本地运行

需要 Node 18+：

```bash
npm start
# 打开 http://localhost:8030
```

修改前端文件后刷新即可，无需构建。

自测（规则 + AI 自对弈）：

```bash
npm test
```

## Docker 部署

```bash
docker compose up -d --build
# 打开 http://localhost:8030
```

或不用 compose：

```bash
docker build -t qige-chess .
docker run -d -p 8030:8030 --name qige-chess --restart unless-stopped qige-chess
```

端口可用环境变量 `PORT` 调整（compose 中改 `ports` 与 `PORT` 保持一致即可）。

## 电视 / 投影 / 遥控器

APK 已适配电视和投影（出现在电视主屏，无触屏也能装）：

- **方向键**：移动焦点；进入棋盘后是一个发光光标，在棋盘点位之间移动，走到边缘会自动跳到旁边的按钮
- **确定键**：点击按钮 / 在光标处选子、落子
- **返回键**：关弹窗 → 退回首页 → 退出应用
- 键盘也一样可用（方向键 / Enter / Esc）；触屏、鼠标操作不受影响

## 离线 APK 与在线更新

每次推送到 `main`，GitHub Actions 会自动编译签名 APK 并发布到 Releases，版本号 = `主.次`（`package.json`）+ 构建号，首页底部可看到。同一签名，直接覆盖安装升级。

应用内「检查更新」（启动 4 秒后会在首页静默检查一次，对局中不会弹窗打扰）：

1. 先试「更新服务器」——就是你用 docker 部署的这个站点，本服务器会代你去 GitHub 取最新 APK（`/api/update`、`/api/update/apk`），国内访问更稳
2. 连不上再直连 GitHub Releases

在应用里「检查更新 → 更新服务器」填入你的站点地址（如 `https://chess.example.com`）即可；也可以在仓库的 Settings → Variables 里新建 `UPDATE_SERVER`，之后编译出的 APK 默认就带上。服务器可用环境变量 `GITHUB_REPO` 指向别的仓库，`GITHUB_TOKEN` 提高 GitHub 接口额度。

首次更新时安卓会要求允许本应用「安装未知应用」，允许后回来再点一次「立即更新」。

## 安装成 App（推荐在平板上用）

PWA 需要 HTTPS 或 localhost 才能安装。几种常见做法：

1. **本机局域网访问**：用 Nginx / Caddy 反向代理到 8030 并开启 HTTPS，平板用浏览器打开后点「安装到桌面」。
2. **Android 平板**：Chrome 菜单 →「安装应用」/「添加到主屏幕」；会以独立窗口、全屏运行。
3. **iPad / iPhone**：Safari → 分享 →「添加到主屏幕」；以独立全屏窗口运行。
4. **桌面 Chrome / Edge**：地址栏右侧的安装图标，或首页的「安装到桌面」按钮。

如果还想进应用商店，可在此基础上用 [Capacitor](https://capacitorjs.com/) 或 Android TWA 打包：
把 `public/` 作为 `www` 目录，`npx cap add android` 即可复用同一套前端代码。

## 目录结构

```
chess/
├─ server/index.js        零依赖静态服务（SPA 回退、ETag、gzip、更新代理）
├─ public/
│  ├─ index.html
│  ├─ manifest.webmanifest / sw.js / icons/
│  ├─ css/app.css
│  └─ js/
│     ├─ core/            app.js（界面）· session.js（对局/AI/存档）· ai-worker.js
│     │                    nav.js（遥控器导航）· updater.js（在线更新）· version.js
│     └─ games/           _util.js · _draw.js · 七种棋的实现 + index.js
├─ tools/                 selftest.mjs（自测）· make-icons.mjs（生成 PWA 图标）
├─ Dockerfile / docker-compose.yml
└─ package.json
```

## 游戏模块接口

每个游戏模块导出统一接口，便于新增棋种：

```js
meta               // id/name/aspect/seatNames/rules/tips...
create(opts)       // 新对局（opts.variant 选择玩法）
tap(state, {x,y,w,h})   // 点击棋盘（返回 {ok, moved, msg}）
applyMove(state, move)  // 执行一步
aiMove(state)      // 同步 AI（在 Worker 中运行）
undo(state)        // 悔棋
draw(ctx, state, {w,h}) // 绘制
actions(state) / action(state, id)  // 额外按钮（掷骰子、停一手、重新布阵…）
cursorPoints(state, {w,h}) // 遥控器光标可停靠的点位 [{x,y,r}]
seatInfo(state, i)      // 座位条补充信息（如连五吃子的手数/盘面子数）
moveAnim(state, {w,h})  // 走子动画（slide / drop，可选）
```

## 已知限制

- 围棋为 9 路棋盘（休闲快棋，AI 为启发式搜索而非职业级引擎）
- 军棋采用二人陆战棋规则，暗棋信息对 AI 同样隐藏（AI 不作弊）
- 飞行棋为两人制（对角两家），使用常见民间规则（6 起飞、同色跳 4、机场飞 12、精确到点）
- 象棋 / 国际象棋的长将、长捉等专业赛规做了简化处理

## 许可

MIT

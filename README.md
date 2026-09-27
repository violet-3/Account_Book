# 旺财 · 记工、工资与攒钱

> 通过记录、规划和留痕，让打工生活更有底气。考勤、工资估算、攒钱目标与工作材料都在本机管理。
> A local-first work and money companion for attendance, pay estimates, savings goals, and work records.

[![CI](https://github.com/violet-3/Account_Book/actions/workflows/ci.yml/badge.svg)](https://github.com/violet-3/Account_Book/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v1.3.0-4f46e5)](../../releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-blueviolet)](#)
![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)

<p align="center">
  <img src="docs/demo.gif" alt="旺财手机界面演示：今日、日历、工资、攒钱与工作证据档案，均为演示数据" width="320">
  <br>
  <sub>新版手机界面演示 · 使用虚构数据</sub>
</p>

## Quick Start 快速开始

1. **Run / 运行**:`node server.js` → open <http://localhost:5173> (网页运行无需安装依赖 / no app dependencies required)
2. **Deploy / 部署**:把文件夹丢到任意静态托管(GitHub Pages / Vercel / Netlify),或 `docker run -p 5173:5173` 本地容器
3. **Install / 安装**:手机浏览器打开 → 「添加到主屏幕」离线使用；也可用 `android/` 与 `ios/` 原生工程构建客户端 / Install as a PWA or build the native client

---

## 一键部署 · One-click Deploy

把仓库部署成**你自己的**离线记账本:数据 100% 存在你使用的那台设备浏览器里,不同设备互不相通。

<p>
  <a href="https://app.netlify.com/start/deploy?repository=https://github.com/violet-3/Account_Book">
    <img src="https://www.netlify.com/img/deploy/button.svg" alt="Deploy to Netlify" height="32">
  </a>
  &nbsp;
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fviolet-3%2FAccount_Book&project-name=dagong-ledger">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" height="32">
  </a>
</p>

- **Netlify / Vercel**:点按钮 → 授权 → 自动建站 → 得到专属网址;手机浏览器打开 → 「添加到主屏幕」→ 离线记账 App ✅(仓库每次更新,站点自动同步)
- **GitHub Pages**:本仓库已内置 Pages 工作流,推送 main 自动发布到 `https://violet-3.github.io/Account_Book/`(首次需在 Settings → Pages 把 Source 设为 **GitHub Actions**)
- **本地运行**:`git clone` 后 `node server.js`,或直接双击 `index.html`(离线,无 PWA 安装能力)

---

## 功能特性

- **今日打卡**:出勤状态(出勤 / 休息 / 带薪假 / 无薪假 / 病假 / 旷工)+ 加班时长一键记录;显示在岗状态与下班倒计时;自动识别工作日、周末、法定节假日、调休日,自动匹配 1.5× / 2× / 3× 加班倍率
- **排班制度**:双休 / 单休 / **大小周**(指定本周类型后按周自动交替推算),上下班时间可配,同步影响应出勤、缺勤判定与加班倍率
- **专业排班**:医护、工厂、客服等可配置“连续上班 N 天 + 连续休息 M 天”轮班周期;销售、外勤等可使用按实际记录的弹性排班
- **出勤日历**:月视图状态着色 + 加班角标,点任意日期弹层编辑;内置 2025–2026 节假日安排，其他年份由用户主动联网获取并缓存，离线时继续使用周末规则
- **工资估算**:加班费(倍率可改)、缺勤扣款、五险一金(内置 16 城个人比例与基数上下限,可改)、个税**累计预扣预缴法**(5000 起征,支持专项附加扣除),工资条式明细 + 全年实发走势图
- **五险一金解耦**:养老、医疗、失业、公积金可分别启用和调整比例,还可添加任意自定义险种
- **加班补偿**:加班费 / **调休折算**(累计可休时长) / 仅记录,三种模式
- **攒钱规划**:储蓄目标(旅行、恋爱基金、应急备用金、买房首付等 12 个模板)+ 存款流水 + 本月进度 + 年度储蓄预估(计划口径与实际速度双口径),预计达成年月一目了然
- **工作证据档案**:打卡修改留痕，原始材料加密存本机；可导出包含原件、校验清单、打卡与工资估算的 ZIP。校验不等于第三方存证或工作事实证明。
- **本机加密与备份**:首次使用设置解锁口令，账本和证据原件加密后保存在本机；`.wangcai` 加密备份包含附件。恢复密钥由用户自行保管，CSV/XLSX 是不加密的表格文件
- **三端适配**:手机 / 平板 / 桌面响应式布局,深色模式跟随系统
- **表格导入导出**:支持多工作表 `.xlsx` 与 UTF-8 CSV 导出，也可导入表格恢复考勤和储蓄记录；表格文件为明文，不含证据原件

## 性能 Performance

计算引擎为纯函数,最重的「全年 12 个月工资计算」在 10 年数据量(3650 条考勤)下单次耗时 **< 2.2ms**。

![benchmark](docs/benchmark.png)

复现:`npm run bench`(脚本:[test/bench.mjs](test/bench.mjs),结果因机器而异)。

## 开发 Development

```bash
npm install        # 仅安装 eslint(devDependency)
npm test           # 计算、节假日、储蓄、加密与证据档案测试
npm run lint       # ESLint
npm run bench      # 基准测试
npm run mobile:sync # 同步 Capacitor 原生工程
npm run mobile:android # 打开 Android Studio
npm run mobile:ios # 打开 Xcode(macOS)
```

浏览器端可访问 `/test/evidence-browser.html` 运行合成数据冒烟测试；它验证 Web Crypto、IndexedDB、加密备份恢复和证据 ZIP，不读取现有账本。

## 手机客户端封装

项目使用 Capacitor 复用同一套 Web 业务代码，原生工程为 `android/` 和 `ios/`。修改根目录的网页文件后，先将 `index.html`、`css/`、`js/`、`vendor/`、`icons/` 同步到 `www/`，再执行 `npm run mobile:sync`，即可用 Android Studio 或 Xcode 打开客户端工程。客户端默认离线运行，主账本使用口令派生密钥加密保存在本机；证据原件在本机 IndexedDB 加密存放。首次设置会生成用户自行保管的恢复密钥，忘记口令可凭它重设。Android Keystore、iOS Keychain 快捷解锁尚未接入。Android 可构建 APK，iOS 构建需要 macOS、Xcode 和 Apple Developer 签名。证据 ZIP 为明文；本地哈希链不是独立时间戳或司法存证。

本次需求、待验收事项和历史改动记录见 [docs/CHANGE_REQUESTS.md](docs/CHANGE_REQUESTS.md)；理财功能与未来 AI 助手的演进建议见 [docs/FINANCE_ROADMAP.md](docs/FINANCE_ROADMAP.md)；本机加密设计、迁移与风险边界见 [docs/SECURITY.md](docs/SECURITY.md)。

<details>
<summary>目录结构 Structure</summary>

```
index.html          页面与 Vue 模板
css/style.css       样式(移动优先,三档断点,深色模式)
js/data.js          城市五险一金参数 + 内置节假日(2025–2026)
js/holiday.js       节假日内置表、本地缓存与用户主动更新
js/calc.js          计算引擎(加班费/社保/个税,纯函数)
js/db.js            加密账本存储、旧数据迁移与表格导入导出
js/secure.js        本机账本与附件加密、恢复密钥
js/evidence.js      工作证据时间线、附件备份与 ZIP 导出
js/app.js           Vue 3 应用逻辑
server.js           零依赖静态服务器(支持 PORT 环境变量)
sw.js               PWA 离线缓存(network-first)
test/               单元测试与基准测试
Dockerfile          容器化部署
```

</details>

<details>
<summary>计算口径说明 Calculation rules</summary>

- 月计薪天数 21.75 天;日薪 = 月薪 ÷ 21.75,时薪 = 日薪 ÷ 8
- 加班费:工作日 ×1.5、周末 ×2、法定节假日 ×3(可自定义,或改为"仅记录不计费")
- 缺勤扣款:无薪假 / 旷工按 1 × 日薪
- 五险一金:缴费基数 = min(max(基数, 下限), 上限);城市参数为参考值(每年约 7 月调整),请按当地当年公布口径在设置中校正
- 个税:按年度税率表累计预扣,累计应纳税所得额 = 年初至本月应发累计 − 五险一金 − 5000/月 − 专项附加扣除
- 未记录考勤的月份按全勤估算;估算仅供参考,不构成法律依据

</details>

## 部署方式 Deploy

### 访客安装到手机

推荐先点击上方 Netlify 或 Vercel 的一键部署按钮，为自己创建一个独立网址，再用手机打开该网址：

- Android Chrome：点击页面的“立即安装”，或浏览器菜单中的“安装应用”。
- iPhone / iPad：使用 Safari 打开网址，点击“分享”→“添加到主屏幕”。iOS 不支持在普通网页中弹出 Android 式安装按钮。
- 安装后可以离线记账。数据默认只保存在当前设备、当前浏览器的本地存储中，不会自动同步到其他设备。
- 更换设备、清理浏览器数据或卸载应用前，请在“设置 → 数据”导出 JSON 备份；“导出 Excel 表格”生成的 CSV 文件可以直接用 Excel 打开。

完整 PWA 安装需要 HTTPS（GitHub Pages、Netlify、Vercel 默认支持）。直接双击 `index.html` 可以使用基础记账功能，但浏览器通常不会提供 PWA 安装能力。

| 方式 | 命令 | 说明 |
|---|---|---|
| Node | `node server.js` | 零依赖,支持 `PORT` 环境变量 |
| Docker | `docker build -t dagong-ledger . && docker run -p 5173:5173 dagong-ledger` | 一键容器化 |
| 静态托管 | 上传整个文件夹 | GitHub Pages / Vercel / Netlify,支持 PWA 安装 |
| 离线直开 | 双击 `index.html` | 数据照常保存,无 PWA 安装能力 |

## Roadmap

- [ ] 年度考勤报告(加班 Top、平均下班时间)
- [ ] 多份工资设置切换(兼职场景)
- [ ] iOS 添加到主屏幕的启动屏适配

## License

[MIT](LICENSE) · 数据与费率估算仅供参考,不构成任何法律依据。

> 把 `YOUR_USERNAME` 替换为你的 GitHub 用户名即可激活徽章与 Release 链接。

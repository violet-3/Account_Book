# 打工人账本 · Dagong Ledger

> 考勤 + 加班 + 工资估算,数据存在自己设备里的记账本。
> Local-first attendance & overtime tracking with payroll estimation — works on phone, tablet and desktop.

[![CI](https://github.com/violet-3/Account_Book/actions/workflows/ci.yml/badge.svg)](https://github.com/violet-3/Account_Book/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v1.2.0-4f46e5)](../../releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-blueviolet)](#)
![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)

<p align="center">
  <img src="docs/demo.gif" alt="打工人账本演示 demo" width="320">
</p>

## Quick Start 快速开始

1. **Run / 运行**:`node server.js` → open <http://localhost:5173> (零依赖,无需 npm install / zero-dependency)
2. **Deploy / 部署**:把文件夹丢到任意静态托管(GitHub Pages / Vercel / Netlify),或 `docker run -p 5173:5173` 本地容器
3. **Install / 安装**:手机浏览器打开 → 「添加到主屏幕」,像原生 App 一样离线使用 / Add to Home Screen for offline use

---

## 功能特性

- **今日打卡**:出勤状态(出勤 / 休息 / 带薪假 / 无薪假 / 病假 / 旷工)+ 加班时长一键记录;显示在岗状态与下班倒计时;自动识别工作日、周末、法定节假日、调休日,自动匹配 1.5× / 2× / 3× 加班倍率
- **排班制度**:双休 / 单休 / **大小周**(指定本周类型后按周自动交替推算),上下班时间可配,同步影响应出勤、缺勤判定与加班倍率
- **出勤日历**:月视图状态着色 + 加班角标,点任意日期弹层编辑;节假日数据**按年自动更新**(内置 2025–2026,其他年份自动在线获取并缓存,离线优雅降级)
- **工资估算**:加班费(倍率可改)、缺勤扣款、五险一金(内置 16 城个人比例与基数上下限,可改)、个税**累计预扣预缴法**(5000 起征,支持专项附加扣除),工资条式明细 + 全年实发走势图
- **加班补偿**:加班费 / **调休折算**(累计可休时长) / 仅记录,三种模式
- **数据自主**:100% 存本地浏览器,不注册不上传;JSON 导出 / 导入备份
- **三端适配**:手机 / 平板 / 桌面响应式布局,深色模式跟随系统

## 性能 Performance

计算引擎为纯函数,最重的「全年 12 个月工资计算」在 10 年数据量(3650 条考勤)下单次耗时 **< 2.2ms**。

![benchmark](docs/benchmark.png)

复现:`npm run bench`(脚本:[test/bench.mjs](test/bench.mjs),结果因机器而异)。

## 开发 Development

```bash
npm install        # 仅安装 eslint(devDependency)
npm test           # 41 项单元测试(计算引擎 + 节假日解析)
npm run lint       # ESLint
npm run bench      # 基准测试
```

<details>
<summary>目录结构 Structure</summary>

```
index.html          页面与 Vue 模板
css/style.css       样式(移动优先,三档断点,深色模式)
js/data.js          城市五险一金参数 + 内置节假日(2025–2026)
js/holiday.js       节假日按年自动更新(holiday-cn + jsDelivr + 本地缓存)
js/calc.js          计算引擎(加班费/社保/个税,纯函数)
js/db.js            localStorage 持久层 + JSON 导入导出
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

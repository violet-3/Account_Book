# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式,
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.2.0] - 2026-08-30

### 新增 Added
- **排班制度**:双休 / 单休 / 大小周;大小周可指定"本周是大周还是小周",之后按周自动交替推算,同步影响应出勤天数、缺勤判定与加班倍率认定
- **上下班时间**:设置上班 / 下班时间,今日页显示在岗状态(未上班 / 工作中 / 已下班)与倒计时
- **加班补偿新增「调休」**:按倍率折算可休时长(不发钱),今日页、日历统计与工资页同步显示累计可调休
- 自定义城市支持填写城市名称,工资页五险一金明细展示该名称
- 五险一金明细展开补全**工伤、生育**两项(单位全额缴纳,个人 ¥0)
- 新增 7 项排班与调休折算单测(合计 56 项)

### 修复 Fixed
- 修复自定义城市模式下的信息缺失(补充城市名称输入)
- 修复调休时长提示的单位换算错误(小时误作分钟)

[1.1.0] 之前的版本见下方历史。

## [1.1.0] - 2026-08-30

### 新增 Added
- 手机 / 平板 / 桌面三档响应式布局:桌面端为左侧导航栏 + 双列卡片流,平板端加宽容器与触控区
- 法定节假日按年自动更新:内置 2025–2026 官方安排,其他年份自动从 [holiday-cn](https://github.com/NateScarlet/holiday-cn) 开源数据(jsDelivr CDN)在线获取并缓存本地,离线时按周末规则优雅降级
- 计算引擎基准测试(`npm run bench`)与 [benchmark 图](docs/benchmark.png)
- GitHub Actions:CI(Lint + 单测 + 基准冒烟)与 Release(打 tag 自动测试、打包 zip 并发布)
- Dockerfile 一键容器化(`docker run -p 5173:5173`)
- 7 项节假日数据解析器单测(合计 41 项测试)

### 变更 Changed
- Service Worker 缓存策略由 cache-first 改为 network-first,保证发布后更新及时、离线可回退

### 修复 Fixed
- 修复打卡面板初始化时机不当导致首条记录写入空日期键的问题
- 修复存储不可用(如受限 WebView)时静默失败的问题,现会显示醒目警告

## [1.0.0] - 2026-08-30

### 新增 Added
- 今日打卡:出勤状态(出勤/休息/带薪假/无薪假/病假/旷工)+ 加班时长一键记录,自动识别工作日 / 周末 / 法定节假日 / 调休日并匹配 1.5× / 2× / 3× 加班倍率
- 出勤日历:月视图状态着色与加班角标,任意日期弹层编辑
- 工资估算:加班费、缺勤扣款、五险一金(内置 16 城个人比例与基数上下限,可改)、个税累计预扣预缴法(5000 起征,支持专项附加扣除),工资条式明细与全年实发走势
- 数据 100% 本地存储(localStorage),JSON 导出 / 导入备份
- PWA:可安装、离线可用,移动优先 + 深色模式
- 计算引擎 34 项单元测试,零后端依赖,静态文件即可部署

[Unreleased]: https://github.com/YOUR_USERNAME/dagong-ledger/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/YOUR_USERNAME/dagong-ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/YOUR_USERNAME/dagong-ledger/releases/tag/v1.0.0

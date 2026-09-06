/* 计算引擎单测:node test/calc.test.mjs */
import '../js/data.js';
import calc from '../js/calc.js';

const { dayKind, calcYear, monthStats, socialInsurance, annualTax } = calc;
const H = globalThis.HOLIDAYS;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = Math.round(actual * 100) / 100, e = Math.round(expected * 100) / 100;
  if (Math.abs(a - e) < 0.011) { pass++; }
  else { fail++; console.error(`FAIL ${label}: got ${actual}, want ${expected}`); }
}
function is(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

/* ---- 1. 日历类型判定 ---- */
is(dayKind('2026-02-17', H), 'holiday', '2026春节周三=法定假');
is(dayKind('2026-02-14', H), 'makeup', '2026-02-14周六=调休上班');
is(dayKind('2026-02-28', H), 'makeup', '2026-02-28周六=调休上班');
is(dayKind('2026-10-10', H), 'makeup', '2026-10-10=国庆调休');
is(dayKind('2026-08-15', H), 'weekend', '普通周六');
is(dayKind('2026-08-30', H), 'weekend', '2026-08-30周日');
is(dayKind('2026-08-20', H), 'workday', '普通周四');
is(dayKind('2025-10-01', H), 'holiday', '2025国庆');

/* ---- 2. 五险一金 ---- */
const bjSettings = (base) => ({
  baseSalary: base, monthlyAllowance: 0,
  sbBase: base, sbFloor: 6821, sbCeiling: 35283,
  pensionRate: 0.08, medicalRate: 0.02, unemploymentRate: 0.005, housingRate: 0.12,
  taxThreshold: 5000, specialDeduction: 0,
  otComp: 'pay', otRateWorkday: 1.5, otRateWeekend: 2, otRateHoliday: 3,
});

const si1 = socialInsurance(bjSettings(10000));
eq(si1.total, 2250, '北京月薪1万社保=(8+2+0.5+12)%=2250');
is(si1.itemList.length, 6, '五险一金完整显示六个项目');
is(si1.itemList.find(x => x.id === 'work_injury').companyOnly, true, '工伤保险默认标记为单位缴纳');
const siContract = socialInsurance({ ...bjSettings(10000), insuranceDeductionMode: 'contract', contractInsuranceTotal: 1700, contractEmployeeShare: 0.5 });
eq(siContract.rateTotal, 2250, '个人比例口径保留用于核对');
eq(siContract.contractPersonal, 850, '合同1700元且个人各半=850');
eq(siContract.total, 850, '合同固定分摊模式用于工资扣款');
const si2 = socialInsurance(bjSettings(5000));
eq(si2.base, 6821, '基数低于下限按下限');
eq(si2.total, 6821 * 0.225, '下限缴费金额');
const si3 = socialInsurance(bjSettings(50000));
eq(si3.base, 35283, '基数高于上限按上限');
const siCustom = socialInsurance({ ...bjSettings(10000), insuranceItems: [
  { id: 'pension', name: '养老保险', enabled: true, rate: 0.08 },
  { id: 'medical', name: '医疗保险', enabled: false, rate: 0.02 },
  { id: 'supplement', name: '补充保险', enabled: true, rate: 0.01 },
] });
eq(siCustom.total, 900, '自定义险种可独立启用并计费');
is(siCustom.itemList.length, 2, '自定义险种动态明细');

/* ---- 3. 个税累计预扣:月薪3万(北京) ---- */
const s30k = bjSettings(30000);
const fullYearRecords = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`2026-${String(index + 1).padStart(2, '0')}-01`, { status: 'work', ot: 0 }]));
const y30k = calcYear(2026, s30k, fullYearRecords, H);
eq(y30k.months[0].tax, 547.5, '1月个税 18250*3%');
eq(y30k.months[1].tax, 582.5, '2月跳档 36500*10%-2520-547.5');
eq(y30k.months[8].tax, 3650, '9月跳20%档:15930-12280');
eq(y30k.months[0].net, 30000 - 6750 - 547.5, '1月实发');
eq(y30k.months[11].cumTaxable, 219000, '全年累计应纳税所得额');
const totalTax = y30k.months.reduce((a, m) => a + m.tax, 0);
eq(totalTax, 26880, '全年个税合计=速算表验证值');

/* ---- 4. 已记录月份按全勤估算:月薪1万北京 ---- */
const y10k = calcYear(2026, bjSettings(10000), fullYearRecords, H);
const aug = y10k.months[7];
eq(aug.gross, 10000, '8月应发(全勤无加班)');
eq(aug.tax, 82.5, '8月个税恒定2750*3%');
eq(aug.net, 10000 - 2250 - 82.5, '8月实发');

/* ---- 4b. 未记录月份不虚构累计个税，可用工资条累计数校准 ---- */
const yPartial = calcYear(2026, bjSettings(10000), { '2026-09-01': { status: 'work', ot: 0 } }, H);
eq(yPartial.months[8].cumTaxableBefore, 0, '中途开始记账前未知月份不计入累计');
eq(yPartial.months[8].cumTaxable, 2750, '首个已记录月只累计本月应纳税所得额');
const yCarry = calcYear(2026, { ...bjSettings(10000), taxCarryTaxable: 22000, taxCarryPaid: 660 }, { '2026-09-01': { status: 'work', ot: 0 } }, H);
eq(yCarry.months[8].cumTaxableBefore, 22000, '工资条累计应纳税所得额作为校准起点');
eq(yCarry.months[8].tax, 82.5, '工资条累计已缴个税参与本月预扣');

/* ---- 5. 加班费:月薪21750 → 时薪125 ---- */
const s21750 = bjSettings(21750);
const recs = {
  '2026-08-04': { status: 'work', ot: 2 },                      // 周二 工作日 2h*1.5
  '2026-08-08': { status: 'work', ot: 2 },                      // 周六 周末 2h*2
  '2026-10-02': { status: 'work', ot: 2 },                      // 国庆 节假日 2h*3
};
const y21750 = calcYear(2026, s21750, recs, H);
const aug2 = y21750.months[7];
eq(aug2.hourlyWage, 125, '时薪=21750/21.75/8');
eq(aug2.otPay, 125 * 2 * 1.5 + 125 * 2 * 2, '工作日2h(375)+周六2h(500)=875');
eq(aug2.gross, 21750 + 875, '8月应发=月薪+加班费');
const oct2 = y21750.months[9];
eq(oct2.otPay, 125 * 2 * 3, '节假日加班2h=750');

/* ---- 6. 缺勤扣款:月薪21750,无薪假1天 ---- */
const recs2 = { '2026-08-05': { status: 'leave_unpaid', ot: 0 } };
const y2 = calcYear(2026, s21750, recs2, H);
eq(y2.months[7].deduction, 1000, '无薪假1天扣日薪1000');
eq(y2.months[7].gross, 20750, '应发=21750-1000');

/* ---- 7. 加班补偿=仅记录(不折钱) ---- */
const sNoPay = { ...s21750, otComp: 'none' };
const y3 = calcYear(2026, sNoPay, recs, H);
eq(y3.months[7].otPay, 0, 'otComp=none 时加班费为0');

/* ---- 8. monthStats ---- */
const st = monthStats(2026, 8, recs, H);
is(st.otDays, 2, '8月加班2天');
eq(st.otTotal, 4, '8月加班4小时');
is(st.attended, 2, '月统计只计算已保存的出勤记录');
const stWorkdays = monthStats(2026, 2, {}, H); // 2026年2月:28天-4个周末日? 2/1周日;周末:1,7,8,14(调休),15-23假,21,22,28(调休)
is(stWorkdays.workdayCount, 16, '2026年2月应出勤:20个工作日-6天春节假+2天调休');
is(stWorkdays.attended, 0, '空月份不预填出勤数据');

/* ---- 9. annualTax 边界 ---- */
eq(annualTax(0), 0, '0元不缴税');
eq(annualTax(36000), 1080, '3万6整=3%档顶');
eq(annualTax(144000), 11880, '14.4万整=10%档顶');

/* ---- 10. 排班制度:单休 ---- */
const one = { workType: 'one' };
is(dayKind('2026-08-15', H, one), 'workday', '单休:周六是工作日');
is(dayKind('2026-08-16', H, one), 'weekend', '单休:周日休息');
is(dayKind('2026-08-15', H), 'weekend', '默认(未传sched):双休周六休');

/* ---- 11. 排班制度:大小周自动交替 ---- */
// 锚点:2026-08-31 那一周(周一)为大周。该周周六=9/5。
const bs = { workType: 'bigsmall', anchorWeekStart: '2026-08-31', anchorType: 'big' };
is(dayKind('2026-09-05', H, bs), 'weekend', '大小周:锚点周(大周)周六休息');
is(dayKind('2026-09-12', H, bs), 'workday', '大小周:下一周(小周)周六上班');
is(dayKind('2026-09-13', H, bs), 'weekend', '大小周:周日永远休息');
is(dayKind('2026-09-19', H, bs), 'weekend', '大小周:隔两周回到大周');
// 小周锚点
const bs2 = { workType: 'bigsmall', anchorWeekStart: '2026-08-31', anchorType: 'small' };
is(dayKind('2026-09-05', H, bs2), 'workday', '大小周:小周锚点时本周六上班');
is(dayKind('2026-09-12', H, bs2), 'weekend', '大小周:小周锚点下周六休息');
// 无锚点退化为双休
is(dayKind('2026-09-12', H, { workType: 'bigsmall' }), 'weekend', '大小周未设锚点:退化为双休');
// 大小周与调休补班优先级:补班日永远上班
is(dayKind('2026-10-10', H, bs), 'makeup', '大小周:法定调休补班日优先于排班');
// weekStartOf
is(calc.weekStartOf('2026-08-30'), '2026-08-24', 'weekStartOf:周日归属本周一(8/24)');

/* ---- 12b. 医护轮班与弹性排班 ---- */
const shift = { workType: 'shift', shiftAnchorDate: '2026-09-01', shiftWorkDays: 2, shiftRestDays: 2 };
is(dayKind('2026-09-01', H, shift), 'workday', '轮班:周期第1天上班');
is(dayKind('2026-09-02', H, shift), 'workday', '轮班:周期第2天上班');
is(dayKind('2026-09-03', H, shift), 'weekend', '轮班:周期第3天休息');
is(dayKind('2026-09-05', H, shift), 'workday', '轮班:下一周期第1天上班');
is(dayKind('2026-09-06', H, { workType: 'flexible' }), 'workday', '弹性排班:周日默认可出勤');

/* ---- 12. 大小周下的工资计算 ---- */
const bsSettings = { ...s21750, workType: 'bigsmall', anchorWeekStart: '2026-08-31', anchorType: 'big' };
const ybs = calcYear(2026, bsSettings, {}, H);
// 2026年9月:平日22天中25号为中秋假 → 21;补班9/20(周日)+1;周六12(小周班)+1;周六26为中秋假
is(ybs.months[8].workdayCount, 23, '大小周:9月应出勤=21平日+补班周日+小周班周六');

/* ---- 13. 调休折算时长 timeoffHours ---- */
const toSettings = { ...s21750, otComp: 'timeoff' };
const yto = calcYear(2026, toSettings, recs, H);
eq(yto.months[7].timeoffHours, 2 * 1.5 + 2 * 2, '8月调休折算=工作日2h*1.5+周末2h*2=7h');
eq(yto.months[7].otPay, 0, '调休模式不发加班费');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

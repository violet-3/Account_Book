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
const si2 = socialInsurance(bjSettings(5000));
eq(si2.base, 6821, '基数低于下限按下限');
eq(si2.total, 6821 * 0.225, '下限缴费金额');
const si3 = socialInsurance(bjSettings(50000));
eq(si3.base, 35283, '基数高于上限按上限');

/* ---- 3. 个税累计预扣:月薪3万(北京) ---- */
const s30k = bjSettings(30000);
const y30k = calcYear(2026, s30k, {}, H);
eq(y30k.months[0].tax, 547.5, '1月个税 18250*3%');
eq(y30k.months[1].tax, 582.5, '2月跳档 36500*10%-2520-547.5');
eq(y30k.months[8].tax, 3650, '9月跳20%档:15930-12280');
eq(y30k.months[0].net, 30000 - 6750 - 547.5, '1月实发');
eq(y30k.months[11].cumTaxable, 219000, '全年累计应纳税所得额');
const totalTax = y30k.months.reduce((a, m) => a + m.tax, 0);
eq(totalTax, 26880, '全年个税合计=速算表验证值');

/* ---- 4. 无记录月份=全勤估算:月薪1万北京 ---- */
const y10k = calcYear(2026, bjSettings(10000), {}, H);
const aug = y10k.months[7];
eq(aug.gross, 10000, '8月应发(全勤无加班)');
eq(aug.tax, 82.5, '8月个税恒定2750*3%');
eq(aug.net, 10000 - 2250 - 82.5, '8月实发');

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
const stWorkdays = monthStats(2026, 2, {}, H); // 2026年2月:28天-4个周末日? 2/1周日;周末:1,7,8,14(调休),15-23假,21,22,28(调休)
is(stWorkdays.workdayCount, 16, '2026年2月应出勤:20个工作日-6天春节假+2天调休');

/* ---- 9. annualTax 边界 ---- */
eq(annualTax(0), 0, '0元不缴税');
eq(annualTax(36000), 1080, '3万6整=3%档顶');
eq(annualTax(144000), 11880, '14.4万整=10%档顶');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

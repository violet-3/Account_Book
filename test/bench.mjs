/* 计算引擎基准测试:node test/bench.mjs
 * 输出各核心函数的吞吐量(ops/s),供 README 的 benchmark 图使用。
 * 结果因机器而异,图为准入口径:仅展示量级与复杂度趋势。
 */
import '../js/data.js';
import calc from '../js/calc.js';

const { dayKind, monthStats, calcYear, socialInsurance, annualTax } = calc;
const H = globalThis.HOLIDAYS;

function bench(label, iterations, fn) {
  // 预热
  for (let i = 0; i < Math.ceil(iterations / 10); i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  const ops = Math.round((iterations / ms) * 1000);
  console.log(`${label.padEnd(38)} ${String(ops).padStart(10)} ops/s  (${iterations} iters, ${ms.toFixed(1)}ms)`);
  return { label, ops, iterations, ms: Number(ms.toFixed(1)) };
}

/* 生成 n 条考勤记录(连续 n 天) */
function makeRecords(n) {
  const records = {};
  const base = new Date(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    records[ds] = { status: 'work', ot: i % 3 };
  }
  return records;
}

const settings = {
  baseSalary: 22000, monthlyAllowance: 200, sbBaseMode: 'salary',
  sbFloor: 6821, sbCeiling: 35283,
  pensionRate: 0.08, medicalRate: 0.02, unemploymentRate: 0.005, housingRate: 0.12,
  otComp: 'pay', otRateWorkday: 1.5, otRateWeekend: 2, otRateHoliday: 3,
  taxThreshold: 5000, specialDeduction: 1500,
};

const results = [];
results.push(bench('dayKind × 31 天(日历格判定)', 100000, i => {
  dayKind(`2026-08-${String((i % 28) + 1).padStart(2, '0')}`, H);
}));
results.push(bench('monthStats(单月考勤汇总)', 20000, () => monthStats(2026, 8, {}, H)));
results.push(bench('socialInsurance(五险一金)', 200000, () => socialInsurance(settings)));
results.push(bench('annualTax(累计预扣个税)', 200000, () => annualTax(123456)));
results.push(bench('calcYear 0 条记录(全勤估算)', 3000, () => calcYear(2026, settings, {}, H)));
results.push(bench('calcYear 365 条记录(1年)', 1500, () => calcYear(2026, settings, makeRecords(365), H)));
results.push(bench('calcYear 3650 条记录(10年)', 300, () => calcYear(2026, settings, makeRecords(3650), H)));

console.log('\n##BENCH## ' + JSON.stringify(results));

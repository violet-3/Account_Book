/* savings.js 单测:node test/savings.test.mjs */
import '../js/savings.js';
const S = globalThis.SAVINGS;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = Math.round(actual * 100) / 100, e = Math.round(expected * 100) / 100;
  if (Math.abs(a - e) < 0.011) { pass++; }
  else { fail++; console.error(`FAIL ${label}: got ${actual}, want ${expected}`); }
}
function isStr(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

const deps = [
  { goalId: 'g1', amount: 500, date: '2026-07-05' },
  { goalId: 'g1', amount: 300, date: '2026-08-10' },
  { goalId: 'g1', amount: 200, date: '2026-08-20' },
  { goalId: 'g2', amount: 1000, date: '2026-06-30' },
  { goalId: 'g2', amount: 800, date: '2026-07-15' },
  { goalId: 'g2', amount: 900, date: '2026-08-25' },
  { goalId: 'g2', amount: 700, date: '2025-12-01' },
];

/* goalSaved */
eq(S.goalSaved('g1', deps), 1000, 'g1 已存=500+300+200');
eq(S.goalSaved('g2', deps), 3400, 'g2 已存=1000+800+900+700');
eq(S.goalSaved('gx', deps), 0, '不存在目标=0');

/* savedInYear */
eq(S.savedInYear(2026, deps), 3700, '2026 年已攒(排除 2025 的 700)');
eq(S.savedInYear(2025, deps), 700, '2025 年已攒');

/* monthlyAverage:近 3 个月(2026-06/07/08)月均 = (1000+1300+1400)/3 */
eq(S.monthlyAverage('2026-08', deps, 3), 3700 / 3, '近3月月均');

/* goalProgress */
const g1 = { id: 'g1', target: 4000, monthlyPlan: 500 };
const p1 = S.goalProgress(g1, deps, new Date(2026, 7, 30));
eq(p1.saved, 1000, '进度已存');
eq(p1.pct, 25, '进度百分比');
eq(p1.remain, 3000, '剩余');
isStr(p1.etaMonth, '2027年2月', '按月计划500:3000/500=6个月 → 2027年2月');
const pDone = S.goalProgress({ id: 'g9', target: 100 }, [{ goalId: 'g9', amount: 120, date: '2026-08-01' }], new Date(2026, 7, 30));
isStr(pDone.etaMonth, '已达成', '超额达成');
eq(pDone.pct, 100, '进度封顶100%');
const pNoPlan = S.goalProgress({ id: 'g8', target: 500 }, [], new Date(2026, 7, 30));
isStr(pNoPlan.etaMonth, null, '无月计划不给 ETA');

/* yearProjection */
const proj = S.yearProjection({}, [{ monthlyPlan: 500 }, { monthlyPlan: 300 }], deps, '2026-08');
eq(proj.planMonthly, 800, '计划月存合计');
eq(proj.planYearly, 9600, '计划口径年攒');
eq(proj.avgMonthly, 3700 / 3, '实际月均');
eq(proj.actualYearly, 14799.96, '实际口径年攒(月均两位小数×12)');
eq(proj.savedThisYear, 3700, '今年已攒');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

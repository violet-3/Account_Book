/* =========================================================
 * savings.js — 攒钱/储蓄规划纯逻辑
 * 兼容浏览器(window.SAVINGS)与 Node(单测)。
 *
 * 口径:
 * - 目标进度:已存 = 该目标全部存款流水之和,封顶 100%
 * - 年度预估两种口径:
 *   1) 计划口径:各目标"每月计划"之和 × 12
 *   2) 实际口径:近 3 个自然月(含当月)存款月均 × 12
 * ========================================================= */
(function (root) {
  'use strict';

  function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  /* 某目标已存总额 */
  function goalSaved(goalId, deposits) {
    return round2((deposits || []).reduce(
      (a, d) => (d.goalId === goalId ? a + (Number(d.amount) || 0) : a), 0));
  }

  /* 某年已攒总额(date 以 'YYYY-MM-DD' 开头匹配年份) */
  function savedInYear(year, deposits) {
    const pre = String(year) + '-';
    return round2((deposits || []).reduce(
      (a, d) => (String(d.date || '').startsWith(pre) ? a + (Number(d.amount) || 0) : a), 0));
  }

  /* 近 n 个自然月(含当月)的存款月均;nowYm = 'YYYY-MM' */
  function monthlyAverage(nowYm, deposits, n) {
    const sums = {};
    for (const d of deposits || []) {
      const ym = String(d.date || '').slice(0, 7);
      if (!ym) continue;
      sums[ym] = (sums[ym] || 0) + (Number(d.amount) || 0);
    }
    const [y, m] = String(nowYm).split('-').map(Number);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dt = new Date(y, m - 1 - i, 1);
      const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      total += sums[key] || 0;
    }
    return round2(total / n);
  }

  /* 目标进度:saved/pct/remain/etaMonth(按每月计划推算预计达成年月)
   * nowDate 可注入(单测用),默认当前时间。
   */
  function goalProgress(goal, deposits, nowDate) {
    const saved = goalSaved(goal.id, deposits);
    const target = Number(goal.target) || 0;
    const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    const remain = Math.max(0, target - saved);
    let etaMonth = null;
    if (remain <= 0) {
      etaMonth = '已达成';
    } else if (Number(goal.monthlyPlan) > 0) {
      const months = Math.ceil(remain / Number(goal.monthlyPlan));
      const now = nowDate || new Date();
      const dt = new Date(now.getFullYear(), now.getMonth() + months, 1);
      etaMonth = `${dt.getFullYear()}年${dt.getMonth() + 1}月`;
    }
    return { saved, target, pct: Math.round(pct * 10) / 10, remain: round2(remain), etaMonth };
  }

  /* 年度储蓄预估 */
  function yearProjection(settings, goals, deposits, nowYm) {
    const planMonthly = round2((goals || []).reduce((a, g) => a + (Number(g.monthlyPlan) || 0), 0));
    const savedThisYear = savedInYear(String(nowYm).slice(0, 4), deposits);
    const avgMonthly = monthlyAverage(nowYm, deposits, 3);
    return {
      planMonthly,
      planYearly: round2(planMonthly * 12),
      avgMonthly,
      actualYearly: round2(avgMonthly * 12),
      savedThisYear,
    };
  }

  const SAVINGS = { goalSaved, savedInYear, monthlyAverage, goalProgress, yearProjection, round2 };
  root.SAVINGS = SAVINGS;
  if (typeof module !== 'undefined' && module.exports) module.exports = SAVINGS;
})(typeof window !== 'undefined' ? window : globalThis);

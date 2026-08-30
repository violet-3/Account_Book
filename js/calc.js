/* =========================================================
 * calc.js — 计算引擎(纯函数,无副作用)
 * 同时兼容浏览器(window.CALC)与 Node(单测 require)。
 *
 * 核心规则:
 * - 月计薪天数 21.75 天,日薪 = 月薪 / 21.75,时薪 = 日薪 / 8
 * - 加班费:工作日 ×1.5 / 周末 ×2 / 法定节假日 ×3(倍率可改)
 * - 缺勤扣款:(无薪假 + 旷工)天数 × 日薪
 * - 五险一金:缴费基数 = clamp(基数, 下限, 上限),按城市个人比例合计
 * - 个税:累计预扣预缴法,起征点 5000/月,支持专项附加扣除
 * ========================================================= */

(function (root) {
  'use strict';

  const PAY_DAYS_PER_MONTH = 21.75;

  /* ---------- 日期工具(全部基于 YYYY-MM-DD 字符串,避免时区问题) ---------- */

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay(); // 0=周日
  }

  /* ---------- 出勤类型判定 ----------
   * 返回:'holiday' 法定节假 | 'makeup' 调休上班 | 'weekend' 周末 | 'workday' 工作日
   * records 中显式覆盖优先于日历推断。
   */
  function dayKind(dateStr, holidays) {
    const y = Number(dateStr.slice(0, 4));
    const table = holidays[y];
    if (table) {
      if (table.holidays.includes(dateStr)) return 'holiday';
      if (table.makeup.includes(dateStr)) return 'makeup';
    }
    const w = weekdayOf(dateStr);
    return (w === 0 || w === 6) ? 'weekend' : 'workday';
  }

  /* 记录状态 → 实际计薪口径
   * status: 'work' 出勤 | 'rest' 休息 | 'leave_paid' 带薪假
   *         | 'leave_unpaid' 无薪假 | 'sick' 病假 | 'absent' 旷工
   * 未记录(null):按日历推断 —— 应上班日视为出勤,休息日视为休息。
   */
  function effectiveStatus(dateStr, rec, holidays) {
    if (rec && rec.status) return rec.status;
    const kind = dayKind(dateStr, holidays);
    return (kind === 'workday' || kind === 'makeup') ? 'work' : 'rest';
  }

  /* 某天是否算"出勤"(用于出勤天数统计) */
  function isAttended(dateStr, rec, holidays) {
    const s = effectiveStatus(dateStr, rec, holidays);
    return s === 'work' || s === 'leave_paid' || s === 'sick';
  }

  /* 某天缺勤(扣款)天数 */
  function unpaidDaysOf(dateStr, rec, holidays) {
    const s = effectiveStatus(dateStr, rec, holidays);
    return (s === 'leave_unpaid' || s === 'absent') ? 1 : 0;
  }

  /* 加班类型:法定节假日 ×3,周末(含被顶掉的休息日) ×2,其余 ×1.5
   * 用户显式覆盖 rec.otType 时以覆盖为准(如周末来上班处理的是工作日事务,仍按周末 2 倍算)。
   */
  function otTypeOf(dateStr, rec, holidays) {
    if (rec && rec.otType) return rec.otType;
    const kind = dayKind(dateStr, holidays);
    if (kind === 'holiday') return 'holiday';
    if (kind === 'weekend') return 'weekend';
    return 'workday';
  }

  /* ---------- 五险一金 ---------- */

  function socialInsurance(settings) {
    const base = clampNum(settings.sbBase, 0, 1e10);
    const floor = clampNum(settings.sbFloor, 0, 1e10);
    const ceiling = clampNum(settings.sbCeiling, 0, 1e10);
    const adjBase = Math.min(Math.max(base, floor), ceiling);
    const rates = {
      pension: num(settings.pensionRate),
      medical: num(settings.medicalRate),
      unemployment: num(settings.unemploymentRate),
      housing: num(settings.housingRate),
    };
    const items = {};
    let total = 0;
    for (const k of Object.keys(rates)) {
      const v = adjBase * rates[k];
      items[k] = round2(v);
      total += v;
    }
    return { base: adjBase, rates, items, total: round2(total) };
  }

  /* ---------- 个税:累计预扣预缴 ---------- */

  function annualTax(cumTaxable) {
    const t = Math.max(0, cumTaxable);
    for (const [limit, rate, quick] of root.TAX_BRACKETS) {
      if (t <= limit) return t * rate - quick;
    }
    return 0;
  }

  /* ---------- 单月计算 ---------- */

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function clampNum(v, lo, hi) { return Math.min(Math.max(num(v), lo), hi); }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* 计算某年 1-12 月的工资明细(累计预扣法需要从 1 月起逐月累计)。
   * 无考勤记录的月份按"全勤"估算。
   * 返回 { months: [ {key, label, ...明细} ], totals }
   */
  function calcYear(year, settings, records, holidays) {
    const base = num(settings.baseSalary);
    const allowance = num(settings.monthlyAllowance);
    const daily = base / PAY_DAYS_PER_MONTH;
    const hourly = daily / 8;
    const rates = {
      workday: num(settings.otRateWorkday) || 1.5,
      weekend: num(settings.otRateWeekend) || 2,
      holiday: num(settings.otRateHoliday) || 3,
    };
    const otPayEnabled = settings.otComp !== 'none';
    const si = socialInsurance(settings);
    const threshold = num(settings.taxThreshold) || 5000;
    const special = num(settings.specialDeduction);

    let cumTaxable = 0;      // 年初至今累计应纳税所得额
    let cumTax = 0;          // 年初至今累计已缴个税
    const months = [];

    for (let m = 1; m <= 12; m++) {
      const dim = daysInMonth(year, m);
      const otHours = { workday: 0, weekend: 0, holiday: 0 };
      let unpaid = 0, attended = 0, workdayCount = 0, restCount = 0;
      let recorded = false;

      for (let d = 1; d <= dim; d++) {
        const ds = fmtDate(year, m, d);
        const rec = records[ds];
        const kind = dayKind(ds, holidays);
        if (kind === 'workday' || kind === 'makeup') workdayCount++;
        else restCount++;
        if (rec) recorded = true;

        if (isAttended(ds, rec, holidays)) attended++;
        unpaid += unpaidDaysOf(ds, rec, holidays);

        const h = rec ? num(rec.ot) : 0;
        if (h > 0) {
          const t = otTypeOf(ds, rec, holidays);
          otHours[t] += h;
        }
      }

      const otPay = otPayEnabled
        ? hourly * (otHours.workday * rates.workday
          + otHours.weekend * rates.weekend
          + otHours.holiday * rates.holiday)
        : 0;
      const deduction = unpaid * daily;
      const gross = base + allowance + otPay - deduction;
      const taxableThisMonth = gross - si.total - threshold - special;
      cumTaxable += taxableThisMonth;
      const taxMonth = Math.max(0, annualTax(cumTaxable) - cumTax);
      cumTax += taxMonth;
      const net = gross - si.total - taxMonth;

      months.push({
        key: `${year}-${pad2(m)}`,
        year, month: m,
        label: `${year}年${m}月`,
        recorded,
        workdayCount, restCount,
        attended, unpaid,
        otHours, otPay: round2(otPay),
        dailyWage: round2(daily), hourlyWage: round2(hourly),
        deduction: round2(deduction),
        allowance,
        gross: round2(gross),
        social: si,
        tax: round2(taxMonth),
        cumTaxable: round2(cumTaxable),
        taxRate: taxRateOf(cumTaxable),
        net: round2(net),
      });
    }
    return { months };
  }

  function taxRateOf(cumTaxable) {
    const t = Math.max(0, cumTaxable);
    for (const [limit, rate] of root.TAX_BRACKETS) {
      if (t <= limit) return rate;
    }
    return 0.45;
  }

  /* 汇总某月统计(今日页/日历页用,不涉及钱的部分单独提供) */
  function monthStats(year, month, records, holidays) {
    const dim = daysInMonth(year, month);
    let attended = 0, otTotal = 0, otDays = 0, unpaid = 0, workdayCount = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = fmtDate(year, month, d);
      const rec = records[ds];
      const kind = dayKind(ds, holidays);
      if (kind === 'workday' || kind === 'makeup') workdayCount++;
      if (isAttended(ds, rec, holidays)) attended++;
      unpaid += unpaidDaysOf(ds, rec, holidays);
      const h = rec ? num(rec.ot) : 0;
      if (h > 0) { otTotal += h; otDays++; }
    }
    return { attended, workdayCount, otTotal: round2(otTotal), otDays, unpaid };
  }

  const CALC = {
    PAY_DAYS_PER_MONTH, fmtDate, daysInMonth, weekdayOf, dayKind,
    effectiveStatus, isAttended, unpaidDaysOf, otTypeOf,
    socialInsurance, annualTax, calcYear, monthStats, taxRateOf,
    round2, num,
  };

  root.CALC = CALC;
  if (typeof module !== 'undefined' && module.exports) module.exports = CALC;
})(typeof window !== 'undefined' ? window : globalThis);

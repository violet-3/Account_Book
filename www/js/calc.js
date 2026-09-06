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
   * 返回:'holiday' 法定节假 | 'makeup' 调休上班 | 'weekend' 排班休息日 | 'workday' 工作日
   * records 中显式覆盖优先于日历推断。
   * sched(可选):{workType:'two'|'one'|'bigsmall'|'shift'|'flexible', anchorWeekStart, anchorType:'big'|'small', shiftAnchorDate, shiftWorkDays, shiftRestDays}
   *   two=双休 one=单休 bigsmall=大小周(以 anchorWeekStart 那周为锚点,单双周自动交替)
   */
  function weekStartOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const wd = (new Date(y, m - 1, d).getDay() + 6) % 7; // 周一=0
    const dt = new Date(y, m - 1, d - wd);
    return fmtDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }

  function isScheduledRestDay(dateStr, sched) {
    const w = weekdayOf(dateStr);
    const type = sched && sched.workType ? sched.workType : 'two';
    if (type === 'one') return w === 0;
    if (type === 'bigsmall') {
      if (w === 0) return true;
      if (w !== 6) return false;
      const anchorWS = sched && sched.anchorWeekStart;
      if (!anchorWS) return true; // 未设锚点时退化为双休
      const diff = Math.round((Date.parse(weekStartOf(dateStr)) - Date.parse(anchorWS)) / 604800000);
      const isBig = (Math.abs(diff) % 2 === 0) ? sched.anchorType === 'big' : sched.anchorType === 'small';
      return isBig;
    }
    if (type === 'shift') {
      const workDays = Math.max(1, Math.floor(num(sched.shiftWorkDays) || 2));
      const restDays = Math.max(1, Math.floor(num(sched.shiftRestDays) || 2));
      const cycle = workDays + restDays;
      const anchor = sched.shiftAnchorDate || '1970-01-01';
      const diff = Math.floor((Date.parse(dateStr) - Date.parse(anchor)) / 86400000);
      const pos = ((diff % cycle) + cycle) % cycle;
      return pos >= workDays;
    }
    if (type === 'flexible') return false;
    return w === 0 || w === 6; // two(双休,默认)
  }

  /* 从 settings 提取排班配置(calcYear 内部自动调用) */
  function schedFromSettings(settings) {
    if (!settings || !settings.workType || settings.workType === 'two') return null;
    return {
      workType: settings.workType,
      anchorWeekStart: settings.anchorWeekStart || '',
      anchorType: settings.anchorType || 'big',
      shiftAnchorDate: settings.shiftAnchorDate || '',
      shiftWorkDays: settings.shiftWorkDays,
      shiftRestDays: settings.shiftRestDays,
    };
  }

  function dayKind(dateStr, holidays, sched) {
    const y = Number(dateStr.slice(0, 4));
    const table = holidays[y];
    if (table) {
      if (table.holidays.includes(dateStr)) return 'holiday';
      if (table.makeup.includes(dateStr)) return 'makeup';
    }
    return isScheduledRestDay(dateStr, sched) ? 'weekend' : 'workday';
  }

  /* 记录状态 → 实际计薪口径
   * status: 'work' 出勤 | 'rest' 休息 | 'leave_paid' 带薪假
   *         | 'leave_unpaid' 无薪假 | 'sick' 病假 | 'absent' 旷工
   * 未记录(null):按排班推断 —— 应上班日视为出勤,休息日视为休息。
   */
  function effectiveStatus(dateStr, rec, holidays, sched) {
    if (rec && rec.status) return rec.status;
    const kind = dayKind(dateStr, holidays, sched);
    return (kind === 'workday' || kind === 'makeup') ? 'work' : 'rest';
  }

  /* 某天是否算"出勤"(用于出勤天数统计) */
  function isAttended(dateStr, rec, holidays, sched) {
    const s = effectiveStatus(dateStr, rec, holidays, sched);
    return s === 'work' || s === 'leave_paid' || s === 'sick';
  }

  /* 某天缺勤(扣款)天数 */
  function unpaidDaysOf(dateStr, rec, holidays, sched) {
    const s = effectiveStatus(dateStr, rec, holidays, sched);
    return (s === 'leave_unpaid' || s === 'absent') ? 1 : 0;
  }

  /* 加班类型:法定节假日 ×3,排班休息日 ×2,其余 ×1.5
   * 用户显式覆盖 rec.otType 时以覆盖为准。
   */
  function otTypeOf(dateStr, rec, holidays, sched) {
    if (rec && rec.otType) return rec.otType;
    const kind = dayKind(dateStr, holidays, sched);
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
    const legacy = [
      { id: 'pension', name: '养老保险', rate: settings.pensionRate },
      { id: 'medical', name: '医疗保险', rate: settings.medicalRate },
      { id: 'unemployment', name: '失业保险', rate: settings.unemploymentRate },
      { id: 'work_injury', name: '工伤保险', rate: 0, companyOnly: true },
      { id: 'maternity', name: '生育保险', rate: 0, companyOnly: true },
      { id: 'housing', name: '住房公积金', rate: settings.housingRate },
    ];
    const configured = Array.isArray(settings.insuranceItems) && settings.insuranceItems.length
      ? settings.insuranceItems : legacy.map(x => ({ ...x, enabled: true }));
    const rates = {};
    const items = {};
    const itemList = [];
    let rateTotal = 0;
    for (const item of configured) {
      if (!item || !item.id || item.enabled === false) continue;
      const rate = num(item.rate);
      const v = adjBase * rate;
      rates[item.id] = rate;
      items[item.id] = round2(v);
      itemList.push({ id: item.id, name: item.name || item.id, rate, amount: round2(v), companyOnly: item.companyOnly === true });
      rateTotal += v;
    }
    const contractTotal = Math.max(0, num(settings.contractInsuranceTotal));
    const employeeShare = Math.min(1, Math.max(0, num(settings.contractEmployeeShare) || 0));
    const contractPersonal = round2(contractTotal * employeeShare);
    const deductionMode = settings.insuranceDeductionMode === 'contract' && contractTotal > 0 ? 'contract' : 'rate';
    const total = deductionMode === 'contract' ? contractPersonal : round2(rateTotal);
    return { base: adjBase, rates, items, itemList, rateTotal: round2(rateTotal), contractTotal: round2(contractTotal), contractPersonal, deductionMode, total };
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
   * 无考勤记录的月份按"全勤"估算;排班制度(workType 等)取自 settings。
   * 返回 { months: [ {key, label, ...明细} ] }
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
    const otComp = settings.otComp || 'pay';
    const otPayEnabled = otComp === 'pay';
    const sched = schedFromSettings(settings);
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
        const kind = dayKind(ds, holidays, sched);
        if (kind === 'workday' || kind === 'makeup') workdayCount++;
        else restCount++;
        if (rec) recorded = true;

        if (isAttended(ds, rec, holidays, sched)) attended++;
        unpaid += unpaidDaysOf(ds, rec, holidays, sched);

        const h = rec ? num(rec.ot) : 0;
        if (h > 0) {
          const t = otTypeOf(ds, rec, holidays, sched);
          otHours[t] += h;
        }
      }

      const otHoursWeighted = otHours.workday * rates.workday
        + otHours.weekend * rates.weekend
        + otHours.holiday * rates.holiday;
      const otPay = otPayEnabled ? hourly * otHoursWeighted : 0;
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
        timeoffHours: round2(otHoursWeighted),
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

  /* 汇总某月统计(今日页/日历页用,sched 为可选排班配置) */
  function monthStats(year, month, records, holidays, sched) {
    const dim = daysInMonth(year, month);
    let attended = 0, otTotal = 0, otDays = 0, unpaid = 0, workdayCount = 0, recorded = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = fmtDate(year, month, d);
      const rec = records[ds];
      const kind = dayKind(ds, holidays, sched);
      if (kind === 'workday' || kind === 'makeup') workdayCount++;
      if (rec) {
        recorded++;
        if (isAttended(ds, rec, holidays, sched)) attended++;
        unpaid += unpaidDaysOf(ds, rec, holidays, sched);
      }
      const h = rec ? num(rec.ot) : 0;
      if (h > 0) { otTotal += h; otDays++; }
    }
    return { attended, recorded, workdayCount, otTotal: round2(otTotal), otDays, unpaid };
  }

  const CALC = {
    PAY_DAYS_PER_MONTH, fmtDate, daysInMonth, weekdayOf, dayKind, weekStartOf,
    isScheduledRestDay, schedFromSettings,
    effectiveStatus, isAttended, unpaidDaysOf, otTypeOf,
    socialInsurance, annualTax, calcYear, monthStats, taxRateOf,
    round2, num,
  };

  root.CALC = CALC;
  if (typeof module !== 'undefined' && module.exports) module.exports = CALC;
})(typeof window !== 'undefined' ? window : globalThis);

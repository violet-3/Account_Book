/* =========================================================
 * app.js — Vue 3 应用逻辑
 * 页面:今日打卡 / 出勤日历 / 工资估算 / 设置
 * ========================================================= */
(function () {
  'use strict';
  const { createApp, reactive, ref, computed, watch, nextTick } = Vue;
  const H = globalThis.HOLIDAYS;
  const CITY = globalThis.CITY_DATA;
  const C = globalThis.CALC;
  const SAVINGS = globalThis.SAVINGS;

  // VisualViewport follows mobile toolbars and keyboards without disabling zoom.
  function updateViewport() {
    const viewport = window.visualViewport;
    if (!viewport || viewport.scale !== 1) return;
    document.documentElement.style.setProperty('--visible-height', `${viewport.height}px`);
    document.documentElement.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
  }
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  updateViewport();

  /* ---------- 状态 ---------- */
  const state = reactive(DB.loadState());
  const hver = ref(0); // 节假日数据版本:在线拉取到新年份后自增,驱动依赖日历的 computed 重算
  const storageOk = ref(DB.storage.ok);
  watch(state, () => {
    if (!DB.saveState(state)) storageOk.value = false;
  }, { deep: true });

  /* 生效设置:合并社保基数模式与排班 */
  const effSettings = computed(() => {
    const s = state.settings;
    const sbBase = s.sbBaseMode === 'salary'
      ? (Number(s.baseSalary) || 0)
      : (Number(s.sbBaseCustom) || 0);
    return { ...s, sbBase };
  });
  const schedule = computed(() => C.schedFromSettings(effSettings.value));
  const cityName = computed(() => {
    const s = state.settings;
    return s.city === 'custom' ? (s.customCityName || '自定义') : (CITY[s.city] ? CITY[s.city].name : '自定义');
  });

  function applyCity(key) {
    const c = CITY[key];
    if (!c) return;
    const s = state.settings;
    s.city = key;
    s.sbFloor = c.floor; s.sbCeiling = c.ceiling;
    s.pensionRate = c.pension; s.medicalRate = c.medical;
    s.unemploymentRate = c.unemployment; s.housingRate = c.housingDefault;
    (s.insuranceItems || []).forEach(item => {
      if (item.id === 'pension') item.rate = c.pension;
      if (item.id === 'medical') item.rate = c.medical;
      if (item.id === 'unemployment') item.rate = c.unemployment;
      if (item.id === 'housing') item.rate = c.housingDefault;
    });
  }

  /* ---------- 通用 ---------- */
  const toast = ref('');
  let toastTimer = null;
  function showToast(msg) {
    toast.value = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = ''), 2000);
  }

  const STATUS_META = {
    work: { label: '出勤', cls: 'st-work' },
    rest: { label: '休息', cls: 'st-rest' },
    leave_paid: { label: '带薪假', cls: 'st-leave-paid' },
    leave_unpaid: { label: '无薪假', cls: 'st-leave-unpaid' },
    sick: { label: '病假', cls: 'st-sick' },
    absent: { label: '旷工', cls: 'st-absent' },
  };
  const OT_TYPE_LABEL = { auto: '自动判定', workday: '工作日 ×1.5', weekend: '周末 ×2', holiday: '法定节假日 ×3' };
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  const page = ref('today');

  function fmtMoney(v, int) {
    const n = Number(v) || 0;
    return n.toLocaleString('zh-CN', {
      minimumFractionDigits: int ? 0 : 2,
      maximumFractionDigits: int ? 0 : 2,
    });
  }

  /* ---------- 日期草稿(今日面板 / 任意日弹层共用) ---------- */
  const draft = reactive({ open: false, date: '', status: 'work', ot: 0, otType: 'auto', note: '' });

  function inferredStatus(date) { return C.effectiveStatus(date, null, H, schedule.value); }
  function inferredOtType(date) { return C.otTypeOf(date, null, H, schedule.value); }

  function loadDraft(date, open = true) {
    const rec = state.records[date];
    draft.open = open;
    draft.date = date;
    draft.status = (rec && rec.status) || inferredStatus(date);
    draft.ot = rec ? (Number(rec.ot) || 0) : 0;
    draft.otType = (rec && rec.otType) || 'auto';
    draft.note = (rec && rec.note) || '';
  }

  function saveDraft() {
    state.records[draft.date] = {
      status: draft.status,
      ot: draft.ot > 0 ? draft.ot : 0,
      otType: draft.otType === 'auto' ? '' : draft.otType,
      note: draft.note || '',
    };
    draft.open = false;
    if (draft.date === todayStr) loadDraft(todayStr, false); // 刷新今日常驻面板
    showToast(draft.date === todayStr ? '今日记录已保存' : '记录已保存');
  }

  function clearDraft() {
    delete state.records[draft.date];
    draft.open = false;
    showToast('已清除该日记录');
  }

  const todayStr = C.fmtDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const todayRec = computed(() => state.records[todayStr] || null);
  const todayKind = computed(() => { hver.value; return C.dayKind(todayStr, H); });
  const todayKindLabel = computed(() => {
    const k = todayKind.value;
    if (k === 'holiday') return '法定节假日';
    if (k === 'makeup') return '调休上班日';
    if (k === 'weekend') return '周末';
    return '工作日';
  });
  const todayHolidayName = computed(() => globalThis.HOLIDAY_NAMES[todayStr] || '');

  /* 今日默认加班类型 */
  const todayOtType = computed(() =>
    todayRec.value && todayRec.value.otType ? todayRec.value.otType : inferredOtType(todayStr));

  const todayOtRate = computed(() => {
    const s = state.settings;
    const t = todayOtType.value;
    const r = t === 'holiday' ? s.otRateHoliday : t === 'weekend' ? s.otRateWeekend : s.otRateWorkday;
    return Number(r) || (t === 'holiday' ? 3 : t === 'weekend' ? 2 : 1.5);
  });

  /* 当前月份 */
  const now = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  const thisMonthPay = computed(() => { hver.value; return C.calcYear(now.y, effSettings.value, state.records, H).months[now.m - 1]; });

  /* 上下班时间与在岗状态(打开页面时快照) */
  function minutesOf(hhmm) {
    const [h, m] = String(hhmm || '09:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return `${h} 小时 ${m} 分`;
    if (h) return `${h} 小时`;
    return `${m} 分钟`;
  }
  const workStatus = computed(() => {
    const s = effSettings.value;
    const n = new Date();
    const cur = n.getHours() * 60 + n.getMinutes();
    const start = minutesOf(s.workTimeStart);
    const end = minutesOf(s.workTimeEnd);
    if (cur < start) return { label: '未上班', cls: 'wt-before', detail: `距上班还有 ${fmtDur(start - cur)}` };
    if (cur <= end) return { label: '工作中', cls: 'wt-working', detail: `距下班还有 ${fmtDur(end - cur)}` };
    return { label: '已下班', cls: 'wt-after', detail: draft.ot > 0 ? `今日已记加班 ${draft.ot} 小时,辛苦了` : '今天辛苦了' };
  });

  /* 大小周:以本周为锚点设置类型,自动交替推算 */
  function setAnchor(type) {
    state.settings.anchorType = type;
    state.settings.anchorWeekStart = C.weekStartOf(todayStr);
    showToast(type === 'big' ? '已设本周为大周,之后自动交替' : '已设本周为小周,之后自动交替');
  }
  const thisWeekendHint = computed(() => {
    if (state.settings.workType !== 'bigsmall') return '';
    const ws = C.weekStartOf(todayStr);
    const [wy, wm, wd] = ws.split('-').map(Number);
    const sat = C.fmtDate(wy, wm, wd + 6);
    return C.isScheduledRestDay(sat, schedule.value)
      ? '本周末休周六、周日,下周自动切换'
      : '本周为小周仅休周日,下周自动切换';
  });

  /* ---------- 日历页 ---------- */
  const calYear = ref(now.y);
  const calMonth = ref(now.m);
  const calCells = computed(() => {
    hver.value;
    const y = calYear.value, m = calMonth.value;
    const firstWd = (C.weekdayOf(C.fmtDate(y, m, 1)) + 6) % 7; // 周一=0
    const dim = C.daysInMonth(y, m);
    const prevM = m === 1 ? 12 : m - 1, prevY = m === 1 ? y - 1 : y;
    const nextM = m === 12 ? 1 : m + 1, nextY = m === 12 ? y + 1 : y;
    const prevDim = C.daysInMonth(prevY, prevM);
    const cells = [];
    const push = (yy, mm, dd, inMonth) => {
      const ds = C.fmtDate(yy, mm, dd);
      const rec = state.records[ds];
      cells.push({
        key: ds, d: dd, inMonth,
        kind: C.dayKind(ds, H, schedule.value),
        status: rec ? rec.status : '',
        ot: rec ? (Number(rec.ot) || 0) : 0,
        name: globalThis.HOLIDAY_NAMES[ds] || '',
      });
    };
    for (let i = 0; i < firstWd; i++) push(prevY, prevM, prevDim - firstWd + 1 + i, false);
    for (let d = 1; d <= dim; d++) push(y, m, d, true);
    while (cells.length < 42) {
      const i = cells.length - firstWd - dim;
      push(nextY, nextM, i + 1, false);
    }
    return cells;
  });
  const calStat = computed(() => { hver.value; return C.monthStats(calYear.value, calMonth.value, state.records, H, schedule.value); });
  const calHasRecords = computed(() => calStat.value.recorded > 0);
  const calOtPay = computed(() => { hver.value; return C.calcYear(calYear.value, effSettings.value, state.records, H).months[calMonth.value - 1].otPay; });
  const calTimeoff = computed(() => { hver.value; return C.calcYear(calYear.value, effSettings.value, state.records, H).months[calMonth.value - 1].timeoffHours; });
  const calYearHint = computed(() => {
    hver.value;
    const st = globalThis.HolidayUpdater ? globalThis.HolidayUpdater.status(calYear.value) : 'ok';
    if (st === 'loading') return `${calYear.value} 年节假日数据获取中…`;
    if (!H[calYear.value]) return `${calYear.value} 年节假日安排暂未获取(未公布或离线),按周末规则推断`;
    return '';
  });
  function calShift(delta) {
    let m = calMonth.value + delta, y = calYear.value;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    calMonth.value = m; calYear.value = y;
  }

  /* ---------- 工资页 ---------- */
  const payYear = ref(now.y);
  const payMonth = ref(now.m);
  const yearResult = computed(() => { hver.value; return C.calcYear(payYear.value, effSettings.value, state.records, H); });
  const pay = computed(() => yearResult.value.months[payMonth.value - 1]);
  const chartData = computed(() => yearResult.value.months.map(m => ({
    label: `${m.month}`, net: m.recorded ? m.net : 0, cur: m.month === payMonth.value,
  })));
  const hasYearRecords = computed(() => yearResult.value.months.some(m => m.recorded));
  const payRecordedDays = computed(() => Object.keys(state.records).filter(date => date.startsWith(`${payYear.value}-${String(payMonth.value).padStart(2, '0')}-`)).length);
  const chartMax = computed(() => Math.max(...chartData.value.map(c => c.net), 1));
  function payShift(delta) {
    let m = payMonth.value + delta, y = payYear.value;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    payMonth.value = m; payYear.value = y;
  }
  const percentStr = r => `${Math.round((Number(r) || 0) * 10000) / 100}%`;

  /* ---------- 攒钱页(储蓄目标与存款流水) ---------- */
  const GOAL_TEMPLATES = [
    { icon: '✈️', name: '旅行基金' },
    { icon: '💕', name: '恋爱基金' },
    { icon: '🛟', name: '应急备用金' },
    { icon: '🏠', name: '买房首付' },
    { icon: '🚗', name: '买车基金' },
    { icon: '💻', name: '数码心愿' },
    { icon: '💍', name: '婚礼基金' },
    { icon: '📚', name: '学习提升' },
    { icon: '🏋️', name: '健身变美' },
    { icon: '🐱', name: '宠物基金' },
    { icon: '🧧', name: '孝亲红包' },
    { icon: '🎁', name: '心愿清单' },
  ];
  const savYear = computed(() =>
    SAVINGS.yearProjection(effSettings.value, state.savings.goals, state.savings.deposits, todayStr.slice(0, 7)));
  const goalCards = computed(() => state.savings.goals
    .map(g => ({
      ...g,
      ...SAVINGS.goalProgress(g, state.savings.deposits),
      deposits: state.savings.deposits
        .filter(d => d.goalId === g.id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    }))
    .sort((a, b) => ((a.pct >= 100 ? 1 : 0) - (b.pct >= 100 ? 1 : 0)) || (b.pct - a.pct)));
  const expandedGoal = ref('');

  const goalDraft = reactive({ open: false, editId: '', name: '', icon: '✈️', target: 20000, monthlyPlan: 1000 });
  function openGoalEditor(g) {
    if (g) Object.assign(goalDraft, { open: true, editId: g.id, name: g.name, icon: g.icon, target: g.target, monthlyPlan: g.monthlyPlan || '' });
    else Object.assign(goalDraft, { open: true, editId: '', name: '', icon: '✈️', target: 20000, monthlyPlan: 1000 });
  }
  function applyTemplate(t) { goalDraft.name = t.name; goalDraft.icon = t.icon; }
  function saveGoal() {
    const name = (goalDraft.name || '').trim();
    if (!name) { showToast('先给目标起个名字'); return; }
    const target = Number(goalDraft.target) || 0;
    if (target <= 0) { showToast('目标金额要大于 0'); return; }
    const fields = { name, icon: goalDraft.icon, target, monthlyPlan: Number(goalDraft.monthlyPlan) || 0 };
    if (goalDraft.editId) {
      const g = state.savings.goals.find(x => x.id === goalDraft.editId);
      if (g) Object.assign(g, fields);
      showToast('目标已更新');
    } else {
      state.savings.goals.push({ id: 'g' + Date.now().toString(36), createdAt: new Date().toISOString(), ...fields });
      showToast('目标已创建,开始攒!');
    }
    goalDraft.open = false;
  }
  function deleteGoal(id) {
    const g = state.savings.goals.find(x => x.id === id);
    const n = state.savings.deposits.filter(d => d.goalId === id).length;
    if (!confirm(`删除目标「${g ? g.name : ''}」?${n ? `其 ${n} 笔存款记录将一并删除。` : ''}`)) return;
    state.savings.goals = state.savings.goals.filter(x => x.id !== id);
    state.savings.deposits = state.savings.deposits.filter(d => d.goalId !== id);
    if (expandedGoal.value === id) expandedGoal.value = '';
    showToast('目标已删除');
  }

  const depDraft = reactive({ open: false, goalId: '', amount: 500, date: todayStr, note: '' });
  function openDeposit(goalId) {
    if (!state.savings.goals.length) { showToast('先创建一个储蓄目标'); openGoalEditor(); return; }
    const gid = goalId || (state.savings.goals[0] && state.savings.goals[0].id) || '';
    Object.assign(depDraft, { open: true, goalId: gid, amount: 500, date: todayStr, note: '' });
  }
  function saveDeposit() {
    const amount = Number(depDraft.amount);
    if (!depDraft.goalId) { showToast('选择一个目标'); return; }
    if (!(amount > 0)) { showToast('金额要大于 0'); return; }
    state.savings.deposits.push({
      id: 'd' + Date.now().toString(36),
      goalId: depDraft.goalId,
      amount: Math.round(amount * 100) / 100,
      date: depDraft.date || todayStr,
      note: (depDraft.note || '').trim(),
    });
    depDraft.open = false;
    showToast('存入成功,离目标又近一步!');
  }
  function deleteDeposit(id) {
    state.savings.deposits = state.savings.deposits.filter(d => d.id !== id);
    showToast('已删除该笔存款');
  }

  /* ---------- 设置页 / 数据管理 ---------- */
  const siOpen = ref(false);
  const pay0 = thisMonthPay; // 今日页加班费预估用当月时薪
  const draftDateLabel = computed(() => {
    if (!draft.date) return '';
    const [, m, d] = draft.date.split('-').map(Number);
    const wd = WEEKDAYS[(C.weekdayOf(draft.date) + 6) % 7];
    return `${m}月${d}日 · 周${wd}`;
  });
  const draftKindLabel = computed(() => {
    if (!draft.date) return '';
    hver.value;
    const k = C.dayKind(draft.date, H);
    const name = globalThis.HOLIDAY_NAMES[draft.date];
    const map = { holiday: '法定节假日', makeup: '调休上班日', weekend: '周末', workday: '工作日' };
    return name || map[k];
  });
  const pctField = key => computed({
    get: () => Math.round((Number(state.settings[key]) || 0) * 1000) / 10,
    set: v => { state.settings[key] = (Number(v) || 0) / 100; },
  });
  const pensionPct = pctField('pensionRate');
  const medicalPct = pctField('medicalRate');
  const unemploymentPct = pctField('unemploymentRate');
  const cityList = computed(() => Object.entries(CITY).map(([k, v]) => ({ k, name: v.name })));
  const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
  const timePicker = reactive({ open: false, target: 'start', hour: '09', minute: '00' });
  const hourWheel = ref(null);
  const minuteWheel = ref(null);
  function scrollWheelTo(kind, value) {
    const wheel = kind === 'hour' ? hourWheel.value : minuteWheel.value;
    if (!wheel) return;
    const option = wheel.querySelector(`[data-value="${value}"]`);
    if (!option) return;
    wheel.scrollTop = option.offsetTop - (wheel.clientHeight - option.offsetHeight) / 2;
  }
  function openTimePicker(target) {
    const value = target === 'start' ? state.settings.workTimeStart : state.settings.workTimeEnd;
    const [hour, minute] = String(value || (target === 'start' ? '09:00' : '18:00')).split(':');
    Object.assign(timePicker, { open: true, target, hour: hourOptions.includes(hour) ? hour : '00', minute: minuteOptions.includes(minute) ? minute : '00' });
    nextTick(() => { scrollWheelTo('hour', timePicker.hour); scrollWheelTo('minute', timePicker.minute); });
  }
  function syncWheelValue(kind, event) {
    const wheel = event.currentTarget;
    const center = wheel.scrollTop + wheel.clientHeight / 2;
    let closest = null, distance = Infinity;
    wheel.querySelectorAll('[data-value]').forEach(option => {
      const gap = Math.abs(option.offsetTop + option.offsetHeight / 2 - center);
      if (gap < distance) { closest = option; distance = gap; }
    });
    if (closest) timePicker[kind] = closest.dataset.value;
  }
  function chooseWheelValue(kind, value) {
    timePicker[kind] = value;
    nextTick(() => scrollWheelTo(kind, value));
  }
  function saveTimePicker() {
    const value = `${timePicker.hour}:${timePicker.minute}`;
    if (timePicker.target === 'start') state.settings.workTimeStart = value;
    else state.settings.workTimeEnd = value;
    timePicker.open = false;
  }
  const housingPct = computed({
    get: () => Math.round(state.settings.housingRate * 1000) / 10,
    set: v => { state.settings.housingRate = (Number(v) || 0) / 100; },
  });
  const insuranceSummary = computed(() => {
    const enabled = (state.settings.insuranceItems || []).filter(item => item.enabled !== false);
    const totalRate = enabled.reduce((sum, item) => sum + (Number(item.rate) || 0), 0);
    return `${enabled.length} 项启用 · 合计 ${Math.round(totalRate * 10000) / 100}%`;
  });
  const insuranceTitle = computed(() => {
    const housing = (state.settings.insuranceItems || []).find(item => item.id === 'housing');
    return housing && housing.enabled !== false ? '五险一金' : '五险（无公积金）';
  });
  const socialDeductionInfo = computed(() => {
    const social = C.socialInsurance(effSettings.value);
    return {
      ratePersonal: social.rateTotal,
      contractTotal: social.contractTotal,
      contractPersonal: social.contractPersonal,
      current: social.total,
      mode: social.deductionMode,
    };
  });
  function setHousingEnabled(enabled) {
    const housing = (state.settings.insuranceItems || []).find(item => item.id === 'housing');
    if (housing) housing.enabled = enabled;
  }
  const socialBaseInfo = computed(() => {
    const source = Number(effSettings.value.sbBase) || 0;
    const floor = Number(effSettings.value.sbFloor) || 0;
    const ceiling = Number(effSettings.value.sbCeiling) || 0;
    const actual = C.socialInsurance(effSettings.value).base;
    let reason = '按填写的缴费基数计算';
    if (source < floor) reason = '低于下限，按下限计算';
    else if (source > ceiling) reason = '高于上限，按上限计算';
    return { source, floor, ceiling, actual, reason };
  });
  function isCompanyOnlyInsurance(item) { return item.companyOnly === true || ['work_injury', 'maternity'].includes(item.id); }
  function setInsuranceRate(item, value) {
    item.rate = Math.max(0, Number(value) || 0) / 100;
    if (item.id === 'pension') state.settings.pensionRate = item.rate;
    if (item.id === 'medical') state.settings.medicalRate = item.rate;
    if (item.id === 'unemployment') state.settings.unemploymentRate = item.rate;
    if (item.id === 'housing') state.settings.housingRate = item.rate;
  }
  function addInsurance() {
    state.settings.insuranceItems.push({ id: `custom-${Date.now().toString(36)}`, name: '新险种', enabled: true, rate: 0 });
    showToast('已添加自定义险种');
  }
  function removeInsurance(item) {
    if (['pension', 'medical', 'unemployment', 'housing'].includes(item.id)) { item.enabled = false; showToast('已停用该险种'); return; }
    state.settings.insuranceItems = state.settings.insuranceItems.filter(x => x.id !== item.id);
    showToast('已删除自定义险种');
  }

  function doExport() {
    const blob = new Blob([DB.exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `打工账本备份-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出备份文件');
  }
  function doExportCSV() {
    const blob = new Blob([DB.exportCSV(state, globalThis.HOLIDAY_NAMES)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `打工账本数据-${todayStr}.csv`; a.click(); URL.revokeObjectURL(a.href);
    showToast('已导出 Excel 兼容表格');
  }
  function doExportXLSX() {
    const xlsx = globalThis.XLSX;
    if (!xlsx) { showToast('Excel 模块尚未加载,请稍后重试'); return; }
    const wb = xlsx.utils.book_new();
    const status = { work: '出勤', rest: '休息', leave_paid: '带薪假', leave_unpaid: '无薪假', sick: '病假', absent: '旷工' };
    const rows = [['日期', '星期', '出勤状态', '加班时长(小时)', '加班类型', '备注']];
    Object.keys(state.records || {}).sort().forEach(date => { const r = state.records[date] || {}; const d = new Date(`${date}T00:00:00`); rows.push([date, ['日','一','二','三','四','五','六'][d.getDay()], status[r.status] || r.status || '', r.ot || 0, r.otType || '自动判定', r.note || '']); });
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), '考勤明细');
    const goals = Object.fromEntries((state.savings.goals || []).map(g => [g.id, g.name]));
    const savings = [['日期', '金额', '目标ID', '目标名称', '备注']];
    (state.savings.deposits || []).forEach(d => savings.push([d.date, d.amount, d.goalId || '', goals[d.goalId] || '', d.note || '']));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(savings), '储蓄记录');
    const wages = [['月份', '基本工资', '补贴', '加班费', '缺勤扣款', '五险一金', '个税', '预计实发工资']];
    yearResult.value.months.filter(m => m.recorded).forEach(m => wages.push([m.label, m.gross - m.allowance - m.otPay + m.deduction, m.allowance, m.otPay, m.deduction, m.social.total, m.tax, m.net]));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(wages), '工资估算');
    const settingRows = [['项目', '值'], ['月薪基数', state.settings.baseSalary], ['城市', state.settings.city], ['排班', state.settings.workType], ['数据说明', '所有数据仅保存在本设备']];
    state.settings.insuranceItems.forEach(item => settingRows.push([`险种:${item.id}`, `${item.name}|${item.enabled ? 1 : 0}|${item.rate}`]));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(settingRows), '设置说明');
    xlsx.writeFile(wb, `打工账本-${todayStr}.xlsx`);
    showToast('已导出 Excel 文件');
  }
  function parseSpreadsheetRows(rows) {
    const header = rows[0] || [];
    const index = name => header.indexOf(name);
    const dateI = index('日期'), statusI = index('出勤状态'), otI = index('加班时长(小时)'), typeI = index('加班类型'), noteI = index('备注');
    const statusMap = { '出勤': 'work', '休息': 'rest', '带薪假': 'leave_paid', '无薪假': 'leave_unpaid', '病假': 'sick', '旷工': 'absent' };
    const typeMap = { '工作日 ×1.5': 'workday', '周末 ×2': 'weekend', '法定节假日 ×3': 'holiday', '自动判定': '' };
    const records = {};
    rows.slice(1).forEach(row => {
      const date = String(row[dateI] || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      records[date] = { status: statusMap[row[statusI]] || row[statusI] || 'work', ot: Number(row[otI]) || 0, otType: typeMap[row[typeI]] || row[typeI] || '', note: row[noteI] || '' };
    });
    return records;
  }
  function onImportSpreadsheetFile(ev) {
    const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!file) return;
    if (!globalThis.XLSX) { alert('Excel 模块尚未加载'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const xlsx = globalThis.XLSX;
        const book = xlsx.read(reader.result, { type: 'array', cellDates: true });
        const attendanceSheet = book.Sheets['考勤明细'] || book.Sheets[book.SheetNames[0]];
        const attendanceRows = xlsx.utils.sheet_to_json(attendanceSheet, { header: 1, raw: false });
        const records = parseSpreadsheetRows(attendanceRows);
        const savingsSheet = book.Sheets['储蓄记录'];
        const savingsRows = savingsSheet ? xlsx.utils.sheet_to_json(savingsSheet, { header: 1, raw: false }) : (() => { const start = attendanceRows.findIndex(row => row[0] === '储蓄记录'); return start >= 0 ? attendanceRows.slice(start + 1) : []; })();
        const sh = savingsRows[0] || [];
        const si = sh.indexOf('日期'), ai = sh.indexOf('金额'), gi = sh.indexOf('目标ID'), ni = sh.indexOf('备注');
        const deposits = savingsRows.slice(1).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(String(row[si] || '').slice(0, 10))).map(row => ({ id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date: String(row[si]).slice(0, 10), amount: Number(row[ai]) || 0, goalId: row[gi] || '', note: row[ni] || '' }));
        const settingSheet = book.Sheets['设置说明'];
        const settingRows = settingSheet ? xlsx.utils.sheet_to_json(settingSheet, { header: 1, raw: false }) : [];
        const importedSettings = {};
        const importedItems = [];
        settingRows.slice(1).forEach(row => {
          const key = String(row[0] || ''), value = row[1];
          if (key === '月薪基数') importedSettings.baseSalary = Number(value) || 0;
          if (key === '城市') importedSettings.city = value;
          if (key === '排班') importedSettings.workType = value;
          if (key.startsWith('险种:')) {
            const [name, enabled, rate] = String(value || '').split('|');
            importedItems.push({ id: key.slice(3), name: name || key.slice(3), enabled: enabled !== '0', rate: Number(rate) || 0 });
          }
        });
        if (!confirm(`将导入 ${Object.keys(records).length} 条考勤记录和 ${deposits.length} 笔储蓄记录，并覆盖现有记录。继续?`)) return;
        state.records = records;
        if (deposits.length) state.savings.deposits = deposits;
        Object.assign(state.settings, importedSettings);
        if (importedItems.length) state.settings.insuranceItems = importedItems;
        state.settings.insuranceItems.forEach(item => { if (item.id === 'pension') state.settings.pensionRate = item.rate; if (item.id === 'medical') state.settings.medicalRate = item.rate; if (item.id === 'unemployment') state.settings.unemploymentRate = item.rate; if (item.id === 'housing') state.settings.housingRate = item.rate; });
        showToast('表格导入成功');
      } catch (e) { alert(`表格导入失败:${e.message}`); }
    };
    reader.readAsArrayBuffer(file);
  }
  function onImportFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { records, settings } = DB.importJSON(reader.result);
        if (!confirm(`将导入 ${Object.keys(records).length} 条日期记录,并覆盖当前设置。继续?`)) return;
        state.records = records;
        Object.assign(state.settings, settings);
        const imported = DB.importJSON(reader.result);
        if (imported.savings) state.savings = imported.savings;
        showToast('导入成功');
      } catch (e) {
        alert('导入失败:' + e.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }
  function doClear() {
    if (!confirm('确定清空所有考勤记录吗?此操作不可恢复(建议先导出备份)。')) return;
    state.records = {};
    showToast('已清空全部记录');
  }

  /* ---------- 挂载 ---------- */
  createApp({
    setup() {
      loadDraft(todayStr, false); // 今日页常驻草稿(须在 setup 上下文中初始化)
      // 节假日数据自动更新:切到新年份时按需在线拉取,完成后 hver 自增触发重算
      if (globalThis.HolidayUpdater) {
        globalThis.HolidayUpdater.init(() => { hver.value++; });
        watch([calYear, payYear], (years) => {
          years.forEach(y => globalThis.HolidayUpdater.ensureYear(y));
        });
      }
      return {
        state, page, toast, showToast, storageOk,
        effSettings, applyCity, schedule, cityName,
        STATUS_META, OT_TYPE_LABEL, WEEKDAYS, fmtMoney,
        draft, loadDraft, saveDraft, clearDraft, inferredOtType,
        draftDateLabel, draftKindLabel, siOpen, pay0,
        pensionPct, medicalPct, unemploymentPct,
        todayStr, todayRec, todayKindLabel, todayHolidayName, todayOtType, todayOtRate,
        thisMonthPay, now, workStatus, setAnchor, thisWeekendHint, fmtDur,
        GOAL_TEMPLATES, savYear, goalCards, expandedGoal,
        goalDraft, openGoalEditor, applyTemplate, saveGoal, deleteGoal,
        depDraft, openDeposit, saveDeposit, deleteDeposit,
        calYear, calMonth, calCells, calStat, calHasRecords, calOtPay, calShift, calYearHint, calTimeoff,
        payYear, payMonth, pay, payRecordedDays, hasYearRecords, chartData, chartMax, payShift, percentStr,
        cityList, hourOptions, minuteOptions, timePicker, hourWheel, minuteWheel, openTimePicker, syncWheelValue, chooseWheelValue, saveTimePicker,
        housingPct, insuranceSummary, insuranceTitle, socialDeductionInfo, socialBaseInfo, isCompanyOnlyInsurance, setHousingEnabled, setInsuranceRate, addInsurance, removeInsurance,
        doExport, doExportCSV, doExportXLSX, onImportFile, onImportSpreadsheetFile, doClear,
      };
    },
  }).mount('#app');
})();

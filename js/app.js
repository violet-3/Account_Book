/* =========================================================
 * app.js — Vue 3 应用逻辑
 * 页面:今日打卡 / 出勤日历 / 工资估算 / 设置
 * ========================================================= */
(function () {
  'use strict';
  const { createApp, reactive, ref, computed, watch } = Vue;
  const H = globalThis.HOLIDAYS;
  const CITY = globalThis.CITY_DATA;
  const C = globalThis.CALC;

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
    const inferred = inferredStatus(draft.date);
    const empty = draft.status === inferred && !draft.ot && !draft.note;
    if (empty) delete state.records[draft.date];
    else state.records[draft.date] = {
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

  /* 今日页本月概览 */
  const now = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  const thisMonthStat = computed(() => { hver.value; return C.monthStats(now.y, now.m, state.records, H, schedule.value); });
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
    label: `${m.month}`, net: m.net, cur: m.month === payMonth.value,
  })));
  const chartMax = computed(() => Math.max(...chartData.value.map(c => c.net), 1));
  function payShift(delta) {
    let m = payMonth.value + delta, y = payYear.value;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    payMonth.value = m; payYear.value = y;
  }
  const percentStr = r => `${Math.round((Number(r) || 0) * 10000) / 100}%`;

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
  const housingPct = computed({
    get: () => Math.round(state.settings.housingRate * 1000) / 10,
    set: v => { state.settings.housingRate = (Number(v) || 0) / 100; },
  });

  function doExport() {
    const blob = new Blob([DB.exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `打工账本备份-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('已导出备份文件');
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
        thisMonthStat, thisMonthPay, now, workStatus, setAnchor, thisWeekendHint, fmtDur,
        calYear, calMonth, calCells, calStat, calOtPay, calShift, calYearHint, calTimeoff,
        payYear, payMonth, pay, chartData, chartMax, payShift, percentStr,
        cityList, housingPct,
        doExport, onImportFile, doClear,
      };
    },
  }).mount('#app');
})();

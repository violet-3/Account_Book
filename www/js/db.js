/* =========================================================
 * db.js — 本地持久层(localStorage)
 * 所有数据保存在浏览器本地,不上传任何服务器;
 * 支持导出/导入 JSON 备份。
 * ========================================================= */
(function (root) {
  'use strict';

  const KEY = 'dagong-ledger-v1';

  const DEFAULT_SETTINGS = {
    city: 'beijing',
    customCityName: '',      // 自定义城市名称
    baseSalary: 10000,       // 月薪基数
    monthlyAllowance: 0,     // 每月固定补贴(计税)
    workTimeStart: '09:00',  // 上班时间
    workTimeEnd: '18:00',    // 下班时间
    workType: 'two',         // 排班:two 双休 | one 单休 | bigsmall 大小周
    anchorWeekStart: '',     // 大小周锚点:某周的周一(YYYY-MM-DD)
    anchorType: 'big',       // 锚点周类型:big 大周(双休) | small 小周(单休)
    sbBaseMode: 'salary',    // 社保基数:'salary'按月薪 | 'custom'手动
    sbBaseCustom: 10000,
    sbFloor: 6821,           // 缴费基数下限(随城市初始化,可改)
    sbCeiling: 35283,
    pensionRate: 0.08,
    medicalRate: 0.02,
    unemploymentRate: 0.005,
    housingRate: 0.12,       // 公积金个人比例
    otComp: 'pay',           // 加班补偿:'pay'加班费 | 'timeoff'调休折算 | 'none'仅记录
    otRateWorkday: 1.5,
    otRateWeekend: 2,
    otRateHoliday: 3,
    specialDeduction: 0,     // 每月专项附加扣除合计
  };

  function defaults() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      records: {},            // 'YYYY-MM-DD': {status, ot, otType, note}
      savings: { goals: [], deposits: [] }, // 储蓄目标与存款流水
      createdAt: new Date().toISOString(),
    };
  }

  function probeStorage() {
    try {
      const k = '__dagong_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }
  const storage = { ok: probeStorage() };

  function loadState() {
    if (!storage.ok) return defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      return {
        ...defaults(),
        ...data,
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        records: data.records || {},
        savings: {
          goals: (data.savings && data.savings.goals) || [],
          deposits: (data.savings && data.savings.deposits) || [],
        },
      };
    } catch {
      console.warn('本地数据读取失败,已重置');
      return defaults();
    }
  }

  function saveState(state) {
    if (!storage.ok) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: state.version,
        settings: state.settings,
        records: state.records,
        savings: state.savings,
        createdAt: state.createdAt,
        savedAt: new Date().toISOString(),
      }));
      return true;
    } catch (e) {
      console.warn('本地保存失败', e);
      return false;
    }
  }

  function exportJSON(state) {
    return JSON.stringify({
      app: '打工人账本',
      version: state.version,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      records: state.records,
      savings: state.savings,
    }, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
    const records = data.records && typeof data.records === 'object' ? data.records : {};
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    const savings = {
      goals: (data.savings && data.savings.goals) || [],
      deposits: (data.savings && data.savings.deposits) || [],
    };
    return { records, settings, savings };
  }

  function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCSV(state) {
    const rows = [['日期', '星期', '出勤状态', '加班时长(小时)', '加班类型', '备注']];
    const status = { work: '出勤', rest: '休息', leave_paid: '带薪假', leave_unpaid: '无薪假', sick: '病假', absent: '旷工' };
    const otType = { workday: '工作日 ×1.5', weekend: '周末 ×2', holiday: '法定节假日 ×3', auto: '自动判定' };
    Object.keys(state.records || {}).sort().forEach(date => {
      const rec = state.records[date] || {};
      const d = new Date(`${date}T00:00:00`);
      rows.push([date, ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], status[rec.status] || rec.status || '', rec.ot || 0, otType[rec.otType || 'auto'], rec.note || '']);
    });
    rows.push([]);
    rows.push(['储蓄记录']);
    rows.push(['日期', '金额', '目标', '备注']);
    const goals = Object.fromEntries((state.savings && state.savings.goals || []).map(g => [g.id, g.name]));
    (state.savings && state.savings.deposits || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(d => rows.push([d.date, d.amount, goals[d.goalId] || '', d.note || '']));
    return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  root.DB = { KEY, DEFAULT_SETTINGS, defaults, loadState, saveState, exportJSON, importJSON, exportCSV, storage };
})(typeof window !== 'undefined' ? window : globalThis);

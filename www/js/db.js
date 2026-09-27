/* =========================================================
 * db.js — 本地持久层(localStorage)
 * 主账本只保存 WANGCAI_SECURE 密封包；旧明文只用于一次性迁移。
 * ========================================================= */
(function (root) {
  'use strict';

  const KEY = 'dagong-ledger-v1';
  const VAULT_KEY = 'wangcai-vault-v1';

  const DEFAULT_SETTINGS = {
    city: 'beijing',
    customCityName: '',      // 自定义城市名称
    baseSalary: 10000,       // 月薪基数
    monthlyAllowance: 0,     // 每月固定补贴(计税)
    workTimeStart: '09:00',  // 上班时间
    workTimeEnd: '18:00',    // 下班时间
    workType: 'two',         // 排班:two 双休 | one 单休 | bigsmall 大小周 | shift 轮班 | flexible 弹性
    anchorWeekStart: '',     // 大小周锚点:某周的周一(YYYY-MM-DD)
    anchorType: 'big',       // 锚点周类型:big 大周(双休) | small 小周(单休)
    shiftAnchorDate: '',     // 轮班周期起算日
    shiftWorkDays: 2,        // 轮班连续上班天数
    shiftRestDays: 2,        // 轮班连续休息天数
    sbBaseMode: 'salary',    // 社保基数:'salary'按月薪 | 'custom'手动
    sbBaseCustom: 10000,
    sbFloor: 6821,           // 缴费基数下限(随城市初始化,可改)
    sbCeiling: 35283,
    insuranceDeductionMode: 'rate', // rate=按个人比例 | contract=按合同固定个人分摊
    contractInsuranceTotal: 0,      // 合同约定的单位+个人五险/五险一金总额
    contractEmployeeShare: 0.5,     // 合同约定个人分摊比例
    pensionRate: 0.08,
    medicalRate: 0.02,
    unemploymentRate: 0.005,
    housingRate: 0.12,       // 公积金个人比例
    insuranceItems: [
      { id: 'pension', name: '养老保险', enabled: true, rate: 0.08 },
      { id: 'medical', name: '医疗保险', enabled: true, rate: 0.02 },
      { id: 'unemployment', name: '失业保险', enabled: true, rate: 0.005 },
      { id: 'work_injury', name: '工伤保险', enabled: true, rate: 0, companyOnly: true },
      { id: 'maternity', name: '生育保险', enabled: true, rate: 0, companyOnly: true },
      { id: 'housing', name: '住房公积金', enabled: true, rate: 0.12 },
    ],
    otComp: 'pay',           // 加班补偿:'pay'加班费 | 'timeoff'调休折算 | 'none'仅记录
    otRateWorkday: 1.5,
    otRateWeekend: 2,
    otRateHoliday: 3,
    specialDeduction: 0,     // 每月专项附加扣除合计
    taxCarryTaxable: 0,      // 开始记账前已知的累计应纳税所得额
    taxCarryPaid: 0,         // 开始记账前已预缴个税
  };

  function defaults() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, insuranceItems: DEFAULT_SETTINGS.insuranceItems.map(x => ({ ...x })) },
      records: {},            // 'YYYY-MM-DD': {status, ot, otType, note}
      savings: { goals: [], deposits: [] }, // 储蓄目标与存款流水
      evidence: { events: [] }, // 操作时间线；原始附件密文在 IndexedDB
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

  function normalizeState(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings) ||
          !data.records || typeof data.records !== 'object' || Array.isArray(data.records) ||
          (data.savings !== undefined && (!data.savings || typeof data.savings !== 'object' ||
            !Array.isArray(data.savings.goals) || !Array.isArray(data.savings.deposits))) ||
          (data.evidence !== undefined && (!data.evidence || !Array.isArray(data.evidence.events)))) {
        throw new Error('账本数据不完整，已停止读取');
      }
      const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      if (!data.settings || !Array.isArray(data.settings.insuranceItems)) {
        settings.insuranceItems = [
          { id: 'pension', name: '养老保险', enabled: true, rate: Number(settings.pensionRate) || 0 },
          { id: 'medical', name: '医疗保险', enabled: true, rate: Number(settings.medicalRate) || 0 },
          { id: 'unemployment', name: '失业保险', enabled: true, rate: Number(settings.unemploymentRate) || 0 },
          { id: 'work_injury', name: '工伤保险', enabled: true, rate: 0, companyOnly: true },
          { id: 'maternity', name: '生育保险', enabled: true, rate: 0, companyOnly: true },
          { id: 'housing', name: '住房公积金', enabled: true, rate: Number(settings.housingRate) || 0 },
        ];
      }
      return {
        ...defaults(),
        ...data,
        settings: { ...settings, insuranceItems: normalizeInsuranceItems(settings.insuranceItems) },
        records: data.records || {},
        savings: {
          goals: (data.savings && data.savings.goals) || [],
          deposits: (data.savings && data.savings.deposits) || [],
        },
        evidence: { events: data.evidence?.events || [] },
      };
  }

  function inspect() {
    if (!storage.ok) return 'unavailable';
    try {
      if (localStorage.getItem(VAULT_KEY) !== null) return 'unlock';
      if (localStorage.getItem(KEY) !== null) return 'migrate';
      return 'setup';
    } catch { return 'unavailable'; }
  }
  function readLegacy() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) throw new Error('没有找到旧账本');
    return normalizeState(JSON.parse(raw));
  }
  function readVault() {
    const raw = localStorage.getItem(VAULT_KEY);
    if (raw === null) throw new Error('没有找到加密账本');
    return JSON.parse(raw);
  }
  function writeVault(vault) {
    if (!storage.ok) throw new Error('本地存储不可用');
    const raw = JSON.stringify(vault);
    localStorage.setItem(VAULT_KEY, raw);
    if (localStorage.getItem(VAULT_KEY) !== raw) throw new Error('加密账本写入校验失败');
  }
  function removeLegacy() {
    localStorage.removeItem(KEY);
    if (localStorage.getItem(KEY) !== null) throw new Error('旧明文账本未能移除');
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
    const records = data.records && typeof data.records === 'object' ? data.records : {};
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    settings.insuranceItems = normalizeInsuranceItems(settings.insuranceItems);
    const savings = {
      goals: (data.savings && data.savings.goals) || [],
      deposits: (data.savings && data.savings.deposits) || [],
    };
    return { records, settings, savings };
  }

  function normalizeInsuranceItems(items) {
    if (!Array.isArray(items) || !items.length) return DEFAULT_SETTINGS.insuranceItems.map(x => ({ ...x }));
    const normalized = items.filter(x => x && x.id).map(x => ({
      id: String(x.id), name: String(x.name || x.id), enabled: x.enabled !== false,
      rate: Number(x.rate) >= 0 ? Number(x.rate) : 0, companyOnly: x.companyOnly === true,
    }));
    const byId = new Map(normalized.map(x => [x.id, x]));
    const builtin = DEFAULT_SETTINGS.insuranceItems.map(base => ({ ...base, ...(byId.get(base.id) || {}) }));
    const custom = normalized.filter(x => !DEFAULT_SETTINGS.insuranceItems.some(base => base.id === x.id));
    return [...builtin, ...custom];
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

  root.DB = { KEY, VAULT_KEY, DEFAULT_SETTINGS, defaults, normalizeState, inspect, readLegacy,
    readVault, writeVault, removeLegacy, importJSON, exportCSV, storage };
})(typeof window !== 'undefined' ? window : globalThis);

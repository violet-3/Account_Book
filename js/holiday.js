/* =========================================================
 * holiday.js — 法定节假日数据自动更新
 *
 * 策略:离线优先 + 在线增量
 * 1. 内置(data.js)已覆盖 2025–2026 年官方安排;
 * 2. 其他年份首次访问时,自动从 holiday-cn 开源数据仓库
 *    (NateScarlet/holiday-cn,依据国务院办公厅通知逐年底更新)
 *    经 jsDelivr CDN 拉取,并缓存到 localStorage;
 * 3. 拉取失败(离线/未公布)时按周末规则推断,不影响使用。
 * ========================================================= */
(function (root) {
  'use strict';

  const CACHE_KEY = 'dagong-holiday-cache-v1';
  const FAIL_COOLDOWN = 10 * 60 * 1000; // 拉取失败后的重试冷却
  const SOURCES = [
    y => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
    y => `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  ];

  const st = { loading: {}, failed: {}, listeners: [] };

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
  }
  function saveCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* 存储不可用时仅内存生效 */ }
  }

  /* 解析 holiday-cn 数据格式:
   * { year: 2026, days: [{ name:'元旦', date:'2026-01-01', isOffDay:true }, ...] }
   * → { year, holidays:[], makeup:[], names:{} } (names 取每段连续假期的首日)
   */
  function parseHolidayCN(payload) {
    if (!payload || !Array.isArray(payload.days)) throw new Error('invalid holiday payload');
    const holidays = [];
    const makeup = [];
    const names = {};
    let prevName = null;
    for (const d of payload.days) {
      if (!d || !d.date) continue;
      if (d.isOffDay) {
        holidays.push(d.date);
        if (d.name && d.name !== prevName) { names[d.date] = d.name; prevName = d.name; }
      } else {
        makeup.push(d.date);
        prevName = null;
      }
    }
    return { year: Number(payload.year), holidays, makeup, names };
  }

  function applyToGlobals(parsed) {
    root.HOLIDAYS[parsed.year] = { holidays: parsed.holidays, makeup: parsed.makeup };
    Object.assign(root.HOLIDAY_NAMES, parsed.names);
  }

  async function fetchYear(year) {
    let lastErr = null;
    for (const src of SOURCES) {
      try {
        const res = await fetch(src(year));
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        return parseHolidayCN(await res.json());
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('all holiday sources failed');
  }

  /* 确保某年数据可用:内置/已缓存/已在拉取中则直接返回 */
  async function ensureYear(year) {
    year = Number(year);
    if (!year || root.HOLIDAYS[year]) return 'ok';
    if (st.loading[year]) return 'loading';
    if (st.failed[year] && Date.now() - st.failed[year] < FAIL_COOLDOWN) return 'unavailable';
    st.loading[year] = true;
    try {
      const parsed = await fetchYear(year);
      applyToGlobals(parsed);
      const cache = loadCache();
      cache[year] = parsed;
      saveCache(cache);
      st.listeners.forEach(fn => { try { fn(year); } catch { /* 监听器异常互不影响 */ } });
      return 'ok';
    } catch {
      st.failed[year] = Date.now();
      return 'unavailable';
    } finally {
      delete st.loading[year];
    }
  }

  /* 某年数据当前状态:'ok' | 'loading' | 'unavailable' */
  function status(year) {
    year = Number(year);
    if (root.HOLIDAYS[year]) return 'ok';
    if (st.loading[year]) return 'loading';
    return 'unavailable';
  }

  /* 应用启动:恢复缓存 → 注册更新回调 → 预取今年与明年(未内置的) */
  function init(onUpdate) {
    const cache = loadCache();
    Object.keys(cache).forEach(y => {
      try { applyToGlobals(cache[y]); } catch { /* 单条缓存损坏则忽略 */ }
    });
    if (typeof onUpdate === 'function') st.listeners.push(onUpdate);
    const nowY = new Date().getFullYear();
    ensureYear(nowY);
    ensureYear(nowY + 1);
  }

  root.HolidayUpdater = { init, ensureYear, status, parseHolidayCN };
})(typeof window !== 'undefined' ? window : globalThis);

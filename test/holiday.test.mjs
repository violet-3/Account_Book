/* holiday.js 解析器单测:node test/holiday.test.mjs */
import '../js/data.js';
import '../js/holiday.js';

const Updater = globalThis.HolidayUpdater;
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; }
  else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
}

/* 模拟 holiday-cn 2027 年假想数据(春节 + 调休) */
const sample = {
  year: 2027,
  days: [
    { name: '春节', date: '2027-02-06', isOffDay: true },
    { name: '春节', date: '2027-02-07', isOffDay: true },
    { name: '春节', date: '2027-02-08', isOffDay: true },
    { name: '春节', date: '2027-02-09', isOffDay: true },
    { name: '春节', date: '2027-02-10', isOffDay: true },
    { name: '春节', date: '2027-02-11', isOffDay: true },
    { name: '春节', date: '2027-02-12', isOffDay: true },
    { name: '春节', date: '2027-01-30', isOffDay: false },
    { name: '春节', date: '2027-02-13', isOffDay: false },
  ],
};

const parsed = Updater.parseHolidayCN(sample);
eq(parsed.year, 2027, '年份');
eq(parsed.holidays, ['2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12'], '放假日期');
eq(parsed.makeup, ['2027-01-30', '2027-02-13'], '调休补班日期');
eq(parsed.names, { '2027-02-06': '春节' }, '假期名称只记首日');

/* 名称分段:连续假期中段出现不同名称(如国庆+中秋) */
const dual = {
  year: 2028,
  days: [
    { name: '国庆节', date: '2028-10-01', isOffDay: true },
    { name: '国庆节', date: '2028-10-02', isOffDay: true },
    { name: '中秋节', date: '2028-10-03', isOffDay: true },
    { name: '中秋节', date: '2028-10-04', isOffDay: true },
  ],
};
const parsed2 = Updater.parseHolidayCN(dual);
eq(parsed2.names, { '2028-10-01': '国庆节', '2028-10-03': '中秋节' }, '双节分段命名');

/* 非法输入抛错 */
let threw = false;
try { Updater.parseHolidayCN({ foo: 1 }); } catch { threw = true; }
eq(threw, true, '非法输入抛出异常');

/* 状态接口:未获取年份返回 unavailable(未发起加载时) */
eq(Updater.status(2099), 'unavailable', '未知年份状态');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

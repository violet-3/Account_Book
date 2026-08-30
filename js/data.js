/* =========================================================
 * data.js — 静态数据:主要城市五险一金参考参数 + 法定节假日
 *
 * 说明:
 * 1. 各城市社保/公积金的"个人缴纳比例"与"缴费基数上下限"
 *    每年 7 月前后会随当地社平工资调整,此处为参考值(2025 年度前后),
 *    应用内所有数值均可基于此修改,以当地当年公布为准。
 * 2. 节假日数据来自国务院办公厅通知:
 *    - 2025 年:国办发明电〔2024〕17 号
 *    - 2026 年:国办发明电〔2025〕xx 号(2025-11-04 发布)
 * ========================================================= */

(typeof window!=="undefined"?window:globalThis).CITY_DATA = {
  beijing:   { name: '北京', floor: 6821,  ceiling: 35283, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.12 },
  shanghai:  { name: '上海', floor: 7384,  ceiling: 36921, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.07 },
  guangzhou: { name: '广州', floor: 4546,  ceiling: 26421, pension: 0.08, medical: 0.02, unemployment: 0.002, housingDefault: 0.05 },
  shenzhen:  { name: '深圳', floor: 3523,  ceiling: 34860, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.05 },
  hangzhou:  { name: '杭州', floor: 4462,  ceiling: 24930, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.12 },
  nanjing:   { name: '南京', floor: 4879,  ceiling: 24396, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.08 },
  suzhou:    { name: '苏州', floor: 4879,  ceiling: 24396, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.08 },
  chengdu:   { name: '成都', floor: 4511,  ceiling: 22555, pension: 0.08, medical: 0.02, unemployment: 0.004, housingDefault: 0.06 },
  wuhan:     { name: '武汉', floor: 4864,  ceiling: 24320, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.08 },
  chongqing: { name: '重庆', floor: 4512,  ceiling: 22560, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.05 },
  xian:      { name: '西安', floor: 4416,  ceiling: 22080, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.08 },
  tianjin:   { name: '天津', floor: 5013,  ceiling: 25065, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.11 },
  changsha:  { name: '长沙', floor: 4546,  ceiling: 22730, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.08 },
  zhengzhou: { name: '郑州', floor: 3756,  ceiling: 18780, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.08 },
  hefei:     { name: '合肥', floor: 4310,  ceiling: 21550, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.08 },
  jinan:     { name: '济南', floor: 4416,  ceiling: 22078, pension: 0.08, medical: 0.02, unemployment: 0.003, housingDefault: 0.08 },
  custom:    { name: '自定义', floor: 4000, ceiling: 24000, pension: 0.08, medical: 0.02, unemployment: 0.005, housingDefault: 0.08 },
};

/* 法定节假日(放假)与调休上班日,日期格式 YYYY-MM-DD */
(typeof window!=="undefined"?window:globalThis).HOLIDAYS = {
  2025: {
    holidays: [
      '2025-01-01',
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
      '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
      '2025-04-04', '2025-04-05', '2025-04-06',
      '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
      '2025-05-31', '2025-06-01', '2025-06-02',
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
      '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
    ],
    makeup: ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11'],
  },
  2026: {
    holidays: [
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18',
      '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
      '2026-10-05', '2026-10-06', '2026-10-07',
    ],
    makeup: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-09-20', '2026-10-10'],
  },
};

/* 假期名称(取每个假期首日,用于 UI 标注) */
(typeof window!=="undefined"?window:globalThis).HOLIDAY_NAMES = {
  '2025-01-01': '元旦', '2025-01-28': '春节', '2025-04-04': '清明节',
  '2025-05-01': '劳动节', '2025-05-31': '端午节', '2025-10-01': '国庆节·中秋',
  '2026-01-01': '元旦', '2026-02-17': '春节', '2026-04-05': '清明节',
  '2026-05-01': '劳动节', '2026-06-19': '端午节', '2026-09-25': '中秋节',
  '2026-10-01': '国庆节',
};

/* 个税:综合所得税率表(年度累计预扣预缴用) [累计上限, 税率, 速算扣除数] */
(typeof window!=="undefined"?window:globalThis).TAX_BRACKETS = [
  [36000, 0.03, 0],
  [144000, 0.10, 2520],
  [300000, 0.20, 16920],
  [420000, 0.25, 31920],
  [660000, 0.30, 52920],
  [960000, 0.35, 85920],
  [Infinity, 0.45, 181920],
];

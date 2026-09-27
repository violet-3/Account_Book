import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
await import('../js/secure.js');
await import('../js/db.js');
const SECURE = globalThis.WANGCAI_SECURE;
const DB = globalThis.DB;
const password = '旺财独立长口令-请勿与账号共用';

const earlyLedger = { version: 1, settings: { baseSalary: 8600 }, records: { '2024-05-01': { status: 'work', ot: 2 } } };
values.set(DB.KEY, JSON.stringify(earlyLedger));
const normalizedEarlyLedger = DB.readLegacy();
assert.deepEqual(normalizedEarlyLedger.records, earlyLedger.records, '旧版考勤应完整保留');
assert.deepEqual(normalizedEarlyLedger.savings, { goals: [], deposits: [] }, '早期无攒钱字段应补默认值');
values.set(DB.KEY, JSON.stringify({ settings: {}, savings: { goals: [], deposits: [] } }));
assert.throws(() => DB.readLegacy(), /账本数据不完整/, '缺少考勤主体时应拒绝迁移');
assert.ok(values.has(DB.KEY), '无效旧数据仍应留在本机');

const original = DB.defaults();
original.settings.baseSalary = 17321;
original.records['2026-09-25'] = { status: 'work', ot: 2, note: '仅本机可读-秘密备注' };
original.savings.goals.push({ id: 'g1', name: '应急储蓄', target: 30000, monthlyPlan: 1000 });
values.set(DB.KEY, JSON.stringify(original));
assert.equal(DB.inspect(), 'migrate');
const legacy = DB.readLegacy();
assert.deepEqual(legacy.records, original.records);

await assert.rejects(SECURE.createVault(legacy, '123456'), /至少 12/);
const created = await SECURE.createVault(legacy, password);
assert.match(created.recoveryKey, /^[A-Za-z0-9_-]{43}$/);
DB.writeVault(created.vault);
const raw = values.get(DB.VAULT_KEY);
assert.ok(raw && !raw.includes('仅本机可读') && !raw.includes('baseSalary'));
assert.ok(values.has(DB.KEY), '明文只在验证后移除');
const verified = await SECURE.openVault(DB.readVault(), password);
assert.deepEqual(verified.state.records, original.records);
const recoveryOpened = await SECURE.openVaultWithRecovery(DB.readVault(), created.recoveryKey);
assert.deepEqual(recoveryOpened.state.records, original.records, 'recovery key unlocks the same ledger');
await assert.rejects(SECURE.openVaultWithRecovery(DB.readVault(), 'A'.repeat(43)), /恢复密钥不正确/);
DB.removeLegacy();
assert.equal(DB.inspect(), 'unlock');
assert.equal(values.has(DB.KEY), false);
await assert.rejects(SECURE.openVault(DB.readVault(), '错误口令错误口令错误口令'), /口令不正确/);
assert.equal(values.get(DB.VAULT_KEY), raw, '错误口令不能覆盖密文');

verified.state.records['2026-09-26'] = { status: 'rest', note: '新增内容' };
const next = await SECURE.sealState(verified.state, verified.dataKey, verified.vault);
assert.notEqual(next.payload.iv, verified.vault.payload.iv, '每次保存必须使用新的随机 nonce');
DB.writeVault(next);
const restored = await SECURE.openVault(values.get(DB.VAULT_KEY), password);
assert.equal(restored.state.records['2026-09-26'].note, '新增内容');
const rekeyed = await SECURE.resetPassphrase(restored.vault, restored.dataKey, '新旺财口令-独立使用-安全保存');
await assert.rejects(SECURE.openVault(rekeyed.vault, password), /口令不正确/);
const reopenedWithNewPassword = await SECURE.openVault(rekeyed.vault, '新旺财口令-独立使用-安全保存');
assert.equal(reopenedWithNewPassword.state.records['2026-09-26'].note, '新增内容');
await assert.rejects(SECURE.openVaultWithRecovery(rekeyed.vault, created.recoveryKey), /恢复密钥不正确/);
const reopenedWithRotatedRecovery = await SECURE.openVaultWithRecovery(rekeyed.vault, rekeyed.recoveryKey);
assert.equal(reopenedWithRotatedRecovery.state.records['2026-09-26'].note, '新增内容');
const tampered = JSON.parse(JSON.stringify(next));
const first = tampered.payload.data[0];
tampered.payload.data = (first === 'A' ? 'B' : 'A') + tampered.payload.data.slice(1);
await assert.rejects(SECURE.openVault(tampered, password), /已损坏/);
assert.equal(values.get(DB.VAULT_KEY), JSON.stringify(next), '篡改测试不影响原备份');

console.log('加密建库、迁移、错误口令、保存、备份恢复与篡改检测通过');

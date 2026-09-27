import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
await import('../js/secure.js');
await import('../js/evidence.js');
const SECURE = globalThis.WANGCAI_SECURE;
const EVIDENCE = globalThis.WANGCAI_EVIDENCE;
const state = { settings: {}, records: {}, savings: { goals: [], deposits: [] }, evidence: { events: [] } };
const before = { status: 'work', ot: 0, otType: '', note: '' };
const after = { status: 'work', ot: 2, otType: 'workday', note: '完成项目交付' };
const first = await EVIDENCE.makeEvent(state.evidence.events,
  { kind: 'attendance_save', workDate: '2026-09-27', source: 'self', title: '保存本人打卡', before, after });
state.evidence.events.push(first);
const second = await EVIDENCE.makeEvent(state.evidence.events,
  { kind: 'attendance_delete', workDate: '2026-09-27', source: 'self', title: '删除本人打卡', before: after });
state.evidence.events.push(second);
assert.equal(second.prevHash, first.hash);
assert.equal(await EVIDENCE.verifyEvents(state.evidence.events), second.hash);
const modified = JSON.parse(JSON.stringify(state.evidence.events));
modified[0].after.note = '事后修改的文字';
await assert.rejects(EVIDENCE.verifyEvents(modified), /校验失败/);

const created = await SECURE.createVault(state, '用于证据测试的独立长口令-2026');
const id = EVIDENCE.randomId();
const original = new TextEncoder().encode('原始工资通知：测试内容');
const sealed = await SECURE.sealAttachment(original, created.dataKey, id);
const decrypted = await SECURE.openAttachment(sealed, created.dataKey, id);
assert.deepEqual(decrypted, original);
await assert.rejects(SECURE.openAttachment(sealed, created.dataKey, EVIDENCE.randomId()));
const backup = EVIDENCE.parseBackup(created.vault);
assert.equal(backup.version, 1);
assert.equal(backup.attachments.length, 0);

const zip = EVIDENCE.buildZip([{ name: 'files/sample.txt', data: original }]);
const bytes = new Uint8Array(await zip.arrayBuffer());
const view = new DataView(bytes.buffer);
assert.equal(view.getUint32(0, true), 0x04034b50);
const nameLength = view.getUint16(26, true);
const dataOffset = 30 + nameLength;
assert.equal(new TextDecoder().decode(bytes.subarray(30, dataOffset)), 'files/sample.txt');
assert.deepEqual(bytes.subarray(dataOffset, dataOffset + original.length), original);
assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);

const packageBlob = await EVIDENCE.evidencePackage(state, created.dataKey,
  [['月份', '预计实发'], ['2026-09', 10000]]);
assert.ok(packageBlob.size > zip.size);
const packageBytes = new Uint8Array(await packageBlob.arrayBuffer());
const packageView = new DataView(packageBytes.buffer);
const entries = new Map();
let offset = 0;
while (packageView.getUint32(offset, true) === 0x04034b50) {
  const size = packageView.getUint32(offset + 18, true);
  const nameSize = packageView.getUint16(offset + 26, true);
  const name = new TextDecoder().decode(packageBytes.subarray(offset + 30, offset + 30 + nameSize));
  const start = offset + 30 + nameSize;
  entries.set(name, packageBytes.subarray(start, start + size));
  offset = start + size;
}
assert.equal(packageView.getUint32(offset, true), 0x02014b50);
assert.ok(entries.has('verify.html'));
const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
assert.equal(manifest.chainHead, second.hash);
assert.equal(manifest.documents.length, 4);
for (const document of manifest.documents) {
  const content = entries.get(document.path);
  assert.equal(document.size, content.length);
  assert.equal(document.sha256, await EVIDENCE.sha256(content));
}
console.log('证据留痕链、附件加密、备份格式和 ZIP 导出通过');

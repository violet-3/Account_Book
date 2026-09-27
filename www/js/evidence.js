/* 工作证据档案：本机加密附件、操作时间线与可离线核对的导出包。 */
(function (root) {
  'use strict';

  const encoder = new root.TextEncoder();
  const ZERO = '0'.repeat(64);
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const DB_NAME = 'wangcai-evidence-v1';
  const STORE = 'attachments';
  const SOURCES = { self: '本人记录', employer: '用人单位材料', message: '往来沟通', bank: '银行/支付记录', other: '其他来源' };

  function randomId() {
    return Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function hex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
  async function sha256(bytes) { return hex(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes))); }
  function toBase64(bytes) {
    let output = '';
    for (let i = 0; i < bytes.length; i += 0x8000) output += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return root.btoa(output);
  }
  function fromBase64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('附件备份格式不正确');
    return Uint8Array.from(root.atob(value), char => char.charCodeAt(0));
  }
  function recordShape(record) {
    if (!record) return null;
    return { status: String(record.status || ''), ot: Number(record.ot) || 0,
      otType: String(record.otType || ''), note: String(record.note || '') };
  }
  function fileShape(file) {
    if (!file) return null;
    return { id: file.id, name: file.name, mime: file.mime, size: file.size,
      sha256: file.sha256, lastModified: file.lastModified || null };
  }
  function canonical(event) {
    return JSON.stringify({ id: event.id, kind: event.kind, recordedAt: event.recordedAt,
      workDate: event.workDate || '', source: event.source, title: event.title || '',
      note: event.note || '', before: recordShape(event.before), after: recordShape(event.after),
      file: fileShape(event.file), prevHash: event.prevHash });
  }
  async function makeEvent(events, input) {
    const previous = events[events.length - 1];
    const event = { id: randomId(), kind: input.kind, recordedAt: new Date().toISOString(),
      workDate: input.workDate || '', source: input.source || 'self', title: input.title || '',
      note: input.note || '', before: recordShape(input.before), after: recordShape(input.after),
      file: fileShape(input.file), prevHash: previous ? previous.hash : ZERO };
    event.hash = await sha256(encoder.encode(canonical(event)));
    return event;
  }
  async function verifyEvents(events) {
    if (!Array.isArray(events)) throw new Error('证据时间线格式不正确');
    let previous = ZERO;
    for (const event of events) {
      if (event.prevHash !== previous || event.hash !== await sha256(encoder.encode(canonical(event)))) {
        throw new Error('证据时间线校验失败，请检查数据或备份');
      }
      previous = event.hash;
    }
    return previous;
  }
  function attachmentEvents(events) { return events.filter(event => event.file); }
  function openDB() {
    if (!root.indexedDB) return Promise.reject(new Error('当前环境不支持附件存储'));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onerror = () => reject(request.error || new Error('附件存储打开失败'));
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function putAttachment(id, box) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id, iv: box.iv, data: box.data });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('附件保存失败'));
        tx.onabort = () => reject(tx.error || new Error('附件保存被中止'));
      });
    } finally { db.close(); }
  }
  async function getAttachment(id) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('附件读取失败'));
      });
    } finally { db.close(); }
  }
  async function deleteAttachment(id) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('附件清理失败'));
      });
    } finally { db.close(); }
  }
  async function putAttachments(items) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        for (const item of items) tx.objectStore(STORE).put(item);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('附件恢复失败'));
        tx.onabort = () => reject(tx.error || new Error('附件恢复被中止'));
      });
    } finally { db.close(); }
  }
  async function readOriginal(event, dataKey) {
    const saved = await getAttachment(event.file.id);
    if (!saved) throw new Error(`缺少原始附件：${event.file.name}`);
    const bytes = await root.WANGCAI_SECURE.openAttachment(saved, dataKey, event.file.id);
    if (bytes.byteLength !== event.file.size || await sha256(bytes) !== event.file.sha256) {
      throw new Error(`附件校验失败：${event.file.name}`);
    }
    return bytes;
  }
  async function encryptedBackup(vault, events, dataKey) {
    await verifyEvents(events);
    const attachments = [];
    for (const event of attachmentEvents(events)) {
      const saved = await getAttachment(event.file.id);
      if (!saved) throw new Error(`缺少原始附件：${event.file.name}`);
      await readOriginal(event, dataKey);
      attachments.push({ id: event.file.id, iv: saved.iv, data: toBase64(new Uint8Array(saved.data)) });
    }
    return { format: 'wangcai-backup', version: 2, vault, attachments };
  }
  function parseBackup(input) {
    const value = typeof input === 'string' ? JSON.parse(input) : input;
    if (value?.format === 'wangcai-backup' && value.version === 2 && Array.isArray(value.attachments)) {
      root.WANGCAI_SECURE.assertVault(value.vault);
      return value;
    }
    root.WANGCAI_SECURE.assertVault(value);
    return { format: 'wangcai-backup', version: 1, vault: value, attachments: [] };
  }
  async function restoreAttachments(backup, opened) {
    const events = opened.state.evidence?.events || [];
    await verifyEvents(events);
    const expected = attachmentEvents(events);
    const byId = new Map(backup.attachments.map(item => [item.id, item]));
    if (byId.size !== backup.attachments.length || expected.length !== byId.size) throw new Error('备份附件不完整或有重复项');
    const items = [];
    for (const event of expected) {
      const item = byId.get(event.file.id);
      if (!item) throw new Error(`备份缺少附件：${event.file.name}`);
      const bytes = await root.WANGCAI_SECURE.openAttachment({ iv: item.iv, data: item.data }, opened.dataKey, item.id);
      if (bytes.byteLength !== event.file.size || await sha256(bytes) !== event.file.sha256) {
        throw new Error(`备份附件校验失败：${event.file.name}`);
      }
      items.push({ id: item.id, iv: item.iv, data: fromBase64(item.data).buffer });
    }
    if (items.length) await putAttachments(items);
  }
  function safeName(name) { return String(name || 'file').replace(/[\\/\x00-\x1f<>:"|?*]/g, '_').slice(0, 80) || 'file'; }
  function escapeHtml(text) { return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function csvCell(value) {
    const raw = String(value ?? '');
    const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }
  function csv(rows) { return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  function timelineHtml(events) {
    const kinds = { attachment: '原始附件', attendance_delete: '删除打卡', attendance_save: '保存打卡',
      attendance_import: '导入考勤', attendance_bulk_delete: '清空考勤' };
    const recordText = record => record ? `${record.status}；加班 ${record.ot} 小时；类型 ${record.otType || '自动'}；备注 ${record.note || '无'}` : '无记录';
    const items = events.map(event => `<li><b>${escapeHtml(event.recordedAt)}</b> · ${escapeHtml(kinds[event.kind] || '操作记录')} · ${escapeHtml(event.workDate || '未关联日期')}<br>${escapeHtml(event.title || '')} <small>来源：${escapeHtml(SOURCES[event.source] || SOURCES.other)}</small>${event.kind === 'attendance_save' || event.kind === 'attendance_delete' ? `<br>原记录：${escapeHtml(recordText(event.before))}<br>新记录：${escapeHtml(recordText(event.after))}` : ''}${event.file ? `<br>文件：${escapeHtml(event.file.name)} · SHA-256：<code>${escapeHtml(event.file.sha256)}</code>` : ''}${event.note ? `<br>${escapeHtml(event.note)}` : ''}<br><small>事件哈希：<code>${escapeHtml(event.hash)}</code></small></li>`).join('');
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>旺财工作证据时间线</title><style>body{font:16px/1.65 sans-serif;max-width:850px;margin:32px auto;padding:0 18px}li{margin:0 0 18px}small{color:#555}code{overflow-wrap:anywhere}h1{font-size:1.5em}</style><h1>旺财工作证据时间线</h1><p>本清单由用户设备导出。本人填写的打卡、设备时间及附件来源未经独立核实；校验值用于比较文件是否改变，不能单独证明工作事实。</p><ol>${items}</ol></html>`;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function buildZip(entries) {
    const parts = [], central = [];
    let offset = 0;
    if (entries.length > 65535) throw new Error('导出文件过多');
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(entry.data);
      if (data.length > 0xffffffff || offset + data.length > 0xffffffff) throw new Error('证据包超过 ZIP 大小限制');
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true); local.set(name, 30);
      parts.push(local, data);
      const record = new Uint8Array(46 + name.length), cv = new DataView(record.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); record.set(name, 46);
      central.push(record); offset += local.length + data.length;
    }
    const centralSize = central.reduce((size, record) => size + record.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new root.Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  function verifierHtml() {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>旺财证据包离线校验</title>
<style>body{font:16px/1.6 sans-serif;max-width:720px;margin:30px auto;padding:0 16px}label{display:block;margin:18px 0}input{display:block;max-width:100%}button{padding:10px 18px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>证据包离线校验</h1><p>解压证据包后，选择 manifest.json、汇总文件和 files 文件夹。校验只检查文件与时间线是否和清单一致，不证明打卡事实、文件来源或设备时间。</p>
<label>清单文件<input id="manifest" type="file" accept=".json"></label>
<label>汇总文件（多选 README.txt、timeline.html、attendance.csv、wage-estimate.csv）<input id="documents" type="file" multiple></label>
<label>原件文件夹<input id="files" type="file" webkitdirectory multiple></label>
<label>如无法选择文件夹，可在这里多选所有原件<input id="alternatives" type="file" multiple></label>
<button id="verify">开始校验</button><pre id="result" role="status"></pre>
<script>
const enc = new TextEncoder();
function recordShape(r){return r?{status:String(r.status||''),ot:Number(r.ot)||0,otType:String(r.otType||''),note:String(r.note||'')}:null}
function fileShape(f){return f?{id:f.id,name:f.name,mime:f.mime,size:f.size,sha256:f.sha256,lastModified:f.lastModified||null}:null}
function canonical(e){return JSON.stringify({id:e.id,kind:e.kind,recordedAt:e.recordedAt,workDate:e.workDate||'',source:e.source,title:e.title||'',note:e.note||'',before:recordShape(e.before),after:recordShape(e.after),file:fileShape(e.file),prevHash:e.prevHash})}
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
document.getElementById('verify').onclick=async()=>{const out=document.getElementById('result');out.textContent='正在校验…';try{
 const manifestFile=document.getElementById('manifest').files[0];if(!manifestFile)throw Error('请选择 manifest.json');
 const m=JSON.parse(await manifestFile.text());if(m.format!=='wangcai-evidence-package'||m.version!==1)throw Error('清单版本不正确');
 let prev='0'.repeat(64);for(const e of m.events){if(e.prevHash!==prev||e.hash!==await digest(enc.encode(canonical(e))))throw Error('时间线校验失败：'+e.id);prev=e.hash}
 if(m.chainHead!==prev)throw Error('时间线末端校验值不一致');
 const selected=[...document.getElementById('files').files,...document.getElementById('alternatives').files];
 const files=new Map(selected.map(f=>[f.name,f]));let count=0;
 for(const meta of m.files){const file=files.get(meta.path.split('/').pop());if(!file)throw Error('缺少原件：'+meta.path);
  if(file.size!==meta.size||await digest(await file.arrayBuffer())!==meta.sha256)throw Error('原件校验失败：'+meta.path);count++}
 const docs=new Map([...document.getElementById('documents').files].map(f=>[f.name,f]));
 for(const meta of m.documents){const file=docs.get(meta.path);if(!file)throw Error('缺少汇总文件：'+meta.path);
  if(file.size!==meta.size||await digest(await file.arrayBuffer())!==meta.sha256)throw Error('汇总文件校验失败：'+meta.path)}
 out.textContent='校验通过：时间线 '+m.events.length+' 条、原始文件 '+count+' 份、汇总文件 '+m.documents.length+' 份。此结果只表示所选文件与清单一致。';
 }catch(error){out.textContent='校验未通过：'+error.message}};
</script></html>`;
  }
  async function evidencePackage(state, dataKey, wageRows) {
    const events = state.evidence?.events || [];
    const chainHead = await verifyEvents(events);
    const files = [], fileEntries = [];
    for (const event of attachmentEvents(events)) {
      const bytes = await readOriginal(event, dataKey);
      const path = `files/${event.file.id}-${safeName(event.file.name)}`;
      files.push({ ...fileShape(event.file), path });
      fileEntries.push({ name: path, data: bytes });
    }
    const attendance = [['日期', '出勤状态', '加班小时', '备注', '来源说明']];
    for (const [date, record] of Object.entries(state.records || {}).sort(([a], [b]) => a.localeCompare(b))) {
      attendance.push([date, record.status || '', record.ot || 0, record.note || '', events.some(event => event.workDate === date && event.kind === 'attendance_save') ? '本机打卡留痕' : '旧版记录：无操作留痕']);
    }
    const notes = '旺财工作证据包\r\n\r\n1. 解压 ZIP 后保留原文件和 manifest.json。\r\n2. timeline.html 可浏览或打印；attendance.csv 与 wage-estimate.csv 为用户记录和估算。\r\n3. 打开 verify.html 可核对所选原件、汇总文件和时间线与清单是否一致。校验不能证明工作事实或设备时间，本包并非公证或司法存证。\r\n4. 包内有明文材料，分享前请检查个人与他人隐私。\r\n';
    const documents = [{ name: 'README.txt', data: notes },
      { name: 'timeline.html', data: timelineHtml(events) },
      { name: 'attendance.csv', data: csv(attendance) },
      { name: 'wage-estimate.csv', data: csv(wageRows) }];
    const documentHashes = await Promise.all(documents.map(async item => {
      const bytes = encoder.encode(item.data);
      return { path: item.name, size: bytes.byteLength, sha256: await sha256(bytes) };
    }));
    const manifest = { format: 'wangcai-evidence-package', version: 1, exportedAt: new Date().toISOString(),
      chainHead, meaning: '本机自录时间线与附件完整性校验；未经过独立时间或工作事实核实', events, files,
      documents: documentHashes };
    return buildZip([...documents,
      { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
      { name: 'verify.html', data: verifierHtml() },
      ...fileEntries]);
  }

  root.WANGCAI_EVIDENCE = { MAX_FILE_BYTES, SOURCES, randomId, sha256, makeEvent, verifyEvents,
    putAttachment, getAttachment, deleteAttachment, readOriginal, encryptedBackup, parseBackup,
    restoreAttachments, evidencePackage, buildZip };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WANGCAI_EVIDENCE;
})(typeof window !== 'undefined' ? window : globalThis);

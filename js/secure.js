/* 旺财本地密封包：Web Crypto AES-GCM + PBKDF2，绝不持久化口令或明文密钥。 */
(function (root) {
  'use strict';

  const FORMAT = 'wangcai-vault';
  const VERSION = 1;
  const ITERATIONS = 600000;
  const encoder = new root.TextEncoder();
  const decoder = new root.TextDecoder('utf-8', { fatal: true });

  function subtle() {
    if (!root.crypto || !root.crypto.subtle || !root.crypto.getRandomValues) {
      throw new Error('当前环境不支持安全加密，请使用 HTTPS、localhost 或手机客户端');
    }
    return root.crypto.subtle;
  }
  function random(size) { return root.crypto.getRandomValues(new Uint8Array(size)); }
  function b64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return root.btoa(binary);
  }
  function unb64(value, expected) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('加密备份格式不正确');
    const binary = root.atob(value);
    if (expected && binary.length !== expected) throw new Error('加密备份格式不正确');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  function unurl64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('恢复密钥格式不正确');
    const binary = root.atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  function validState(data) {
    return data && typeof data === 'object' && !Array.isArray(data) &&
      data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) &&
      data.records && typeof data.records === 'object' && !Array.isArray(data.records) &&
      data.savings && Array.isArray(data.savings.goals) && Array.isArray(data.savings.deposits);
  }
  function assertVault(vault) {
    if (!vault || vault.format !== FORMAT || vault.version !== VERSION ||
        vault.kdf?.name !== 'PBKDF2-SHA256' ||
        !Number.isInteger(vault.kdf.iterations) || vault.kdf.iterations < ITERATIONS || vault.kdf.iterations > 5000000 ||
        !vault.wrap || !vault.payload) throw new Error('不支持或损坏的加密备份');
    unb64(vault.kdf.salt, 16);
    unb64(vault.wrap.iv, 12);
    unb64(vault.wrap.data);
    unb64(vault.payload.iv, 12);
    unb64(vault.payload.data);
    if (vault.recovery) {
      unb64(vault.recovery.wrap?.iv, 12);
      unb64(vault.recovery.wrap?.data);
    }
    return vault;
  }
  async function derive(passphrase, salt, iterations) {
    const base = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(key, bytes, label) {
    const iv = random(12);
    const data = new Uint8Array(await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(label) }, key, bytes));
    return { iv: b64(iv), data: b64(data) };
  }
  async function decrypt(key, box, label) {
    return new Uint8Array(await subtle().decrypt(
      { name: 'AES-GCM', iv: unb64(box.iv, 12), additionalData: encoder.encode(label) },
      key, unb64(box.data)));
  }
  async function sealAttachment(bytes, dataKey, id) {
    if (!(bytes instanceof Uint8Array) || !/^[a-f0-9]{32}$/.test(id)) throw new Error('附件格式不正确');
    const iv = random(12);
    const data = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(`${FORMAT}:${VERSION}:attachment:${id}`) }, dataKey, bytes);
    return { iv: b64(iv), data };
  }
  async function openAttachment(box, dataKey, id) {
    if (!box || !/^[a-f0-9]{32}$/.test(id)) throw new Error('附件格式不正确');
    const data = box.data instanceof ArrayBuffer ? box.data : unb64(box.data);
    return new Uint8Array(await subtle().decrypt(
      { name: 'AES-GCM', iv: unb64(box.iv, 12), additionalData: encoder.encode(`${FORMAT}:${VERSION}:attachment:${id}`) }, dataKey, data));
  }
  async function sealState(state, dataKey, vault) {
    assertVault(vault);
    if (!validState(state)) throw new Error('账本内容不完整，已停止保存');
    const payload = await encrypt(dataKey, encoder.encode(JSON.stringify(state)), `${FORMAT}:${VERSION}:payload`);
    return { ...vault, payload };
  }
  async function createVault(state, passphrase) {
    subtle();
    if (!validState(state)) throw new Error('账本内容不完整，无法加密');
    if (typeof passphrase !== 'string' || Array.from(passphrase).length < 12) throw new Error('请设置至少 12 个字符的解锁口令');
    const salt = random(16);
    const wrappingKey = await derive(passphrase, salt, ITERATIONS);
    const rawKey = random(32);
    const wrap = await encrypt(wrappingKey, rawKey, `${FORMAT}:${VERSION}:key`);
    const recoveryKey = b64url(random(32));
    const recoveryWrap = await wrapRecoveryKey(rawKey, recoveryKey);
    const dataKey = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    rawKey.fill(0);
    const vault = { format: FORMAT, version: VERSION,
      kdf: { name: 'PBKDF2-SHA256', salt: b64(salt), iterations: ITERATIONS },
      wrap, recovery: { wrap: recoveryWrap }, payload: { iv: b64(random(12)), data: '' } };
    return { vault: await sealState(state, dataKey, vault), dataKey, recoveryKey };
  }
  function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
  async function wrapRecoveryKey(rawDataKey, recoveryKey) {
    const rawRecoveryKey = unurl64(recoveryKey);
    try {
      const key = await subtle().importKey('raw', rawRecoveryKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return await encrypt(key, rawDataKey, `${FORMAT}:${VERSION}:recovery-key`);
    } finally { rawRecoveryKey.fill(0); }
  }
  async function openWithRawKey(vault, rawKey) {
    try {
      if (rawKey.length !== 32) throw new Error('密钥长度错误');
      const dataKey = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
      const plain = await decrypt(dataKey, vault.payload, `${FORMAT}:${VERSION}:payload`);
      const state = JSON.parse(decoder.decode(plain));
      plain.fill(0);
      if (!validState(state)) throw new Error('账本结构错误');
      return { vault, dataKey, state };
    } finally { rawKey.fill(0); }
  }
  async function openVault(input, passphrase) {
    subtle();
    const vault = assertVault(typeof input === 'string' ? JSON.parse(input) : input);
    if (typeof passphrase !== 'string' || !passphrase) throw new Error('请输入解锁口令');
    try {
      const wrappingKey = await derive(passphrase, unb64(vault.kdf.salt, 16), vault.kdf.iterations);
      const rawKey = await decrypt(wrappingKey, vault.wrap, `${FORMAT}:${VERSION}:key`);
      return await openWithRawKey(vault, rawKey);
    } catch {
      throw new Error('口令不正确，或加密备份已损坏；原数据未被修改');
    }
  }

  async function openVaultWithRecovery(input, recoveryKey) {
    subtle();
    const vault = assertVault(typeof input === 'string' ? JSON.parse(input) : input);
    if (!vault.recovery) throw new Error('此账本没有恢复密钥，请使用原口令解锁后创建');
    let rawRecoveryKey;
    try {
      rawRecoveryKey = unurl64(recoveryKey);
      const key = await subtle().importKey('raw', rawRecoveryKey, { name: 'AES-GCM' }, false, ['decrypt']);
      rawRecoveryKey.fill(0);
      const rawKey = await decrypt(key, vault.recovery.wrap, `${FORMAT}:${VERSION}:recovery-key`);
      return await openWithRawKey(vault, rawKey);
    } catch {
      if (rawRecoveryKey) rawRecoveryKey.fill(0);
      throw new Error('恢复密钥不正确，或加密数据已损坏；原数据未被修改');
    }
  }

  async function addRecoveryKey(vault, dataKey) {
    const recoveryKey = b64url(random(32));
    const rawDataKey = new Uint8Array(await subtle().exportKey('raw', dataKey));
    try {
      const recovery = { wrap: await wrapRecoveryKey(rawDataKey, recoveryKey) };
      return { vault: { ...vault, recovery }, recoveryKey };
    } finally { rawDataKey.fill(0); }
  }

  async function resetPassphrase(vault, dataKey, passphrase) {
    if (typeof passphrase !== 'string' || Array.from(passphrase).length < 12) throw new Error('新口令至少需要 12 个字符');
    const rawDataKey = new Uint8Array(await subtle().exportKey('raw', dataKey));
    try {
      const salt = random(16);
      const wrappingKey = await derive(passphrase, salt, ITERATIONS);
      const wrap = await encrypt(wrappingKey, rawDataKey, `${FORMAT}:${VERSION}:key`);
      const nextBase = { ...vault, kdf: { name: 'PBKDF2-SHA256', salt: b64(salt), iterations: ITERATIONS }, wrap };
      const recovered = await addRecoveryKey(nextBase, dataKey);
      return recovered;
    } finally { rawDataKey.fill(0); }
  }

  root.WANGCAI_SECURE = { FORMAT, VERSION, ITERATIONS, assertVault, createVault, openVault, openVaultWithRecovery, addRecoveryKey, resetPassphrase, sealState, sealAttachment, openAttachment };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WANGCAI_SECURE;
})(typeof window !== 'undefined' ? window : globalThis);

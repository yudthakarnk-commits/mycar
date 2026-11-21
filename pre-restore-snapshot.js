/* MYCAR v3.4.6-A: local pre-restore snapshot foundation.
 * PURE/read-only with respect to MYCAR and Supabase. Does NOT save, download,
 * lock cloud sync, or restore. Caller must persist and verify before any write.
 * SHA-256 is an accidental-corruption check, NOT a signature or proof of owner.
 */
(function (root) {
  'use strict';
  const COLLECTIONS = Object.freeze(['vehicles','fuel','maintenance','tax','trips','other']);
  function canonical(value) {
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function cryptoEngine() {
    if (root.crypto?.subtle) return root.crypto;
    if (typeof require==='function') return require('node:crypto').webcrypto;
    throw new Error('Secure cryptographic digest is unavailable.');
  }
  async function sha256(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    const digest = await cryptoEngine().subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
  }
  function assertValid(data,validate) {
    if (typeof validate!=='function') throw new Error('Trusted MYCAR backup validator is required.');
    const check=validate(data);
    if (!check || check.valid!==true) throw new Error('Invalid current MYCAR data. Snapshot not created.');
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function checkContext(context) {
    if (!context || typeof context.userId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.userId))
      throw new Error('An authenticated account ID is required.');
    if (context.online !== true) throw new Error('Online confirmation required before preparing snapshot.');
    if (!Number.isInteger(context.pendingCount) || context.pendingCount!==0)
      throw new Error('Pending sync must be exactly zero.');
    // Read-only context checks cannot guarantee that remote changes are quiescent.
  }
  function countsFor(data) {return Object.fromEntries(COLLECTIONS.map(name=>[name,data[name].length]));}
  async function create(currentData, context, validate) {
    checkContext(context);
    assertValid(currentData,validate);
    const data=clone(currentData);
    assertValid(data,validate);
    const payload={format:'MYCAR_LOCAL_PRE_RESTORE_SNAPSHOT_V1',createdAt:new Date().toISOString(),
      accountId:context.userId,source:'device-memory',data};
    const hash=await sha256(payload);
    return {...payload,integrity:{algorithm:'SHA-256',digest:hash}};
  }
  async function verify(snapshot,expectedUserId,validate) {
    if (!snapshot || snapshot.format!=='MYCAR_LOCAL_PRE_RESTORE_SNAPSHOT_V1' ||
      !snapshot.integrity || snapshot.integrity.algorithm!=='SHA-256' ||
      !/^[a-f0-9]{64}$/.test(snapshot.integrity.digest||'') ||
      !snapshot.createdAt || Number.isNaN(Date.parse(snapshot.createdAt)) ||
      snapshot.source!=='device-memory' ||
      typeof expectedUserId!=='string' || snapshot.accountId!==expectedUserId) return {valid:false,reason:'Snapshot metadata or account label mismatch.'};
    try {
      assertValid(snapshot.data,validate);
      const {integrity,...payload}=snapshot;
      // Reject extra fields not present when the hash was produced, even if callers added them.
      if (Object.keys(payload).sort().join(',')!==['format','createdAt','accountId','source','data'].sort().join(','))
        return {valid:false,reason:'Unexpected snapshot fields.'};
      if (await sha256(payload)!==integrity.digest) return {valid:false,reason:'Snapshot digest mismatch.'};
      return {valid:true,counts:countsFor(snapshot.data)};
    } catch(err) {return {valid:false,reason:err.message};}
  }
  root.MYCARPreRestoreSnapshot=Object.freeze({create,verify});
  if (typeof module!=='undefined' && module.exports) module.exports=root.MYCARPreRestoreSnapshot;
})(typeof window!=='undefined'?window:globalThis);

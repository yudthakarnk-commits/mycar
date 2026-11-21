/* MYCAR v3.4.6-A: explicit, read-only snapshot download and file verification.
 * No Supabase writes, dbData mutation, or restore operations.
 * Snapshot reflects local in-memory data, NOT an atomic Supabase checkpoint.
 */
(function (root) {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024;
  const SNAPSHOT_FORMAT = 'MYCAR_LOCAL_PRE_RESTORE_SNAPSHOT_V1';
  async function prepare(data, context, validator, library) {
    if (!library || typeof library.create !== 'function' || typeof library.verify !== 'function')
      throw new Error('Pre-restore snapshot library missing.');
    const snapshot = await library.create(data, context, validator);
    const json = JSON.stringify(snapshot, null, 2);
    if (new TextEncoder().encode(json).byteLength > MAX_BYTES)
      throw new Error('Snapshot exceeds 10 MB download limit.');
    const parsed = JSON.parse(json);
    const verification = await library.verify(parsed, context.userId, validator);
    if (!verification.valid) throw new Error('Snapshot self-check failed: ' + verification.reason);
    return { json, verification };
  }
  async function verifyText(json, userId, validator, library) {
    if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > MAX_BYTES)
      return {valid:false, reason:'Invalid or oversized snapshot.'};
    try {
      const snapshot = JSON.parse(json);
      if (!snapshot || snapshot.format !== SNAPSHOT_FORMAT)
        return {valid:false, reason:'Not a MYCAR pre-restore snapshot.'};
      if (!library || typeof library.verify !== 'function')
        return {valid:false, reason:'Snapshot verification library unavailable.'};
      return await library.verify(snapshot, userId, validator);
    } catch (_) { return {valid:false, reason:'Invalid snapshot JSON.'}; }
  }
  function dependencies() {
    if (typeof AuthManager === 'undefined' || !AuthManager.currentUser?.id)
      throw new Error('Sign in to MYCAR first.');
    if (typeof MYCARCloud === 'undefined') throw new Error('Cloud Sync module unavailable.');
    if (typeof MYCARBackupPreview === 'undefined') throw new Error('Backup validator unavailable.');
    if (!root.MYCARPreRestoreSnapshot) throw new Error('Snapshot module unavailable.');
    if (typeof dbData === 'undefined') throw new Error('Current MYCAR records unavailable.');
    return {
      userId: AuthManager.currentUser.id,
      online: navigator.onLine === true,
      pendingCount: MYCARCloud.pendingCount,
      data: dbData,
      validator: MYCARBackupPreview.validate,
      library: root.MYCARPreRestoreSnapshot
    };
  }
  function status(message, success) {
    const el = document.getElementById('mycar-snapshot-status');
    if (el) { el.textContent = message; el.dataset.valid = String(success); }
  }
  async function download() {
    try {
      const d = dependencies();
      const {json} = await prepare(d.data, {userId:d.userId, online:d.online, pendingCount:d.pendingCount}, d.validator, d.library);
      const blob = new Blob([json], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mycar_pre_restore_snapshot_' + new Date().toISOString().slice(0,10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      status('Snapshot validated and download requested. Check the downloaded file using Verify Snapshot. This is a local copy, not a cloud-consistent backup.', true);
    } catch (e) { status('Snapshot blocked: ' + e.message, false); }
  }
  async function inspect(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const d = dependencies();
      if (file.size > MAX_BYTES) throw new Error('File exceeds 10 MB limit.');
      const result = await verifyText(await file.text(), d.userId, d.validator, d.library);
      status(result.valid
        ? 'Snapshot verification PASSED. Counts: ' + Object.entries(result.counts).map(([k,v])=>k+'='+v).join(', ') + '. No data was restored.'
        : 'Snapshot verification FAILED: ' + result.reason, result.valid);
    } catch (e) { status('Snapshot verification FAILED: ' + e.message, false); }
    finally { input.value = ''; }
  }
  const api = Object.freeze({prepare, verifyText, download, inspect});
  root.MYCARSnapshotDownload = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

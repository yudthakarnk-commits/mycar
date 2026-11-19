/** MYCAR Staging RLS QA; Node 22+, no extra packages, no production data. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const vars = ['MYCAR_STAGING_URL','MYCAR_STAGING_PUBLISHABLE_KEY','MYCAR_TEST_USER_A_EMAIL','MYCAR_TEST_USER_A_PASSWORD','MYCAR_TEST_USER_B_EMAIL','MYCAR_TEST_USER_B_PASSWORD'];
for (const key of vars) if (!process.env[key]) throw new Error(`Missing staging environment variable: ${key}`);
const url = new URL(process.env.MYCAR_STAGING_URL.trim());
assert.equal(url.origin, 'https://dlbshlvyhfwkorooxbnu.supabase.co', 'REFUSING TO RUN: URL is not the verified MYCAR-STAGING project');
assert.equal(url.pathname.replace(/\/$/,''), '', 'Staging URL must be the project root');
const base = url.origin;
const publicKey = process.env.MYCAR_STAGING_PUBLISHABLE_KEY;
assert.match(publicKey, /^sb_publishable_[A-Za-z0-9_-]{10,}$/, 'A publishable key is required. Never supply a secret/service-role key.');
const testId = 'qa_' + randomUUID().replaceAll('-','');
const recordA = `${testId}_a`;
const recordB = `${testId}_b`;
const collection = 'other';
const table = base + '/rest/v1/mycar_records';

async function http(endpoint, { method='GET', token='', body, prefer, headers={} }={}) {
  const h = { apikey: publicKey, Accept:'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type']='application/json';
  if (prefer) h.Prefer = prefer;
  const response = await fetch(endpoint,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const text = await response.text();
  let data;
  try { data=text ? JSON.parse(text) : null; } catch { data=text; }
  return {status: response.status, ok: response.ok, data};
}
const fail = (res,label) => {if(!res.ok)throw new Error(`${label} failed HTTP ${res.status}: ${JSON.stringify(res.data).slice(0,250)}`);};
async function login(email,password){
  const response=await http(base+'/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  fail(response,`Sign-in ${email===process.env.MYCAR_TEST_USER_A_EMAIL?'A':'B'}`);
  assert.match(response.data?.access_token||'',/^[^\s]+$/);
  const user=await http(base+'/auth/v1/user',{token:response.data.access_token});
  fail(user,'Verify identity');
  assert.match(user.data?.id||'',/^[0-9a-f-]{36}$/i);
  return {id:user.data.id,token:response.data.access_token};
}
async function rowsFor(token,recordId){
  const params=new URLSearchParams({select:'user_id,collection,record_id,payload,deleted',collection:'eq.'+collection,record_id:'eq.'+recordId});
  const r=await http(table+'?'+params,{token});fail(r,'Read rows');assert.ok(Array.isArray(r.data));return r.data;
}
async function upsert(user,recordId,cost,deleted=false){
  const params=new URLSearchParams({on_conflict:'user_id,collection,record_id'});
  const body=[{user_id:user.id,collection,record_id:recordId,payload:deleted?{}:{id:recordId,vehicleId:'qa_vehicle',date:'2026-11-19',description:'Automated staging QA',cost},deleted}];
  const r=await http(table+'?'+params,{method:'POST',token:user.token,body,prefer:'resolution=merge-duplicates,return=representation'});
  fail(r,'Upsert record');return r;
}
async function step(label,fn){await fn();console.log(`PASS ${label}`);}

let A, B;
try {
 await step('Both staging users authenticate independently',async()=>{A=await login(process.env.MYCAR_TEST_USER_A_EMAIL,process.env.MYCAR_TEST_USER_A_PASSWORD);B=await login(process.env.MYCAR_TEST_USER_B_EMAIL,process.env.MYCAR_TEST_USER_B_PASSWORD);assert.notEqual(A.id,B.id);});
 await step('User A can create and read own record',async()=>{await upsert(A,recordA,12.5);const rows=await rowsFor(A.token,recordA);assert.equal(rows.length,1);assert.equal(rows[0].user_id,A.id);assert.equal(rows[0].payload.cost,12.5);});
 await step('User B cannot read User A record',async()=>{assert.deepEqual(await rowsFor(B.token,recordA),[]);});
 await step('User B cannot update User A record',async()=>{const params=new URLSearchParams({user_id:'eq.'+A.id,record_id:'eq.'+recordA,collection:'eq.'+collection});const r=await http(table+'?'+params,{method:'PATCH',token:B.token,body:{payload:{id:recordA,vehicleId:'qa_vehicle',date:'2026-11-19',description:'MALICIOUS CHANGE',cost:999}},prefer:'return=representation'});assert.ok(r.status===200||r.status===204,`Unexpected status ${r.status}`);assert.deepEqual(r.data??[],[]);const rows=await rowsFor(A.token,recordA);assert.equal(rows[0].payload.cost,12.5);});
 await step('User B cannot insert record owned by A',async()=>{const body=[{user_id:A.id,collection,record_id:`${testId}_unauth`,payload:{id:`${testId}_unauth`,vehicleId:'qa_vehicle'},deleted:false}];const r=await http(table,{method:'POST',token:B.token,body,prefer:'return=representation'});assert.ok(r.status===401||r.status===403,`Expected RLS rejection, got ${r.status}`);});
 await step('Upsert same record ID twice causes no duplicate',async()=>{await upsert(A,recordA,13.5);await upsert(A,recordA,14.5);const rows=await rowsFor(A.token,recordA);assert.equal(rows.length,1);assert.equal(rows[0].payload.cost,14.5);});
 await step('User B can create own isolated record',async()=>{await upsert(B,recordB,7);assert.equal((await rowsFor(B.token,recordB)).length,1);assert.deepEqual(await rowsFor(A.token,recordB),[]);});
 await step('Deleted/tombstone records preserve ownership isolation',async()=>{await upsert(A,recordA,0,true);await upsert(B,recordB,0,true);assert.equal((await rowsFor(A.token,recordA))[0].deleted,true);assert.equal((await rowsFor(B.token,recordB))[0].deleted,true);assert.deepEqual(await rowsFor(B.token,recordA),[]);assert.deepEqual(await rowsFor(A.token,recordB),[]);});
 console.log('STAGING RLS QA PASSED: 7 checks. Only 2 QA tombstones were created.');
} catch(err) {
 console.error('STAGING RLS QA FAILED:', err.message);
 process.exitCode=1;
} finally {
 // Best effort tombstone marking. We do NOT delete rows or alter schema.
 for (const [u,id] of [[A,recordA],[B,recordB]]) if (u?.token) {
   try { const matches=await rowsFor(u.token,id);if(matches.length&&!matches[0].deleted)await upsert(u,id,0,true); }
   catch { console.error('Cleanup warning: a QA row may remain active in Staging; check ID prefix qa_.'); }
 }
}

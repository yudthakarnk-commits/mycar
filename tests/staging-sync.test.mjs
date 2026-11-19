// MYCAR Cloud Sync Integration QA — Staging only.
// Runs the checked-out cloud-sync.js source (unmodified) in two isolated JS contexts.
// Uses authenticated Supabase Data API calls, no service-role / database admin keys.
// No production URLs, actual vehicles, or real user data are used.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const REQUIRED = ['MYCAR_STAGING_URL','MYCAR_STAGING_PUBLISHABLE_KEY','MYCAR_TEST_USER_A_EMAIL','MYCAR_TEST_USER_A_PASSWORD'];
for (const name of REQUIRED) if (!process.env[name]) throw new Error(`Missing Staging environment secret: ${name}`);
const url = new URL(process.env.MYCAR_STAGING_URL);
const STAGING_REF = 'dlbshlvyhfwkorooxbnu';
if (url.origin !== `https://${STAGING_REF}.supabase.co` || url.pathname !== '/') {
  throw new Error('Safety stop: MYCAR_STAGING_URL does not match the dedicated MYCAR-STAGING project.');
}
const apiKey = process.env.MYCAR_STAGING_PUBLISHABLE_KEY;
if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(apiKey)) throw new Error('Safety stop: expected a public sb_publishable_ key only.');
const collections = ['vehicles','fuel','maintenance','tax','trips','other'];
const newState = () => ({ activeVehicleId:'qa_vehicle', ...Object.fromEntries(collections.map(c=>[c,[]])) });
const clone = x => JSON.parse(JSON.stringify(x));

async function login(email,password) {
  const response = await fetch(`${url.origin}/auth/v1/token?grant_type=password`, {
    method:'POST',headers:{ apikey:apiKey,'Content-Type':'application/json' },
    body:JSON.stringify({email,password})
  });
  if (!response.ok) {
    // Never emit raw auth response: it may expose account metadata.
    throw new Error(`Staging sign-in failed (HTTP ${response.status}); verify test credentials.`);
  }
  const result = await response.json();
  if (!result?.access_token || !result?.user?.id) throw new Error('Staging sign-in did not return a valid session.');
  return {token:result.access_token,id:result.user.id};
}
function authHeaders(token) {
  return { apikey:apiKey, Authorization:`Bearer ${token}`, Accept:'application/json' };
}
async function readRecord(session, id) {
  const params = new URLSearchParams({select:'record_id,payload,deleted',collection:'eq.other',record_id:`eq.${id}`,user_id:`eq.${session.id}`});
  const response=await fetch(`${url.origin}/rest/v1/mycar_records?${params}`,{headers:authHeaders(session.token)});
  if(!response.ok) throw new Error(`Could not verify staging row (HTTP ${response.status})`);
  const rows=await response.json();
  assert.ok(Array.isArray(rows));
  return rows;
}
function createDevice(source, session, label) {
  const storage = new Map();
  const localStorage = {
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  };
  const elements = new Map();
  const document={
    hidden:false,
    getElementById:id=>{
      if(!elements.has(id)) elements.set(id,{ dataset:{}, title:'', textContent:'', setAttribute(){} });
      return elements.get(id);
    },
    addEventListener(){}
  };
  const navigator={onLine:true};
  const AuthManager={
    config:{url:url.origin,key:apiKey}, projectId:url.hostname,
    currentUser:{id:session.id},
    async getAccessToken(){return session.token;}
  };
  const window={addEventListener(){}};
  // Do not schedule automatic polling: explicit syncNow() makes each assertion deterministic.
  let nextId=0;
  const setTimeout=()=>++nextId;
  const clearTimeout=()=>{};
  const context=vm.createContext({window,document,navigator,localStorage,AuthManager,fetch,URLSearchParams,setTimeout,clearTimeout,console,Date,JSON,Map,Object,Array,String,Error,Number});
  vm.runInContext(source+'\n;globalThis.__qaCloud = MYCARCloud;',context,{filename:'cloud-sync.js'});
  let state=newState();
  const bridge={getData(){return clone(state);},applyData(data){state=clone(data);}};
  context.__qaCloud.start({id:session.id},bridge);
  return {name:label,cloud:context.__qaCloud,navigator,get data(){return clone(state);},setData(next){state=clone(next);},stop(){context.__qaCloud.stop();}};
}

function pass(message){console.log(`PASS ${message}`);}

const script = await fs.readFile('cloud-sync.js','utf8');
const session=await login(process.env.MYCAR_TEST_USER_A_EMAIL,process.env.MYCAR_TEST_USER_A_PASSWORD);
pass('User A authenticated against Staging only');
const id=`qa_sync_${Date.now()}_${randomBytes(5).toString('hex')}`;
const carId='qa_vehicle';
const a=createDevice(script,session,'A');
const b=createDevice(script,session,'B');
try {
  await a.cloud.syncNow();
  await b.cloud.syncNow();
  pass('Two simulated device contexts initialized independently');
  a.navigator.onLine=false;
  const before=a.data;
  const after=clone(before);
  after.other.push({id,vehicleId:carId,date:'2026-11-19',description:'QA sync test only',cost:17.25,notes:'staging integration QA'});
  a.setData(after);
  a.cloud.onLocalChange(before,after);
  assert.equal(a.cloud.pendingCount,1);
  await a.cloud.syncNow();
  assert.equal((await readRecord(session,id)).length,0);
  pass('Offline local change remains queued and is not written remotely');
  a.navigator.onLine=true;
  await a.cloud.syncNow();
  const inserted=await readRecord(session,id);
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].deleted,false);
  assert.equal(inserted[0].payload.cost,17.25);
  assert.equal(a.cloud.pendingCount,0);
  pass('Reconnected device uploads pending local change to Staging');
  await b.cloud.syncNow();
  assert.equal(b.data.other.find(x=>x.id===id)?.cost,17.25);
  pass('Second device downloads synchronized record');
  const oldB=b.data;const newB=clone(oldB);
  newB.other.find(x=>x.id===id).cost=20.5;
  b.setData(newB);
  b.cloud.onLocalChange(oldB,newB);
  await b.cloud.syncNow();
  await a.cloud.syncNow();
  assert.equal(a.data.other.find(x=>x.id===id)?.cost,20.5);
  pass('Update on device B synchronizes back to device A');
  await a.cloud.syncNow();await b.cloud.syncNow();
  assert.equal((await readRecord(session,id)).length,1);
  pass('Repeated synchronization does not duplicate record IDs');
  const oldA=a.data;const newA=clone(oldA);
  newA.other=newA.other.filter(x=>x.id!==id);
  a.setData(newA);a.cloud.onLocalChange(oldA,newA);
  await a.cloud.syncNow();
  assert.equal((await readRecord(session,id))[0].deleted,true);
  await b.cloud.syncNow();
  assert.equal(b.data.other.some(x=>x.id===id),false);
  pass('Deletion tombstone propagates to second device');
  console.log('STAGING CLOUD SYNC INTEGRATION PASSED: 8 checks. 1 QA tombstone created.');
} finally {
  // Cleanly terminate local contexts; do not hard-delete rows (role lacks DELETE permission).
  a.stop();b.stop();
  // If an assertion fails after upload but before deletion, mark only our generated QA row as deleted.
  {
    const rows=await readRecord(session,id).catch(()=>[]);
    if(rows.length===1 && !rows[0].deleted){
      const response=await fetch(`${url.origin}/rest/v1/mycar_records?user_id=eq.${session.id}&collection=eq.other&record_id=eq.${id}`,{
        method:'PATCH',headers:{...authHeaders(session.token),'Content-Type':'application/json'},body:JSON.stringify({deleted:true,payload:{}})
      });
      if(!response.ok) console.warn('QA tombstone cleanup did not complete; review the staging test row only.');
    }
  }
}

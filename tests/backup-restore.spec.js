const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Isolated dummy data; this suite never authenticates or connects to a real account.
const fixture = {
  activeVehicleId: 'qa-car',
  vehicles: [{ id: 'qa-car', name: 'QA Test Car', plate: 'QA-123', defaultFuel: 'RON95', currentOdometer: 1100, tireMileageLimit: 40000, lastTireChangeOdometer: 0 }],
  fuel: [{ id: 'f-1', vehicleId: 'qa-car', date: '2026-10-05', odometer: 1050, liters: 20, cost: 100, fuelType: 'RON95' }],
  maintenance: [{ id: 'm-1', vehicleId: 'qa-car', date: '2026-10-10', odometer: 1090, cost: 50, type: 'Service', garage: 'QA Garage' }],
  tax: [{ id: 'e-1', vehicleId: 'qa-car', date: '2026-10-10', cost: 10, type: 'Parking Fee', notes: 'QA' }],
  trips: [{ id: 't-1', vehicleId: 'qa-car', date: '2026-10-11', purpose: 'QA Trip', startOdometer: 1050, endOdometer: 1100, distance: 50, cost: 0, notes: '' }],
  other: [{ id: 'o-1', vehicleId: 'qa-car', date: '2026-10-11', description: 'QA Car Wash', cost: 7, notes: '' }]
};
const clone = x => JSON.parse(JSON.stringify(x));

async function openIsolatedApp(page) {
  // Explicitly disallow Supabase and replace the authentication/sync modules *inside the test browser only*.
  let cloudRequests = 0;
  await page.route(/https?:\/\/[^/]*\.supabase\.co\//, route => { cloudRequests++; return route.abort('blockedbyclient'); });
  await page.route(/\/auth\.js(?:\?.*)?$/, route => route.fulfill({status:200,contentType:'application/javascript',body:`
    const AuthManager={init:()=>{},get currentUser(){return null;},get projectId(){return 'qa-only';},signOut:()=>{},showPasswordUpdate:()=>{},getAccessToken:async()=>{throw Error('No real auth in QA')}};` }));
  await page.route(/\/cloud-sync\.js(?:\?.*)?$/, route => route.fulfill({status:200,contentType:'application/javascript',body:`
    const MYCARCloud={start:()=>{},stop:()=>{},syncNow:()=>{},onLocalChange:()=>{},get pendingCount(){return 0;}};` }));
  await page.route('https://open.er-api.com/**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:'success',base_code:'MYR',time_last_update_utc:'Wed, 18 Nov 2026 00:00:00 +0000',rates:{MYR:1,THB:8,USD:0.25}})}));
  await page.goto('/index.html', { waitUntil: 'load' });
  await expect.poll(()=>page.evaluate(()=>typeof exportJSON==='function' && typeof importJSON==='function' && typeof isValidBackup==='function')).toBe(true);
  await page.evaluate(data=>{
    dbData=structuredClone(data);
    initYearFilter();
    document.getElementById('filter-year').value='all';
    document.getElementById('filter-month').value='all';
    updateVehicleSelector();
    document.getElementById('auth-screen').hidden=true;
    document.getElementById('mycar-app-shell').hidden=false;
    switchTab('dashboard');
  }, fixture);
  await expect(page.locator('#sum-total-cost')).toHaveText('RM167.00');
  return ()=>cloudRequests;
}

async function exportJson(page, scope='all', from='', to='') {
  await page.evaluate(({scope,from,to})=>{
    document.getElementById('mycar-export-scope').value=scope;
    document.getElementById('mycar-export-start').value=from;
    document.getElementById('mycar-export-end').value=to;
  }, {scope,from,to});
  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(()=>exportJSON());
  const download=await downloadPromise;
  const filePath=await download.path();
  return {filename:download.suggestedFilename(),data:JSON.parse(await fs.readFile(filePath,'utf8'))};
}

test('full JSON export contains all categories and retains MYR numbers', async ({page})=>{
  const requests=await openIsolatedApp(page);
  const {filename,data}=await exportJson(page);
  expect(filename).toMatch(/^mycar_backup_all_\d{4}-\d\d-\d\d\.json$/);
  expect(data).toEqual(fixture);
  const sum=['fuel','maintenance','tax','trips','other'].flatMap(k=>data[k]).reduce((n,x)=>n+(Number(x.cost)||0),0);
  expect(sum).toBe(167);
  expect(requests()).toBe(0);
});


test('full JSON backup shows read-only preview without changing records', async ({page}) => {
  const requests = await openIsolatedApp(page);
  const {data} = await exportJson(page);

  const original = await page.evaluate(() => structuredClone(dbData));

  await page.evaluate(() => openSettingsModal());

  await page.locator('#settings-modal input[type="file"][accept=".json"]')
    .setInputFiles({
      name: 'qa-full.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data))
    });

  const preview = page.locator('#mycar-backup-preview');

  await expect(preview).toBeVisible();
  await expect(preview.locator('.mycar-backup-preview__status'))
    .toContainText('Valid structure');

  await expect(preview).toContainText('Comparison against records');

  expect(await page.evaluate(() => structuredClone(dbData)))
    .toEqual(original);

  await expect(page.locator('#sum-total-cost')).toHaveText('RM167.00');

  expect(requests()).toBe(0);
});

test('preview of changed backup leaves existing records untouched', async ({page}) => {
  const requests = await openIsolatedApp(page);
  const different = clone(fixture);
  different.fuel[0].cost = 9999;

  const original = await page.evaluate(() => structuredClone(dbData));

  await page.evaluate(() => openSettingsModal());

  await page.locator('#settings-modal input[type="file"][accept=".json"]')
    .setInputFiles({
      name: 'qa-changed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(different))
    });

  const preview = page.locator('#mycar-backup-preview');

  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Valid structure');
  await expect(preview).toContainText('1 changed IDs');

  expect(await page.evaluate(() => structuredClone(dbData)))
    .toEqual(original);

  await expect(page.locator('#sum-total-cost')).toHaveText('RM167.00');

  expect(requests()).toBe(0);
});

test('invalid backup preview rejects malformed files without changing records', async ({page}) => {
  const requests = await openIsolatedApp(page);

  const malformed = {
    vehicles: [{id: 'qa-car', name: 'Bad'}],
    fuel: [{id: 'f1', vehicleId: 'qa-car'}]
    // Missing required collections
  };

  const original = await page.evaluate(() => structuredClone(dbData));

  await page.evaluate(() => openSettingsModal());

  await page.locator('#settings-modal input[type="file"][accept=".json"]')
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(malformed))
    });

  const preview = page.locator('#mycar-backup-preview');

  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Not safe to restore');
  await expect(preview).toContainText('ERROR');

  expect(await page.evaluate(() => structuredClone(dbData)))
    .toEqual(original);

  await expect(page.locator('#sum-total-cost')).toHaveText('RM167.00');

  expect(requests()).toBe(0);
});

test('month-range report excludes out-of-range records and cannot be restored as backup', async ({page})=>{
  await openIsolatedApp(page);
  const {filename,data}=await exportJson(page,'range','2026-10','2026-10');
  expect(filename).toMatch(/^mycar_report_2026-10_to_2026-10_/);
  expect(data.type).toBe('MYCAR_PERIOD_REPORT_NOT_FOR_RESTORE');
  expect(data.records.vehicles).toHaveLength(1);
  expect(data.records.fuel).toHaveLength(1);
  expect(await page.evaluate(x=>isValidBackup(x),data)).toBe(false);
});

test('displaying THB/USD does not change exported MYR values', async ({page})=>{
  await openIsolatedApp(page);
  await page.evaluate(()=>openSettingsModal());
  await page.locator('#mycar-currency-select').selectOption('THB');
  await expect(page.locator('#sum-total-cost')).toHaveText('฿1,336.00');
  const {data}=await exportJson(page);
  expect(data).toEqual(fixture);
  await page.locator('#mycar-currency-select').selectOption('USD');
  await expect(page.locator('#sum-total-cost')).toHaveText('$41.75');
  expect(await page.evaluate(()=>[dbData.fuel[0].cost,dbData.maintenance[0].cost,dbData.tax[0].cost,dbData.other[0].cost])).toEqual([100,50,10,7]);
});

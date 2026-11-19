const { test, expect } = require('@playwright/test');

// QA fixture only. No Supabase credentials, no real account and no production writes.
const fixture = {
  activeVehicleId: 'v-test',
  vehicles: [{ id: 'v-test', name: 'QA Test Car', plate: 'TEST123', defaultFuel: 'RON95', currentOdometer: 1100, tireMileageLimit: 40000, lastTireChangeOdometer: 0 }],
  fuel: [{ id: 'fuel-a', vehicleId: 'v-test', date: '2026-10-05', odometer: 1050, liters: 20, cost: 100, fuelType: 'RON95' }],
  maintenance: [{ id: 'maint-a', vehicleId: 'v-test', date: '2026-10-10', odometer: 1090, cost: 50, type: 'Service', garage: 'QA Garage' }],
  tax: [{ id: 'tax-a', vehicleId: 'v-test', date: '2026-10-10', cost: 10, type: 'Parking Fee', notes: 'QA parking' }],
  trips: [{ id: 'trip-a', vehicleId: 'v-test', date: '2026-10-11', purpose: 'QA Trip', startOdometer: 1050, endOdometer: 1100, distance: 50, cost: 0, notes: '' }],
  other: [{ id: 'other-a', vehicleId: 'v-test', date: '2026-10-11', description: 'QA Car Wash', cost: 7, notes: 'QA dummy' }]
};

// Replace only auth and cloud-sync modules in the TEST browser, not in app files.
// This avoids asynchronous auth restoration/navigations changing the page during tests.
async function isolateApp(page) {
  let cloudRequests = 0;
  await page.route(/https?:\/\/[^/]*\.supabase\.co\//, route => {
    cloudRequests++;
    return route.abort('blockedbyclient');
  });
  await page.route(/\/auth\.js(?:\?.*)?$/, route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `const AuthManager = {
      init: () => {},
      get currentUser() { return null; },
      get projectId() { return 'qa-local-only'; },
      signOut: () => {},
      showPasswordUpdate: () => {},
      getAccessToken: async () => { throw new Error('QA: network authentication disabled'); }
    };`
  }));
  await page.route(/\/cloud-sync\.js(?:\?.*)?$/, route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `const MYCARCloud = {
      start: () => {}, stop: () => {}, syncNow: () => {}, onLocalChange: () => {},
      get pendingCount() { return 0; }
    };`
  }));
  await page.route('https://open.er-api.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      result: 'success', base_code: 'MYR',
      time_last_update_utc: 'Wed, 18 Nov 2026 00:00:00 +0000',
      rates: { MYR: 1, USD: 0.25, THB: 8 }
    })
  }));
  return () => cloudRequests;
}

async function loadDummyApp(page) {
  const cloudRequests = await isolateApp(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await expect(page.locator('#mycar-app-shell')).toHaveCount(1);
  // Wait for defer scripts + DOMContentLoaded to finish before injecting fixture.
  await expect.poll(() => page.evaluate(() => typeof switchTab === 'function' && typeof updateVehicleSelector === 'function')).toBe(true);
  await page.evaluate(data => {
    dbData = JSON.parse(JSON.stringify(data));
    initYearFilter();
    document.querySelector('#filter-year').value = 'all';
    document.querySelector('#filter-month').value = 'all';
    updateVehicleSelector();
    document.querySelector('#auth-screen').hidden = true;
    document.querySelector('#mycar-app-shell').hidden = false;
    switchTab('dashboard');
  }, fixture);
  await expect(page.locator('#mycar-app-shell')).toBeVisible();
  // A fixture integrity check distinguishes harness failures from app failures.
  expect(await page.evaluate(() => dbData.other[0].cost)).toBe(7);
  return cloudRequests;
}

test('login screen is reachable without test credentials', async ({ page }) => {
  await isolateApp(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('#auth-email')).toBeVisible();
});

test('all five tabs reset scroll position on tab change', async ({ page }) => {
  const cloudRequests = await loadDummyApp(page);
  const tabs = ['dashboard', 'fuel', 'maintenance', 'tax', 'trips'];
  for (const tab of tabs) {
    await page.evaluate(() => {
      const main = document.getElementById('main-content');
      const padding = document.getElementById('qa-scroll-padding') || document.createElement('div');
      padding.id = 'qa-scroll-padding'; padding.style.height = '2500px';
      main.appendChild(padding);
      main.scrollTop = 700;
    });
    expect(await page.locator('#main-content').evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await page.evaluate(t => switchTab(t), tab);
    await expect.poll(() => page.locator('#main-content').evaluate(el => el.scrollTop)).toBe(0);
    await expect(page.locator(`#tab-${tab}`)).toBeVisible();
  }
  expect(cloudRequests()).toBe(0);
});

test('Other Expenses is in Expenses only, not under Trips', async ({ page }) => {
  await loadDummyApp(page);
  await expect(page.locator('#tab-tax #other-list')).toHaveCount(1);
  await expect(page.locator('#tab-trips #other-list')).toHaveCount(0);
  await page.evaluate(() => switchTab('tax'));
  await expect(page.locator('#tab-tax')).toContainText('QA Car Wash');
});

test('summary totals include Other Expenses without changing the MYR source', async ({ page }) => {
  await loadDummyApp(page);
  await expect(page.locator('#sum-total-cost')).toHaveText('RM167.00');
  await expect(page.locator('#card-other-cost')).toContainText('50 km');
  const stored = await page.evaluate(() => dbData.other[0].cost);
  expect(stored).toBe(7);
});

test('currency switch changes displayed values but preserves MYR source', async ({ page }) => {
  await loadDummyApp(page);
  await page.evaluate(() => openSettingsModal());
  await page.locator('#mycar-currency-select').selectOption('THB');
  await expect(page.locator('#sum-total-cost')).toHaveText('฿1,336.00');
  await page.locator('#mycar-currency-select').selectOption('USD');
  await expect(page.locator('#sum-total-cost')).toHaveText('$41.75');
  const original = await page.evaluate(() => [dbData.fuel[0].cost, dbData.maintenance[0].cost, dbData.tax[0].cost, dbData.other[0].cost]);
  expect(original).toEqual([100, 50, 10, 7]);
});

test('mobile shell and header stay within screen width', async ({ page }) => {
  await loadDummyApp(page);
  const metrics = await page.evaluate(() => {
    const shell = document.getElementById('mycar-app-shell');
    const rect = shell.getBoundingClientRect();
    const header = shell.querySelector('header').getBoundingClientRect();
    return { viewport: document.documentElement.clientWidth, shellLeft: rect.left, shellRight: rect.right, headerRight: header.right, pageWidth: document.documentElement.scrollWidth };
  });
  expect(metrics.shellLeft).toBeGreaterThanOrEqual(-1);
  expect(metrics.shellRight).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.headerRight).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewport + 1);
});

test('Settings modal stays within viewport and can scroll to backup controls', async ({ page }) => {
  await loadDummyApp(page);
  await page.evaluate(() => openSettingsModal());
  const modal = page.locator('#settings-modal');
  await expect(modal).toBeVisible();
  const result = await modal.evaluate(el => {
    const panel = el.firstElementChild;
    const rect = panel.getBoundingClientRect();
    const scrollables = [panel, ...panel.querySelectorAll('*')].filter(x => {
      const style = getComputedStyle(x);
      return /(auto|scroll)/.test(style.overflowY) && x.scrollHeight > x.clientHeight + 2;
    });
    return { bottom: rect.bottom, viewportHeight: innerHeight, scrollable: scrollables.length > 0 };
  });
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
  expect(result.scrollable).toBe(true);
  await expect(page.getByText('Restore Backup (JSON)')).toHaveCount(1);
});

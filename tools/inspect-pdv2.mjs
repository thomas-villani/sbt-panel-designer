import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'C:/Users/thoma/AppData/Local/Temp/claude/pdv2';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('pdv2')) ?? ctx.pages()[0];
await page.setViewportSize({ width: 1500, height: 1000 });
await page.goto('https://pdv2.standardbio.com/experiment/216732', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
const shot = async name => { await page.waitForTimeout(1000); await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); console.log('SHOT', name); };

// 1. instrument options + panel state
const instr = await page.$$eval('select[name=instrument] option, #instrument option, select option', os => os.map(o => [o.value, o.textContent.trim()]));
console.log('OPTIONS', JSON.stringify(instr).slice(0, 1500));

// 2. call the data endpoints from page context (inherits session + jQuery ajaxSetup CSRF)
const post = async (url, data) => page.evaluate(async ([u, d]) => {
  const tok = document.querySelector('meta[name=csrf-token]')?.content || '';
  const body = new URLSearchParams({ ...d, _token: tok });
  try { const r = await fetch(u, { method: 'POST', body, headers: { 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }); return `${r.status} ` + await r.text(); } catch (e) { return 'ERR ' + e.message; }
}, [url, data]);
const calls = [
  ['massbias_1', '/massbias/get/1', {}], ['massbias_2', '/massbias/get/2', {}], ['massbias_3', '/massbias/get/3', {}],
  ['spillover_7', '/spillover/get_customer/7', {}], ['spillover_1', '/spillover/get_customer/1', {}], ['spillover_2', '/spillover/get_customer/2', {}], ['spillover_3', '/spillover/get_customer/3', {}], ['spillover_4', '/spillover/get_customer/4', {}], ['spillover_5', '/spillover/get_customer/5', {}], ['spillover_6', '/spillover/get_customer/6', {}],
  ['catalog_get', '/catalog/get/', {}],
  ['exp_nodes', '/node/get_exp_nodes/216732/undefined/false', {}],
  ['kits', '/experiment/get_kits/216732', {}],
  ['group_ref', '/group/get_ref_list/216732', {}],
  ['labels_CD8a', '/product/get_labels_by_target', { target: 'CD8a', reactivity: 'Human' }],
  ['labels_CD45', '/product/get_labels_by_target', { target: 'CD45' }],
  ['open_channels', '/experiment/open_channels', { exp_id: 216732 }],
];
for (const [name, url, data] of calls) {
  const r = await post(url, data);
  fs.writeFileSync(`${out}/api_${name}.txt`, r);
  console.log('API', name, r.length, r.slice(0, 160).replace(/\s+/g, ' '));
}

// 3. dialogs
for (const [name, sel] of [['quickadd', 'text=QUICK ADD'], ['advsearch', 'text=ADVANCED SEARCH'], ['importpanel', 'text=IMPORT PANEL'], ['quote', 'text=QUOTE REQUEST']]) {
  try { await page.click(sel, { timeout: 5000 }); await shot(`dlg_${name}`); await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.$$eval('.ui.modal .close, .modal .close, button:has-text("Cancel"), button:has-text("Close")', b => b.forEach(x => x.click())).catch(() => {}); } catch (e) { console.log('ERR', name, e.message.slice(0, 80)); }
}
// 4. sidebar icons
const side = await page.$$('a[href*="pdv2"], .sidebar a, nav a, #sidebar a');
const hrefs = [...new Set((await Promise.all(side.map(a => a.getAttribute('href')))).filter(Boolean))];
console.log('SIDEBAR', JSON.stringify(hrefs));
const icons = await page.$$eval('a', as => as.filter(a => a.closest('[class*=side], [class*=nav], [class*=menu]')).map(a => a.href + ' | ' + (a.className || '') + ' | ' + a.innerHTML.replace(/\s+/g, ' ').slice(0, 80)));
console.log('ICONS', JSON.stringify(icons.slice(0, 20)));
for (const h of hrefs) {
  if (/logout|login/.test(h)) continue;
  try { await page.goto(h, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(3000); await shot('side_' + new URL(h).pathname.replace(/[^a-z0-9]+/gi, '_')); } catch (e) { console.log('ERR', h, e.message.slice(0, 80)); }
}
console.log('DONE');

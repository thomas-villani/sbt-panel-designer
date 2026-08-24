import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'C:/Users/thoma/AppData/Local/Temp/claude/pdv2';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('pdv2')) ?? ctx.pages()[0];
await page.setViewportSize({ width: 1500, height: 1000 });
const shot = async name => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${name}.png` }); console.log('SHOT', name); };
const post = async (url, data) => page.evaluate(async ([u, d]) => {
  const tok = document.querySelector('meta[name=csrf-token]')?.content || '';
  const body = new URLSearchParams({ ...d, _token: tok });
  try { const r = await fetch(u, { method: 'POST', body, headers: { 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }); return `${r.status} ` + await r.text(); } catch (e) { return 'ERR ' + e.message; }
}, [url, data]);

// A. landing: Create New Panel dialog
await page.goto('https://pdv2.standardbio.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
try { await page.click('button:has-text("Create New Panel"), a:has-text("Create New Panel"), :text("Create New Panel")', { timeout: 5000 }); await shot('dlg_create_panel');
  const opts = await page.$$eval('select', ss => ss.map(s => (s.name || s.id) + ': ' + [...s.options].map(o => o.value + '=' + o.textContent.trim()).join(' | ')));
  console.log('CREATE_SELECTS', JSON.stringify(opts));
  // try switching panel type / reactivity radios to reveal suspension instruments
  const radios = await page.$$eval('input[type=radio], input[type=checkbox]', rs => rs.map(r => r.name + '=' + r.value + ':' + (r.labels?.[0]?.textContent?.trim() || '')));
  console.log('CREATE_RADIOS', JSON.stringify(radios));
  for (const r of await page.$$('input[type=radio]')) { try { await r.check({ force: true }); await page.waitForTimeout(500); const o = await page.$$eval('select', ss => ss.map(s => (s.name || s.id) + ': ' + [...s.options].map(x => x.value + '=' + x.textContent.trim()).join(' | '))); console.log('AFTER_RADIO', JSON.stringify(o)); } catch {} }
  await shot('dlg_create_panel_2');
  await page.keyboard.press('Escape');
} catch (e) { console.log('ERR create', e.message.slice(0, 100)); }

// B. experiment page dialogs
await page.goto('https://pdv2.standardbio.com/experiment/216732', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
for (const [name, txt] of [['advsearch', 'Advanced Search'], ['importpanel', 'Import Panel'], ['quote', 'Quote Request'], ['export', 'Export']]) {
  try { await page.click(`:text-is("${txt}"), :text("${txt.toUpperCase()}"), button:has-text("${txt}"), a:has-text("${txt}"), div:has-text("${txt}") >> nth=-1`, { timeout: 6000 }); await shot(`dlg_${name}`); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  catch (e) { console.log('ERR', name, e.message.slice(0, 80)); await page.goto('https://pdv2.standardbio.com/experiment/216732', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000); }
}
// abundance dropdown info + tag dropdown for one row
const rowSel = await page.$$eval('select', ss => ss.slice(0, 12).map(s => (s.className || s.name) + ': ' + [...s.options].map(o => o.value + '=' + o.textContent.trim()).join(' | ').slice(0, 300)));
console.log('ROW_SELECTS', JSON.stringify(rowSel));

// C. kit contents
const kits = JSON.parse(fs.readFileSync(`${out}/api_kits.txt`, 'utf8').replace(/^\d+ /, ''));
console.log('KITKEYS', Object.keys(kits), 'panels:', JSON.stringify(kits.panels).slice(0, 300));
const all = {};
for (const k of kits.kits) { const r = await post(`/node/get_exp_nodes/${k.id}/undefined/false`, {}); all[k.name] = { meta: k, nodes: r.startsWith('200') ? JSON.parse(r.slice(4)) : r }; console.log('KIT', k.name, r.length); }
fs.writeFileSync(`${out}/api_kit_contents.json`, JSON.stringify(all, null, 1));
// D. spillover for instruments, export endpoint, labels with proper params
for (const [n, u, d] of [['labels2', '/product/get_labels_by_target', { target: 'CD8a', reactivity: '[1]', catalog: 1, panel_type: 1 }], ['sigtol', '/product/get_signal_tolerance', { product_id: 3148020, catalog: 1 }], ['precheck', '/optimize/pre_check', { exp_id: 216732 }]]) { const r = await post(u, d); fs.writeFileSync(`${out}/api_${n}.txt`, r); console.log('API', n, r.slice(0, 200).replace(/\s+/g, ' ')); }
console.log('DONE');

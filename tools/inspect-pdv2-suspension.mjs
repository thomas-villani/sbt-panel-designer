import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'C:/Users/thoma/AppData/Local/Temp/claude/pdv2';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('pdv2')) ?? ctx.pages()[0];
await page.setViewportSize({ width: 1500, height: 1000 });
const shot = async name => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${name}.png` }); console.log('SHOT', name); };
const post = async (url, data) => page.evaluate(async ([u, d]) => { const tok = document.querySelector('meta[name=csrf-token]')?.content || ''; const body = new URLSearchParams({ ...d, _token: tok }); const r = await fetch(u, { method: 'POST', body, headers: { 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' }); return `${r.status} ` + await r.text(); }, [url, data]);
const get = async (url) => page.evaluate(async u => { const r = await fetch(u, { credentials: 'same-origin' }); return `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-disposition') || ''}\n` + await r.text(); }, url);

await page.goto('https://pdv2.standardbio.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
const findExp = async () => (await page.$$eval('a[href*="/experiment/"]', as => as.map(a => [a.textContent.trim(), a.href]))).find(([t]) => t === 'PD3 capture - suspension')?.[1]?.match(/experiment\/(\d+)/)?.[1];
let expId = await findExp();
if (!expId) {
  await page.click(':text("Create New Panel")'); await page.waitForTimeout(1000);
  await page.evaluate(() => { const f = document.querySelector('#create-panel-form'); f.querySelector('input[name=name]').value = 'PD3 capture - suspension'; f.querySelector('#reactivity_1').checked = true; f.querySelector('#instrument').value = '4'; f.submit(); });
  await page.waitForTimeout(4000);
  console.log('URL after create', page.url());
  if (!/experiment\/\d+/.test(page.url())) { await page.goto('https://pdv2.standardbio.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); }
  expId = page.url().match(/experiment\/(\d+)/)?.[1] ?? await findExp();
}
console.log('EXP', expId);
if (expId) {
  await page.goto(`https://pdv2.standardbio.com/experiment/${expId}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
  await shot('susp_01_empty');
  const r = await post(`/experiment/get_kits/${expId}`, {}); fs.writeFileSync(`${out}/api_kits_susp.txt`, r); console.log('KITS', r.slice(0, 200));
  try { const kits = JSON.parse(r.replace(/^\d+ /, '')); const all = {}; for (const k of kits.kits) { const n = await post(`/node/get_exp_nodes/${k.id}/undefined/false`, {}); all[k.name] = { meta: k, nodes: n.startsWith('200') ? JSON.parse(n.slice(4)) : n }; console.log('KIT', k.name, k.instrument_type, n.length); } fs.writeFileSync(`${out}/api_kit_contents_susp.json`, JSON.stringify(all, null, 1)); } catch (e) { console.log('ERR kits', e.message.slice(0, 100)); }
  // quick-add CD45 so exports have a row
  const lbl = await post('/product/get_labels_by_target', { target: 'CD45', exp_id: expId, reactivity: '[1]' }); console.log('LABELS', lbl.slice(0, 200));
}
// Export formats for the IMC panel 216732 (and suspension if it has rows)
const ids = [216732].concat(expId ? [Number(expId)] : []);
for (const kind of ['export_panel_multiple', 'export_quote_multiple', 'export_tags_multiple']) {
  const r = await get(`/experiment/${kind}/${encodeURIComponent(JSON.stringify(ids))}`);
  fs.writeFileSync(`${out}/fmt_${kind}.txt`, r); console.log('FMT', kind, r.length, r.slice(0, 300).replace(/\s+/g, ' '));
}
const ct = await get('/catalog/export/' + encodeURIComponent(JSON.stringify([]))); fs.writeFileSync(`${out}/fmt_catalog_export_empty.txt`, ct); console.log('CATEXP', ct.slice(0, 300).replace(/\s+/g, ' '));
// catalog template link
await page.goto('https://pdv2.standardbio.com/catalog', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000);
const tmplJs = await page.evaluate(() => { const s = [...document.scripts].map(x => x.textContent).join('\n'); const m = s.match(/[^\n]*template[^\n]*/gi); return m ? m.slice(0, 10) : []; }); console.log('TMPL_JS', JSON.stringify(tmplJs));
// Quote modal on My Panels with a panel checked
await page.goto('https://pdv2.standardbio.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
await page.evaluate(() => { const c = document.querySelector('.panels .panel-check[value="216732"]'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
await page.evaluate(() => document.querySelector('.panels .gen-quote-btn')?.click());
await page.waitForTimeout(2500); await shot('dlg_quote_checked');
fs.writeFileSync(`${out}/page_quote_modal.html`, await page.content());
const modalText = await page.evaluate(() => [...document.querySelectorAll('.ui.modal, .modal, [role=dialog]')].filter(m => getComputedStyle(m).display !== 'none').map(m => m.innerText.slice(0, 3000)));
console.log('MODAL', JSON.stringify(modalText).slice(0, 3000));
console.log('DONE');

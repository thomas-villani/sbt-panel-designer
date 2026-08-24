// Metered harvest of per-conjugate Signal_Di / Tolerance_Di from pdv2 via the user's logged-in Edge (CDP :9222).
// One call per unique (panel type, target), 1.2 s apart, idempotent (skips targets already saved).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = 'C:/Users/thoma/AppData/Local/Temp/claude/pdv2/harvest';
fs.mkdirSync(out, { recursive: true });
const raw = JSON.parse(fs.readFileSync('C:/Users/thoma/AppData/Local/Temp/claude/pdv2/pdv2_products_raw.json', 'utf8'));
const jobs = [...new Map(raw.map(r => [r.panel_type + '|' + r.cells[4], { pt: r.panel_type, target: r.cells[4] }])).values()];
console.log('jobs', jobs.length);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find(p => p.url().includes('pdv2'));
if (!page) { console.log('No pdv2 tab open in the debug Edge window'); process.exit(1); }
const post = async (url, data) => page.evaluate(async ([u, d]) => {
  const tok = document.querySelector('meta[name=csrf-token]')?.content || '';
  const body = new URLSearchParams({ ...d, _token: tok });
  const r = await fetch(u, { method: 'POST', body, headers: { 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' });
  return `${r.status} ` + await r.text();
}, [url, data]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let i = 0, fail = 0;
for (const j of jobs) {
  const exp = j.pt === 'IMC' ? 216732 : 216733;
  const file = `${out}/${j.pt}_${j.target.replace(/[^a-z0-9]+/gi, '_')}.json`;
  if (fs.existsSync(file)) { i++; continue; }
  let r = await post('/product/get_labels_by_target', { target: j.target, exp_id: exp, reactivity: '[1,2,3,4]' });
  if (!r.startsWith('200')) { await sleep(3000); r = await post('/product/get_labels_by_target', { target: j.target, exp_id: exp, reactivity: '[1]' }); }
  if (r.startsWith('200')) fs.writeFileSync(file, r.slice(4)); else { fail++; fs.writeFileSync(file + '.err', r.slice(0, 300)); }
  i++;
  if (i % 25 === 0) console.log(`progress ${i}/${jobs.length} fail=${fail}`);
  await sleep(1200);
}
console.log(`DONE ${i}/${jobs.length} fail=${fail}`);
process.exit(0);

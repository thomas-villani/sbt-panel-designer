/**
 * Drive the running dev server through SPEC 6.4 (Priya: IMC / human / FFPE) with Playwright.
 * Usage: node scripts/drive.mjs [baseUrl]   -> screenshots in scripts/shots/, exits non-zero on failure.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
mkdirSync("scripts/shots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: `scripts/shots/${n}.png`, fullPage: true });
const step = async (name, fn) => { process.stdout.write(`${name} ... `); await fn(); console.log("ok"); };
const sidebarRows = () => page.locator("aside ul li").filter({ has: page.locator("button") }).count();

try {
  await step("load", async () => {
    await page.goto(base);
    await page.getByText("What are you measuring?").waitFor({ timeout: 20000 });
    await shot("01-setup");
  });
  await step("setup: imaging / human / FFPE", async () => {
    await page.getByRole("button", { name: /Tissue imaging/ }).click();
    await page.getByRole("button", { name: "Human", exact: true }).click();
    await page.getByRole("button", { name: "FFPE", exact: true }).click();
    await page.getByRole("button", { name: /Choose markers/ }).click();
    await page.getByText("Start from a module").waitFor();
    await shot("02-build-empty");
  });
  await step("add 6 modules", async () => {
    for (const name of ["Tissue architecture", "Basic immune", "Lymphoid", "Myeloid / macrophages", "Functional state", "T-cell exhaustion"]) {
      const card = page.locator("div.rounded-lg").filter({ has: page.getByText(name, { exact: true }) }).first();
      await card.getByRole("button", { name: /^Add \d+ markers/ }).click();
    }
    const n = await sidebarRows();
    if (n < 20) throw new Error(`expected >= 20 rows, got ${n}`);
    console.log(`(${n} rows)`);
    await shot("03-build-modules");
  });
  await step("no metals visible before balance", async () => {
    const txt = await page.locator("aside").innerText();
    if (/\b1[4-7]\d[A-Z][a-z]\b/.test(txt)) throw new Error("metal label visible in sidebar before Balance");
  });
  await step("search + add Granzyme B, PD-L1", async () => {
    const box = page.getByPlaceholder(/e\.g\. CD8a/);
    for (const q of ["granzyme", "PD-L1"]) {
      await box.fill(q);
      await page.locator("div.absolute button").first().waitFor();
      const hit = page.locator("div.absolute button:not([disabled])").first();
      if (await hit.count()) await hit.click(); else console.log();
    }
    await box.fill("CD163, Pan-Cytokeratin, CD31");
    await page.getByRole("button", { name: /Add all/ }).click();
    console.log(`(${await sidebarRows()} rows)`);
  });
  await step("balance", async () => {
    await page.getByRole("button", { name: /Balance panel/ }).first().click();
    await page.getByRole("button", { name: "Balance panel", exact: true }).click();
    await page.getByText(/Panel is balanced|thing(s)? to look at/).waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await shot("04-balance");
    const txt = await page.locator("aside").innerText();
    if (!/\b\d{2,3}[A-Z][a-z]\b/.test(txt)) throw new Error("no metal chips after Balance");
    console.log(`(${(txt.match(/spillover score [\d.]+/) ?? ["?"])[0]})`);
  });
  await step("apply fixes if any", async () => {
    for (let i = 0; i < 5; i++) {
      const apply = page.getByRole("button", { name: "Apply" }).first();
      if (!(await apply.count())) break;
      await apply.click();
      await page.waitForTimeout(600);
    }
    await shot("05-balance-fixed");
  });
  await step("lock a row and cycle abundance", async () => {
    const first = page.locator("aside ul li").first();
    await first.locator("button").first().click();
    const sel = first.locator("select").last();
    await sel.selectOption({ index: 1 });
    await page.waitForTimeout(700);
    if (!(await first.innerText()).includes("🔒")) throw new Error("lock icon missing");
    await first.locator("button").first().click();
    await shot("06-locked");
  });
  await step("overlap map + why", async () => {
    await page.getByRole("button", { name: /Show overlap map/ }).click();
    await page.getByRole("button", { name: /Why metals matter/ }).click();
    await page.getByRole("heading", { name: "Overlap map" }).waitFor();
    await shot("07-overlap");
  });
  await step("order", async () => {
    await page.getByRole("button", { name: /Order \/ export/ }).click();
    await page.getByText("Part number").waitFor();
    await page.getByRole("spinbutton").fill("40");
    const rows = await page.locator("main tbody tr").count();
    const missing = await page.locator("main tbody tr", { hasText: "—" }).count();
    console.log(`(${rows} BOM lines, ${missing} without SKU)`);
    await shot("08-order");
  });
  await step("share link reload restores state", async () => {
    const url = page.url();
    if (!url.includes("#")) throw new Error("no hash in URL");
    const before = await sidebarRows();
    await page.goto("about:blank");
    await page.goto(url);
    await page.getByText(/Panel is balanced|thing(s)? to look at|Balance/).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const after = await sidebarRows();
    if (after !== before) throw new Error(`rows ${before} -> ${after} after reload`);
    await shot("09-reload");
  });
  await step("suspension flow: PBMC backbone on CyTOF XT", async () => {
    await page.goto(base);
    await page.getByText("What are you measuring?").waitFor();
    await page.getByRole("button", { name: /Suspension cells/ }).click();
    await page.getByRole("button", { name: /Choose markers/ }).click();
    const card = page.locator("div.rounded-lg").filter({ has: page.getByText("Immune lineage backbone (human)", { exact: true }) }).first();
    await card.getByRole("button", { name: /^Add \d+ markers/ }).click();
    await page.getByRole("button", { name: /Balance panel/ }).first().click();
    await page.getByRole("button", { name: "Balance panel", exact: true }).click();
    await page.getByText(/Panel is balanced|thing(s)? to look at/).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    await shot("10-suspension");
  });
} catch (e) {
  console.log("FAILED:", e.message);
  await shot("99-failure");
  process.exitCode = 1;
}
if (errors.length) { console.log("console errors:"); for (const e of errors) console.log("  " + e.slice(0, 300)); process.exitCode = 1; }
else console.log("no console errors");
await browser.close();

/** One-off visual check of the cell-type search + cards: node scripts/shot-celltypes.mjs [baseUrl] -> scripts/shots/06-*.png */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000/";
mkdirSync("scripts/shots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.goto(base);
await page.getByRole("button", { name: /Suspension cells/ }).click();
await page.getByRole("button", { name: /Choose markers/ }).click();
const box = page.getByPlaceholder(/e\.g\. CD8a/);
await box.fill("dendritic");
await page.getByTestId("module-hit").first().waitFor();
await page.screenshot({ path: "scripts/shots/06-celltype-search.png" });
await page.getByTestId("module-hit").first().click();
await page.getByRole("button", { name: "Cell types" }).click();
await page.getByText("all targets already in panel").first().waitFor();
await page.screenshot({ path: "scripts/shots/07-celltype-cards.png", fullPage: false });
await page.locator("aside ul li button").first().click();
await page.getByTestId("papers").waitFor();
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByLabel("Panel name").fill("DC panel");
await page.screenshot({ path: "scripts/shots/08-sidebar-papers-save.png", fullPage: false });
await browser.close();
console.log("ok");

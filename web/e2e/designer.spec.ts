/** SPEC 6.4 acceptance scenario (Priya: IMC / human / FFPE) plus a suspension pass, driven through the real UI. */
import { expect, test, type Page } from "@playwright/test";

const METAL = /\d{2,3}[A-Z][a-z]/; // innerText runs words together, so no \b
const sidebarRows = (page: Page) => page.locator("aside ul li").filter({ has: page.locator("button") });
const addModule = async (page: Page, name: string) => {
  const card = page.locator("div.rounded-lg").filter({ has: page.getByText(name, { exact: true }) }).first();
  await card.getByRole("button", { name: /^Add \d+ markers/ }).click();
};
const balance = async (page: Page) => {
  await page.getByRole("button", { name: /Balance panel/ }).first().click();
  await page.getByRole("button", { name: "Balance panel", exact: true }).click();
  await expect(page.getByText(/Panel is balanced|thing(s)? to look at/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("aside")).toContainText(/spillover score/);
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto("/");
  await expect(page.getByText("What are you measuring?")).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test("Priya: IMC panel from modules to BOM, shareable by URL", async ({ page }) => {
  await page.getByRole("button", { name: /Tissue imaging/ }).click();
  await page.getByRole("button", { name: "Human", exact: true }).click();
  await page.getByRole("button", { name: "FFPE", exact: true }).click();
  await expect(page.getByRole("button", { name: /Hyperion XTi/ })).toHaveClass(/border-teal/);
  await page.getByRole("button", { name: /Choose markers/ }).click();

  for (const m of ["Tissue architecture", "Basic immune", "Lymphoid", "Myeloid / macrophages", "Functional state", "T-cell exhaustion"]) await addModule(page, m);
  await expect(sidebarRows(page)).toHaveCount(27);
  await expect(page.locator("aside")).toContainText("27 of ~41 channels · 6 modules");
  await expect(page.locator("aside")).not.toContainText(METAL); // no metals before Balance

  const box = page.getByPlaceholder(/e\.g\. CD8a/);
  await box.fill("granzyme");
  await expect(page.locator("div.absolute button").first()).toBeDisabled(); // already in the panel
  await box.fill("CD163, Pan-Cytokeratin, CD31");
  await page.getByRole("button", { name: /Add all/ }).click();
  await expect(sidebarRows(page)).toHaveCount(28);

  await balance(page);
  await expect(page.locator("aside")).toContainText(METAL);
  const strip = page.locator("main .flex.h-24 > div");
  expect(await strip.count()).toBeGreaterThanOrEqual(45);
  await expect(strip.filter({ hasText: "" }).locator("div.bg-emerald-500")).toHaveCount(28);

  // Apply every offered fix; the panel must stay fully assigned.
  for (let i = 0; i < 5 && (await page.getByRole("button", { name: "Apply" }).count()); i++) {
    await page.getByRole("button", { name: "Apply" }).first().click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator("aside")).not.toContainText("unassigned");

  // Lock the first row to a specific channel via the drawer.
  const first = sidebarRows(page).first();
  await first.locator("button").first().click();
  await first.locator("select").last().selectOption({ index: 1 });
  await expect(first).toContainText("🔒");
  await expect(page.getByRole("button", { name: /Unlock all \(1\)/ })).toBeVisible();

  await page.getByRole("button", { name: /Show overlap map/ }).click();
  await expect(page.getByRole("heading", { name: "Overlap map" })).toBeVisible();

  await page.getByRole("button", { name: /Order \/ export/ }).click();
  await expect(page.getByText("Part number")).toBeVisible();
  await page.getByRole("spinbutton").fill("40");
  await expect(page.locator("main tbody tr")).toHaveCount(28);
  await expect(page.locator("main tbody tr", { hasText: "—" })).toHaveCount(0);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.csv$/);

  // Reload the share URL: same panel, same lock.
  const url = page.url();
  expect(url).toContain("#");
  await page.goto("about:blank");
  await page.goto(url);
  await expect(sidebarRows(page)).toHaveCount(28);
  await expect(page.locator("aside")).toContainText("🔒");
});

test("suspension: PBMC backbone balances on the CyTOF XT with reserved channels untouched", async ({ page }) => {
  await page.getByRole("button", { name: /Suspension cells/ }).click();
  await page.getByRole("button", { name: /Choose markers/ }).click();
  await addModule(page, "Immune lineage backbone (human)");
  await balance(page);
  const txt = await page.locator("aside").innerText();
  for (const reserved of ["191Ir", "193Ir", "194Pt", "195Pt", "198Pt"]) expect(txt).not.toContain(reserved);
  await expect(page.locator("main .flex.h-24 > div")).toHaveCount(68);
});

test("search offers custom conjugation when nothing matches", async ({ page }) => {
  await page.getByRole("button", { name: /Choose markers/ }).click();
  const box = page.getByPlaceholder(/e\.g\. CD8a/);
  await box.fill("zzz-not-a-marker");
  await page.getByText(/custom conjugation/).first().click();
  await expect(sidebarRows(page)).toHaveCount(1);
  await expect(page.locator("aside")).toContainText("custom");
});

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
  await expect(page.locator("aside")).toContainText("27 of ~38 channels · 6 modules");
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

test("cell types: 'dendritic' adds the DC gate with its negatives; overlap copy; save / restore in this browser", async ({ page }) => {
  await page.getByRole("button", { name: /Suspension cells/ }).click();
  await page.getByRole("button", { name: /Choose markers/ }).click();
  const box = page.getByPlaceholder(/e\.g\. CD8a/);

  // Typing "CD4" keeps the antibody first (Enter adds CD4, not the "CD4 helper T cells" module).
  await box.fill("CD4");
  await expect(page.locator("div.absolute button").first()).toHaveText(/^CD4/);
  await box.press("Enter");
  await expect(sidebarRows(page)).toHaveCount(1);

  await box.fill("dendritic");
  const hit = page.getByTestId("module-hit").first();
  await expect(hit).toContainText("Dendritic cells");
  await expect(hit).toContainText("adds HLA-DR, CD11c, CD123");
  await expect(hit).toContainText("CD3ε−"); // lineage negatives are spelled out
  await hit.click();
  await expect(sidebarRows(page)).toHaveCount(8); // CD4 + HLA-DR, CD11c, CD123, CD3ε−, CD19−, CD14−, CD56−
  await expect(page.locator("aside")).toContainText("1 module");

  // Card copy when another module already covers the markers: no more "Add 0 markers".
  const pdc = page.locator("div.rounded-lg").filter({ has: page.getByText("Plasmacytoid dendritic cells (pDC)", { exact: true }) }).first();
  await expect(pdc).toContainText("3 of 4 already in panel");
  await expect(pdc.getByRole("button", { name: "Add 1 marker" })).toBeVisible();
  await page.getByRole("button", { name: "Cell types" }).click();
  const tcells = page.locator("div.rounded-lg").filter({ has: page.getByText("T cells", { exact: true }) }).first();
  await expect(tcells).toContainText("all targets already in panel");
  await tcells.getByRole("button", { name: "Tag as module" }).click();
  await expect(sidebarRows(page)).toHaveCount(8);
  await expect(page.locator("aside")).toContainText("2 modules");

  // Papers from the literature DB appear in the row drawer.
  await sidebarRows(page).first().locator("button").first().click();
  await expect(page.getByTestId("papers")).toContainText(/\d+ papers mention this marker/);

  // Save in this browser, clear, load it back.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Panel name").fill("My DC panel");
  await page.getByLabel("Panel name").press("Enter");
  await expect(page.getByTestId("saved-panels")).toContainText("My DC panel");
  await expect(page.getByTestId("saved-panels")).toContainText("8 markers");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(sidebarRows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "My DC panel" }).click();
  await expect(sidebarRows(page)).toHaveCount(8);

  // A plain reload (no share hash) picks the draft back up and says so.
  await page.goto("/");
  await expect(page.getByTestId("restored-draft")).toContainText("8 markers");
  await expect(sidebarRows(page)).toHaveCount(8);
  await page.getByRole("button", { name: "Start fresh" }).click();
  await expect(sidebarRows(page)).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByText("What are you measuring?")).toBeVisible();
  await expect(page.getByTestId("restored-draft")).toHaveCount(0);
});

/** VP feedback round 1: the channel count must show its working and the segmentation kit must be optional. */
test("IMC channel budget: 38 explained, segmentation kit optional, channels can be kept empty", async ({ page }) => {
  await page.getByRole("button", { name: /Tissue imaging/ }).click();
  await expect(page.getByTestId("setup-budget")).toContainText("38");
  await expect(page.getByTestId("setup-budget")).toContainText("43 channels");

  // Not running the segmentation kit gives its three Pt channels back.
  await page.getByRole("checkbox", { name: /Cell segmentation kit/ }).uncheck();
  await expect(page.getByTestId("setup-budget")).toContainText("41");
  await page.getByRole("checkbox", { name: /Cell segmentation kit/ }).check();
  await expect(page.getByTestId("setup-budget")).toContainText("38");
  await expect(page.getByRole("checkbox", { name: /DNA intercalator/ })).toBeDisabled();

  // "Blank" channels for an RPT nuclide: blocked masses come off the budget and out of the optimiser.
  await page.getByTestId("blocked-toggle").click();
  await page.getByTestId("blocked-picker").getByRole("button", { name: "175Lu", exact: true }).click();
  await page.getByTestId("blocked-picker").getByRole("button", { name: "176Yb", exact: true }).click();
  await expect(page.getByTestId("setup-budget")).toContainText("36");

  await page.getByRole("button", { name: /Choose markers/ }).click();
  await addModule(page, "Basic immune");
  await page.getByTestId("channel-count").first().click();
  const card = page.getByTestId("budget-card");
  await expect(card).toContainText("Hyperion XTi channel budget");
  await expect(card).toContainText("Why not 45?");
  await expect(card).toContainText("Kept empty on purpose");

  await balance(page);
  for (const kept of ["175Lu", "176Yb"]) expect(await page.locator("aside").innerText()).not.toContain(kept);
});

test("markers carry their panels, topics search, browse-all lists the catalogue, custom markers take a metal", async ({ page }) => {
  await page.getByRole("button", { name: /Tissue imaging/ }).click();
  await page.getByRole("button", { name: /Choose markers/ }).click();
  const box = page.getByPlaceholder(/e\.g\. CD8a/);

  // "which panels is FAP already in?" — chips that add the whole panel.
  await box.fill("FAP");
  const inModules = page.getByTestId("in-modules").first();
  await expect(inModules).toBeVisible();
  await inModules.getByRole("button").first().click();
  await expect(page.locator("aside")).toContainText("1 module");

  // A topic, not a marker: "io" finds the immuno-oncology panels and can flood the grid.
  await box.fill("io");
  await expect(page.getByTestId("module-hit").first()).toContainText(/Immuno-oncology|Checkpoint/);
  await page.getByTestId("show-all-modules").click();
  await expect(page.getByText(/Panels matching “io”/)).toBeVisible();
  await page.getByRole("button", { name: "clear", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click(); // empty the panel again

  // Everything that is labelled, in one table.
  await page.getByTestId("browse-toggle").click();
  const browse = page.getByTestId("browse-all");
  await expect(browse).toContainText("All markers");
  await browse.getByPlaceholder(/filter by name/).fill("granzyme");
  await expect(browse.getByRole("row")).toHaveCount(2); // header + Granzyme B
  await browse.getByRole("button", { name: "add" }).click();
  await expect(browse.getByRole("button", { name: "remove" })).toBeVisible();

  // A marker of your own, already conjugated: pin its metal so the balancer works around it.
  await box.fill("My own hybridoma");
  await page.getByText(/custom conjugation/).first().click();
  const row = sidebarRows(page).filter({ hasText: "My own hybridoma" });
  await row.locator("button").first().click();
  await row.getByRole("combobox").selectOption({ label: "already labelled with 168Er" });
  await expect(row).toContainText("168Er");
  await balance(page);
  await expect(row).toContainText("168Er");
});

/** A marker with no conjugate for this modality must be called out at Balance, not discovered in the BOM. */
test("balance warns when a marker would have to be conjugated to order", async ({ page }) => {
  await page.getByRole("button", { name: /Tissue imaging/ }).click();
  await page.getByRole("button", { name: /Choose markers/ }).click();
  await page.getByPlaceholder(/e\.g\. CD8a/).fill("NK cells");
  await page.getByTestId("module-hit").first().click();
  await balance(page);

  const warn = page.getByTestId("custom-conjugation-warning");
  await expect(warn).toHaveCount(1);
  await expect(warn).toContainText("CD56/NCAM has no off-the-shelf IMC conjugate");
  await expect(warn).toContainText("Sold for CyTOF only");
  await expect(page.locator("aside")).toContainText(/[0-9]{2,3}[A-Z][a-z][*]/); // channel is starred: no catalogue vial
  await expect(page.locator("aside")).toContainText("1 warning to resolve");

  await warn.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("custom-conjugation-warning")).toHaveCount(0);
  await expect(page.locator("aside")).toContainText("no warnings");
});

/** Phone layout (run under the "mobile" Playwright project: iPhone 13 emulation). */
import { expect, test, type Page } from "@playwright/test";

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto("/");
  await expect(page.getByText("What are you measuring?")).toBeVisible();
});
test.afterEach(async ({ page }) => { expect((page as unknown as { errors: string[] }).errors).toEqual([]); });

test("phone: build with the bottom-sheet panel, balance, order — no horizontal overflow", async ({ page }) => {
  await noHorizontalScroll(page);
  // Header collapses: step labels hidden, numbers remain and stay tappable.
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  expect(await page.getByRole("button", { name: "Setup" }).innerText()).toBe("1");
  await expect(page.locator("aside")).toBeHidden(); // desktop sidebar is gone on phones

  await page.getByRole("button", { name: /Tissue imaging/ }).click();
  await page.getByTestId("mobile-panel").getByText("Choose markers →").click(); // the bar's next-step button
  await expect(page.getByPlaceholder(/e\.g\. CD8a/)).toBeVisible();
  await noHorizontalScroll(page);

  const box = page.getByPlaceholder(/e\.g\. CD8a/);
  await box.fill("macrophage"); // a cell type whose gate holds up in tissue (dendritic cells are IMC-hidden: no CD123)
  await page.getByTestId("module-hit").first().click();
  await expect(page.getByTestId("mobile-panel-toggle")).toContainText("Your panel · 3 of ~38");

  // Open the sheet: same sidebar component, scrollable, closes on backdrop tap.
  await page.getByTestId("mobile-panel-toggle").click();
  const sheet = page.locator("#mobile-panel-sheet");
  await expect(sheet.locator("ul li").filter({ has: page.locator("button") })).toHaveCount(3);
  await sheet.getByRole("button", { name: "CD68" }).first().click();
  await expect(sheet.getByTestId("papers")).toBeVisible();
  await page.mouse.click(10, 60); // backdrop
  await expect(sheet).toBeHidden();

  await page.getByTestId("mobile-panel").getByText("Balance panel →").click();
  await page.getByRole("button", { name: "Balance panel", exact: true }).click();
  await expect(page.getByText(/Panel is balanced|thing(s)? to look at/)).toBeVisible({ timeout: 30_000 });
  await noHorizontalScroll(page); // the mass strip scrolls inside its own container
  const strip = page.getByTestId("mass-strip");
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.getByTestId("mobile-panel-toggle")).toContainText(/balanced · no warnings|warning/);

  await page.getByTestId("mobile-panel").getByText("Order →").click();
  await expect(page.getByText("Part number")).toBeVisible();
  await noHorizontalScroll(page); // the BOM table scrolls inside its own container
});

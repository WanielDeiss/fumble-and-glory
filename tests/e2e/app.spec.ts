import { expect, test, type Page } from "@playwright/test";

const SETTINGS_KEY = "fumble-and-glory.settings.v1";

/** Number of deck rows once the deck has rendered. */
async function deckRows(page: Page) {
  await expect(page.locator(".deck-row").first()).toBeVisible();
  return page.locator(".deck-row").count();
}

/** Skip the first-start explanation (unless a test wants it) and optionally pretend to be the installed app. */
async function prepare(page: Page, { seenHelp = true, installed = false } = {}) {
  await page.addInitScript(
    ({ key, seenHelp, installed }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ locale: "en", seenHelp }));
      if (installed) {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (q: string) =>
          q.includes("display-mode: standalone") ? ({ matches: true, media: q } as MediaQueryList) : original(q);
      }
    },
    { key: SETTINGS_KEY, seenHelp, installed },
  );
}

test("first visit explains the app, then cards can be drawn", async ({ page }) => {
  await prepare(page, { seenHelp: false });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await page.getByRole("link", { name: "Let's go" }).click();

  await page.getByRole("button", { name: "Draw fumble (1)" }).click();
  await expect(page.locator(".fg-card--fumble .fg-card__title")).not.toBeEmpty();
  await page.getByRole("button", { name: "Draw glory (20)" }).click();
  await expect(page.locator(".fg-card--glory")).toBeVisible();
});

test("is installable and keeps working offline", async ({ page, context }) => {
  await prepare(page);
  await page.goto("./");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ name: "Fumble & Glory", display: "standalone" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto("./#/deck");
  const cards = await deckRows(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".deck-row")).toHaveCount(cards);
  await context.setOffline(false);
});

test("own cards are saved on the device in the installed app", async ({ page }) => {
  await prepare(page, { installed: true });
  await page.goto("./#/deck");
  await page.getByRole("link", { name: "Create your own card" }).click();
  await page.getByLabel("Title").fill("Dice Under the Table");
  await page.getByLabel("Effect").fill("Your die rolls under the table. You lose your bonus action.");
  await page.getByRole("button", { name: "Comic" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/#\/deck$/);

  await page.reload();
  const row = page.locator(".deck-row").first();
  await expect(row).toContainText("Dice Under the Table");
  await expect(row).toContainText("Own card");

  await row.click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".deck-row").first()).not.toContainText("Dice Under the Table");
});

test.describe("card updates", () => {
  // page.route can't see requests the service worker makes; offline caching has its own test above.
  test.use({ serviceWorkers: "block" });

  test("new cards on the server are offered, not swapped in silently", async ({ page }) => {
    await prepare(page);
    await page.goto("./#/deck");
    const before = await deckRows(page);

    await page.route("**/data/manifest.json*", async (route) => {
      const json = await (await route.fetch()).json();
      await route.fulfill({ json: { ...json, version: `${json.version}-e2e` } });
    });
    await page.route("**/data/decks/core-glory.json*", async (route) => {
      const json = await (await route.fetch()).json();
      const card = { ...json.cards[0], id: "glory-e2e-new", i18n: { en: { title: "E2E Glory", effect: "Test." } } };
      await route.fulfill({ json: { ...json, cards: [...json.cards, card] } });
    });

    await page.reload();
    await expect(page.locator(".update-banner")).toContainText("1 new card available");
    await expect(page.locator(".deck-row")).toHaveCount(before);
    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.locator(".deck-row")).toHaveCount(before + 1);
  });
});

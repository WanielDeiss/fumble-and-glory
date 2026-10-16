import { expect, test, type Page } from "@playwright/test";

const SETTINGS_KEY = "fumble-and-glory.settings.v1";

/** True once the page's own fonts (not a system fallback) are in use. */
const fontsLoaded = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('600 20px "Fraunces"') && document.fonts.check('400 16px "Alegreya Sans"');
  });

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
        // An installed app never gets offered for installation again.
        window.addEventListener("beforeinstallprompt", (e) => e.stopImmediatePropagation(), true);
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
  expect(await fontsLoaded(page)).toBe(true);
});

test("loads fonts from the site itself, not from third parties", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("http://localhost")) foreign.push(r.url()); });
  await prepare(page);
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Draw fumble (1)" })).toBeVisible();
  expect(await fontsLoaded(page)).toBe(true);
  expect(foreign).toEqual([]);
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
  expect(await fontsLoaded(page)).toBe(true);
  await context.setOffline(false);
});

test("own cards are saved on the device in the installed app", async ({ page }) => {
  await prepare(page, { installed: true });
  await page.goto("./#/deck");
  await page.getByRole("link", { name: "Create your own card" }).click();
  await expect(page.getByRole("heading", { name: "New card" })).toBeVisible();
  // exact: the deck's search box is labelled "Search title or effect"
  await page.getByLabel("Title", { exact: true }).fill("Dice Under the Table");
  await page.getByLabel("Effect", { exact: true }).fill("Your die rolls under the table. You lose your bonus action.");
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

test("own cards survive a backup and restore", async ({ page }) => {
  await prepare(page, { installed: true });
  // Desktop download path, even on the emulated phone
  await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined }));
  const card = {
    id: "custom-e2e", kind: "glory", classGroups: [], tones: ["lucky"], severity: "mild", custom: true,
    i18n: { de: { title: "Glückspilz", effect: "Du findest eine Münze." } },
  };
  await page.addInitScript((c) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("fumble-and-glory.custom-cards.v1", JSON.stringify([c]));
      sessionStorage.setItem("seeded", "1");
    }
  }, card);
  await page.goto("./#/deck");
  await page.getByRole("link", { name: "Back up or import own cards" }).click();
  await expect(page.getByText("You have 1 own card.")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fumble-and-glory-cards-.*\.json$/);
  const backupPath = await download.path();

  await page.evaluate(() => localStorage.removeItem("fumble-and-glory.custom-cards.v1"));
  await page.reload();
  await expect(page.getByText("You have 0 own cards.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await expect(page.getByRole("status")).toHaveText("1 card added");

  await page.goto("./#/deck");
  await expect(page.locator(".deck-row").first()).toContainText("Glückspilz");
});

test("a shared link shows the card and adds it", async ({ page }) => {
  await prepare(page, { installed: true });
  await page.goto("./");
  const card = { kind: "fumble", classGroups: ["ranged"], tones: ["comic"], severity: "mild", i18n: { en: { title: "Arrow in the Hat", effect: "You shoot your own hat." } } };
  const code = await page.evaluate((c) => {
    const bytes = new TextEncoder().encode(JSON.stringify({ app: "fumble-and-glory", v: 1, cards: [c] }));
    return btoa(String.fromCodePoint(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, card);

  await page.goto(`./#/import/${code}`);
  await expect(page.getByRole("heading", { name: "Shared cards" })).toBeVisible();
  await expect(page.locator(".deck-row")).toContainText("Arrow in the Hat");
  await page.getByRole("button", { name: "Add to my deck" }).click();
  await expect(page.getByRole("status")).toHaveText("1 card added");
  await page.getByRole("link", { name: "Open deck" }).click();
  await expect(page.locator(".deck-row").first()).toContainText("Arrow in the Hat");
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

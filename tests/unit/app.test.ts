import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicJson, stubFetch, stubMatchMedia } from "./helpers";

const SETTINGS_KEY = "fumble-and-glory.settings.v1";
const CUSTOM_KEY = "fumble-and-glory.custom-cards.v1";

// main.ts registers window/document listeners on import; remove them after each test
// so earlier app instances don't react to later tests.
const added: [EventTarget, string, EventListenerOrEventListenerObject][] = [];

const app = () => document.getElementById("app")!;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => app().querySelector<T>(sel);
const $$ = (sel: string) => [...app().querySelectorAll(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));
const storedSettings = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");

async function waitFor(check: () => unknown, what = "condition") {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const totalCards = () => {
  const manifest = readPublicJson("data/manifest.json");
  return manifest.decks.reduce((n: number, d: string) => n + readPublicJson(`data/${d}`).cards.length, 0);
};

interface StartOptions {
  installed?: boolean;
  hash?: string;
  settings?: Record<string, unknown> | null;
  override?: Parameters<typeof stubFetch>[0];
  failFetch?: boolean;
}

async function start({ installed = false, hash = "", settings = {}, override, failFetch }: StartOptions = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", `/fumble-and-glory/${hash}`);
  if (settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ locale: "en", seenHelp: true, ...settings }));
  stubFetch(override);
  if (failFetch) vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
  stubMatchMedia(installed);
  vi.resetModules();
  await import("../../src/main");
  await waitFor(() => app().innerHTML.trim(), "first render");
}

async function go(hash: string) {
  location.hash = hash;
  await waitFor(() => location.hash === hash, `navigation to ${hash}`);
  await flush();
}

function type(sel: string, value: string) {
  const el = $<HTMLInputElement>(sel)!;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const click = (sel: string) => $(sel)!.click();

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // not implemented in jsdom
  for (const target of [window, document] as EventTarget[]) {
    const original = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation((type, listener, options) => {
      added.push([target, type, listener!]);
      original(type, listener, options);
    });
  }
});

afterEach(() => {
  for (const [target, type, listener] of added.splice(0)) target.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("first start", () => {
  it("opens the explanation once and remembers it", async () => {
    await start({ settings: null });
    expect(location.hash).toBe("#/help");
    expect($("h1")?.textContent).toBe("How it works");
    expect(storedSettings().seenHelp).toBe(true);
    await go("#/");
    expect($('[data-action="draw"]')).not.toBeNull();
  });

  it("shows an error when the decks can't be loaded", async () => {
    await start({ failFetch: true });
    expect(app().textContent).toMatch(/503/);
  });
});

describe("drawing cards", () => {
  it("draws a card of the chosen kind and avoids repeating the last one", async () => {
    await start();
    click('[data-action="draw"][data-kind="fumble"]');
    expect($(".fg-card--fumble")).not.toBeNull();
    const first = $(".fg-card__title")!.textContent;
    click('[data-action="draw"][data-kind="fumble"]');
    expect($(".fg-card__title")!.textContent).not.toBe(first);
    click('[data-action="draw"][data-kind="glory"]');
    expect($(".fg-card--glory")).not.toBeNull();
  });

  it("disables drawing when no card matches the table settings", async () => {
    await start({ settings: { fumbleTones: [] } });
    expect($<HTMLButtonElement>('[data-kind="fumble"]')!.disabled).toBe(true);
    expect($<HTMLButtonElement>('[data-kind="glory"]')!.disabled).toBe(false);
    expect($(".footer .meta")!.textContent).toMatch(/^0 fumbles/);
  });

  it("links to help and install while no card is drawn", async () => {
    await start();
    expect($$(".hint-links a").map((a) => a.getAttribute("href"))).toEqual(["#/help", "#/install"]);
  });
});

describe("table settings", () => {
  it("saves character, class, tones and severity", async () => {
    await start();
    await go("#/table");
    type("#charname", "Brom");
    click('[data-action="set"][data-key="classGroup"][data-value="arcane"]');
    click('[data-action="tone"][data-kind="glory"][data-value="lucky"]');
    click('[data-action="tone"][data-kind="fumble"][data-value="awkward"]');
    click('[data-action="set"][data-key="maxSeverity"][data-value="harsh"]');
    const s = storedSettings();
    expect(s).toMatchObject({ characterName: "Brom", classGroup: "arcane", maxSeverity: "harsh" });
    expect(s.gloryTones).toContain("lucky");
    expect(s.fumbleTones).not.toContain("awkward");
  });

  it("switches the language from the top bar", async () => {
    await start();
    const select = $<HTMLSelectElement>('[data-action="locale"]')!;
    select.value = "de";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => $('[data-kind="fumble"]')?.textContent === "Patzer ziehen (1)", "German UI");
    expect(document.documentElement.lang).toBe("de");
    expect(storedSettings().locale).toBe("de");
  });
});

describe("deck", () => {
  it("lists every card and filters by search and kind", async () => {
    await start();
    await go("#/deck");
    expect($$(".deck-row")).toHaveLength(totalCards());
    type('[data-action="search"]', "Fanfare");
    expect($$(".deck-row")).toHaveLength(1);
    type('[data-action="search"]', "");
    click('[data-action="set"][data-key="deckFilter"][data-value="glory"]');
    expect($$(".deck-row").length).toBeGreaterThan(0);
    expect($$(".deck-die--fumble")).toHaveLength(0);
  });

  it("only offers own cards in the installed app", async () => {
    await start();
    await go("#/deck");
    expect($('a[href="#/card/new"]')).toBeNull();
    expect($('a[href="#/install"]')).not.toBeNull();
  });
});

describe("install guide", () => {
  it("opens the block for the current device and uses the browser's install prompt", async () => {
    await start({ hash: "#/install" });
    expect($$("details[open]")).toHaveLength(1);
    expect($('[data-action="install"]')).toBeNull();

    const prompt = vi.fn(() => Promise.resolve());
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt }));
    click('[data-action="install"]');
    expect(prompt).toHaveBeenCalledOnce();
    await flush();
    expect($('[data-action="install"]')).toBeNull();
  });

  it("drops the install button once the app is installed", async () => {
    await start({ hash: "#/install" });
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt: vi.fn() }));
    expect($('[data-action="install"]')).not.toBeNull();
    window.dispatchEvent(new Event("appinstalled"));
    expect($('[data-action="install"]')).toBeNull();
  });

  it("says so when the app already runs installed", async () => {
    await start({ installed: true, hash: "#/install" });
    expect($(".notice")).not.toBeNull();
    expect($$("details")).toHaveLength(0);
  });
});

describe("own cards", () => {
  it("are created, edited and deleted in the installed app", async () => {
    vi.stubGlobal("confirm", () => true);
    await start({ installed: true });
    await go("#/deck");
    click('a[href="#/card/new"]');
    await waitFor(() => $("#card-title"), "editor");

    click('[data-action="save-card"]');
    expect($(".form-error")).not.toBeNull();

    click('[data-action="draft"][data-key="kind"][data-value="glory"]');
    type("#card-title", "Lucky Dice");
    type("#card-effect", "You roll again.");
    type("#card-duration", "Once");
    click('[data-action="draft-toggle"][data-key="tones"][data-value="lucky"]');
    click('[data-action="draft-toggle"][data-key="classGroups"][data-value="ranged"]');
    click('[data-action="save-card"]');
    await waitFor(() => location.hash === "#/deck", "back to deck");
    await flush();

    expect($(".deck-row__title")!.textContent).toBe("Lucky Dice");
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY)!);
    expect(saved[0]).toMatchObject({ kind: "glory", tones: ["lucky"], classGroups: ["ranged"] });
    expect(saved[0].i18n.en).toEqual({ title: "Lucky Dice", effect: "You roll again.", duration: "Once" });

    click(".deck-row--link");
    await waitFor(() => $<HTMLInputElement>("#card-title")?.value === "Lucky Dice", "editor with card");
    type("#card-title", "Luckier Dice");
    click('[data-action="save-card"]');
    await waitFor(() => location.hash === "#/deck", "back to deck");
    await flush();
    expect($(".deck-row__title")!.textContent).toBe("Luckier Dice");

    click(".deck-row--link");
    await waitFor(() => $('[data-action="delete-card"]'), "delete button");
    click('[data-action="delete-card"]');
    await waitFor(() => location.hash === "#/deck", "back to deck");
    expect(JSON.parse(localStorage.getItem(CUSTOM_KEY)!)).toEqual([]);
  });

  it("clears tones when switching between fumble and glory", async () => {
    await start({ installed: true, hash: "#/card/new" });
    click('[data-action="draft-toggle"][data-key="tones"][data-value="comic"]');
    expect($('[data-value="comic"]')!.getAttribute("aria-pressed")).toBe("true");
    click('[data-action="draft"][data-key="kind"][data-value="glory"]');
    expect($('[data-value="comic"]')).toBeNull();
    expect($$('.fg-tag[aria-pressed="true"]')).toHaveLength(0);
  });

  it("are shown when drawn and can't be opened outside the installed app", async () => {
    const own = {
      id: "custom-x1", kind: "fumble", classGroups: [], tones: ["awkward"], severity: "mild",
      i18n: { de: { title: "Eigener Patzer", effect: "Text" } },
    };
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([own]));
    await start({ installed: true, settings: { fumbleTones: ["awkward"] } });
    await go("#/deck");
    expect($(".deck-row__title")!.textContent).toBe("Eigener Patzer");
    expect($(".fg-tag--custom")).not.toBeNull();
  });

  it("send other routes to a safe screen", async () => {
    await start({ hash: "#/card/new" });
    await waitFor(() => location.hash === "#/install", "redirect to install");

    await start({ installed: true, hash: "#/card/custom-missing" });
    await waitFor(() => location.hash === "#/deck", "redirect to deck");

    await start({ hash: "#/card/%3Cimg%20src%3Dx%3E" });
    expect($("img")).toBeNull();
    expect($('[data-action="draw"]')).not.toBeNull();
  });
});

describe("card updates", () => {
  const newCard = {
    id: "fumble-test-new", kind: "fumble", classGroups: [], tones: ["awkward"], severity: "mild",
    i18n: { en: { title: "Brand New", effect: "Test card." } },
  };
  const bumped = (m: any) => ({ ...m, version: `${m.version}-next` });

  it("offers new cards and loads them only when asked", async () => {
    await start();
    await start({
      override: {
        "data/manifest.json": bumped,
        "data/decks/core-fumble.json": (d) => ({ ...d, cards: [...d.cards, newCard] }),
      },
    });
    await waitFor(() => $(".update-banner"), "update banner");
    expect($(".update-banner")!.textContent).toMatch(/1 new card available/);

    await go("#/deck");
    expect($$(".deck-row")).toHaveLength(totalCards());
    click('[data-action="apply-update"]');
    expect($$(".deck-row")).toHaveLength(totalCards() + 1);
    expect($(".update-banner")!.textContent).toMatch(/Cards updated/);
  });

  it("says when existing cards changed", async () => {
    await start();
    await start({
      override: {
        "data/manifest.json": bumped,
        "data/decks/core-glory.json": (d) => ({ ...d, cards: d.cards.slice(1) }),
      },
    });
    await waitFor(() => $(".update-banner"), "update banner");
    expect($(".update-banner")!.textContent).toMatch(/Card update available/);
  });

  it("takes a new version without card changes silently", async () => {
    await start();
    await start({ override: { "data/manifest.json": bumped } });
    await waitFor(() => JSON.parse(localStorage.getItem("fumble-and-glory.data.v1")!).manifest.version.endsWith("-next"), "silent update");
    expect($(".update-banner")).toBeNull();
  });

  it("checks again when the app comes back to the foreground", async () => {
    await start();
    const fetchSpy = vi.mocked(fetch);
    const before = fetchSpy.mock.calls.length;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60 * 60 * 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => fetchSpy.mock.calls.length > before, "update check");
  });
});

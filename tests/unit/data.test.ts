import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  diffData, fetchData, label, loadStoredData, loadUiStrings, localize, storeData, withinSeverity,
  type Card, type GameData,
} from "../../src/data";
import { readPublicJson, stubFetch } from "./helpers";

const card = (over: Partial<Card> = {}): Card => ({
  id: "fumble-test",
  kind: "fumble",
  classGroups: [],
  tones: ["awkward"],
  severity: "mild",
  i18n: { en: { title: "Trip", effect: "You trip." }, de: { title: "Stolpern", effect: "Du stolperst." } },
  ...over,
});

const game = (cards: Card[], version = "1"): GameData => ({
  manifest: { version, defaultLocale: "en", locales: ["en", "de", "fr"], decks: [] },
  taxonomy: { classGroups: {}, tones: { fumble: {}, glory: {} }, severities: {} as GameData["taxonomy"]["severities"] },
  cards,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("localize", () => {
  it("uses the requested language", () => {
    expect(localize(card(), "de", "en")?.text.title).toBe("Stolpern");
  });

  it("falls back to English or hides the card, as the player chose", () => {
    expect(localize(card(), "fr", "en")?.text.title).toBe("Trip");
    expect(localize(card(), "fr", "hide")).toBeNull();
  });

  it("always shows own cards in the language they were written in", () => {
    const own = card({ custom: true, i18n: { de: { title: "Eigene", effect: "Text" } } });
    expect(localize(own, "fr", "hide")?.text.title).toBe("Eigene");
  });
});

describe("label and severity", () => {
  it("picks the locale, then English, then empty", () => {
    expect(label({ en: "Mild", de: "Mild!" }, "de")).toBe("Mild!");
    expect(label({ en: "Mild" }, "fr")).toBe("Mild");
    expect(label(undefined, "de")).toBe("");
  });

  it("orders severities mild < medium < harsh", () => {
    expect(withinSeverity(card({ severity: "medium" }), "medium")).toBe(true);
    expect(withinSeverity(card({ severity: "harsh" }), "medium")).toBe(false);
    expect(withinSeverity(card({ severity: "mild" }), "mild")).toBe(true);
  });
});

describe("diffData", () => {
  it("counts added, changed and removed cards", () => {
    const local = game([card({ id: "a" }), card({ id: "b" }), card({ id: "c" })]);
    const remote = game([card({ id: "a" }), card({ id: "b", severity: "harsh" }), card({ id: "d" }), card({ id: "e" })]);
    expect(diffData(local, remote)).toEqual({ added: 2, changed: 1, removed: 1 });
  });
});

describe("stored decks", () => {
  it("round-trips through localStorage", () => {
    storeData(game([card()], "v7"));
    expect(loadStoredData()?.manifest.version).toBe("v7");
    expect(loadStoredData()?.cards).toHaveLength(1);
  });

  it("drops cards that are not in the expected shape", () => {
    const bad = [card({ id: "<script>" }), card({ kind: "oops" as Card["kind"] }), { id: "x" } as Card];
    storeData(game([card(), ...bad]));
    expect(loadStoredData()?.cards.map((c) => c.id)).toEqual(["fumble-test"]);
  });

  it("returns null for missing, broken or incomplete data", () => {
    expect(loadStoredData()).toBeNull();
    localStorage.setItem("fumble-and-glory.data.v1", "{not json");
    expect(loadStoredData()).toBeNull();
    localStorage.setItem("fumble-and-glory.data.v1", JSON.stringify({ cards: [] }));
    expect(loadStoredData()).toBeNull();
  });

  it("does not store incomplete data", () => {
    storeData({ cards: [] } as unknown as GameData);
    expect(localStorage.getItem("fumble-and-glory.data.v1")).toBeNull();
  });
});

describe("fetchData", () => {
  it("loads every deck listed in the manifest", async () => {
    stubFetch();
    const manifest = readPublicJson("data/manifest.json");
    const expected = manifest.decks.reduce((n: number, d: string) => n + readPublicJson(`data/${d}`).cards.length, 0);
    const data = await fetchData();
    expect(data.manifest.version).toBe(manifest.version);
    expect(data.cards).toHaveLength(expected);
  });

  it("refuses deck paths outside data/", async () => {
    stubFetch({ "data/manifest.json": (m) => ({ ...m, decks: ["../../evil.json"] }) });
    await expect(fetchData()).rejects.toThrow(/Refusing to load/);
  });

  it("reports HTTP errors", async () => {
    stubFetch({ "data/manifest.json": (m) => ({ ...m, decks: ["decks/missing.json"] }) });
    await expect(fetchData()).rejects.toThrow(/404/);
  });
});

describe("loadUiStrings", () => {
  it("layers the language over English", async () => {
    stubFetch();
    const de = await loadUiStrings("de", "x");
    expect(de["help.title"]).toBe(readPublicJson("i18n/ui.de.json")["help.title"]);
    expect(Object.keys(de).length).toBeGreaterThanOrEqual(Object.keys(readPublicJson("i18n/ui.en.json")).length);
  });

  it("falls back to English when a language file is missing", async () => {
    stubFetch();
    const xx = await loadUiStrings("xx", "x");
    expect(xx["help.title"]).toBe(readPublicJson("i18n/ui.en.json")["help.title"]);
  });
});

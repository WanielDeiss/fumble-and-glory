import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, loadSettings, saveSettings } from "../../src/settings";
import { loadCustomCards, newCustomId, saveCustomCards } from "../../src/custom";
import type { Card } from "../../src/data";

const LOCALES = ["en", "de", "fr"];
const SETTINGS_KEY = "fumble-and-glory.settings.v1";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("settings", () => {
  it("starts in the browser language when it is supported", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("de-AT");
    expect(defaultSettings(LOCALES).locale).toBe("de");
    vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
    expect(defaultSettings(LOCALES).locale).toBe("en");
  });

  it("merges stored values over the defaults", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ classGroup: "arcane" }));
    const s = loadSettings(LOCALES);
    expect(s.classGroup).toBe("arcane");
    expect(s.maxSeverity).toBe("medium");
  });

  it("resets an unsupported language and survives broken storage", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ locale: "xx" }));
    expect(loadSettings(LOCALES).locale).toBe("en");
    localStorage.setItem(SETTINGS_KEY, "{broken");
    expect(loadSettings(LOCALES)).toEqual(defaultSettings(LOCALES));
  });

  it("saves and ignores storage errors", () => {
    const s = { ...defaultSettings(LOCALES), characterName: "Brom" };
    saveSettings(s);
    expect(loadSettings(LOCALES).characterName).toBe("Brom");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => saveSettings(s)).not.toThrow();
  });
});

describe("own cards", () => {
  const own: Card = {
    id: "custom-abc", kind: "glory", classGroups: [], tones: ["lucky"], severity: "mild",
    i18n: { de: { title: "Glück", effect: "Du hast Glück." } },
  };

  it("are empty at first and marked as own cards after saving", () => {
    expect(loadCustomCards()).toEqual([]);
    expect(saveCustomCards([own])).toBe(true);
    expect(loadCustomCards()).toEqual([{ ...own, custom: true }]);
  });

  it("report when the device refuses to store them", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(saveCustomCards([own])).toBe(false);
  });

  it("ignore broken storage", () => {
    localStorage.setItem("fumble-and-glory.custom-cards.v1", "{oops");
    expect(loadCustomCards()).toEqual([]);
    localStorage.setItem("fumble-and-glory.custom-cards.v1", JSON.stringify({ not: "a list" }));
    expect(loadCustomCards()).toEqual([]);
  });

  it("get ids that the card route accepts", () => {
    expect(newCustomId()).toMatch(/^custom-[a-z0-9]+$/);
  });
});

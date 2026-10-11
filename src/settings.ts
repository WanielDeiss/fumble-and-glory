import type { Severity } from "./data";

export interface Settings {
  locale: string;
  fallback: "en" | "hide";
  characterName: string;
  classGroup: string;
  fumbleTones: string[];
  gloryTones: string[];
  maxSeverity: Severity;
}

const KEY = "fumble-and-glory.settings.v1";

export function defaultSettings(locales: string[]): Settings {
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return {
    locale: locales.includes(browser) ? browser : "en",
    fallback: "en",
    characterName: "",
    classGroup: "martial",
    fumbleTones: ["awkward", "embarrassing", "comic"],
    gloryTones: ["heroic", "flashy"],
    maxSeverity: "medium",
  };
}

export function loadSettings(locales: string[]): Settings {
  const defaults = defaultSettings(locales);
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const merged = { ...defaults, ...(stored ?? {}) } as Settings;
    if (!locales.includes(merged.locale)) merged.locale = defaults.locale;
    return merged;
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage blocked: settings live for this visit only */
  }
}

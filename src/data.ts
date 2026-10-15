export type Kind = "fumble" | "glory";
export type Severity = "mild" | "medium" | "harsh";
export type Labels = Record<string, string>; // locale -> text, "en" always present

export interface CardText { title: string; effect: string; duration?: string }

export interface Card {
  id: string;
  kind: Kind;
  classGroups: string[]; // empty = every class
  tones: string[];
  severity: Severity;
  i18n: Record<string, CardText>;
  custom?: boolean; // created by the player on this device
}

export interface Manifest { version: string; defaultLocale: string; locales: string[]; decks: string[] }

export interface Taxonomy {
  classGroups: Record<string, Labels>;
  tones: Record<Kind, Record<string, Labels>>;
  severities: Record<Severity, Labels>;
}

export interface GameData { manifest: Manifest; taxonomy: Taxonomy; cards: Card[] }

/** A card resolved to one locale; null when it must not be shown. */
export interface LocalizedCard extends Card { text: CardText }

const base = import.meta.env.BASE_URL;

// Only our own JSON files under data/ and i18n/ are ever fetched.
const SAFE_PATH = /^(data|i18n)\/[a-z0-9/._-]+\.json$/;

async function getJson<T>(path: string, version?: string): Promise<T> {
  if (!SAFE_PATH.test(path) || path.includes("..")) throw new Error(`Refusing to load ${path}`);
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  const res = await fetch(`${base}${path}${query}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

/** Loads the current decks from the server. */
export async function fetchData(): Promise<GameData> {
  // The manifest is always fetched fresh; its version busts the cache of everything else.
  const manifest = await getJson<Manifest>("data/manifest.json", String(Date.now()));
  const [taxonomy, ...decks] = await Promise.all([
    getJson<Taxonomy>("data/taxonomy.json", manifest.version),
    ...manifest.decks.map((d) => getJson<{ cards: Card[] }>(`data/${d}`, manifest.version)),
  ]);
  return { manifest, taxonomy, cards: decks.flatMap((d) => d.cards) };
}

// The decks the player last downloaded. The app starts from this copy and only
// switches to newer server data when the player accepts the update.
const DATA_KEY = "fumble-and-glory.data.v1";

const ID = /^[a-z0-9-]+$/;
const isText = (t: unknown): t is CardText =>
  typeof t === "object" && t !== null && typeof (t as CardText).title === "string" && typeof (t as CardText).effect === "string";
const isCard = (c: Card): boolean =>
  ID.test(c?.id ?? "") && (c.kind === "fumble" || c.kind === "glory") &&
  Array.isArray(c.classGroups) && Array.isArray(c.tones) && Object.values(c.i18n ?? {}).every(isText);

/** Keeps only data in the shape the app expects; null when the basics are missing. */
function sanitize(d: GameData | null): GameData | null {
  if (typeof d?.manifest?.version !== "string" || !d.taxonomy || !Array.isArray(d.cards)) return null;
  return { manifest: d.manifest, taxonomy: d.taxonomy, cards: d.cards.filter(isCard) };
}

export function loadStoredData(): GameData | null {
  try {
    return sanitize(JSON.parse(localStorage.getItem(DATA_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function storeData(d: GameData): void {
  const clean = sanitize(d);
  if (!clean) return;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(clean));
  } catch {
    /* storage full or blocked: the data is fetched again next time */
  }
}

export interface DataDiff { added: number; changed: number; removed: number }

export function diffData(local: GameData, remote: GameData): DataDiff {
  const old = new Map(local.cards.map((c) => [c.id, JSON.stringify(c)]));
  const ids = new Set(remote.cards.map((c) => c.id));
  let added = 0, changed = 0;
  for (const c of remote.cards) {
    const before = old.get(c.id);
    if (before === undefined) added++;
    else if (before !== JSON.stringify(c)) changed++;
  }
  return { added, changed, removed: local.cards.filter((c) => !ids.has(c.id)).length };
}

export async function loadUiStrings(locale: string, version: string): Promise<Labels> {
  const en = await getJson<Labels>("i18n/ui.en.json", version);
  if (locale === "en") return en;
  try {
    return { ...en, ...(await getJson<Labels>(`i18n/ui.${locale}.json`, version)) };
  } catch {
    return en;
  }
}

export function localize(card: Card, locale: string, fallback: "en" | "hide"): LocalizedCard | null {
  let text = card.i18n[locale];
  // A player's own card is written in one language and shown as written.
  if (!text && card.custom) text = Object.values(card.i18n)[0];
  else if (!text && fallback === "en") text = card.i18n.en;
  return text ? { ...card, text } : null;
}

export function label(labels: Labels | undefined, locale: string): string {
  if (!labels) return "";
  return labels[locale] ?? labels.en ?? "";
}

const SEVERITY_RANK: Record<Severity, number> = { mild: 0, medium: 1, harsh: 2 };
export function withinSeverity(card: Card, max: Severity): boolean {
  return SEVERITY_RANK[card.severity] <= SEVERITY_RANK[max];
}

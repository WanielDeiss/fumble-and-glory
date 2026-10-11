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

async function getJson<T>(path: string, version?: string): Promise<T> {
  const url = `${base}${path}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadData(): Promise<GameData> {
  // The manifest is always fetched fresh; its version busts the cache of everything else.
  const manifest = await getJson<Manifest>("data/manifest.json", String(Date.now()));
  const [taxonomy, ...decks] = await Promise.all([
    getJson<Taxonomy>("data/taxonomy.json", manifest.version),
    ...manifest.decks.map((d) => getJson<{ cards: Card[] }>(`data/${d}`, manifest.version)),
  ]);
  return { manifest, taxonomy, cards: decks.flatMap((d) => d.cards) };
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
  const text = card.i18n[locale] ?? (fallback === "en" ? card.i18n.en : undefined);
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

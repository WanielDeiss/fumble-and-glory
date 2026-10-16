import type { Card, CardText, Kind, Severity, Taxonomy } from "./data";

// Own cards travel as a small JSON document: in a backup file, or base64url-encoded
// in a share link (#/import/<code>). The same format serves both.
export interface SharedCard {
  kind: Kind;
  classGroups: string[];
  tones: string[];
  severity: Severity;
  i18n: Record<string, CardText>;
}

interface Payload { app: "fumble-and-glory"; v: 1; cards: SharedCard[] }

const MAX_CARDS = 1000;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
const CODE = /^[A-Za-z0-9_-]+$/;
const SEVERITIES: Severity[] = ["mild", "medium", "harsh"];

export const toShared = ({ kind, classGroups, tones, severity, i18n }: Card): SharedCard =>
  ({ kind, classGroups, tones, severity, i18n });

export function toPayload(cards: Card[]): Payload {
  return { app: "fumble-and-glory", v: 1, cards: cards.map(toShared) };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.codePointAt(0)!));
}

export const encodeCards = (cards: Card[]) => toBase64Url(JSON.stringify(toPayload(cards)));

/** The code from a pasted share link or a bare code; null if there is none. */
export function extractCode(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = /#\/import\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (fromLink) return fromLink[1];
  return CODE.test(trimmed) ? trimmed : null;
}

/** Decodes a share code into raw JSON; null when it isn't one. */
export function decodeCode(code: string): unknown {
  try {
    return JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function cleanText(v: unknown): CardText | null {
  if (!isRecord(v) || !text(v.title, 60) || !text(v.effect, 280)) return null;
  const out: CardText = { title: (v.title as string).trim(), effect: (v.effect as string).trim() };
  if (text(v.duration, 60)) out.duration = (v.duration as string).trim();
  return out;
}

/** A card from outside in exactly the shape the app expects, or null. Unknown tones and classes are dropped. */
function cleanCard(v: unknown, taxonomy: Taxonomy): SharedCard | null {
  if (!isRecord(v)) return null;
  const kind = v.kind;
  if (kind !== "fumble" && kind !== "glory") return null;
  if (!SEVERITIES.includes(v.severity as Severity)) return null;
  const tones = Array.isArray(v.tones) ? v.tones.filter((t) => typeof t === "string" && t in taxonomy.tones[kind]) : [];
  if (tones.length === 0) return null;
  const classGroups = Array.isArray(v.classGroups)
    ? v.classGroups.filter((g) => typeof g === "string" && g in taxonomy.classGroups)
    : [];
  const i18n: Record<string, CardText> = {};
  if (isRecord(v.i18n)) {
    for (const [locale, t] of Object.entries(v.i18n)) {
      const clean = LOCALE.test(locale) ? cleanText(t) : null;
      if (clean) i18n[locale] = clean;
    }
  }
  if (Object.keys(i18n).length === 0) return null;
  return { kind, classGroups: [...new Set(classGroups)], tones: [...new Set(tones)], severity: v.severity as Severity, i18n };
}

/** Valid cards from a backup file or share code (also accepts a bare list of cards). */
export function parseImport(raw: unknown, taxonomy: Taxonomy): { cards: SharedCard[]; invalid: number } {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw) && Array.isArray(raw.cards)) list = raw.cards;
  const cards: SharedCard[] = [];
  let invalid = 0;
  for (const item of list.slice(0, MAX_CARDS)) {
    const card = cleanCard(item, taxonomy);
    if (card) cards.push(card);
    else invalid++;
  }
  return { cards, invalid: invalid + Math.max(0, list.length - MAX_CARDS) };
}

const fingerprint = (c: SharedCard) => JSON.stringify(toShared(c as Card));

/** Adds incoming cards that aren't in the deck yet; identical cards are skipped. */
export function mergeCards(existing: Card[], incoming: SharedCard[], newId: () => string) {
  const seen = new Set(existing.map((c) => fingerprint(toShared(c))));
  const added: Card[] = [];
  for (const card of incoming) {
    const key = fingerprint(card);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ ...card, id: newId(), custom: true });
  }
  return { cards: [...added, ...existing], added: added.length, skipped: incoming.length - added.length };
}

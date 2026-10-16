import { describe, expect, it } from "vitest";
import { decodeCode, encodeCards, extractCode, mergeCards, parseImport, toPayload } from "../../src/share";
import { newCustomId } from "../../src/custom";
import type { Card, Taxonomy } from "../../src/data";
import { readPublicJson } from "./helpers";

const taxonomy = readPublicJson<Taxonomy>("data/taxonomy.json");

const card = (over: Partial<Card> = {}): Card => ({
  id: "custom-1",
  kind: "fumble",
  classGroups: ["arcane"],
  tones: ["comic"],
  severity: "mild",
  i18n: { de: { title: "Würfel unterm Tisch", effect: "Dein Würfel rollt weg. Ärgerlich – oder? 🎲", duration: "Sofort" } },
  custom: true,
  ...over,
});

describe("share codes", () => {
  it("round-trip cards including umlauts and emoji, without ids", () => {
    const code = encodeCards([card()]);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCode(code)).toEqual({
      app: "fumble-and-glory", v: 1,
      cards: [{ kind: "fumble", classGroups: ["arcane"], tones: ["comic"], severity: "mild", i18n: card().i18n }],
    });
  });

  it("are found in links and pasted text", () => {
    const code = encodeCards([card()]);
    expect(extractCode(`https://example.org/fumble-and-glory/#/import/${code}`)).toBe(code);
    expect(extractCode(`  ${code}\n`)).toBe(code);
    expect(extractCode("not a code!")).toBeNull();
    expect(extractCode('{"cards": []}')).toBeNull();
  });

  it("decode to null when broken", () => {
    expect(decodeCode("%%%")).toBeNull();
    expect(decodeCode("bm90IGpzb24")).toBeNull(); // "not json"
  });
});

describe("parseImport", () => {
  it("accepts a backup document and a bare list", () => {
    expect(parseImport(toPayload([card(), card({ kind: "glory", tones: ["lucky"] })]), taxonomy).cards).toHaveLength(2);
    expect(parseImport([card()], taxonomy)).toMatchObject({ cards: [{ kind: "fumble" }], invalid: 0 });
  });

  it("drops unknown tones and classes but keeps the card", () => {
    const { cards } = parseImport([card({ tones: ["comic", "lucky", "bogus"], classGroups: ["arcane", "bard", "arcane"] })], taxonomy);
    expect(cards[0]).toMatchObject({ tones: ["comic"], classGroups: ["arcane"] });
  });

  it("rejects cards that aren't in the expected shape", () => {
    const long = "x".repeat(61);
    const bad = [
      card({ kind: "oops" as Card["kind"] }),
      card({ severity: "brutal" as Card["severity"] }),
      card({ tones: ["lucky"] }), // a glory tone on a fumble
      card({ i18n: { de: { title: long, effect: "e" } } }),
      card({ i18n: { de: { title: "t", effect: "" } } }),
      card({ i18n: { "<script>": { title: "t", effect: "e" } } }),
      "a string", null, 42,
    ];
    expect(parseImport(bad, taxonomy)).toEqual({ cards: [], invalid: bad.length });
  });

  it("keeps only valid languages and trims text", () => {
    const { cards } = parseImport([card({ i18n: { de: { title: "  Titel ", effect: " Text " }, xx_YY: { title: "a", effect: "b" } } })], taxonomy);
    expect(cards[0].i18n).toEqual({ de: { title: "Titel", effect: "Text" } });
  });

  it("returns nothing for things that aren't cards at all", () => {
    expect(parseImport(null, taxonomy)).toEqual({ cards: [], invalid: 0 });
    expect(parseImport({ hello: "world" }, taxonomy)).toEqual({ cards: [], invalid: 0 });
  });

  it("caps very large imports", () => {
    const { cards, invalid } = parseImport(Array.from({ length: 1005 }, () => card()), taxonomy);
    expect(cards).toHaveLength(1000);
    expect(invalid).toBe(5);
  });
});

describe("mergeCards", () => {
  it("adds new cards with fresh ids and skips identical ones", () => {
    const existing = [card()];
    const other = card({ i18n: { de: { title: "Anders", effect: "Text" } } });
    const result = mergeCards(existing, parseImport([card(), other, other], taxonomy).cards, newCustomId);
    expect(result).toMatchObject({ added: 1, skipped: 2 });
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toMatchObject({ custom: true, i18n: other.i18n });
    expect(result.cards[0].id).toMatch(/^custom-[a-z0-9-]+$/);
  });

  it("gives every card its own id, even when created at the same moment", () => {
    expect(new Set(Array.from({ length: 200 }, newCustomId)).size).toBe(200);
  });
});

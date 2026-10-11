// Validates all decks: JSON schema, unique ids, known class groups and tones.
// Prints a report of missing translations (warning only, never fails the build).
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";

const root = new URL("..", import.meta.url).pathname;
const dataDir = join(root, "public/data");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const manifest = read(join(dataDir, "manifest.json"));
const taxonomy = read(join(dataDir, "taxonomy.json"));
const validate = new Ajv({ allErrors: true }).compile(read(join(root, "schema/deck.schema.json")));

const errors = [];
const missing = Object.fromEntries(manifest.locales.map((l) => [l, []]));
const seen = new Set();
let total = 0;

for (const deckPath of manifest.decks) {
  const deck = read(join(dataDir, deckPath));
  if (!validate(deck)) {
    for (const e of validate.errors) errors.push(`${deckPath}${e.instancePath}: ${e.message}`);
    continue;
  }
  for (const card of deck.cards) {
    total++;
    const where = `${deckPath} › ${card.id}`;
    if (seen.has(card.id)) errors.push(`${where}: duplicate card id`);
    seen.add(card.id);
    for (const g of card.classGroups) {
      if (!taxonomy.classGroups[g]) errors.push(`${where}: unknown class group "${g}"`);
    }
    for (const t of card.tones) {
      if (!taxonomy.tones[card.kind][t]) errors.push(`${where}: tone "${t}" is not a ${card.kind} tone`);
    }
    for (const l of Object.keys(card.i18n)) {
      if (!manifest.locales.includes(l)) errors.push(`${where}: locale "${l}" is not listed in manifest.json`);
    }
    for (const l of manifest.locales) if (!card.i18n[l]) missing[l].push(card.id);
  }
}

const lines = [`## Translation coverage (${total} cards)`, "", "| Locale | Translated | Missing |", "|---|---|---|"];
for (const l of manifest.locales) lines.push(`| ${l} | ${total - missing[l].length} | ${missing[l].length} |`);
for (const l of manifest.locales) {
  if (missing[l].length) lines.push("", `**${l}** missing: ${missing[l].join(", ")}`);
}
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\nAll ${total} cards valid.`);

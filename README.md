# Fumble & Glory

Crit cards for every natural 1 and 20 at your table. A phone-first web app for pen-and-paper groups: roll a natural 1 or 20, draw a card whose effect fits your character's class and the tones your table agreed on.

Runs entirely on GitHub Pages. No database, no backend: all cards are JSON files in this repo.

## How it works

```
public/data/
  manifest.json          version, supported locales, list of decks
  taxonomy.json          class groups, tones, severities (keys + translations)
  decks/*.json           the cards, all translations inline
public/i18n/ui.<locale>.json   UI strings
schema/deck.schema.json        JSON Schema for decks
scripts/validate.mjs           schema + consistency checks, translation report
```

- The app loads `manifest.json` fresh on every start and uses its `version` to cache-bust everything else. **Bump `version` whenever you change data.**
- Settings (language, character, class group, tones, severity) live in the browser's `localStorage`.
- **Translations:** a card is shown in the app language. If that translation is missing, the player chooses: show it in English, or hide it. English is required for every card.

## Adding a card

Add an object to a deck in `public/data/decks/`:

```json
{
  "id": "fumble-arcane-wrong-pocket",
  "kind": "fumble",
  "classGroups": ["arcane"],
  "tones": ["comic"],
  "severity": "mild",
  "i18n": {
    "en": { "title": "Wrong Pocket", "effect": "You grab the wrong component. Your spell fails, but the slot is not spent.", "duration": "Immediately" },
    "de": { "title": "Falsche Tasche", "effect": "Du greifst zur falschen Komponente. Dein Zauber misslingt, der Platz bleibt aber erhalten.", "duration": "Sofort" }
  }
}
```

Rules (enforced by `npm run validate` and CI):

- `id`: lowercase, digits and dashes, unique across all decks.
- `kind`: `fumble` or `glory`. `tones` must be tones of that kind in `taxonomy.json`.
- `classGroups`: keys from `taxonomy.json`; an empty list means the card applies to every class.
- `severity`: `mild`, `medium` or `harsh`.
- `i18n.en` is required; other locales must be listed in `manifest.json`.
- Effects speak to the player in second person ("You…", "Du…"), one or two sentences, game vocabulary as written (`1d4`, advantage, saving throw).

A new deck file must also be added to `manifest.decks`. A new language needs its code in `manifest.locales` and a `public/i18n/ui.<code>.json`.

## Development

```bash
npm install
npm run dev        # local dev server
npm run validate   # check decks, print translation coverage
npm run build      # validate + type-check + build to dist/
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: validate, build, deploy to GitHub Pages. Pull requests are validated only; the translation coverage report appears in the job summary.

## Design

Colors, type and components follow the "Fumble & Glory" design system: parchment and ink, blood red for fumbles, gold for glory, Fraunces for numerals and titles, Alegreya Sans for text. Light ("Parchment") and dark ("Tavern night") follow the system setting.

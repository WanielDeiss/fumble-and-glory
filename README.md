# Fumble & Glory

[![Play now](https://img.shields.io/badge/play-online-2a1f14?style=flat)](https://wanieldeiss.github.io/fumble-and-glory/)
[![Fumbles](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fdata%2Fdecks%2Fcore-fumble.json&query=%24.cards.length&label=fumbles&color=9e2a24)](public/data/decks/core-fumble.json)
[![Glories](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fdata%2Fdecks%2Fcore-glory.json&query=%24.cards.length&label=glories&color=c9952a)](public/data/decks/core-glory.json)
[![Languages](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fdata%2Fmanifest.json&query=%24.locales&label=languages&color=3a5486)](public/i18n/)
[![PWA](https://img.shields.io/badge/PWA-installable-5b4636)](https://wanieldeiss.github.io/fumble-and-glory/#/install)

[![Validate and deploy](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml/badge.svg)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Ftests.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Fcoverage.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Security](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=bugs)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=WanielDeiss_fumble-and-glory&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)

[![Lighthouse performance](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Flighthouse-performance.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Lighthouse accessibility](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Flighthouse-accessibility.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Lighthouse best practices](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Flighthouse-best-practices.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)
[![Lighthouse SEO](https://img.shields.io/endpoint?url=https%3A%2F%2Fwanieldeiss.github.io%2Ffumble-and-glory%2Fbadges%2Flighthouse-seo.json)](https://github.com/WanielDeiss/fumble-and-glory/actions/workflows/deploy.yml)

[![SonarQube Cloud](https://sonarcloud.io/images/project_badges/sonarcloud-light.svg)](https://sonarcloud.io/summary/new_code?id=WanielDeiss_fumble-and-glory)

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

- The app keeps the decks it last downloaded on the device and starts from that copy. On start (and when an installed app comes back to the foreground) it loads `manifest.json` fresh; if the `version` differs, it shows "N new cards available" and switches to the new decks only when the player taps "Load". **Bump `version` whenever you change data**, otherwise nobody gets the update.
- **How it works:** `#/help` explains fumbles, glories, tones and severity. It opens once on first start and is linked from the draw screen and the table settings.
- **Own cards:** in the installed app (not in a browser tab) players can create, edit and delete their own cards from the deck screen. They are stored only on that device (`localStorage`, with persistent storage requested), written in one language and shown in every language.
- Settings (language, character, class group, tones, severity) live in the browser's `localStorage`.
- **Installable app (PWA):** `public/manifest.webmanifest` and `public/sw.js` make the site installable and usable offline. The service worker fetches pages, decks and UI strings network-first (so the update check always sees the latest decks) and serves the last copy when offline. The in-app guide at `#/install` explains installing on iPhone, Android, Chrome/Edge and Safari on Mac. Icons live in `public/icons/` (`icon.svg` is the source for the PNGs).
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

npm test               # unit and UI tests (Vitest, jsdom)
npm run test:coverage  # same, with a coverage report in coverage/
npm run test:e2e       # browser tests against the build (Playwright; run `npx playwright install chromium` once)
npm run lighthouse     # Lighthouse CI against the build: performance, accessibility, best practices, SEO
```

CI runs all of these on every push and pull request, and only deploys when everything passes, including the Lighthouse minimums in `lighthouserc.json`. `scripts/badges.mjs` turns the results into the badge files under `badges/` on the published site.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: validate, build, deploy to GitHub Pages. Pull requests are validated only; the translation coverage report appears in the job summary.

## Design

Colors, type and components follow the "Fumble & Glory" design system: parchment and ink, blood red for fumbles, gold for glory, Fraunces for numerals and titles, Alegreya Sans for text. Light ("Parchment") and dark ("Tavern night") follow the system setting.

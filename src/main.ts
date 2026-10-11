import "./styles/tokens.css";
import "./styles/app.css";
import {
  loadData, loadUiStrings, localize, label, withinSeverity,
  type GameData, type Kind, type Labels, type LocalizedCard,
} from "./data";
import { loadSettings, saveSettings, type Settings } from "./settings";

const app = document.getElementById("app")!;

let data: GameData;
let ui: Labels = {};
let settings: Settings;
let drawn: { card: LocalizedCard; fresh: boolean } | null = null;
let deckFilter: "all" | Kind = "all";
let deckQuery = "";

// ---------- helpers ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function t(key: string, vars: Record<string, string | number> = {}): string {
  let s = ui[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

const ICONS = {
  deck: '<rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  martial: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  ranged: '<path d="M3 21 21 3M15 3h6v6M5 6c4 0 13 9 13 13"/>',
  arcane: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
} as const;
const icon = (name: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function classBadge(groups: string[]): string {
  if (groups.length === 0) return `<span class="fg-class fg-class--all">${esc(t("card.allClasses"))}</span>`;
  return groups
    .map((g) => {
      const ic = g in ICONS ? icon(g as keyof typeof ICONS) : "";
      return `<span class="fg-class fg-class--${esc(g)}">${ic}${esc(label(data.taxonomy.classGroups[g], settings.locale))}</span>`;
    })
    .join("");
}

const toneLabel = (kind: Kind, tone: string) => label(data.taxonomy.tones[kind][tone], settings.locale);

/** Cards shown in the user's locale, after the translation fallback rule. */
function visibleCards(): LocalizedCard[] {
  return data.cards
    .map((c) => localize(c, settings.locale, settings.fallback))
    .filter((c): c is LocalizedCard => c !== null);
}

/** Cards that may be drawn: right class group, a selected tone, within the severity. */
function drawPool(kind: Kind): LocalizedCard[] {
  const tones = kind === "fumble" ? settings.fumbleTones : settings.gloryTones;
  return visibleCards().filter(
    (c) =>
      c.kind === kind &&
      (c.classGroups.length === 0 || c.classGroups.includes(settings.classGroup)) &&
      c.tones.some((tn) => tones.includes(tn)) &&
      withinSeverity(c, settings.maxSeverity),
  );
}

function update(patch: Partial<Settings>) {
  const localeChanged = patch.locale && patch.locale !== settings.locale;
  settings = { ...settings, ...patch };
  saveSettings(settings);
  if (localeChanged) {
    drawn = null;
    void loadUiStrings(settings.locale, data.manifest.version).then((s) => { ui = s; render(); });
  } else {
    render();
  }
}

// ---------- views ----------

function topbar(title: string | null, actions = ""): string {
  const left = title === null
    ? `<div class="wordmark">Fumble &amp; Glory</div>`
    : `<a class="icon-btn" href="#/" aria-label="${esc(t("nav.back"))}">${icon("back")}</a><h1>${esc(title)}</h1>`;
  return `<header class="topbar">${left}${actions}</header>`;
}

function cardView(c: LocalizedCard, fresh: boolean): string {
  const kindLabel = t(c.kind === "fumble" ? "card.fumble" : "card.glory");
  return `
    <article class="fg-card fg-card--${c.kind}${fresh ? " fg-card--drawn" : ""}" lang="${esc(c.i18n[settings.locale] ? settings.locale : "en")}">
      <header class="fg-card__band">
        <span class="fg-card__kind">${esc(kindLabel)}</span>
        <span class="fg-card__die">${c.kind === "fumble" ? 1 : 20}</span>
      </header>
      <div class="fg-card__body">
        ${classBadge(c.classGroups)}
        <h2 class="fg-card__title">${esc(c.text.title)}</h2>
        <p class="fg-card__effect">${esc(c.text.effect)}</p>
        ${c.text.duration ? `<p class="meta">${esc(c.text.duration)}</p>` : ""}
        <div class="fg-card__tags">${c.tones.map((tn) => `<span class="fg-tag fg-tag--static">${esc(toneLabel(c.kind, tn))}</span>`).join("")}</div>
      </div>
    </article>`;
}

function drawScreen(): string {
  const fumbles = drawPool("fumble").length;
  const glories = drawPool("glory").length;
  const toneNames = settings.fumbleTones.map((tn) => toneLabel("fumble", tn)).join(", ");
  return `
    ${topbar(null, `
      <a class="icon-btn" href="#/deck" aria-label="${esc(t("nav.deck"))}">${icon("deck")}</a>
      <a class="icon-btn" href="#/table" aria-label="${esc(t("nav.table"))}">${icon("sliders")}</a>`)}
    <section class="character">
      ${settings.characterName ? `<strong>${esc(settings.characterName)}</strong>` : ""}
      ${classBadge([settings.classGroup])}
      <span class="meta">${esc(toneNames)}</span>
    </section>
    <div class="stage">
      ${drawn ? cardView(drawn.card, drawn.fresh) : `<div class="empty-card">${esc(t("draw.empty"))}</div>`}
    </div>
    <div class="footer">
      <p class="meta center">${esc(t("draw.pool", { fumble: fumbles, glory: glories }))}</p>
      <button class="fg-btn fg-btn--fumble" data-action="draw" data-kind="fumble" ${fumbles ? "" : "disabled"}>${esc(t("draw.fumble"))}</button>
      <button class="fg-btn fg-btn--glory" data-action="draw" data-kind="glory" ${glories ? "" : "disabled"}>${esc(t("draw.glory"))}</button>
    </div>`;
}

function segmented(name: string, cols: number, options: [string, string][], current: string): string {
  return `<div class="segmented" style="--cols:${cols}" role="group">${options
    .map(([v, l]) => `<button class="seg" data-action="set" data-key="${name}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`)
    .join("")}</div>`;
}

function toneToggles(kind: Kind, selected: string[]): string {
  return `<div class="tags" role="group">${Object.keys(data.taxonomy.tones[kind])
    .map((tn) => `<button class="fg-tag${kind === "glory" ? " fg-tag--glory" : ""}" data-action="tone" data-kind="${kind}" data-value="${esc(tn)}" aria-pressed="${selected.includes(tn)}">${esc(toneLabel(kind, tn))}</button>`)
    .join("")}</div>`;
}

function tableScreen(): string {
  const loc = settings.locale;
  const groups = Object.entries(data.taxonomy.classGroups).map(([k, v]) => [k, label(v, loc)] as [string, string]);
  const sev = Object.entries(data.taxonomy.severities).map(([k, v]) => [k, label(v, loc)] as [string, string]);
  const langNames: Record<string, string> = { en: "English", de: "Deutsch", fr: "Français" };
  const langs = data.manifest.locales.map((l) => [l, langNames[l] ?? l.toUpperCase()] as [string, string]);
  return `
    ${topbar(t("table.title"))}
    <div class="content">
      <section class="section">
        <label class="label" for="charname">${esc(t("table.character"))}</label>
        <input id="charname" class="input" type="text" autocomplete="off" placeholder="${esc(t("table.characterPlaceholder"))}" value="${esc(settings.characterName)}" data-action="name">
        <span class="visually-hidden">${esc(t("table.classGroup"))}</span>
        ${segmented("classGroup", groups.length, groups, settings.classGroup)}
      </section>
      <section class="section">
        <h2 class="label label--fumble">${esc(t("table.fumbleTones"))}</h2>
        <p class="meta">${esc(t("table.fumbleTonesHint"))}</p>
        ${toneToggles("fumble", settings.fumbleTones)}
      </section>
      <section class="section">
        <h2 class="label label--glory">${esc(t("table.gloryTones"))}</h2>
        ${toneToggles("glory", settings.gloryTones)}
      </section>
      <section class="section">
        <h2 class="label">${esc(t("table.severity"))}</h2>
        ${segmented("maxSeverity", sev.length, sev, settings.maxSeverity)}
      </section>
      <section class="section">
        <h2 class="label">${esc(t("table.language"))}</h2>
        ${segmented("locale", langs.length, langs, settings.locale)}
        <p class="meta">${esc(t("table.fallback"))}</p>
        ${segmented("fallback", 2, [["en", t("table.fallback.en")], ["hide", t("table.fallback.hide")]], settings.fallback)}
      </section>
    </div>
    <div class="footer"><a class="fg-btn fg-btn--primary" href="#/">${esc(t("table.done"))}</a></div>`;
}

function deckRows(): string {
  const q = deckQuery.trim().toLowerCase();
  const list = visibleCards().filter(
    (c) => (deckFilter === "all" || c.kind === deckFilter) &&
      (!q || `${c.text.title} ${c.text.effect}`.toLowerCase().includes(q)),
  );
  return list
    .map((c) => `
      <li class="deck-row">
        <span class="deck-die deck-die--${c.kind}" aria-label="${esc(t(c.kind === "fumble" ? "card.fumble" : "card.glory"))}">${c.kind === "fumble" ? 1 : 20}</span>
        <span class="deck-row__text">
          <span class="deck-row__title">${esc(c.text.title)}</span>
          <span class="deck-row__effect">${esc(c.text.effect)}</span>
          <span class="deck-row__meta">${classBadge(c.classGroups)}<span class="meta">${esc(c.tones.map((tn) => toneLabel(c.kind, tn)).join(", "))}</span></span>
        </span>
      </li>`)
    .join("");
}

function deckScreen(): string {
  const count = visibleCards().filter((c) => deckFilter === "all" || c.kind === deckFilter).length;
  return `
    ${topbar(t("deck.title"), `<span class="meta">${esc(t("deck.count", { n: count }))}</span>`)}
    <div class="filters">
      <label class="search">${icon("search")}<span class="visually-hidden">${esc(t("deck.search"))}</span>
        <input type="search" placeholder="${esc(t("deck.search"))}" value="${esc(deckQuery)}" data-action="search">
      </label>
      ${segmented("deckFilter", 3, [["all", t("deck.filter.all")], ["fumble", t("deck.filter.fumble")], ["glory", t("deck.filter.glory")]], deckFilter)}
    </div>
    <ul class="deck-list">${deckRows()}</ul>`;
}

function render() {
  document.documentElement.lang = settings.locale;
  const route = location.hash.replace(/^#/, "") || "/";
  app.innerHTML = route === "/table" ? tableScreen() : route === "/deck" ? deckScreen() : drawScreen();
  if (drawn) drawn.fresh = false;
}

// ---------- events ----------

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const { action, key, value, kind } = el.dataset;
  if (action === "draw" && kind) {
    const pool = drawPool(kind as Kind);
    const others = pool.filter((c) => c.id !== drawn?.card.id);
    const from = others.length ? others : pool;
    if (from.length) drawn = { card: from[Math.floor(Math.random() * from.length)], fresh: true };
    render();
  } else if (action === "set" && key && value) {
    if (key === "deckFilter") { deckFilter = value as typeof deckFilter; render(); }
    else update({ [key]: value } as Partial<Settings>);
  } else if (action === "tone" && kind && value) {
    const field = kind === "fumble" ? "fumbleTones" : "gloryTones";
    const cur = settings[field];
    update({ [field]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] } as Partial<Settings>);
  }
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action === "name") {
    settings.characterName = el.value;
    saveSettings(settings);
  } else if (el.dataset.action === "search") {
    deckQuery = el.value;
    const list = app.querySelector(".deck-list");
    if (list) list.innerHTML = deckRows();
  }
});

window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

// ---------- start ----------

(async () => {
  try {
    data = await loadData();
    settings = loadSettings(data.manifest.locales);
    ui = await loadUiStrings(settings.locale, data.manifest.version);
    render();
  } catch (err) {
    app.innerHTML = `<p class="meta" style="padding:16px">${esc(String(err))}</p>`;
  }
})();

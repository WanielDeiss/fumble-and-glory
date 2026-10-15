import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";
import {
  fetchData, loadStoredData, storeData, diffData, loadUiStrings, localize, label, withinSeverity,
  type Card, type DataDiff, type GameData, type Kind, type Labels, type LocalizedCard, type Severity,
} from "./data";
import { loadCustomCards, saveCustomCards, newCustomId } from "./custom";
import { loadSettings, saveSettings, type Settings } from "./settings";

const app = document.getElementById("app")!;

let data: GameData;
let ui: Labels = {};
let settings: Settings;
let drawn: { card: LocalizedCard; fresh: boolean } | null = null;
let deckFilter: "all" | Kind = "all";
let deckQuery = "";

let customCards: Card[] = [];

/** Newer decks found on the server, waiting for the player to load them. */
let pendingUpdate: { data: GameData; diff: DataDiff } | null = null;
let updateDone = false;
let lastUpdateCheck = 0;

/** The card being created or edited on #/card/… */
interface Draft {
  id: string | null;
  kind: Kind;
  title: string;
  effect: string;
  duration: string;
  classGroups: string[];
  tones: string[];
  severity: Severity;
}
let draft: Draft | null = null;
let draftError = "";

/** Chrome's deferred install prompt (beforeinstallprompt); null where the browser has none. */
interface InstallPromptEvent extends Event { prompt(): Promise<void> }
let installPrompt: InstallPromptEvent | null = null;

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
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  martial: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  ranged: '<path d="M3 21 21 3M15 3h6v6M5 6c4 0 13 9 13 13"/>',
  arcane: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01"/>',
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

/** Cards shown in the user's locale, after the translation fallback rule. Own cards first. */
function visibleCards(): LocalizedCard[] {
  return [...(isInstalled() ? customCards : []), ...data.cards]
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

/** True when running as the installed app rather than in a browser tab. */
const isInstalled = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

type Platform = "ios" | "android" | "mac" | "desktop";
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return "mac";
  return "desktop";
}

function update(patch: Partial<Settings>) {
  const localeChanged = patch.locale && patch.locale !== settings.locale;
  settings = { ...settings, ...patch };
  saveSettings(settings);
  if (localeChanged) {
    drawn = null;
    void loadUiStrings(settings.locale, __BUILD_ID__).then((s) => { ui = s; render(); });
  } else {
    render();
  }
}

// ---------- views ----------

const LANG_NAMES: Record<string, string> = { en: "English", de: "Deutsch", fr: "Français" };

function langSwitch(): string {
  const options = data.manifest.locales
    .map((l) => `<option value="${esc(l)}"${l === settings.locale ? " selected" : ""}>${esc(LANG_NAMES[l] ?? l.toUpperCase())}</option>`)
    .join("");
  return `
    <label class="lang-switch">
      ${icon("globe")}
      <span class="lang-switch__code" aria-hidden="true">${esc(settings.locale.toUpperCase())}</span>
      <select data-action="locale" aria-label="${esc(t("table.language"))}">${options}</select>
    </label>`;
}

function topbar(title: string | null, actions = ""): string {
  const left = title === null
    ? `<div class="wordmark">Fumble &amp; Glory</div>`
    : `<a class="icon-btn" href="#/" aria-label="${esc(t("nav.back"))}">${icon("back")}</a><h1>${esc(title)}</h1>`;
  return `<header class="topbar">${left}${actions}${langSwitch()}</header>`;
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
        <div class="fg-card__tags">${c.custom ? `<span class="fg-tag fg-tag--static fg-tag--custom">${esc(t("card.custom"))}</span>` : ""}${c.tones.map((tn) => `<span class="fg-tag fg-tag--static">${esc(toneLabel(c.kind, tn))}</span>`).join("")}</div>
      </div>
    </article>`;
}

function updateBanner(): string {
  if (updateDone) return `<div class="update-banner" role="status"><span>${esc(t("update.done"))}</span></div>`;
  if (!pendingUpdate) return "";
  const { added } = pendingUpdate.diff;
  let text = t("update.changed");
  if (added === 1) text = t("update.newOne");
  else if (added > 1) text = t("update.new", { n: added });
  return `
    <div class="update-banner" role="status">
      <span>${esc(text)}</span>
      <button class="fg-btn fg-btn--small fg-btn--primary" data-action="apply-update">${esc(t("update.load"))}</button>
    </div>`;
}

/** Help and install links under the empty card. */
function hintLinks(): string {
  const install = isInstalled() ? "" : `<a class="text-link" href="#/install">${icon("install")}${esc(t("install.link"))}</a>`;
  return `
    <p class="hint-links">
      <a class="text-link" href="#/help">${icon("help")}${esc(t("help.link"))}</a>
      ${install}
    </p>`;
}

function drawScreen(): string {
  const fumbles = drawPool("fumble").length;
  const glories = drawPool("glory").length;
  const toneNames = settings.fumbleTones.map((tn) => toneLabel("fumble", tn)).join(", ");
  return `
    ${topbar(null, `
      <a class="icon-btn" href="#/deck" aria-label="${esc(t("nav.deck"))}">${icon("deck")}</a>
      <a class="icon-btn" href="#/table" aria-label="${esc(t("nav.table"))}">${icon("sliders")}</a>`)}
    ${updateBanner()}
    <section class="character">
      ${settings.characterName ? `<strong>${esc(settings.characterName)}</strong>` : ""}
      ${classBadge([settings.classGroup])}
      <span class="meta">${esc(toneNames)}</span>
    </section>
    <div class="stage">
      ${drawn ? cardView(drawn.card, drawn.fresh) : `<div class="empty-card">${esc(t("draw.empty"))}</div>`}
    </div>
    ${drawn ? "" : hintLinks()}
    <div class="footer">
      <p class="meta center">${esc(t("draw.pool", { fumble: fumbles, glory: glories }))}</p>
      <button class="fg-btn fg-btn--fumble" data-action="draw" data-kind="fumble" ${fumbles ? "" : "disabled"}>${esc(t("draw.fumble"))}</button>
      <button class="fg-btn fg-btn--glory" data-action="draw" data-kind="glory" ${glories ? "" : "disabled"}>${esc(t("draw.glory"))}</button>
    </div>`;
}

function segmented(name: string, cols: number, options: [string, string][], current: string, action = "set"): string {
  return `<div class="segmented" style="--cols:${cols}" role="group">${options
    .map(([v, l]) => `<button class="seg" data-action="${action}" data-key="${name}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`)
    .join("")}</div>`;
}

function toneToggles(kind: Kind, selected: string[], action = "tone"): string {
  return `<div class="tags" role="group">${Object.keys(data.taxonomy.tones[kind])
    .map((tn) => `<button class="fg-tag${kind === "glory" ? " fg-tag--glory" : ""}" data-action="${action}" data-kind="${kind}" data-key="tones" data-value="${esc(tn)}" aria-pressed="${selected.includes(tn)}">${esc(toneLabel(kind, tn))}</button>`)
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
      <section class="section">
        <h2 class="label">${esc(t("table.help"))}</h2>
        <a class="fg-btn fg-btn--outline" href="#/help">${icon("help")}${esc(t("help.title"))}</a>
      </section>
      ${isInstalled() ? "" : `
      <section class="section">
        <h2 class="label">${esc(t("table.app"))}</h2>
        <a class="fg-btn fg-btn--outline" href="#/install">${icon("install")}${esc(t("install.link"))}</a>
      </section>`}
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
    .map((c) => {
      const inner = `
        <span class="deck-die deck-die--${c.kind}" aria-label="${esc(t(c.kind === "fumble" ? "card.fumble" : "card.glory"))}">${c.kind === "fumble" ? 1 : 20}</span>
        <span class="deck-row__text">
          <span class="deck-row__title">${esc(c.text.title)}</span>
          <span class="deck-row__effect">${esc(c.text.effect)}</span>
          <span class="deck-row__meta">${c.custom ? `<span class="fg-tag fg-tag--static fg-tag--custom">${esc(t("card.custom"))}</span>` : ""}${classBadge(c.classGroups)}<span class="meta">${esc(c.tones.map((tn) => toneLabel(c.kind, tn)).join(", "))}</span></span>
        </span>`;
      // Own cards open the editor.
      return c.custom
        ? `<li><a class="deck-row deck-row--link" href="#/card/${esc(c.id)}">${inner}</a></li>`
        : `<li class="deck-row">${inner}</li>`;
    })
    .join("");
}

function deckScreen(): string {
  const count = visibleCards().filter((c) => deckFilter === "all" || c.kind === deckFilter).length;
  return `
    ${topbar(t("deck.title"), `<span class="meta">${esc(t("deck.count", { n: count }))}</span>`)}
    ${updateBanner()}
    <div class="filters">
      ${isInstalled()
        ? `<a class="fg-btn fg-btn--outline" href="#/card/new">${icon("plus")}${esc(t("deck.addCustom"))}</a>`
        : `<p class="meta">${esc(t("deck.customHint"))} <a href="#/install">${esc(t("install.title"))}</a></p>`}
      <label class="search">${icon("search")}<span class="visually-hidden">${esc(t("deck.search"))}</span>
        <input type="search" placeholder="${esc(t("deck.search"))}" value="${esc(deckQuery)}" data-action="search">
      </label>
      ${segmented("deckFilter", 3, [["all", t("deck.filter.all")], ["fumble", t("deck.filter.fumble")], ["glory", t("deck.filter.glory")]], deckFilter)}
    </div>
    <ul class="deck-list">${deckRows()}</ul>`;
}

function newDraft(id: string): Draft | null {
  if (id === "new") {
    return { id: null, kind: "fumble", title: "", effect: "", duration: "", classGroups: [], tones: [], severity: "mild" };
  }
  const card = customCards.find((c) => c.id === id);
  if (!card) return null;
  const text = Object.values(card.i18n)[0];
  return {
    id: card.id, kind: card.kind, title: text.title, effect: text.effect, duration: text.duration ?? "",
    classGroups: [...card.classGroups], tones: [...card.tones], severity: card.severity,
  };
}

function editorScreen(id: string): string {
  if (!isInstalled()) { location.replace("#/install"); return ""; }
  if (!draft || (draft.id ?? "new") !== id) { draft = newDraft(id); draftError = ""; }
  if (!draft) { location.replace("#/deck"); return ""; }
  const d = draft;
  const loc = settings.locale;
  const groups = Object.entries(data.taxonomy.classGroups);
  const sev = Object.entries(data.taxonomy.severities).map(([k, v]) => [k, label(v, loc)] as [string, string]);
  return `
    ${topbar(t(d.id ? "editor.edit" : "editor.new"))}
    <div class="content">
      <section class="section">
        <h2 class="label">${esc(t("editor.kind"))}</h2>
        ${segmented("kind", 2, [["fumble", t("card.fumble")], ["glory", t("card.glory")]], d.kind, "draft")}
      </section>
      <section class="section">
        <label class="label" for="card-title">${esc(t("editor.title"))}</label>
        <input id="card-title" class="input" type="text" maxlength="60" autocomplete="off" value="${esc(d.title)}" data-action="draft-text" data-key="title">
        <label class="label" for="card-effect">${esc(t("editor.effect"))}</label>
        <textarea id="card-effect" class="input textarea" maxlength="280" rows="4" placeholder="${esc(t("editor.effectPlaceholder"))}" data-action="draft-text" data-key="effect">${esc(d.effect)}</textarea>
        <label class="label" for="card-duration">${esc(t("editor.duration"))}</label>
        <input id="card-duration" class="input" type="text" maxlength="60" autocomplete="off" placeholder="${esc(t("editor.durationPlaceholder"))}" value="${esc(d.duration)}" data-action="draft-text" data-key="duration">
      </section>
      <section class="section">
        <h2 class="label">${esc(t("editor.classes"))}</h2>
        <p class="meta">${esc(t("editor.classesHint"))}</p>
        <div class="tags" role="group">${groups
          .map(([g, l]) => `<button class="fg-tag" data-action="draft-toggle" data-key="classGroups" data-value="${esc(g)}" aria-pressed="${d.classGroups.includes(g)}">${esc(label(l, loc))}</button>`)
          .join("")}</div>
      </section>
      <section class="section">
        <h2 class="label ${d.kind === "fumble" ? "label--fumble" : "label--glory"}">${esc(t("editor.tones"))}</h2>
        ${toneToggles(d.kind, d.tones, "draft-toggle")}
      </section>
      <section class="section">
        <h2 class="label">${esc(t("editor.severity"))}</h2>
        ${segmented("severity", sev.length, sev, d.severity, "draft")}
      </section>
      <p class="meta">${esc(t("editor.savedLocally"))}</p>
      ${draftError ? `<p class="form-error" role="alert">${esc(draftError)}</p>` : ""}
    </div>
    <div class="footer">
      <button class="fg-btn fg-btn--primary" data-action="save-card">${esc(t("editor.save"))}</button>
      ${d.id ? `<button class="fg-btn fg-btn--outline fg-btn--danger" data-action="delete-card">${esc(t("editor.delete"))}</button>` : ""}
      <a class="fg-btn fg-btn--outline" href="#/deck">${esc(t("editor.cancel"))}</a>
    </div>`;
}

function saveDraft() {
  if (!draft) return;
  const d = draft;
  const title = d.title.trim(), effect = d.effect.trim(), duration = d.duration.trim();
  if (!title || !effect || d.tones.length === 0) {
    draftError = t("editor.errorRequired");
    render();
    return;
  }
  const card: Card = {
    id: d.id ?? newCustomId(),
    kind: d.kind,
    classGroups: d.classGroups,
    tones: d.tones,
    severity: d.severity,
    i18n: { [settings.locale]: duration ? { title, effect, duration } : { title, effect } },
    custom: true,
  };
  const next = d.id ? customCards.map((c) => (c.id === d.id ? card : c)) : [card, ...customCards];
  if (!saveCustomCards(next)) {
    draftError = t("editor.errorStorage");
    render();
    return;
  }
  customCards = next;
  draft = null;
  location.hash = "#/deck";
}

function deleteDraft() {
  if (!draft?.id || !confirm(t("editor.confirmDelete"))) return;
  const id = draft.id;
  const next = customCards.filter((c) => c.id !== id);
  if (!saveCustomCards(next)) return;
  customCards = next;
  if (drawn?.card.id === id) drawn = null;
  draft = null;
  location.hash = "#/deck";
}

/**
 * Re-render after something changed in the background (update check, install prompt).
 * Skipped while the player types, so the field under the cursor isn't replaced;
 * the change shows up with the next render the player triggers.
 */
function refresh() {
  if (!settings) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && app.contains(active) && active.matches("input, textarea, select")) return;
  render();
}

async function checkForUpdate() {
  if (Date.now() - lastUpdateCheck < 10 * 60 * 1000) return;
  lastUpdateCheck = Date.now();
  try {
    const remote = await fetchData();
    if (remote.manifest.version === data.manifest.version) return;
    const diff = diffData(data, remote);
    if (diff.added + diff.changed + diff.removed === 0) {
      // Only labels or settings changed: nothing for the player to decide.
      data = remote;
      storeData(data);
      refresh();
      return;
    }
    pendingUpdate = { data: remote, diff };
    refresh();
  } catch {
    /* offline: check again next time */
  }
}

function applyUpdate() {
  if (!pendingUpdate) return;
  data = pendingUpdate.data;
  storeData(data);
  pendingUpdate = null;
  updateDone = true;
  render();
}

function helpScreen(): string {
  if (!settings.seenHelp) {
    settings.seenHelp = true;
    saveSettings(settings);
  }
  const rule = (kind: Kind) => `
    <section class="help-rule">
      <span class="deck-die deck-die--${kind}" aria-hidden="true">${kind === "fumble" ? 1 : 20}</span>
      <div class="section">
        <h2 class="help-title">${esc(t(`help.${kind}.title`))}</h2>
        <p class="help-text">${esc(t(`help.${kind}.text`))}</p>
      </div>
    </section>`;
  const part = (key: string) => `
    <section class="section">
      <h2 class="label">${esc(t(`help.${key}.title`))}</h2>
      <p class="help-text">${esc(t(`help.${key}.text`))}</p>
    </section>`;
  return `
    ${topbar(t("help.title"))}
    <div class="content">
      <p class="lead">${esc(t("help.intro"))}</p>
      ${rule("fumble")}
      ${rule("glory")}
      ${["setup", "tones", "severity", "gm"].map(part).join("")}
    </div>
    <div class="footer"><a class="fg-btn fg-btn--primary" href="#/">${esc(t("help.start"))}</a></div>`;
}

const INSTALL_STEPS: Record<Platform, number> = { ios: 3, android: 3, desktop: 3, mac: 2 };

function installScreen(): string {
  const current = detectPlatform();
  const order = [current, ...(Object.keys(INSTALL_STEPS) as Platform[]).filter((p) => p !== current)];
  const step = (p: Platform, n: number) => `<li>${esc(t("install." + p + "." + n))}</li>`;
  const firefoxNote = `<p class="meta">${esc(t("install.desktop.firefox"))}</p>`;
  const block = (p: Platform) => {
    const steps = Array.from({ length: INSTALL_STEPS[p] }, (_, i) => step(p, i + 1)).join("");
    return `
      <details class="install-block"${p === current ? " open" : ""}>
        <summary>${esc(t(`install.${p}.title`))}</summary>
        <ol class="steps">${steps}</ol>
        ${p === "desktop" ? firefoxNote : ""}
      </details>`;
  };
  const installButton = installPrompt
    ? `<button class="fg-btn fg-btn--primary" data-action="install">${icon("install")}${esc(t("install.button"))}</button>`
    : "";
  const body = isInstalled()
    ? `<p class="notice">${esc(t("install.installed"))}</p>`
    : `<p class="lead">${esc(t("install.intro"))}</p>${installButton}${order.map(block).join("")}`;
  return `
    ${topbar(t("install.title"))}
    <div class="content">
      ${body}
      <p class="meta">${esc(t("install.offline"))}</p>
    </div>`;
}

const SCREENS: Record<string, () => string> = {
  "/table": tableScreen,
  "/deck": deckScreen,
  "/install": installScreen,
  "/help": helpScreen,
};

// "#/card/new" or "#/card/<id of an own card>"; anything else falls back to the draw screen.
const CARD_ROUTE = /^\/card\/([a-z0-9-]+)$/;

function screenFor(route: string): string {
  const screen = SCREENS[route];
  if (screen) return screen();
  const card = CARD_ROUTE.exec(route);
  return card ? editorScreen(card[1]) : drawScreen();
}

function render() {
  document.documentElement.lang = settings.locale;
  app.innerHTML = screenFor(location.hash.replace(/^#/, "") || "/");
  if (drawn) drawn.fresh = false;
}

// ---------- events ----------

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

function drawCard(kind: Kind) {
  const pool = drawPool(kind);
  const others = pool.filter((c) => c.id !== drawn?.card.id);
  const from = others.length ? others : pool;
  // Shuffling cards, not security: Math.random is fine here.
  if (from.length) drawn = { card: from[Math.floor(Math.random() * from.length)], fresh: true };
  render();
}

const CLICK_ACTIONS: Record<string, (d: DOMStringMap) => void> = {
  draw: ({ kind }) => { if (kind) drawCard(kind as Kind); },
  set: ({ key, value }) => {
    if (!key || !value) return;
    if (key === "deckFilter") { deckFilter = value as typeof deckFilter; render(); }
    else update({ [key]: value } as Partial<Settings>);
  },
  tone: ({ kind, value }) => {
    if (!kind || !value) return;
    const field = kind === "fumble" ? "fumbleTones" : "gloryTones";
    update({ [field]: toggle(settings[field], value) } as Partial<Settings>);
  },
  draft: ({ key, value }) => {
    if (!draft || !key || !value) return;
    if (key === "kind" && value !== draft.kind) draft.tones = []; // tones belong to one kind
    draft = { ...draft, [key]: value };
    render();
  },
  "draft-toggle": ({ key, value }) => {
    if (!draft || !value || (key !== "classGroups" && key !== "tones")) return;
    draft[key] = toggle(draft[key], value);
    draftError = "";
    render();
  },
  "save-card": saveDraft,
  "delete-card": deleteDraft,
  "apply-update": applyUpdate,
  install: () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null; // a prompt can only be shown once
    void prompt.prompt().finally(render);
  },
};

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  const handler = el?.dataset.action ? CLICK_ACTIONS[el.dataset.action] : undefined;
  if (el && handler) handler(el.dataset);
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action === "name") {
    settings.characterName = el.value;
    saveSettings(settings);
  } else if (el.dataset.action === "draft-text" && draft) {
    const key = el.dataset.key as "title" | "effect" | "duration";
    draft[key] = el.value;
  } else if (el.dataset.action === "search") {
    deckQuery = el.value;
    const list = app.querySelector(".deck-list");
    if (list) list.innerHTML = deckRows();
  }
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.dataset.action === "locale") update({ locale: el.value });
});

window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#/card/")) draft = null;
  updateDone = false;
  render();
  window.scrollTo(0, 0);
});

// Installed apps stay open for days: look for new cards whenever the app comes back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && settings) void checkForUpdate();
});

// Keep Chrome's install prompt for our own button instead of its mini-infobar.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as InstallPromptEvent;
  refresh();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  refresh();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* no offline support, the app still works online */
    });
  });
}

// ---------- start ----------

void (async () => {
  try {
    const stored = loadStoredData();
    if (stored) {
      data = stored;
    } else {
      data = await fetchData();
      storeData(data);
    }
    customCards = loadCustomCards();
    settings = loadSettings(data.manifest.locales);
    ui = await loadUiStrings(settings.locale, __BUILD_ID__);
    // First start: explain the app before anything else.
    if (!settings.seenHelp && (location.hash === "" || location.hash === "#/")) location.replace("#/help");
    render();
    if (stored) void checkForUpdate();
  } catch (err) {
    app.innerHTML = `<p class="meta" style="padding:16px">${esc(String(err))}</p>`;
  }
})();

// Turns test, coverage and Lighthouse results into shields.io endpoint files under dist/badges/,
// so the README badges are served from GitHub Pages together with the app.
// Missing inputs are skipped, so the script never fails a build.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "dist/badges");
const readJson = (path) => (existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), "utf8")) : null);

/** Color of the first threshold the value reaches, e.g. [[90, "brightgreen"], [50, "orange"]]; red below all. */
const colorFor = (pct, thresholds) => thresholds.find(([min]) => pct >= min)?.[1] ?? "red";
const scoreColor = (pct) => colorFor(pct, [[90, "brightgreen"], [50, "orange"]]); // Lighthouse's own bands
const coverageColor = (pct) => colorFor(pct, [[80, "brightgreen"], [60, "yellow"]]);

const badges = {};

const coverage = readJson("coverage/coverage-summary.json");
if (coverage) {
  const pct = Math.floor(coverage.total.lines.pct);
  badges.coverage = { label: "coverage", message: `${pct}%`, color: coverageColor(pct) };
}

const unit = readJson("reports/vitest.json");
const e2e = readJson("reports/playwright.json");
if (unit || e2e) {
  const passed = (unit?.numPassedTests ?? 0) + (e2e?.stats.expected ?? 0) + (e2e?.stats.flaky ?? 0);
  const failed = (unit?.numFailedTests ?? 0) + (e2e?.stats.unexpected ?? 0);
  badges.tests = failed
    ? { label: "tests", message: `${failed} failed, ${passed} passed`, color: "red" }
    : { label: "tests", message: `${passed} passed`, color: "brightgreen" };
}

const lhci = readJson("reports/lighthouse/manifest.json");
const run = lhci?.find((r) => r.isRepresentativeRun) ?? lhci?.[0];
if (run) {
  const names = { performance: "performance", accessibility: "accessibility", "best-practices": "best practices", seo: "SEO" };
  for (const [key, name] of Object.entries(names)) {
    const pct = Math.round((run.summary[key] ?? 0) * 100);
    badges[`lighthouse-${key}`] = { label: name, message: String(pct), color: scoreColor(pct), namedLogo: "lighthouse" };
  }
  writeLighthouseSummary(lhci);
}

/** Per-run Lighthouse numbers in the GitHub job summary, to see why a score moved. */
function writeLighthouseSummary(runs) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const metric = (lhr, id) => lhr.audits[id]?.displayValue ?? "–";
  const rows = runs.map((r) => {
    const lhr = JSON.parse(readFileSync(r.jsonPath, "utf8"));
    const s = r.summary;
    return `| ${r.isRepresentativeRun ? "**median**" : ""} | ${[s.performance, s.accessibility, s["best-practices"], s.seo].map((v) => Math.round(v * 100)).join(" | ")} | ${["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift"].map((id) => metric(lhr, id)).join(" | ")} | ${lhr.environment?.benchmarkIndex ?? "–"} |`;
  });
  const table = [
    "## Lighthouse runs", "",
    "| Run | Perf | A11y | Best pr. | SEO | FCP | LCP | TBT | CLS | CPU benchmark |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows, "",
  ].join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + "\n");
}

mkdirSync(outDir, { recursive: true });
for (const [name, badge] of Object.entries(badges)) {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ schemaVersion: 1, ...badge }) + "\n");
}
console.log(`Badges: ${Object.keys(badges).join(", ") || "none"} → ${readdirSync(outDir).length} files in dist/badges`);

// Turns test, coverage and Lighthouse results into shields.io endpoint files under dist/badges/,
// so the README badges are served from GitHub Pages together with the app.
// Missing inputs are skipped, so the script never fails a build.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "dist/badges");
const readJson = (path) => (existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), "utf8")) : null);

const scoreColor = (pct) => (pct >= 90 ? "brightgreen" : pct >= 50 ? "orange" : "red");
const coverageColor = (pct) => (pct >= 80 ? "brightgreen" : pct >= 60 ? "yellow" : "red");

const badges = {};

const coverage = readJson("coverage/coverage-summary.json");
if (coverage) {
  const pct = Math.floor(coverage.total.lines.pct);
  badges.coverage = { label: "coverage", message: `${pct}%`, color: coverageColor(pct) };
}

const unit = readJson("test-results/vitest.json");
const e2e = readJson("test-results/playwright.json");
if (unit || e2e) {
  const passed = (unit?.numPassedTests ?? 0) + (e2e?.stats.expected ?? 0) + (e2e?.stats.flaky ?? 0);
  const failed = (unit?.numFailedTests ?? 0) + (e2e?.stats.unexpected ?? 0);
  badges.tests = failed
    ? { label: "tests", message: `${failed} failed, ${passed} passed`, color: "red" }
    : { label: "tests", message: `${passed} passed`, color: "brightgreen" };
}

const lhci = readJson(".lighthouseci/manifest.json");
const run = lhci?.find((r) => r.isRepresentativeRun) ?? lhci?.[0];
if (run) {
  const names = { performance: "performance", accessibility: "accessibility", "best-practices": "best practices", seo: "SEO" };
  for (const [key, name] of Object.entries(names)) {
    const pct = Math.round((run.summary[key] ?? 0) * 100);
    badges[`lighthouse-${key}`] = { label: name, message: String(pct), color: scoreColor(pct), namedLogo: "lighthouse" };
  }
}

mkdirSync(outDir, { recursive: true });
for (const [name, badge] of Object.entries(badges)) {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ schemaVersion: 1, ...badge }) + "\n");
}
console.log(`Badges: ${Object.keys(badges).join(", ") || "none"} → ${readdirSync(outDir).length} files in dist/badges`);

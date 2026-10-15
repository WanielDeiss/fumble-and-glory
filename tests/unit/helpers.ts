import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

const publicDir = join(__dirname, "../../public");

export const readPublicJson = <T = any>(path: string): T => JSON.parse(readFileSync(join(publicDir, path), "utf8"));

/**
 * Replaces fetch with one that serves files from public/, like the deployed site.
 * `override` can change a file's JSON before it is served (e.g. a newer manifest).
 */
export function stubFetch(override: Record<string, (json: any) => any> = {}) {
  const fetch = vi.fn((input: string | URL) => {
    // The site lives under /fumble-and-glory/; Vitest may serve it from the root instead.
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/(fumble-and-glory\/)?/, "");
    const file = join(publicDir, path);
    if (!existsSync(file)) return Promise.resolve(new Response("not found", { status: 404 }));
    const json = JSON.parse(readFileSync(file, "utf8"));
    const body = override[path] ? override[path](json) : json;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** matchMedia that reports the installed app (display-mode: standalone) when asked. */
export function stubMatchMedia(installed: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: installed && query.includes("display-mode: standalone"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
}

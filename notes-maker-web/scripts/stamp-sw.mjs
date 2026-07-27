/**
 * Stamps a build id into out/sw.js. Runs as part of `next build`.
 *
 * The service worker caches `/_next/static/**` cache-first, which is safe
 * because those filenames are content-hashed. The trap is the cache *name*:
 * with a fixed `nm-static-v1`, every deploy adds a new set of hashed chunks to
 * the same cache and nothing ever removes the previous set. The cache grows
 * without bound on every user's device, and the only symptom is a slowly
 * rising "storage used" figure that looks like their own data.
 *
 * The worker's activate handler already deletes every `nm-` cache that is not
 * the current one, so all that is missing is a version that actually changes.
 * The id is derived from the built asset filenames — content-hashed, so it is
 * stable when nothing changed and different the moment anything did.
 */
import {createHash} from "node:crypto";
import {readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "..", "out");
const SW = path.join(OUT, "sw.js");
const PLACEHOLDER = "__BUILD_ID__";

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

const staticDir = path.join(OUT, "_next", "static");

let names = [];
try {
  names = (await listFiles(staticDir)).map((f) => path.relative(OUT, f)).sort();
} catch {
  // No static dir means nothing to fingerprint; fall through to the timestamp.
}

const buildId = names.length
  ? createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 12)
  : // Fallback keeps deploys distinguishable rather than silently reusing a
    // constant, which would reintroduce the unbounded-growth bug.
    `t${Date.now().toString(36)}`;

const source = await readFile(SW, "utf8");

if (!source.includes(PLACEHOLDER)) {
  console.error(
    `✖ ${PLACEHOLDER} not found in out/sw.js — the cache version would never ` +
      `change and old build assets would accumulate on every device.`,
  );
  process.exit(1);
}

await writeFile(SW, source.replaceAll(PLACEHOLDER, buildId));
console.log(`✓ sw.js stamped with build id ${buildId} (${names.length} static files)`);

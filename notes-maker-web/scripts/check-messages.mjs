/**
 * Fails if the locale catalogs drift apart.
 *
 * next-intl resolves a missing key at RUNTIME — it logs an error and renders
 * the key path. That means a forgotten Indonesian string ships silently and is
 * only found by a user. This turns that into a build failure.
 *
 * Run: pnpm check:messages  (also wired into CI)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "..", "messages");

/** Flatten to dotted leaf paths: { a: { b: "x" } } -> ["a.b"] */
function leaves(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v, key));
    else out.push(key);
  }
  return out;
}

const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
if (files.length < 2) {
  console.log("Only one catalog; nothing to compare.");
  process.exit(0);
}

const catalogs = new Map();
for (const file of files) {
  const locale = path.basename(file, ".json");
  const json = JSON.parse(await readFile(path.join(DIR, file), "utf8"));
  catalogs.set(locale, new Set(leaves(json)));
}

// Compare every locale against the union, so a key missing from ALL but one
// is still reported rather than silently defining the baseline.
const union = new Set([...catalogs.values()].flatMap((s) => [...s]));

let failed = false;
for (const [locale, keys] of catalogs) {
  const missing = [...union].filter((k) => !keys.has(k)).sort();
  if (missing.length) {
    failed = true;
    console.error(`\n✖ ${locale}.json is missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`    ${k}`);
  }
}

// Empty strings are almost always an unfinished translation.
for (const file of files) {
  const locale = path.basename(file, ".json");
  const json = JSON.parse(await readFile(path.join(DIR, file), "utf8"));
  const blanks = leaves(json).filter((k) => {
    const value = k.split(".").reduce((o, part) => o?.[part], json);
    return typeof value === "string" && value.trim() === "";
  });
  if (blanks.length) {
    failed = true;
    console.error(`\n✖ ${locale}.json has ${blanks.length} empty value(s):`);
    for (const k of blanks) console.error(`    ${k}`);
  }
}

if (failed) {
  console.error("\nLocale catalogs are out of sync.\n");
  process.exit(1);
}

console.log(`✓ ${files.length} catalogs in sync (${union.size} keys each)`);

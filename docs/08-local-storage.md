# 8. Local storage (v1)

For free users the browser is the *only* copy of their data. That makes this document the most
safety-critical one in the project — a bug here loses someone's notes permanently, with no server
backup to restore from.

Three rules follow from that and are not negotiable:

1. **Never write a destructive migration.** Additive only. A failed migration is data loss.
2. **Export must work before launch.** It is the sole recovery path.
3. **Assume eviction will happen** to some users. Detect it, be honest about it, and offer import.

## 8.1 Why not cookies

The original concept said "use their cookie browser". Cookies cannot do this job:

| | Cookies | IndexedDB |
| --- | --- | --- |
| Size limit | ~4 KB total | Hundreds of MB to GB |
| Binary data | No | Yes — Blobs natively |
| Sent to server | On **every** request | Never |

A single compressed photo is roughly 100 KB — about 25× the *entire* cookie budget for the origin.
Images, voice, and any realistic number of notes require IndexedDB. Cookies are used only for the
locale preference and the theme, which are tiny and genuinely benefit from being readable during
server rendering of the marketing pages.

## 8.2 Dexie schema

`src/features/storage/db.ts`

```ts
export class NotesDB extends Dexie {
  notes!: Table<LocalNote, string>;
  images!: Table<LocalImage, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("notesmaker");
    this.version(1).stores({
      notes:  "client_id, updated_at, [archived+pinned], deleted_at, _dirty",
      images: "id, note_id",
      meta:   "key",
    });
  }
}
```

```ts
interface LocalNote {
  client_id: string;        // UUIDv7 — sorts by creation time, pleasant to debug
  title: string;
  body: JSONContent;        // Tiptap / ProseMirror JSON
  body_text: string;        // flattened for local search
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  reminder: LocalReminder | null;
  created_at: number;       // epoch ms
  updated_at: number;
  deleted_at: number | null;

  rev: number;              // 0 while local-only; server-owned in Phase 2
  _dirty: 0 | 1;            // Dexie cannot index booleans — use 0/1
  _base_rev: number;
}

interface LocalImage {
  id: string;               // UUIDv7
  note_id: string;
  blob: Blob;               // full size, already compressed (§8.5)
  thumb: Blob;              // ~400px
  width: number; height: number; bytes: number;
  created_at: number;
}
```

Three things here are for Phase 2, not v1, and they cost nothing now:

- **`client_id` as the primary key**, not an auto-increment. When a user upgrades, their notes
  *upload* under IDs the server accepts as-is. With auto-increment keys this becomes a migration
  with a remapping table, which is exactly the kind of code that loses data.
- **`rev` / `_base_rev` / `_dirty`** — the sync fields from [docs/04](04-sync-protocol.md). Unused in
  v1, but adding columns to an IndexedDB store with existing rows is a migration, and §8.1's first
  rule says don't.
- **`deleted_at` tombstones** rather than row deletion — trash in v1, sync correctness in Phase 2.

**`_dirty` is `0 | 1`, not a boolean.** IndexedDB cannot index boolean values; a boolean here
silently produces an unusable index and a full table scan on every query.

### Migrations

Dexie versions are additive and append-only. Never drop a store, never rename a field in place, never
transform data destructively. To rename, add the new field, backfill on read, and leave the old one.
Disk is cheap; a user's notes are not.

## 8.3 Persistence — the eviction problem

By default, browsers classify site data as *best-effort* and may delete it under storage pressure,
with no warning and no user action. `navigator.storage.persist()` upgrades the origin to *persistent*,
after which data is only removed if the user explicitly clears it.

```ts
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
```

**When to ask matters.** Not on first load — the app has done nothing for the user yet, and in
browsers that show a prompt this is a reflexive deny. Ask **after the first note is saved**, alongside
a one-line explanation of what it protects.

Grant behaviour differs by engine and is worth knowing:

- **Chromium** does not prompt; it grants based on engagement signals — notably **whether the PWA is
  installed** and whether notification permission was granted. This is a concrete reason to surface
  the install prompt: installing measurably improves data durability.
- **Firefox** prompts the user directly.
- **Safari** is the weakest case. It grants based on usage, and historically has evicted data from
  sites unused for an extended period. iOS users are the most exposed, which makes export and, later,
  the paid tier most valuable to exactly them.

Treat `persist()` as risk reduction, never a guarantee.

### Detecting eviction

On boot, compare a marker in `meta` against actual content:

```ts
const marker = await db.meta.get("install");   // written on very first run
const count  = await db.notes.count();
if (marker && count === 0 && marker.everHadNotes) {
  // data was evicted, not a fresh install
}
```

Say so plainly — *"Your notes were removed by your browser to free up space. If you have a backup
file, you can restore it now."* — offer import, and only then mention that a paid account prevents
this. Leading with the upsell after losing someone's data is the wrong instinct.

## 8.4 Quota

```ts
const { usage = 0, quota = 0 } = await navigator.storage.estimate();
```

Show usage in Settings. Warn at **80%**, and at that point block new *image* attachments while still
allowing text notes — text is negligible in size, and a user who cannot write down a phone number
because their photos filled the disk will simply leave.

Quotas vary enormously (Chromium allows a large share of free disk; Safari is far tighter). Never
hardcode an assumed limit; always read `estimate()`.

## 8.5 Image pipeline

`src/features/note/images/pipeline.ts`. Runs in a **Web Worker** with `OffscreenCanvas` — a 12MP
phone photo will jank the main thread for hundreds of milliseconds otherwise.

```
File/Blob
  → createImageBitmap(blob, { imageOrientation: "from-image" })
  → draw to OffscreenCanvas, longest edge ≤ 1600
  → convertToBlob({ type: "image/webp", quality: 0.82 })   → full
  → redraw at longest edge ≤ 400
  → convertToBlob({ type: "image/webp", quality: 0.75 })   → thumb
```

**`imageOrientation: "from-image"` is essential.** Canvas re-encoding discards EXIF — which is how we
strip metadata for free — but EXIF also carries the orientation flag. Drop it without applying it
first and every photo taken in portrait on a phone appears rotated 90°. This is *the* classic bug in
this pipeline and it will not show up in desktop testing.

**Metadata stripping is a real privacy feature, not a side effect.** Phone photos embed GPS
coordinates, device model, and timestamps. Since export produces a file users may share, shipping
original EXIF would leak home addresses. Re-encoding through canvas removes all of it.

Typical result: a 4 MB, 12MP JPEG becomes roughly 150–350 KB. Verify with `exiftool` that the output
carries no GPS tags — it is in the launch checklist for a reason.

### Rendering

```ts
const url = useMemo(() => URL.createObjectURL(image.thumb), [image.thumb]);
useEffect(() => () => URL.revokeObjectURL(url), [url]);
```

Every `createObjectURL` needs a matching `revokeObjectURL`. Unrevoked object URLs pin their Blobs in
memory for the lifetime of the document — in a scrolling grid of image notes this is a steady leak
that ends in a tab crash on mobile.

### Tier limit

One image per note on free, ten on paid. The schema is one-to-many in both cases; only a check in the
service layer differs, so Phase 2 lifts the cap by changing a constant.

## 8.6 Export and import

The safety net for the entire free tier. Both directions must work before launch.

**Format** — a `.zip` (built with `fflate`, ~8 KB gzipped and far lighter than JSZip):

```
notesmaker-backup-2026-07-23.zip
├── manifest.json      { format: 1, exported_at, app_version, counts }
├── notes.json         [ LocalNote, … ]  — images referenced by id
└── images/
    ├── 018f3a…-full.webp
    └── 018f3a…-thumb.webp
```

`manifest.json` carries a `format` integer. Every future importer must read older formats — a backup
made today has to restore in three years, or the promise behind "your data is yours" is empty.

**Export** streams into the zip rather than concatenating in memory; a library of image notes can run
to hundreds of megabytes. Save via the File System Access API where available, falling back to an
anchor download.

**Import** offers *merge* or *replace*:

- **Merge** (default) — insert notes whose `client_id` is unknown; for collisions keep whichever has
  the later `updated_at`. Never silently overwrite newer local content.
- **Replace** — wipe and restore. Confirmed by typing the word, since it is destructive.

Validate before writing anything: unknown format version, missing `notes.json`, or a referenced image
that is absent should abort the whole import with a clear message rather than leaving a half-restored
database.

### Backup nudging

Prompt for a backup after the 10th note, then at most monthly, and always after an eviction scare.
Dismissible, never modal. The goal is that no user ever loses everything — a user who lost their notes
does not upgrade, they uninstall and warn their friends.

## 8.7 Phase 2 upgrade path

When a free user subscribes, this local database becomes the sync client's local store described in
[docs/04](04-sync-protocol.md). Because `client_id`, `rev`, `_base_rev`, and `_dirty` already exist:

1. Mark every existing note `_dirty = 1`, `_base_rev = 0`.
2. Push through the normal outbox — the server treats `base_rev: 0` as a create and upserts on
   `(user_id, client_id)`.
3. Upload image Blobs to object storage; replace them with URLs, keeping thumbs cached locally.

No schema migration, no ID remapping, no special-case code path. That is the entire reason these
fields are in v1.

/**
 * Image pipeline — docs/07 Stage D.
 *
 * A modern phone photo is 12MP and 4–6 MB. Storing that untouched would burn a
 * free user's entire quota in a handful of notes, so every image is downscaled
 * and re-encoded before it ever reaches Dexie.
 *
 * Two correctness traps, both non-obvious:
 *
 * 1. **Orientation.** Phone cameras store the sensor image un-rotated plus an
 *    EXIF orientation tag. Drawing that to a canvas without asking for
 *    correction renders portrait photos sideways. `createImageBitmap` with
 *    `imageOrientation: "from-image"` applies the tag; it is mandatory.
 *
 * 2. **EXIF.** Re-encoding through a canvas drops all metadata, which is how
 *    GPS coordinates get stripped. That is a privacy feature, not a side
 *    effect — a note-taking app must not quietly retain where a photo was
 *    taken. It also means orientation MUST be baked into the pixels (see 1),
 *    because the tag that described it is gone.
 */

/** Longest edge of the stored image. */
export const MAX_EDGE = 1600;
/** Longest edge of the list/card thumbnail. */
export const THUMB_EDGE = 400;
/** WebP quality. 0.82 is where artefacts stop being visible on photos. */
const QUALITY = 0.82;

export interface ProcessedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  bytes: number;
}

export class ImageError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported_type" | "too_large" | "decode_failed" | "encode_failed",
  ) {
    super(message);
    this.name = "ImageError";
  }
}

const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i;
/** Refuse absurd inputs before decoding — decoding is what actually OOMs. */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    // Never round to 0 on extreme aspect ratios.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encode(
  source: ImageBitmap,
  target: { width: number; height: number },
): Promise<Blob> {
  // OffscreenCanvas keeps the work off the DOM; the HTMLCanvasElement path is
  // the fallback for browsers that lack it (older Safari).
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(target.width, target.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("Could not get a 2D context", "encode_failed");
    ctx.drawImage(source, 0, 0, target.width, target.height);
    return canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Could not get a 2D context", "encode_failed");
  ctx.drawImage(source, 0, 0, target.width, target.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new ImageError("Encoding failed", "encode_failed")),
      "image/webp",
      QUALITY,
    );
  });
}

/**
 * Decodes, downscales, re-encodes to WebP, and produces a thumbnail.
 * Runs on the main thread but yields at every await; the expensive step
 * (`createImageBitmap`) is already off-thread in every engine that matters.
 */
export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  const type = file.type || "";
  if (!ACCEPTED.test(type)) {
    throw new ImageError(`Unsupported image type: ${type || "unknown"}`, "unsupported_type");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageError("That image is too large to process", "too_large");
  }

  let bitmap: ImageBitmap;
  try {
    // `from-image` is what prevents sideways portrait photos.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("Could not read that image", "decode_failed");
  }

  try {
    const full = fit(bitmap.width, bitmap.height, MAX_EDGE);
    const small = fit(bitmap.width, bitmap.height, THUMB_EDGE);

    const [blob, thumb] = await Promise.all([encode(bitmap, full), encode(bitmap, small)]);

    return { blob, thumb, width: full.width, height: full.height, bytes: blob.size };
  } finally {
    // Bitmaps hold decoded pixels outside the JS heap; without this the memory
    // is only reclaimed at GC's leisure, which on mobile means a crash.
    bitmap.close();
  }
}

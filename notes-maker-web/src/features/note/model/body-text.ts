import type { ChecklistItem, NoteDoc } from "@/features/storage/types";

interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: ProseMirrorNode[];
  attrs?: Record<string, unknown>;
}

/** Concatenates every text leaf beneath a node, ignoring block structure. */
function inlineText(node: ProseMirrorNode): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(inlineText).join("");
}

/**
 * Flattens a Tiptap/ProseMirror document to plaintext, one line per block.
 *
 * List markers are reproduced (`1. `, `• `) rather than dropped. Without them
 * a numbered list collapses into an unreadable run of words in the list
 * preview — "play fun grind" instead of "1. play / 2. fun / 3. grind".
 *
 * In Phase 2 the server derives this instead and never trusts the client copy
 * (docs/02 §2.2), so the shape is kept identical to avoid a migration.
 */
export function flattenDoc(doc: NoteDoc | undefined): string {
  if (!doc) return "";
  const lines: string[] = [];

  const walkBlock = (node: ProseMirrorNode) => {
    switch (node.type) {
      case "bulletList":
      case "orderedList": {
        const ordered = node.type === "orderedList";
        // Honour a list that starts at something other than 1.
        const start = Number(node.attrs?.start ?? 1) || 1;
        node.content?.forEach((item, i) => {
          const marker = ordered ? `${start + i}. ` : "• ";
          const text = inlineText(item).trim();
          if (text) lines.push(marker + text);
        });
        return;
      }
      case "taskList": {
        node.content?.forEach((item) => {
          const checked = Boolean(item.attrs?.checked);
          const text = inlineText(item).trim();
          if (text) lines.push(`${checked ? "☑" : "☐"} ${text}`);
        });
        return;
      }
      case "text": {
        if (node.text) lines.push(node.text);
        return;
      }
      default: {
        // A leaf-ish block (paragraph, heading, codeBlock, blockquote…).
        const text = inlineText(node).trim();
        if (text) {
          lines.push(text);
          return;
        }
        // Otherwise recurse — it is a container we do not special-case.
        node.content?.forEach(walkBlock);
      }
    }
  };

  (doc as ProseMirrorNode).content?.forEach(walkBlock);
  return lines.join("\n").trim();
}

/** Checklist text participates in search too. */
export function flattenChecklist(items: ChecklistItem[] | undefined): string {
  if (!items?.length) return "";
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((i) => `${i.checked ? "☑" : "☐"} ${i.text}`)
    .join("\n");
}

export function buildBodyText(doc: NoteDoc | undefined, checklist?: ChecklistItem[]): string {
  return [flattenDoc(doc), flattenChecklist(checklist)].filter(Boolean).join("\n");
}

/** Minimal valid Tiptap document containing one paragraph per line of text. */
export function docFromText(text: string): NoteDoc {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/**
 * Splits a composed document into a title and the remaining body.
 *
 * The first text block becomes the title and is REMOVED from the body —
 * leaving it in place is what made new notes render their title twice, once as
 * the heading and again as the first line of the preview.
 *
 * Only a plain paragraph or heading is taken. If someone opens with a list or
 * an image, the note simply has no title rather than a nonsensical one.
 */
export function splitTitle(doc: NoteDoc): { title: string; body: NoteDoc } {
  const content = ((doc as ProseMirrorNode).content ?? []) as ProseMirrorNode[];
  const firstIndex = content.findIndex((node) => inlineText(node).trim().length > 0);

  if (firstIndex === -1) return { title: "", body: doc };

  const first = content[firstIndex];
  if (first.type !== "paragraph" && first.type !== "heading") {
    return { title: "", body: doc };
  }

  const rest = content.filter((_, i) => i !== firstIndex);
  return {
    title: inlineText(first).trim().slice(0, 200),
    // Never hand back an empty content array — ProseMirror requires at least
    // one block node and throws on an empty doc.
    body: { type: "doc", content: rest.length ? rest : [{ type: "paragraph" }] },
  };
}

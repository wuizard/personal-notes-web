import type { ChecklistItem, NoteDoc } from "@/features/storage/types";

interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: ProseMirrorNode[];
}

/**
 * Flattens a Tiptap/ProseMirror document to plaintext for local search.
 *
 * In Phase 2 the server derives this instead and never trusts the client's
 * copy (docs/02 §2.2) — otherwise search results are forgeable and drift from
 * the real content. In v1 there is no server, so the client is authoritative,
 * but the field is kept identical in shape so nothing changes at upload time.
 */
export function flattenDoc(doc: NoteDoc | undefined): string {
  if (!doc) return "";
  const out: string[] = [];

  const walk = (node: ProseMirrorNode) => {
    if (typeof node.text === "string") out.push(node.text);
    // Block-level nodes become separate lines so search can't match across a
    // paragraph boundary and produce a nonsense snippet.
    const isBlock = node.type && node.type !== "text";
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
      if (isBlock) out.push("\n");
    }
  };

  walk(doc as ProseMirrorNode);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

/** Checklist text participates in search too. */
export function flattenChecklist(items: ChecklistItem[] | undefined): string {
  if (!items?.length) return "";
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((i) => i.text)
    .join("\n");
}

export function buildBodyText(doc: NoteDoc | undefined, checklist?: ChecklistItem[]): string {
  return [flattenDoc(doc), flattenChecklist(checklist)].filter(Boolean).join("\n");
}

/** Minimal valid Tiptap document containing a single paragraph of text. */
export function docFromText(text: string): NoteDoc {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

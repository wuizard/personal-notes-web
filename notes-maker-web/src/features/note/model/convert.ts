import { uuidv7 } from "uuidv7";
import type { ChecklistItem, LocalNote, NoteDoc, NoteKind } from "@/features/storage/types";
import { flattenDoc } from "./body-text";

/**
 * Conversions between the two capture kinds — docs/10 §10.1.
 *
 * checklist → note is lossless: every item survives as a bullet.
 * note → checklist flattens formatting to plain lines, which is why the UI
 * warns before calling it — the information discarded is real.
 */

/** Reads a note's kind, treating rows from before the field existed as notes. */
export function noteKind(note: Pick<LocalNote, "kind">): NoteKind {
  return note.kind ?? "note";
}

/** Checklist items become one bulleted list; checked state renders as a strike. */
export function checklistToDoc(items: ChecklistItem[]): NoteDoc {
  const ordered = items
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((i) => i.text.trim().length > 0);

  if (!ordered.length) return { type: "doc", content: [{ type: "paragraph" }] };

  return {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: ordered.map((item) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: item.text,
                  ...(item.checked ? { marks: [{ type: "strike" }] } : {}),
                },
              ],
            },
          ],
        })),
      },
    ],
  };
}

/**
 * One checklist item per non-empty plaintext line of the body.
 *
 * List markers that flattenDoc reproduced ("1. ", "• ", "☐ ", "☑ ") are
 * stripped — they were structure, not content, and a real checkbox replaces
 * them. A "☑ " prefix came from a task list and carries its checked state
 * across the conversion.
 */
export function docToChecklist(doc: NoteDoc): ChecklistItem[] {
  return flattenDoc(doc)
    .split("\n")
    .map((line) => ({
      checked: /^☑\s/.test(line),
      text: line.replace(/^(\d+\.\s+|•\s+|☐\s+|☑\s+)/, "").trim(),
    }))
    .filter((entry) => entry.text.length > 0)
    .map((entry, order) => ({
      id: uuidv7(),
      text: entry.text,
      checked: entry.checked,
      order,
    }));
}

/** A fresh, empty item for editors to append. */
export function newChecklistItem(order: number, text = ""): ChecklistItem {
  return { id: uuidv7(), text, checked: false, order };
}

/**
 * True once every item — including a just-inserted blank row — is checked,
 * and at least one item has real text. A blank row starts unchecked, so
 * adding one to an otherwise fully-checked list immediately makes it
 * incomplete again: the trigger for the Completed flow, docs/10 §10.13a,
 * would otherwise fire (or a note would stay stuck completed) while the user
 * is still mid-add, since the debounced save can bundle "checked the last
 * item" and "inserted a new row" into a single snapshot before any text
 * lands in it.
 */
export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.checked) && items.some((i) => i.text.trim().length > 0);
}

import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "@/features/storage/types";
import { checklistToDoc, docToChecklist, noteKind } from "./convert";

function item(text: string, order: number, checked = false): ChecklistItem {
  return { id: `id-${order}`, text, checked, order };
}

describe("noteKind", () => {
  it("treats rows from before the field existed as notes", () => {
    expect(noteKind({})).toBe("note");
    expect(noteKind({ kind: "checklist" })).toBe("checklist");
  });
});

describe("checklistToDoc", () => {
  it("orders items by `order`, not array position", () => {
    const doc = checklistToDoc([item("second", 1), item("first", 0)]);
    const list = (doc.content?.[0] ?? {}) as { content?: unknown[] };
    const texts = (list.content as { content: { content: { text: string }[] }[] }[]).map(
      (li) => li.content[0].content[0].text,
    );
    expect(texts).toEqual(["first", "second"]);
  });

  it("drops blank items and keeps a valid empty doc", () => {
    const doc = checklistToDoc([item("  ", 0)]);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
  });

  it("carries checked state as a strike mark", () => {
    const doc = checklistToDoc([item("done", 0, true)]);
    const list = doc.content?.[0] as {
      content: { content: { content: { marks?: { type: string }[] }[] }[] }[];
    };
    expect(list.content[0].content[0].content[0].marks).toEqual([{ type: "strike" }]);
  });
});

describe("docToChecklist", () => {
  it("makes one item per non-empty line and strips list markers", () => {
    const doc = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "plain line" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "bullet" }] }] },
          ],
        },
      ],
    };
    const items = docToChecklist(doc);
    expect(items.map((i) => i.text)).toEqual(["plain line", "bullet"]);
    expect(items.map((i) => i.order)).toEqual([0, 1]);
    expect(items.every((i) => !i.checked)).toBe(true);
  });

  it("carries a task list's checked state across the conversion", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "open" }] }] },
          ],
        },
      ],
    };
    const items = docToChecklist(doc);
    expect(items.map((i) => [i.text, i.checked])).toEqual([
      ["done", true],
      ["open", false],
    ]);
  });

  it("round-trips a checklist through a note without losing items", () => {
    const original = [item("buy milk", 0), item("call home", 1, true)];
    const roundTripped = docToChecklist(checklistToDoc(original));
    expect(roundTripped.map((i) => i.text)).toEqual(["buy milk", "call home"]);
    // Checked state renders as a strike mark in the note, which flattens back
    // to plain text — the checked bit is the documented loss in this direction.
  });
});

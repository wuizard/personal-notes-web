import {describe, expect, it} from "vitest";
import type {NoteDoc} from "@/features/storage/types";
import {flattenDoc, splitTitle} from "./body-text";

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const listItem = (text: string) => ({ type: "listItem", content: [para(text)] });

describe("flattenDoc", () => {
  it("keeps ordered list numbering", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [
        para("Play Mini Soccer Sunday"),
        {
          type: "orderedList",
          content: [listItem("play"), listItem("fun"), listItem("grind")],
        },
      ],
    };

    // Without markers this collapsed to "Play Mini Soccer Sunday play fun grind".
    expect(flattenDoc(doc)).toBe("Play Mini Soccer Sunday\n1. play\n2. fun\n3. grind");
  });

  it("honours a list that does not start at 1", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [
        { type: "orderedList", attrs: { start: 5 }, content: [listItem("five"), listItem("six")] },
      ],
    };
    expect(flattenDoc(doc)).toBe("5. five\n6. six");
  });

  it("marks bullet lists", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [{ type: "bulletList", content: [listItem("milk"), listItem("bread")] }],
    };
    expect(flattenDoc(doc)).toBe("• milk\n• bread");
  });

  it("puts each block on its own line", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        para("Body"),
      ],
    };
    expect(flattenDoc(doc)).toBe("Title\nBody");
  });

  it("skips empty blocks rather than emitting blank lines", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [para("One"), { type: "paragraph" }, para("Two")],
    };
    expect(flattenDoc(doc)).toBe("One\nTwo");
  });

  it("returns empty string for an undefined or empty doc", () => {
    expect(flattenDoc(undefined)).toBe("");
    expect(flattenDoc({ type: "doc", content: [] })).toBe("");
  });
});

describe("splitTitle", () => {
  it("removes the title block from the body so it is not shown twice", () => {
    const doc: NoteDoc = { type: "doc", content: [para("Groceries"), para("Oat milk")] };
    const { title, body } = splitTitle(doc);

    expect(title).toBe("Groceries");
    // The regression this guards: the title staying in the body meant a new
    // note rendered its title as both the heading and the first preview line.
    expect(flattenDoc(body)).toBe("Oat milk");
  });

  it("leaves the body intact when it opens with a list", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [{ type: "bulletList", content: [listItem("milk")] }],
    };
    const { title, body } = splitTitle(doc);

    expect(title).toBe("");
    expect(flattenDoc(body)).toBe("• milk");
  });

  it("never produces an empty content array", () => {
    // ProseMirror throws on a doc with no block nodes.
    const doc: NoteDoc = { type: "doc", content: [para("Only line")] };
    const { body } = splitTitle(doc);
    expect((body.content ?? []).length).toBeGreaterThan(0);
  });

  it("skips leading blank paragraphs when choosing the title", () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [{ type: "paragraph" }, para("Real title"), para("Body")],
    };
    expect(splitTitle(doc).title).toBe("Real title");
  });

  it("caps an over-long title at 200 characters", () => {
    const doc: NoteDoc = { type: "doc", content: [para("x".repeat(300))] };
    expect(splitTitle(doc).title).toHaveLength(200);
  });
});

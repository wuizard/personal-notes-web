"use client";

import {type Content, type Editor, EditorContent, useEditor} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {Bold, Code, Italic, List, ListOrdered, Strikethrough} from "lucide-react";
import {useTranslations} from "next-intl";
import {type ReactNode, useEffect} from "react";
import type {NoteDoc} from "@/features/storage";

/**
 * The rich-text surface, shared by compose and the editor pane.
 *
 * Deliberately small: bold, italic, strike, two heading levels, two list
 * types, code. Markdown input rules (`# `, `- `, `1. `, `**bold**`) come from
 * StarterKit and cover the rest. docs/06 §6.4 is explicit that the toolbar
 * growing is how capture starts to feel heavy — that is Evernote's mistake.
 *
 * Images are NOT a node in this document. They attach to the note and render
 * as a strip (docs/06 §6.3), because a ProseMirror `src` would have to hold an
 * object URL, and those die with the page — every image would break on reload.
 */
export interface RichTextEditorProps {
  /** Initial content. Only read on mount; the editor owns state afterwards. */
  initialDoc?: NoteDoc;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (doc: NoteDoc, text: string) => void;
  onBlur?: () => void;
  /** Cmd/Ctrl+Enter — save and close. */
  onSubmit?: () => void;
  className?: string;
  /** Formatting controls. Hidden in compose until the user starts writing. */
  showToolbar?: boolean;
  /** Rendered alongside the toolbar — used for the image button. */
  toolbarExtra?: ReactNode;
  /**
   * `top` pins the toolbar above the text and keeps it in place while the note
   * scrolls — the arrangement every notes app uses, because the controls have
   * to stay reachable in a long note. `bottom` suits the compact compose box,
   * where the toolbar sits under two or three lines and never moves.
   */
  toolbarPosition?: "top" | "bottom";
}

export default function RichTextEditor({
  initialDoc,
  placeholder,
  autoFocus,
  onChange,
  onBlur,
  onSubmit,
  className,
  showToolbar,
  toolbarExtra,
  toolbarPosition = "bottom",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        // The note's own title field covers this; a top-level H1 inside the
        // body just competes with it.
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    // `NoteDoc.content` is `unknown[]` on purpose: it is a persisted schema
    // type, and the storage layer must not take a dependency on Tiptap — the
    // Phase 2 server reads this same shape. The cast is the one place the two
    // vocabularies meet, and Tiptap validates the document at load anyway.
    content: (initialDoc ?? { type: "doc", content: [{ type: "paragraph" }] }) as Content,
    autofocus: autoFocus ? "end" : false,
    // Required in Next: rendering synchronously on the server produces a
    // hydration mismatch, because ProseMirror decorates the DOM on init.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-24 [&_h1]:text-[19px] [&_h1]:font-semibold [&_h2]:text-[16px] [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:font-mono [&_code]:text-[13px] [&_p]:min-h-[1.2em]",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as NoteDoc, e.getText());
    },
    onBlur: () => onBlur?.(),
  });

  // Cmd/Ctrl+Enter is registered on the DOM node rather than as a Tiptap
  // keyboard shortcut so it still fires when the selection is inside a list
  // item, where ProseMirror's own Enter handling would otherwise win.
  useEffect(() => {
    if (!editor || !onSubmit) return;
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit();
      }
    };
    dom.addEventListener("keydown", handler);
    return () => dom.removeEventListener("keydown", handler);
  }, [editor, onSubmit]);

  if (!editor) {
    // Matches the editor's min-height so nothing jumps when it mounts.
    return <div className={`min-h-24 ${className ?? ""}`} aria-busy="true" />;
  }

  const top = toolbarPosition === "top";

  const toolbar = (showToolbar || toolbarExtra) && (
    <div
      className={
        top
          ? // Sticky so the controls stay reachable in a long note. The
            // background comes from `--editor-surface`, which the note pane
            // sets to its own pastel — a transparent sticky bar would let text
            // scroll visibly underneath it.
            "sticky top-0 z-10 -mx-5 mb-2 flex items-center gap-1 border-b border-[var(--card-border)] px-5 py-2"
          : "mt-2 flex items-center gap-1 border-t border-[var(--card-border)] pt-2"
      }
      style={top ? { background: "var(--editor-surface, var(--surface))" } : undefined}
    >
      {showToolbar && <EditorToolbar editor={editor} />}
      {toolbarExtra}
    </div>
  );

  return (
    <div className={className}>
      {top && toolbar}
      <EditorContent editor={editor} />
      {!top && toolbar}
    </div>
  );
}

/** Formatting controls. Exported for callers that place them elsewhere. */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const t = useTranslations("editor.format");
  if (!editor) return null;

  const items = [
    { key: "bold", icon: Bold, run: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { key: "italic", icon: Italic, run: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { key: "strike", icon: Strikethrough, run: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
    { key: "bulletList", icon: List, run: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { key: "orderedList", icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { key: "code", icon: Code, run: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t("label")}>
      {items.map(({ key, icon: Icon, run, active }) => (
        <button
          key={key}
          type="button"
          // onMouseDown + preventDefault keeps the selection: a plain click
          // blurs the editor first, and the command then applies to nothing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
          aria-label={t(key)}
          aria-pressed={active}
          className={`grid size-7 place-items-center rounded-md transition-opacity ${
            active ? "bg-black/10 opacity-100 dark:bg-white/15" : "opacity-60 hover:opacity-100"
          }`}
        >
          <Icon size={14} strokeWidth={2} aria-hidden />
        </button>
      ))}
    </div>
  );
}

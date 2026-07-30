import type {ChecklistItem, LocalReminder, NoteDoc} from "@/features/storage/types";

/**
 * The wire shapes for notes-maker-api's sync fields (docs/04, §10.18).
 *
 * `content` is one serialized JSON string rather than separate fields,
 * mirroring how the server stores it: sealed as a single opaque blob. That is
 * the seam end-to-end encryption would slot into — the client would seal it
 * here instead of handing over readable JSON, and nothing else about this
 * contract would change.
 */

/** What lives inside `content`. Keys are the server's field names. */
export interface RemoteContent {
  title: string;
  body?: NoteDoc;
  body_text: string;
  checklist?: ChecklistItem[];
}

export interface RemoteNote {
  clientId: string;
  content: string;
  kind: string | null;
  color: string | null;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  reminder: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Deleted forever, as opposed to a restorable trash tombstone. */
  purged: boolean;
  rev: number;
}

export interface RemotePage {
  notes: RemoteNote[];
  cursor: string;
  hasMore: boolean;
  serverTime: string;
}

export interface WireMutation {
  seq: number;
  clientId: string;
  baseRev: number;
  changedFields: string[];
  deleted?: boolean;
  purged?: boolean;
  content?: string;
  kind?: string | null;
  color?: string | null;
  pinned?: boolean;
  archived?: boolean;
  labels?: string[];
  reminder?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
}

export type MutationStatus = "APPLIED" | "CONFLICT" | "REJECTED";

export interface WireResult {
  seq: number;
  status: MutationStatus;
  reason: string | null;
  note: RemoteNote | null;
}

/**
 * Every field the server can merge independently, in its own naming. Used as
 * `changedFields` when a note has never been sent (base_rev 0) and as the
 * fallback for rows written before `_dirty_fields` existed — "everything
 * changed" costs a conflict at worst, never a lost edit.
 */
export const ALL_SYNC_FIELDS = [
  "title",
  "body",
  "body_text",
  "checklist",
  "kind",
  "color",
  "pinned",
  "archived",
  "labels",
  "reminder",
  "completed_at",
] as const;

/** Parses a stored reminder back out of its serialized wire form. */
export function parseReminder(raw: string | null): LocalReminder | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalReminder;
  } catch {
    // A reminder that will not parse is not worth failing a whole sync over —
    // the note's content matters, its alarm does not.
    return null;
  }
}

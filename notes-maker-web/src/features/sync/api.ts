import {graphqlRequest} from "@/shared/api/graphql";
import type {RemotePage, WireMutation, WireResult} from "./types";

/**
 * The two sync calls. Kept apart from the engine so the protocol and the
 * scheduling can be reasoned about — and tested — separately.
 */

const NOTE_FIELDS = `
  clientId
  content
  kind
  color
  pinned
  archived
  labels
  reminder
  completedAt
  createdAt
  updatedAt
  deletedAt
  purged
  rev
`;

const PULL = `
  query Pull($cursor: String, $limit: Int) {
    notes(cursor: $cursor, limit: $limit) {
      notes { ${NOTE_FIELDS} }
      cursor
      hasMore
      serverTime
    }
  }
`;

const PUSH = `
  mutation Push($mutations: [NoteMutationInput!]!) {
    pushNotes(mutations: $mutations) {
      seq
      status
      reason
      note { ${NOTE_FIELDS} }
    }
  }
`;

/** One page of changes strictly after `cursor`, tombstones included. */
export async function fetchPage(cursor: string, limit: number): Promise<RemotePage> {
  const data = await graphqlRequest<{ notes: RemotePage }>(PULL, { cursor, limit });
  return data.notes;
}

/** Applies a batch. The server does not stop at the first conflict. */
export async function sendMutations(mutations: WireMutation[]): Promise<WireResult[]> {
  const data = await graphqlRequest<{ pushNotes: WireResult[] }>(PUSH, { mutations });
  return data.pushNotes;
}

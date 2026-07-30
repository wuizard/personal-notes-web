import {getIdToken} from "@/features/auth/firebase";

/**
 * The one place a GraphQL request to notes-maker-api is made.
 *
 * Every caller needs the same three things — the API URL, a Firebase ID token,
 * and GraphQL's habit of returning errors inside a 200 response — so they live
 * here rather than being repeated per feature.
 *
 * Unlike features/plan/remote.ts, which deliberately swallows every failure
 * into "free", this throws. Sync has to tell "the backend said no" apart from
 * "the network is down": one is a reason to stop, the other a reason to back
 * off and retry.
 */

/** The API isn't reachable *by configuration* — unset URL, or signed out. */
export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

/** The request was made and failed: transport, HTTP status, or GraphQL errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** True when retrying later could plausibly succeed. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_URL;
}

export function isApiConfigured(): boolean {
  return Boolean(apiUrl());
}

export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = apiUrl();
  if (!url) throw new ApiUnavailableError("NEXT_PUBLIC_API_URL is not set");

  const token = await getIdToken().catch(() => null);
  if (!token) throw new ApiUnavailableError("no Firebase ID token — signed out?");

  let res: Response;
  try {
    res = await fetch(`${url}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    // fetch only rejects on transport failure — offline, DNS, CORS preflight.
    throw new ApiError(`network request failed: ${String(cause)}`, true);
  }

  if (!res.ok) {
    // 5xx and 429 are worth retrying; a 4xx means this request is wrong and
    // will stay wrong.
    throw new ApiError(`HTTP ${res.status}`, res.status >= 500 || res.status === 429);
  }

  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = await res.json();
  } catch (cause) {
    throw new ApiError(`malformed response: ${String(cause)}`, false);
  }

  if (json.errors?.length) {
    // A GraphQL error is the server deliberately refusing — expired
    // entitlement, a rejected argument. Retrying sends the identical request.
    throw new ApiError(json.errors.map((e) => e.message).join("; "), false);
  }
  if (json.data === undefined) {
    throw new ApiError("response carried neither data nor errors", false);
  }
  return json.data;
}

import type {PlanTier} from "./types";
import {getIdToken} from "@/features/auth/firebase";

/**
 * Backend plan check — docs/10 §10.13, §10.17.
 *
 * Calls the real GraphQL `me { plan }` query against notes-maker-api,
 * authenticated with the caller's Firebase ID token (the server verifies it
 * independently via firebase-admin-go; this file never asserts identity,
 * only carries the token). `NEXT_PUBLIC_API_URL` unset, a missing/failed
 * token fetch, a non-OK response, or any GraphQL error all resolve to
 * "free" rather than throwing — usePlan()'s caller-side cache/grace logic
 * already treats a failed check as "leave the existing cache alone," so
 * this only matters on a brand new, not-yet-cached account.
 */
export async function checkRemotePlan(uid: string): Promise<PlanTier> {
  void uid;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return "free";

  try {
    const token = await getIdToken();
    if (!token) return "free";

    const res = await fetch(`${apiUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({query: "query { me { plan } } "}),
    });
    if (!res.ok) return "free";

    const json = (await res.json()) as {data?: {me?: {plan?: string}}};
    return json.data?.me?.plan === "PREMIUM" ? "premium" : "free";
  } catch {
    return "free";
  }
}

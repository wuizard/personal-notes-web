/**
 * Polar checkout — docs/10 §10.10 (chosen MoR), §10.16 (this integration).
 *
 * Deliberately just a REDIRECT to a Polar-hosted Checkout Link, not the
 * dynamic session-creation API. The dynamic API needs a secret key, which
 * must never sit in client code; a static Checkout Link (created once in the
 * Polar dashboard, for the $2/month product) is safe to ship publicly the
 * same way a Stripe Payment Link is — it identifies the *product*, not a
 * credential.
 *
 * IMPORTANT — the loop this does NOT close: nothing here grants premium
 * after payment. That requires a backend that verifies Polar's webhook and
 * writes the entitlement (docs/10 §10.15's GraphQL API — not built yet;
 * features/plan/remote.ts's checkRemotePlan() is still a stub returning
 * "free" unconditionally). Until that exists, a successful payment here
 * charges the card and returns the user to the app with no visible change.
 * Treat wiring the webhook handler as the blocking next step, not optional
 * polish.
 */

const CHECKOUT_URL = process.env.NEXT_PUBLIC_POLAR_CHECKOUT_URL;

export function isPolarConfigured(): boolean {
  return Boolean(CHECKOUT_URL);
}

/**
 * Builds the checkout URL, prefilling the email of a signed-in user so a
 * human can reconcile the Polar payment to the app account by hand until
 * the webhook exists. `customer_email` is Polar's documented prefill param
 * as of when this was written — reverify against their current docs before
 * relying on it silently failing closed if the param name has moved on.
 */
export function polarCheckoutUrl(email?: string | null): string | null {
  if (!CHECKOUT_URL) return null;
  if (!email) return CHECKOUT_URL;
  try {
    const url = new URL(CHECKOUT_URL);
    url.searchParams.set("customer_email", email);
    return url.toString();
  } catch {
    return CHECKOUT_URL;
  }
}

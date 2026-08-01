/**
 * Paddle checkout — docs/10 §10.10 (MoR), §10.20 (this integration,
 * replacing Polar after Polar locked the account).
 *
 * Paddle.js is a client-side overlay checkout, not a static link like the
 * retired Polar Checkout Link — but it needs no backend secret either:
 * Paddle.Initialize takes a public, limited-access client-side token, safe
 * to ship the same way the old Checkout Link was (it identifies the
 * *product*, not a credential). `custom_data.firebase_uid` is passed at
 * checkout time so the webhook handler can key off it directly instead of
 * matching by email — closing the "unmatched payer email, no claim flow"
 * gap the Polar design had (docs/10 §10.17).
 *
 * `PaddleLoader` (./paddle-loader.tsx) loads the SDK; this module only talks
 * to `window.Paddle` once it's present.
 */

declare global {
  interface Window {
    Paddle?: {
      Initialize: (opts: { token: string }) => void;
      Environment: { set: (env: "sandbox" | "production") => void };
      Checkout: {
        open: (opts: {
          items: { priceId: string; quantity: number }[];
          customer?: { email?: string };
          customData?: Record<string, string>;
        }) => void;
      };
    };
  }
}

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
const ENVIRONMENT = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;

export function isPaddleConfigured(): boolean {
  return Boolean(CLIENT_TOKEN && PRICE_ID);
}

let initialized = false;

function ensurePaddleInitialized(): void {
  if (!window.Paddle || initialized || !CLIENT_TOKEN) return;
  if (ENVIRONMENT === "sandbox") window.Paddle.Environment.set("sandbox");
  window.Paddle.Initialize({ token: CLIENT_TOKEN });
  initialized = true;
}

/**
 * Opens the Paddle overlay checkout for a signed-in user. Returns false
 * (does nothing) when unconfigured, no user is signed in, or Paddle.js
 * hasn't finished loading yet — the caller decides what to show in that
 * case, same as the old polarCheckoutUrl() returning null.
 */
export function openPaddleCheckout(user: { email: string | null; uid: string } | null): boolean {
  if (!isPaddleConfigured() || !window.Paddle || !user) return false;
  ensurePaddleInitialized();
  window.Paddle.Checkout.open({
    items: [{ priceId: PRICE_ID!, quantity: 1 }],
    customer: user.email ? { email: user.email } : undefined,
    customData: { firebase_uid: user.uid },
  });
  return true;
}

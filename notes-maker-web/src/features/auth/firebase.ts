import type {Auth} from "firebase/auth";

/**
 * Firebase client bootstrap — docs/10 §10.6.
 *
 * Everything here is loaded LAZILY via dynamic import: firebase/auth is
 * ~100KB gzipped, and the docs/06 §6.10 bundle budget exists precisely to
 * keep weight like that off the initial paint. The first caller pays for it
 * after hydration, in its own chunk.
 *
 * When the env config is absent the app runs unchanged with auth invisible —
 * anonymous usage is a supported mode forever, not a degraded one.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

let authPromise: Promise<Auth> | null = null;

export function getFirebaseAuth(): Promise<Auth> {
  if (!isFirebaseConfigured()) {
    return Promise.reject(new Error("Firebase is not configured (see .env.local.example)"));
  }
  authPromise ??= (async () => {
    const { getApps, initializeApp } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");
    const app = getApps()[0] ?? initializeApp(config);
    return getAuth(app);
  })();
  return authPromise;
}

/** The subset of the Firebase user the UI needs. Keeps firebase types local. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export async function signInWithGoogle(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email: string, password: string): Promise<void> {
  const auth = await getFirebaseAuth();
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

/**
 * Maps a Firebase error to one of our message keys. The mapping is coarse on
 * purpose: for credentials, "which part was wrong" is exactly what a sign-in
 * form must not reveal.
 */
export function authErrorKey(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "invalid_credential";
    case "auth/invalid-email":
      return "invalid_email";
    case "auth/email-already-in-use":
      return "email_in_use";
    case "auth/weak-password":
      return "weak_password";
    case "auth/popup-blocked":
      return "popup_blocked";
    case "auth/network-request-failed":
      return "network";
    case "auth/too-many-requests":
      return "too_many";
    default:
      return "unknown";
  }
}

/** True when the user closed the popup themselves — not an error to show. */
export function isUserCancelled(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

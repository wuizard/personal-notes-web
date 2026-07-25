/**
 * Pass-through root layout.
 *
 * The real document (<html>, <body>, providers) lives in [locale]/layout.tsx
 * because `lang` depends on the locale segment. Next still requires a root
 * layout once a root page exists, so this one renders nothing of its own —
 * it exists solely so app/page.tsx (the `/` → default-locale redirect) can.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

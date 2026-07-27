"use client";

import {Monitor, Moon, Sun} from "lucide-react";
import {useTheme} from "next-themes";
import {useTranslations} from "next-intl";
import {useSyncExternalStore} from "react";

const ORDER = ["system", "light", "dark"] as const;
const ICONS = { system: Monitor, light: Sun, dark: Moon };

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();

  // The server cannot know the resolved theme, so rendering the real icon
  // before hydration guarantees a mismatch. Render a stable placeholder of
  // identical size instead — no layout shift, no mismatch.
  //
  // useSyncExternalStore is used rather than the usual useState+useEffect
  // "mounted" flag: it returns the server snapshot (false) during SSR and the
  // client snapshot (true) once hydrated, in a single render, with no
  // cascading re-render.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const current = (theme ?? "system") as (typeof ORDER)[number];
  const Icon = ICONS[current] ?? Monitor;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      // 44px touch target via padding, per docs/05 §5.9
      className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      aria-label={`${t("label")}: ${mounted ? t(current) : ""}`}
      title={mounted ? t(current) : undefined}
    >
      {mounted ? <Icon size={18} strokeWidth={1.75} aria-hidden /> : <span className="size-[18px]" />}
    </button>
  );
}

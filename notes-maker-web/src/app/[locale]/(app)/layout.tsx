import {setRequestLocale} from "next-intl/server";
import {AppShell} from "@/shared/ui/app-shell";
import {TrashAutoPurge} from "@/features/note/components/trash-auto-purge";
import {ReminderNotifications} from "@/features/note/components/reminder-notifications";

/**
 * The app shell.
 *
 * Everything below this layout renders CLIENT-side against local storage —
 * no server data fetching, ever. That is what keeps the Capacitor port in
 * Phase 3 cheap (docs/01 §1.3) and what lets the app open offline.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AppShell>
      <TrashAutoPurge />
      <ReminderNotifications />
      {children}
    </AppShell>
  );
}

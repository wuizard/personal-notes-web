import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bell } from "lucide-react";

/**
 * Reminders are Stage E. This page exists now because the nav links to it, and
 * a 404 from your own navigation is worse than an honest "not yet".
 */
export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reminders");

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
          <Bell size={24} strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[15px] font-medium">{t("soonTitle")}</p>
        <p className="max-w-[38ch] text-sm text-muted">{t("soonBody")}</p>
      </div>
    </div>
  );
}

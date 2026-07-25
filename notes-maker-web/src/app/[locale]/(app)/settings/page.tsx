import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetPanel } from "@/features/storage/components/reset-panel";
import { StoragePanel } from "@/features/storage/components/storage-panel";
import { AutoCompletePanel } from "@/features/note/components/auto-complete-panel";
import { SuggestionsPanel } from "@/features/note/components/suggestions-panel";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <SuggestionsPanel />
      <AutoCompletePanel />
      <StoragePanel />
      <ResetPanel />
    </div>
  );
}

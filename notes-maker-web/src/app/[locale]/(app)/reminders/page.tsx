import { setRequestLocale } from "next-intl/server";
import { RemindersView } from "@/features/note/components/reminders-view";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RemindersView />;
}

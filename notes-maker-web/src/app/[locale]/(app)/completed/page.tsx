import { setRequestLocale } from "next-intl/server";
import { CompletedView } from "@/features/note/components/completed-view";

export default async function CompletedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CompletedView />;
}

import {setRequestLocale} from "next-intl/server";
import {TrashView} from "@/features/note/components/trash-view";

export default async function TrashPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TrashView />;
}

import {setRequestLocale} from "next-intl/server";
import {ArchiveView} from "@/features/note/components/archive-view";


export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArchiveView />;
}

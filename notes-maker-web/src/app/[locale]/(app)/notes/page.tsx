import {Suspense} from "react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {NoteWorkspace} from "@/features/note/components/note-workspace";

export default async function NotesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <>
      <h1 className="sr-only">{t("notes")}</h1>
      {/* All note data is read client-side from IndexedDB — no server fetch,
          ever (docs/01 §1.3). Suspense is required because the workspace reads
          the ?note= selection via useSearchParams. */}
      <Suspense fallback={<div className="flex-1" />}>
        <NoteWorkspace />
      </Suspense>
    </>
  );
}

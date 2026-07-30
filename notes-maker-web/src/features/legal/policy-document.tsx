import type {PrivacyPolicy} from "./privacy-content";

/**
 * Renders a structured policy document.
 *
 * A legal page has one job — being read and understood — so this is
 * deliberately plain: a readable measure, real headings that a screen reader
 * can navigate, and no decoration competing with the text. The one piece of
 * emphasis is the summary at the top, because most people will read only that.
 */
export function PolicyDocument({
  policy,
  updatedLabel,
  formattedDate,
}: {
  policy: PrivacyPolicy;
  updatedLabel: string;
  formattedDate: string;
}) {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-12 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{policy.title}</h1>
      <p className="mt-2 text-[13px] text-muted">
        {updatedLabel} <time dateTime={policy.updated}>{formattedDate}</time>
      </p>

      <section className="mt-8 rounded-2xl border border-border bg-surface-secondary p-5">
        <h2 className="text-[15px] font-semibold">{policy.summaryHeading}</h2>
        {policy.summary.map((paragraph) => (
          <p key={paragraph.slice(0, 40)} className="mt-2.5 text-[14px] leading-relaxed">
            {paragraph}
          </p>
        ))}
      </section>

      {policy.sections.map((section) => (
        <section key={section.id} id={section.id} className="mt-10 scroll-mt-6">
          <h2 className="text-[17px] font-semibold tracking-tight">{section.heading}</h2>

          {section.paragraphs?.map((paragraph) => (
            <p
              key={paragraph.slice(0, 40)}
              className="mt-3 text-[14px] leading-relaxed text-muted"
            >
              {paragraph}
            </p>
          ))}

          {section.bullets ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-muted">
              {section.bullets.map((bullet) => (
                <li key={bullet.slice(0, 40)}>{bullet}</li>
              ))}
            </ul>
          ) : null}

          {section.table ? (
            // Wide content scrolls inside its own container rather than
            // making the whole page scroll sideways on a phone.
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    {section.table.headers.map((header) => (
                      <th key={header} className="py-2 pr-4 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-border align-top">
                      {row.map((cell) => (
                        <td key={cell.slice(0, 30)} className="py-2.5 pr-4 leading-relaxed text-muted">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}

/**
 * The Notes Maker symbol.
 *
 * Traced from `notes-maker-vector-brand-system/01-masters/notes-maker-symbol-gradient.svg`
 * with its exact construction preserved — 368.64 card, 58.9824 radius, 27.648
 * stroke with round caps, 135° gradient from #6B5FD6 to #B9A6F0. The brand
 * guide forbids altering any of those, so do not "tidy" the numbers.
 *
 * Inlined rather than loaded as a file so it inherits the page's rendering and
 * costs no request — it is under a kilobyte.
 */
export function BrandMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // The gradient needs a document-unique id: two instances on one page sharing
  // an id makes the second one reference the first's definition.
  const gradientId = `nm-brand-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Quick Checklist"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6B5FD6" />
          <stop offset="1" stopColor="#B9A6F0" />
        </linearGradient>
      </defs>
      <rect
        x="71.68"
        y="71.68"
        width="368.64"
        height="368.64"
        rx="58.9824"
        fill={`url(#${gradientId})`}
      />
      <g
        transform="translate(71.68 71.68)"
        stroke="#FFFFFF"
        strokeWidth="27.648"
        strokeLinecap="round"
        opacity="0.96"
      >
        <line x1="81.1008" y1="121.6512" x2="287.5392" y2="121.6512" />
        <line x1="81.1008" y1="191.6928" x2="243.3024" y2="191.6928" />
        <line x1="81.1008" y1="261.7344" x2="184.32" y2="261.7344" />
      </g>
    </svg>
  );
}

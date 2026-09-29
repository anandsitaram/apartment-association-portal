// A table-shaped placeholder for the Months / Summary / Flats-style screens,
// shown instead of a generic spinner while their data loads. Matches the
// existing `.loading-state`'s delayed fade-in (see style.css) so a fast load
// still doesn't flicker.
export default function TableSkeleton({
  rows = 6,
  label = "Loading…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      className="table-skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="table-skeleton-toolbar">
        <span className="table-skeleton-bar table-skeleton-bar--wide" />
        <span className="table-skeleton-bar table-skeleton-bar--pill" />
      </div>
      <div className="table-skeleton-head">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="table-skeleton-bar" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="table-skeleton-row" key={i}>
          {Array.from({ length: 5 }).map((_, j) => (
            <span key={j} className="table-skeleton-bar" />
          ))}
        </div>
      ))}
    </div>
  );
}

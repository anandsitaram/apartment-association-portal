export default function LoadingState({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-state-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

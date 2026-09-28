export default function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state error-state" role="alert">
      <div className="error-icon" aria-hidden="true">
        !
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button className="btn-primary" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { DialogRequest } from "./appDialog.js";

export default function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDialog = (event: Event) => {
      const next = (event as CustomEvent<DialogRequest>).detail;
      setRequest((current) => {
        if (current) {
          if (current.kind === "confirm") current.resolve(false);
          else current.resolve(null);
        }
        return next;
      });
    };
    window.addEventListener("rv-dialog", onDialog);
    return () => window.removeEventListener("rv-dialog", onDialog);
  }, []);

  useEffect(() => {
    if (request?.kind === "prompt") inputRef.current?.focus();
  }, [request]);

  if (!request) return null;

  const close = (value: boolean | string | null) => {
    const current = request;
    setRequest(null);
    current.resolve(value as never);
  };

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={(e) =>
        e.target === e.currentTarget &&
        close(request.kind === "confirm" ? false : null)
      }
    >
      <div
        className="modal card confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <div
          className={`confirm-dialog-icon ${request.danger ? "danger" : ""}`}
          aria-hidden="true"
        >
          {request.danger ? "!" : "?"}
        </div>
        <div className="confirm-dialog-content">
          <h2 id="app-dialog-title">{request.title}</h2>
          <p id="app-dialog-message">{request.message}</p>
          {request.kind === "prompt" && (
            <input
              ref={inputRef}
              className="dialog-input"
              defaultValue={request.defaultValue || ""}
              placeholder={request.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") close(e.currentTarget.value);
                if (e.key === "Escape") close(null);
              }}
            />
          )}
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => close(request.kind === "confirm" ? false : null)}
          >
            {request.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={request.danger ? "danger" : "pri"}
            onClick={() =>
              close(
                request.kind === "prompt"
                  ? inputRef.current?.value || ""
                  : true,
              )
            }
          >
            {request.confirmLabel ||
              (request.kind === "prompt" ? "Continue" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

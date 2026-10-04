import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info" | "warning";
export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

export function notify(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(
    new CustomEvent("rv-toast", { detail: { message, kind } }),
  );
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (
        event as CustomEvent<{ message: string; kind?: ToastKind }>
      ).detail;
      const item = {
        id: Date.now() + Math.random(),
        message: detail.message,
        kind: detail.kind || "info",
      };
      setItems((current) => [...current, item]);
      window.setTimeout(
        () => setItems((current) => current.filter((x) => x.id !== item.id)),
        4500,
      );
    };
    window.addEventListener("rv-toast", onToast);
    return () => window.removeEventListener("rv-toast", onToast);
  }, []);
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast-${item.kind}`}
          role={item.kind === "error" ? "alert" : "status"}
        >
          <span>{item.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setItems((x) => x.filter((y) => y.id !== item.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

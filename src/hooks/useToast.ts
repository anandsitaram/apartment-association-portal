import { notify, type ToastKind } from "../components/ui/ToastHost.jsx";
export function useToast() {
  return (message: string, kind: ToastKind = "info") => notify(message, kind);
}

export type DialogRequest =
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "prompt";
      title: string;
      message: string;
      placeholder?: string;
      defaultValue?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
      resolve: (value: string | null) => void;
    };

export function openConfirm(
  options: Omit<
    Extract<DialogRequest, { kind: "confirm" }>,
    "kind" | "resolve"
  >,
): Promise<boolean> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("rv-dialog", {
        detail: { kind: "confirm", ...options, resolve },
      }),
    ),
  );
}

export function openPrompt(
  options: Omit<Extract<DialogRequest, { kind: "prompt" }>, "kind" | "resolve">,
): Promise<string | null> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("rv-dialog", {
        detail: { kind: "prompt", ...options, resolve },
      }),
    ),
  );
}

export type AppDialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};
export type AppDialogState = { title: string; message: string; buttons: AppDialogButton[] };
type Listener = (dialog: AppDialogState | null) => void;
const listeners = new Set<Listener>();
let active: AppDialogState | null = null;
export const subscribeAppDialog = (listener: Listener) => {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
};
export const showAppDialog = (title: string, message = '', buttons?: AppDialogButton[]) => {
  active = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
  listeners.forEach((listener) => listener(active));
};
export const dismissAppDialog = () => {
  active = null;
  listeners.forEach((listener) => listener(null));
};

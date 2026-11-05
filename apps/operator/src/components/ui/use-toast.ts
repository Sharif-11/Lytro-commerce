import { createContext, useContext } from 'react';

export const ToastContext = createContext<(message: string) => void>(() => undefined);

/** Says what just happened in one sentence that names the shop (OPERATOR-CONSOLE-DESIGN §1). */
export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

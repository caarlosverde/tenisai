"use client";

import { Toaster } from "sonner";

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      // Debajo de la muesca y la barra de estado cuando la app está instalada
      offset={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      theme="dark"
      richColors
      closeButton
      duration={4200}
      toastOptions={{
        classNames: {
          toast:
            "backdrop-blur-md bg-slate-950/80 border border-white/10 shadow-xl rounded-2xl",
          title: "text-sm font-medium",
          description: "text-xs text-slate-300",
        },
      }}
    />
  );
}

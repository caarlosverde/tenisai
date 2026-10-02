import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta gratuita en TenisAI y guarda el historial de tus análisis.",
};

export default function RegistroLayout({ children }: LayoutProps<"/registro">) {
  return children;
}

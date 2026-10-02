import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Entra en TenisAI para guardar tus análisis y seguir tu evolución.",
};

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}

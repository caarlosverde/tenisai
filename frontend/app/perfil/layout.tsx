import type { Metadata } from "next";

export const metadata: Metadata = {
  // Con plantilla propia para que "Ajustes" (ruta hija) siga llevando "— TenisAI"
  title: { default: "Mis análisis", template: "%s — TenisAI" },
  // Área privada: no debe aparecer en buscadores
  robots: { index: false, follow: false },
};

export default function PerfilLayout({ children }: LayoutProps<"/perfil">) {
  return children;
}

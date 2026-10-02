import type { Metadata } from "next";

export const metadata: Metadata = {
  // Análisis privados de cada usuario: no deben aparecer en buscadores
  robots: { index: false, follow: false },
};

export default function AnalisisLayout({ children }: LayoutProps<"/analisis">) {
  return children;
}

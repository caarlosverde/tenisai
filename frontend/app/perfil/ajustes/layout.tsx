import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ajustes de la cuenta",
};

export default function AjustesLayout({ children }: LayoutProps<"/perfil/ajustes">) {
  return children;
}

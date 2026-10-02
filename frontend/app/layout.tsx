import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";
import Navbar from "@/components/Navbar";
import AppToaster from "@/components/AppToaster";
import Footer from "@/components/Footer";
import { SessionProvider } from "@/components/SessionProvider";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const DESCRIPCION =
  "Sube un vídeo de tu golpe de tenis y obtén un análisis biomecánico con visión artificial: ángulos, fases del golpe, consejos y evolución.";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Base para las URLs absolutas de la imagen de Open Graph al compartir enlaces
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "TenisAI — Análisis biomecánico del tenis",
    template: "%s — TenisAI",
  },
  description: DESCRIPCION,
  applicationName: "TenisAI",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "TenisAI",
    title: "TenisAI — Análisis biomecánico del tenis",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La sesión se resuelve en el servidor: la barra de navegación aparece ya
  // en su estado correcto, sin parpadeo de "Iniciar sesión" al recargar.
  const initialUser = await getCurrentUser();

  return (
    <html
      lang="es"
      className={`dark ${manrope.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {/* Primer elemento enfocable: salta la navegación con el teclado */}
        <a
          href="#contenido"
          className="sr-only z-[60] rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Saltar al contenido
        </a>
        <SessionProvider initialUser={initialUser}>
          <Navbar />
          <div id="contenido" className="flex-1 pt-16">
            {children}
          </div>
          <Footer />
        </SessionProvider>
        <AppToaster />
      </body>
    </html>
  );
}

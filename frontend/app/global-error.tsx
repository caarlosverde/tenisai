"use client"; // Sustituye al layout raíz cuando es él quien falla

import { useEffect } from "react";

// No hereda los estilos globales: todo va en línea para no depender de Tailwind
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <title>Error — TenisAI</title>
        <div role="alert" style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>TenisAI no está disponible</h1>
          <p style={{ color: "#94a3b8", marginTop: "0.75rem" }}>
            Ha ocurrido un error grave al cargar la aplicación. Vuelve a intentarlo en unos
            segundos.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#67e8f9",
              color: "#020617",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}

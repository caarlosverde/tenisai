/** Cabecera de la página de análisis (usuario con sesión, análisis en curso o resultados). */
export default function Hero({
  compact = false,
  analyzing = false,
}: {
  compact?: boolean;
  analyzing?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="mb-4 font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80 animate-[fadeUp_0.7s_ease-out_both]">
        Visión artificial · Biomecánica
      </p>
      <h1
        className={[
          "font-display font-semibold leading-[1.1] tracking-tight text-transparent bg-clip-text",
          "bg-gradient-to-br from-white via-cyan-100 to-emerald-300",
          "animate-[fadeUp_0.8s_ease-out_0.08s_both]",
          compact || analyzing ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl md:text-6xl",
        ].join(" ")}
      >
        {analyzing ? "Analizando tu golpe" : compact ? "Resultados del análisis" : "Analiza tu golpe"}
      </h1>
      {!compact && !analyzing ? (
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300/85 sm:text-lg animate-[fadeUp_0.8s_ease-out_0.16s_both]">
          Sube un vídeo y TenisAI detecta tu postura fotograma a fotograma, mide los
          ángulos de cada fase del golpe y te dice qué corregir primero.
        </p>
      ) : (
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400 animate-[fadeUp_0.8s_ease-out_0.16s_both]">
          {analyzing
            ? "El motor está midiendo tu golpe fotograma a fotograma. Suele tardar entre uno y tres minutos."
            : "Mira tu golpe a cámara lenta con el esqueleto y repasa cada fallo con su ejercicio."}
        </p>
      )}
    </div>
  );
}

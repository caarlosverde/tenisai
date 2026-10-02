import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal from "@/components/PaginaLegal";
import { RESPONSABLE } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Aviso legal",
  description: "Titular, condiciones de uso y responsabilidad de TenisAI.",
};

export default function AvisoLegalPage() {
  return (
    <PaginaLegal titulo="Aviso legal">
      <h2>1. Titular</h2>
      <p>
        En cumplimiento de la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI),
        TenisAI es un proyecto académico desarrollado por <strong>{RESPONSABLE.nombre}</strong> como
        Trabajo Fin de Grado en {RESPONSABLE.centro} ({RESPONSABLE.localidad}). Contacto:{" "}
        <strong>{RESPONSABLE.email}</strong>. El servicio es gratuito y no tiene ánimo de lucro.
      </p>

      <h2>2. Condiciones de uso</h2>
      <ul>
        <li>Debes usar TenisAI de forma lícita y no intentar alterar su funcionamiento.</li>
        <li>
          Solo puedes subir vídeos en los que aparezcas tú o personas que te hayan dado permiso.
          Sigues siendo el titular de tus vídeos.
        </li>
        <li>Eres responsable de mantener la confidencialidad de tu contraseña.</li>
      </ul>

      <h2>3. Naturaleza del análisis</h2>
      <p>
        Los resultados se calculan automáticamente con visión artificial y son{" "}
        <strong>orientativos</strong>: la precisión depende de la calidad del vídeo y pueden
        contener errores. No sustituyen el criterio de un entrenador titulado ni el consejo de un
        profesional sanitario. Ante cualquier dolor o lesión, consulta a un especialista.
      </p>

      <h2>4. Propiedad intelectual</h2>
      <p>
        El código, el diseño y la marca TenisAI pertenecen a su autor. Los modelos de terceros que
        utiliza (MediaPipe y YOLOv8) se rigen por sus propias licencias.
      </p>

      <h2>5. Responsabilidad</h2>
      <p>
        Se procura que el servicio funcione de forma continua y correcta, pero al tratarse de un
        proyecto académico no se garantiza su disponibilidad ni la exactitud de los resultados.
      </p>

      <h2>6. Protección de datos</h2>
      <p>
        El tratamiento de tus datos se explica en la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>7. Legislación aplicable</h2>
      <p>Este aviso se rige por la legislación española.</p>
    </PaginaLegal>
  );
}

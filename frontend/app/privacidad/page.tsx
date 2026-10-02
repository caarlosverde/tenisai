import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal from "@/components/PaginaLegal";
import { RESPONSABLE } from "@/lib/legal";
import { EDAD_MINIMA } from "@/lib/validacionPerfil";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos trata TenisAI, para qué, durante cuánto tiempo y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p>
        Esta política explica qué datos personales trata TenisAI, con qué finalidad y cómo puedes
        ejercer tus derechos, conforme al Reglamento General de Protección de Datos (RGPD) y a la
        Ley Orgánica 3/2018 (LOPDGDD).
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        <strong>{RESPONSABLE.nombre}</strong>, como autor del Trabajo Fin de Grado en{" "}
        {RESPONSABLE.centro} ({RESPONSABLE.localidad}). Contacto:{" "}
        <strong>{RESPONSABLE.email}</strong>.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos de la cuenta:</strong> nombre de usuario y contraseña (se guarda cifrada con
          bcrypt; nadie puede leerla).
        </li>
        <li>
          <strong>Datos de perfil:</strong> nombre, apellidos, edad, altura, peso, lateralidad y
          estilo de juego.
        </li>
        <li>
          <strong>Vídeos y resultados:</strong> el vídeo que subes, el vídeo anotado, los puntos del
          esqueleto detectados, las métricas de cada fotograma, la puntuación y los consejos.
        </li>
        <li>
          <strong>Datos técnicos:</strong> una cookie de sesión y la dirección IP, que solo se usa
          en memoria para limitar abusos (intentos de inicio de sesión y número de análisis) y no se
          guarda.
        </li>
        <li>
          <strong>Consentimiento:</strong> la fecha en que aceptaste esta política al registrarte.
        </li>
        <li>
          <strong>Comunidad (solo si la usas):</strong> tu perfil de jugador (si es público o
          privado, ciudad, club, nivel, cuándo sueles jugar y tu presentación), tus amistades y
          solicitudes, los jugadores que bloqueas, las denuncias que envías, los partidos en los
          que participas con su resultado, tus puntos del ranking, los partidos que publicas en
          «Buscar partido» (día, hora, lugar y ciudad), las plazas que pides en los de otros y los
          torneos en los que te inscribes (o que organizas, si tu cuenta es de organizador).
        </li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Analizar la biomecánica de tus golpes y adaptar las reglas a tu estilo de juego.</li>
        <li>Guardar tu historial para que puedas ver tu evolución y comparar análisis.</li>
        <li>
          En la comunidad: mostrar tu perfil de jugador, gestionar amistades y partidos, y
          calcular el ranking.
        </li>
        <li>Proteger el servicio frente a abusos y accesos no autorizados.</li>
      </ul>
      <p>No se usan para publicidad ni para elaborar perfiles comerciales.</p>

      <h2>4. Base jurídica</h2>
      <p>
        El consentimiento que das al crear la cuenta (art. 6.1.a RGPD) y la prestación del servicio
        que solicitas al subir un vídeo (art. 6.1.b RGPD). Puedes retirar tu consentimiento en
        cualquier momento borrando tu cuenta.
      </p>

      <h2>5. Cuánto tiempo los conservamos</h2>
      <ul>
        <li>
          <strong>Con cuenta:</strong> hasta que borres el análisis o tu cuenta. Al borrar la
          cuenta se eliminan tu perfil, tus análisis y todos sus vídeos, tus amistades y los
          partidos sin confirmar. Los partidos ya confirmados siguen en el historial de los otros
          jugadores, pero sin tu nombre («Cuenta eliminada»), porque forman parte de su historial
          y de sus puntos.
        </li>
        <li>
          <strong>Sin cuenta:</strong> los análisis anónimos se borran automáticamente a las 24
          horas.
        </li>
      </ul>

      <h2>6. Con quién se comparten</h2>
      <p>
        Con nadie fuera de TenisAI. Los vídeos se procesan en el propio servidor de TenisAI con
        modelos que se ejecutan en local (MediaPipe y YOLOv8): no se envían a servicios externos
        de inteligencia artificial ni se ceden a terceros.
      </p>
      <p>Dentro de TenisAI, en la comunidad, decides tú qué ven los demás usuarios registrados:</p>
      <ul>
        <li>
          <strong>Perfil privado (por defecto):</strong> solo tus amigos ven tu perfil de jugador
          y tus partidos. El resto solo puede encontrarte por tu nombre de usuario exacto y ve tu
          nombre con la inicial del apellido.
        </li>
        <li>
          <strong>Perfil público:</strong> cualquier usuario registrado ve tu nombre con la inicial
          del apellido, tu perfil de jugador, tus partidos y tus puntos, y apareces en el ranking.
          Tus amigos ven además tus apellidos.
        </li>
        <li>
          Tu edad, altura, peso y tus análisis de vídeo <strong>nunca</strong> se muestran a otros
          usuarios.
        </li>
        <li>
          Al registrar un partido apuntas a otros jugadores: solo puedes apuntar a tus amigos o a
          perfiles públicos, y el partido no cuenta hasta que un rival lo confirma (puede
          rechazarlo). Quienes juegan un partido lo ven en su historial.
        </li>
        <li>
          En «Buscar partido», lo que publicas lo ven quienes pueden ver tu perfil. Si pides plaza,
          quien publicó el partido ve tu nombre, tu nivel, tus puntos y tu mensaje; los nombres de
          los jugadores de un partido solo los ven quienes juegan en él.
        </li>
        <li>
          Los torneos son públicos para los usuarios registrados: si te inscribes, tu nombre (con
          la inicial del apellido) aparece en la lista de inscritos y en el cuadro, aunque tu perfil
          sea privado. Los resultados los anota el organizador y cuentan para el ranking.
        </li>
      </ul>

      <h2>7. Cookies</h2>
      <p>
        TenisAI solo usa una cookie técnica, <code>auth_token</code>, necesaria para mantener tu
        sesión iniciada (dura 7 días). No hay cookies de analítica ni de publicidad, por eso no se
        muestra un aviso de cookies.
      </p>

      <h2>8. Tus derechos</h2>
      <ul>
        <li>
          <strong>Acceso y portabilidad:</strong> descarga todos tus datos desde{" "}
          <Link href="/perfil/ajustes">Ajustes de la cuenta</Link> («Descargar mis datos»).
        </li>
        <li>
          <strong>Rectificación:</strong> edita tus datos en{" "}
          <Link href="/perfil/ajustes">Ajustes de la cuenta</Link>.
        </li>
        <li>
          <strong>Supresión:</strong> borra análisis desde tu historial o la cuenta completa desde
          Ajustes.
        </li>
        <li>
          <strong>Oposición y limitación:</strong> escribe a {RESPONSABLE.email}.
        </li>
      </ul>
      <p>
        Si consideras que no se han respetado tus derechos, puedes reclamar ante la Agencia
        Española de Protección de Datos (<a href="https://www.aepd.es" rel="noreferrer" target="_blank">www.aepd.es</a>).
      </p>

      <h2>9. Seguridad</h2>
      <p>
        Las contraseñas se guardan cifradas, las sesiones van firmadas, el acceso a cada análisis
        está restringido a su dueño y se limitan los intentos de inicio de sesión. En la
        comunidad puedes bloquear a cualquier jugador (dejáis de veros y no puede apuntarte en
        partidos) o denunciarlo; las denuncias las revisa el responsable del tratamiento.
      </p>

      <h2>10. Menores de edad</h2>
      <p>
        Para crear una cuenta tienes que tener al menos {EDAD_MINIMA} años, la edad a partir de
        la cual en España se puede dar el consentimiento por uno mismo (art. 7 de la LOPDGDD).
        El registro no permite edades inferiores.
      </p>
    </PaginaLegal>
  );
}

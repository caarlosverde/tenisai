// Datos de la comunidad tal como llegan a las páginas y componentes (sin Prisma).
import type { SetJuegos } from "@/lib/comunidad/marcador";
import type { Modalidad } from "@/lib/comunidad/perfil";

/** Relación del usuario con otra persona, vista desde el usuario. */
export type EstadoRelacion =
  | "yo"
  | "amigos"
  | "enviada" // le he enviado una solicitud
  | "recibida" // me ha enviado una solicitud
  | "ninguna"
  | "bloqueado" // le he bloqueado yo
  | "te_bloquea"; // me ha bloqueado

export type JugadorResumen = {
  /** null si borró su cuenta. */
  username: string | null;
  nombre: string;
  /** Si quien mira puede abrir su perfil. */
  enlace: boolean;
  esYo: boolean;
};

export type EstadoPartido = "pendiente" | "confirmado" | "rechazado";

export type PartidoVista = {
  id: string;
  modalidad: Modalidad;
  jugadoEn: string;
  lugar: string | null;
  sets: SetJuegos[];
  ganador: 1 | 2;
  estado: EstadoPartido;
  /** Equipo de quien mira, o null si no jugó. */
  miEquipo: 1 | 2 | null;
  equipo1: JugadorResumen[];
  equipo2: JugadorResumen[];
  /** Puntos que ganó o perdió quien mira (partido confirmado en el que jugó). */
  cambioPuntos: number | null;
  /** Rival de quien lo registró: puede confirmarlo o rechazarlo. */
  puedeResponder: boolean;
  /** Quien lo registró puede retirarlo mientras no esté confirmado. */
  puedeRetirar: boolean;
};

export type JugadorEncontrado = {
  username: string;
  nombre: string;
  ciudad: string | null;
  nivel: string | null;
  perfilPublico: boolean;
  relacion: EstadoRelacion;
  puntosIndividual: number;
  puntosDobles: number;
};

export type FilaRanking = {
  posicion: number;
  username: string;
  nombre: string;
  ciudad: string | null;
  puntos: number;
  partidos: number;
  victorias: number;
  provisional: boolean;
  esYo: boolean;
  enlace: boolean;
};

export type AmbitoRanking = "general" | "amigos" | "ciudad";

export type EstadoTorneo = "inscripcion" | "en_curso" | "finalizado" | "cancelado";

/** Un jugador o pareja inscrito en un torneo. */
export type InscritoVista = {
  id: string;
  jugadores: JugadorResumen[];
  /** Puntos de la modalidad (en dobles, la media de la pareja). */
  puntos: number;
  semilla: number | null;
  /** En dobles, falta que la pareja acepte. */
  pendiente: boolean;
  esMia: boolean;
};

export type CruceVista = {
  id: string;
  ronda: number;
  posicion: number;
  a: InscritoVista | null;
  b: InscritoVista | null;
  ganador: "a" | "b" | null;
  tipo: "normal" | "bye" | "incomparecencia";
  /** Marcador desde el lado a ("6-4 3-6 [10-8]"), si se jugó. */
  marcador: string | null;
  /** El organizador puede anotar el resultado. */
  pendienteDeResultado: boolean;
};

export type TorneoVista = {
  id: string;
  nombre: string;
  descripcion: string | null;
  modalidad: Modalidad;
  plazas: number;
  lugar: string;
  ciudad: string;
  nivel: string | null;
  cierreInscripcion: string;
  inicio: string;
  estado: EstadoTorneo;
  organizador: JugadorResumen & { organizacion: string | null };
  esOrganizador: boolean;
  /** Inscripciones que cuentan (y la del usuario aunque falte su pareja). */
  inscritos: InscritoVista[];
  confirmados: number;
  miInscripcion: {
    pendiente: boolean;
    /** El usuario es la pareja invitada y tiene que responder. */
    meInvitan: boolean;
    pareja: JugadorResumen | null;
  } | null;
  inscripcionAbierta: boolean;
  rondas: number;
  cruces: CruceVista[];
  campeon: InscritoVista | null;
};

export type TorneoResumen = {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  inicio: string;
  cierreInscripcion: string;
  lugar: string;
  ciudad: string;
  nivel: string | null;
  estado: EstadoTorneo;
  /** Se calcula en el servidor: el componente no debe leer la hora al renderizar. */
  inscripcionAbierta: boolean;
  plazas: number;
  inscritos: number;
  organizacion: string;
  campeon: string | null;
  participo: boolean;
  esOrganizador: boolean;
};

export type EstadoSolicitud = "pendiente" | "aceptada" | "rechazada";
export type EstadoConvocatoria = "abierta" | "completa" | "cancelada";

/** Quien pide plaza en una convocatoria, tal como lo ve quien la publicó. */
export type SolicitanteVista = JugadorResumen & {
  ciudad: string | null;
  nivel: string | null;
  puntos: number;
  partidos: number;
  mensaje: string | null;
};

export type ConvocatoriaVista = {
  id: string;
  modalidad: Modalidad;
  fechaHora: string;
  lugar: string;
  ciudad: string;
  nivel: string | null;
  plazas: number;
  libres: number;
  comentario: string | null;
  estado: EstadoConvocatoria;
  /** Ya ha pasado la hora del partido. */
  pasada: boolean;
  creador: JugadorResumen & { puntos: number };
  esMia: boolean;
  miSolicitud: EstadoSolicitud | null;
  /** Quien la publicó y los aceptados; solo lo ven quienes juegan. */
  jugadores: JugadorResumen[] | null;
  /** Solicitudes por responder; solo las ve quien la publicó. */
  pendientes: SolicitanteVista[] | null;
  partidoId: string | null;
  puedeRegistrarResultado: boolean;
};

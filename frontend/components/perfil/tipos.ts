export type ProfileUser = {
  id: string;
  username: string;
  nombre: string;
  apellidos: string;
  edad: number;
  altura: number;
  peso: number;
  estiloReves?: string;
  estiloDerecha?: string;
  lateralidad?: string;
  createdAt: string;
  // Perfil de jugador de la comunidad
  perfilPublico?: boolean;
  ciudad?: string | null;
  club?: string | null;
  nivel?: string | null;
  disponibilidad?: string | null;
  bio?: string | null;
};

export type AnalisisItem = {
  id: string;
  fecha: string;
  videoNombre: string;
  puntuacion: number;
  tipoGolpe: string;
  resumen: string;
  detalles: string | null;
  jobId: string | null;
};

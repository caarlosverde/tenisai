-- CreateTable
CREATE TABLE "Torneo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizadorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "modalidad" TEXT NOT NULL,
    "plazas" INTEGER NOT NULL,
    "lugar" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "nivel" TEXT,
    "cierreInscripcion" DATETIME NOT NULL,
    "inicio" DATETIME NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'inscripcion',
    "campeonId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Torneo_organizadorId_fkey" FOREIGN KEY ("organizadorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Torneo_campeonId_fkey" FOREIGN KEY ("campeonId") REFERENCES "InscripcionTorneo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InscripcionTorneo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "torneoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companeroId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'confirmada',
    "semilla" INTEGER,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InscripcionTorneo_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "Torneo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InscripcionTorneo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InscripcionTorneo_companeroId_fkey" FOREIGN KEY ("companeroId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartidoTorneo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "torneoId" TEXT NOT NULL,
    "ronda" INTEGER NOT NULL,
    "posicion" INTEGER NOT NULL,
    "inscripcion1Id" TEXT,
    "inscripcion2Id" TEXT,
    "ganadorId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'normal',
    "partidoId" TEXT,
    CONSTRAINT "PartidoTorneo_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "Torneo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartidoTorneo_inscripcion1Id_fkey" FOREIGN KEY ("inscripcion1Id") REFERENCES "InscripcionTorneo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartidoTorneo_inscripcion2Id_fkey" FOREIGN KEY ("inscripcion2Id") REFERENCES "InscripcionTorneo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartidoTorneo_ganadorId_fkey" FOREIGN KEY ("ganadorId") REFERENCES "InscripcionTorneo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartidoTorneo_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "Partido" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "edad" INTEGER NOT NULL,
    "altura" REAL NOT NULL,
    "peso" REAL NOT NULL,
    "lateralidad" TEXT NOT NULL DEFAULT 'diestro',
    "estiloReves" TEXT NOT NULL DEFAULT '2_manos',
    "estiloDerecha" TEXT NOT NULL DEFAULT 'tradicional',
    "privacidadAceptadaEn" DATETIME,
    "sesionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "perfilPublico" BOOLEAN NOT NULL DEFAULT false,
    "ciudad" TEXT,
    "club" TEXT,
    "nivel" TEXT,
    "disponibilidad" TEXT,
    "bio" TEXT,
    "puntosIndividual" INTEGER NOT NULL DEFAULT 1200,
    "partidosIndividual" INTEGER NOT NULL DEFAULT 0,
    "victoriasIndividual" INTEGER NOT NULL DEFAULT 0,
    "puntosDobles" INTEGER NOT NULL DEFAULT 1200,
    "partidosDobles" INTEGER NOT NULL DEFAULT 0,
    "victoriasDobles" INTEGER NOT NULL DEFAULT 0,
    "rol" TEXT NOT NULL DEFAULT 'jugador',
    "organizacion" TEXT
);
INSERT INTO "new_User" ("altura", "apellidos", "bio", "ciudad", "club", "createdAt", "disponibilidad", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nivel", "nombre", "partidosDobles", "partidosIndividual", "passwordHash", "perfilPublico", "peso", "privacidadAceptadaEn", "puntosDobles", "puntosIndividual", "sesionVersion", "username", "victoriasDobles", "victoriasIndividual") SELECT "altura", "apellidos", "bio", "ciudad", "club", "createdAt", "disponibilidad", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nivel", "nombre", "partidosDobles", "partidosIndividual", "passwordHash", "perfilPublico", "peso", "privacidadAceptadaEn", "puntosDobles", "puntosIndividual", "sesionVersion", "username", "victoriasDobles", "victoriasIndividual" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Torneo_campeonId_key" ON "Torneo"("campeonId");

-- CreateIndex
CREATE INDEX "Torneo_estado_inicio_idx" ON "Torneo"("estado", "inicio");

-- CreateIndex
CREATE INDEX "InscripcionTorneo_companeroId_idx" ON "InscripcionTorneo"("companeroId");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionTorneo_torneoId_userId_key" ON "InscripcionTorneo"("torneoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartidoTorneo_partidoId_key" ON "PartidoTorneo"("partidoId");

-- CreateIndex
CREATE UNIQUE INDEX "PartidoTorneo_torneoId_ronda_posicion_key" ON "PartidoTorneo"("torneoId", "ronda", "posicion");

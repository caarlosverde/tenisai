-- CreateTable
CREATE TABLE "Amistad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitanteId" TEXT NOT NULL,
    "receptorId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceptadaEn" DATETIME,
    CONSTRAINT "Amistad_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Amistad_receptorId_fkey" FOREIGN KEY ("receptorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bloqueo" (
    "autorId" TEXT NOT NULL,
    "bloqueadoId" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("autorId", "bloqueadoId"),
    CONSTRAINT "Bloqueo_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bloqueo_bloqueadoId_fkey" FOREIGN KEY ("bloqueadoId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Denuncia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "autorId" TEXT,
    "denunciadoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" TEXT,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisada" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Denuncia_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Denuncia_denunciadoId_fkey" FOREIGN KEY ("denunciadoId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Partido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modalidad" TEXT NOT NULL,
    "jugadoEn" DATETIME NOT NULL,
    "lugar" TEXT,
    "sets" TEXT NOT NULL,
    "ganador" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadoPorId" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEn" DATETIME,
    CONSTRAINT "Partido_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JugadorPartido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partidoId" TEXT NOT NULL,
    "userId" TEXT,
    "equipo" INTEGER NOT NULL,
    "puntosAntes" INTEGER,
    "puntosDespues" INTEGER,
    CONSTRAINT "JugadorPartido_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "Partido" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JugadorPartido_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "victoriasDobles" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("altura", "apellidos", "createdAt", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nombre", "passwordHash", "peso", "privacidadAceptadaEn", "sesionVersion", "username") SELECT "altura", "apellidos", "createdAt", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nombre", "passwordHash", "peso", "privacidadAceptadaEn", "sesionVersion", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Amistad_receptorId_estado_idx" ON "Amistad"("receptorId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Amistad_solicitanteId_receptorId_key" ON "Amistad"("solicitanteId", "receptorId");

-- CreateIndex
CREATE INDEX "Bloqueo_bloqueadoId_idx" ON "Bloqueo"("bloqueadoId");

-- CreateIndex
CREATE INDEX "Denuncia_denunciadoId_idx" ON "Denuncia"("denunciadoId");

-- CreateIndex
CREATE INDEX "Partido_estado_idx" ON "Partido"("estado");

-- CreateIndex
CREATE INDEX "JugadorPartido_userId_idx" ON "JugadorPartido"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JugadorPartido_partidoId_userId_key" ON "JugadorPartido"("partidoId", "userId");

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
    "codoDerecha" TEXT NOT NULL DEFAULT 'recto',
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
INSERT INTO "new_User" ("altura", "apellidos", "bio", "ciudad", "club", "createdAt", "disponibilidad", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nivel", "nombre", "organizacion", "partidosDobles", "partidosIndividual", "passwordHash", "perfilPublico", "peso", "privacidadAceptadaEn", "puntosDobles", "puntosIndividual", "rol", "sesionVersion", "username", "victoriasDobles", "victoriasIndividual") SELECT "altura", "apellidos", "bio", "ciudad", "club", "createdAt", "disponibilidad", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nivel", "nombre", "organizacion", "partidosDobles", "partidosIndividual", "passwordHash", "perfilPublico", "peso", "privacidadAceptadaEn", "puntosDobles", "puntosIndividual", "rol", "sesionVersion", "username", "victoriasDobles", "victoriasIndividual" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

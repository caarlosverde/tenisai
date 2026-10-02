-- CreateTable
CREATE TABLE "Analisis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "videoNombre" TEXT NOT NULL,
    "puntuacion" INTEGER NOT NULL,
    "tipoGolpe" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "detalles" TEXT,
    CONSTRAINT "Analisis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("altura", "apellidos", "createdAt", "edad", "id", "nombre", "passwordHash", "peso", "username") SELECT "altura", "apellidos", "createdAt", "edad", "id", "nombre", "passwordHash", "peso", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Analisis_jobId_key" ON "Analisis"("jobId");

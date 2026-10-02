-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Video";
PRAGMA foreign_keys=on;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("altura", "apellidos", "createdAt", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nombre", "passwordHash", "peso", "privacidadAceptadaEn", "username") SELECT "altura", "apellidos", "createdAt", "edad", "estiloDerecha", "estiloReves", "id", "lateralidad", "nombre", "passwordHash", "peso", "privacidadAceptadaEn", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

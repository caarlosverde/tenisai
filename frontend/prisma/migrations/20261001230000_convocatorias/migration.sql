-- CreateTable
CREATE TABLE "Convocatoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creadorId" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "fechaHora" DATETIME NOT NULL,
    "lugar" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "nivel" TEXT,
    "plazas" INTEGER NOT NULL,
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partidoId" TEXT,
    CONSTRAINT "Convocatoria_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Convocatoria_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "Partido" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolicitudConvocatoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "convocatoriaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "mensaje" TEXT,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SolicitudConvocatoria_convocatoriaId_fkey" FOREIGN KEY ("convocatoriaId") REFERENCES "Convocatoria" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SolicitudConvocatoria_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Convocatoria_partidoId_key" ON "Convocatoria"("partidoId");

-- CreateIndex
CREATE INDEX "Convocatoria_estado_fechaHora_idx" ON "Convocatoria"("estado", "fechaHora");

-- CreateIndex
CREATE INDEX "Convocatoria_creadorId_idx" ON "Convocatoria"("creadorId");

-- CreateIndex
CREATE INDEX "SolicitudConvocatoria_userId_idx" ON "SolicitudConvocatoria"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudConvocatoria_convocatoriaId_userId_key" ON "SolicitudConvocatoria"("convocatoriaId", "userId");

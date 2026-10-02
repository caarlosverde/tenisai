@echo off
echo [1/2] Levantando el backend en Docker...
docker compose up -d

echo [2/2] Arrancando el frontend de Next.js...
if exist "frontend\package.json" (
    cd frontend
)

rem Si el Control de aplicaciones de Windows bloquea el compilador nativo de Next,
rem se usa el de reserva (WebAssembly) con webpack: tarda mas en compilar, pero funciona
node -e "require('@next/swc-win32-x64-msvc')" >nul 2>&1
if errorlevel 1 (
    echo Windows bloquea el compilador nativo de Next: se arranca en modo compatible.
    echo La primera vez que abras cada pagina puede tardar unos 30 segundos.
    npm run dev:webpack
) else (
    npm run dev
)

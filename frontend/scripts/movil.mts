/**
 * Prepara la app de Android para abrir una web concreta y actualiza el proyecto nativo
 * (android/). La app es la propia web dentro de un WebView (Capacitor), así que cada
 * cambio de la web llega a la app sin publicar una versión nueva.
 *
 *   npm run movil -- emulador             la web de este ordenador desde el emulador
 *   npm run movil -- wifi                 desde un móvil conectado a la misma wifi
 *   npm run movil -- https://midominio    la web publicada (producción)
 *
 * Añade --abrir para abrir después el proyecto en Android Studio.
 */
import { spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const PUERTO_DESARROLLO = 3000;

function salir(mensaje: string): never {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

/** IPv4 de este ordenador en la red local (la wifi de casa suele ser 192.168.x.x). */
function ipLocal(): string {
  const candidatas = Object.values(networkInterfaces())
    .flat()
    .filter((dir) => dir && dir.family === "IPv4" && !dir.internal)
    .map((dir) => dir!.address)
    // 172.16-31.x.x: casi siempre adaptadores virtuales (Docker, WSL), no la wifi
    .filter((ip) => !/^172\.(1[6-9]|2\d|3[01])\./.test(ip));
  const ip = candidatas.find((dir) => dir.startsWith("192.168.")) ?? candidatas[0];
  if (!ip) salir("No se encontró la IP de este ordenador en la red local. ¿Estás conectado a una wifi?");
  if (candidatas.length > 1) {
    console.log(`Hay varias redes (${candidatas.join(", ")}): se usa ${ip}.`);
  }
  return ip;
}

function direccion(destino: string | undefined): string {
  if (destino === "emulador") return `http://10.0.2.2:${PUERTO_DESARROLLO}`;
  if (destino === "wifi") return `http://${ipLocal()}:${PUERTO_DESARROLLO}`;
  if (!destino) {
    salir("Indica a qué web se conecta la app: emulador, wifi o la dirección https de producción.");
  }
  let url: URL;
  try {
    url = new URL(destino);
  } catch {
    salir(`"${destino}" no es una dirección válida (ejemplo: https://tenisai.example.com).`);
  }
  if (url.protocol !== "https:") {
    salir("La web de producción debe ir por https: Google Play no admite apps que envían datos sin cifrar.");
  }
  return url.origin;
}

const args = process.argv.slice(2);
const url = direccion(args.find((arg) => !arg.startsWith("--")));

console.log(`La app abrirá ${url}\n`);
// Comandos fijos: la dirección viaja en una variable de entorno, nunca dentro del comando
const opciones = { stdio: "inherit", shell: true, env: { ...process.env, TENISAI_URL: url } } as const;
const sync = spawnSync("npx cap sync android", opciones);
if (sync.status !== 0) process.exit(sync.status ?? 1);

if (url.startsWith("http://")) {
  console.log(
    "\nRecuerda: la web debe estar en marcha en este ordenador (npm run dev) y, si usas un móvil," +
      "\nel cortafuegos de Windows debe permitir conexiones al puerto 3000 en redes privadas.",
  );
}

if (args.includes("--abrir")) {
  spawnSync("npx cap open android", opciones);
}

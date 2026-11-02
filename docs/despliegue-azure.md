# Despliegue en Azure (Azure for Students)

Guía para publicar TenisAI en una máquina virtual de Azure con el `docker-compose.prod.yml`
del repositorio. Caddy pone el HTTPS solo; no hace falta comprar dominio.

Coste orientativo (máquina Linux en Europa, comprobar en la calculadora de Azure):

| Tamaño | CPU / RAM | Encendida 24 h | Encendida ~4 h al día |
|---|---|---|---|
| B2s  | 2 / 4 GB | ~35 $/mes | ~6 $/mes |
| B2ms | 2 / 8 GB | ~65 $/mes | ~11 $/mes |

Más unos 5 $/mes de disco e IP, que se pagan aunque la máquina esté apagada.
Con Azure for Students, si se acaba el crédito los servicios se paran: no se cobra nada.

## 1. Activar la cuenta

1. Entra en <https://azure.microsoft.com/free/students> y regístrate con el correo de la
   universidad (no pide tarjeta).
2. En el portal (<https://portal.azure.com>), busca **Presupuestos** (Cost Management) y
   crea uno de 20 $ con aviso por correo al 80 %. Así ves el gasto antes de que se acabe.

## 2. Crear la máquina virtual

Portal → **Máquinas virtuales** → **Crear** → **Máquina virtual de Azure**.

Pestaña **Aspectos básicos**:

| Campo | Valor |
|---|---|
| Suscripción | Azure for Students |
| Grupo de recursos | Crear nuevo: `tenisai` |
| Nombre | `tenisai` |
| Región | `(Europe) Spain Central` o `West Europe` (si da error de directiva, prueba otra región europea: las cuentas de estudiante solo permiten algunas) |
| Imagen | Ubuntu Server 24.04 LTS - x64 Gen2 |
| Tamaño | `Standard_B2ms` (o `Standard_B2s`, más barata pero justa de memoria) |
| Tipo de autenticación | Clave pública SSH |
| Nombre de usuario | `azureuser` |
| Origen de la clave SSH | Generar un nuevo par de claves, nombre `tenisai_key` |
| Puertos de entrada públicos | Permitir: SSH (22), HTTP (80), HTTPS (443) |

Pestaña **Discos**: disco del SO de 64 GB, *SSD estándar* (las imágenes de Docker ocupan unos
6 GB y los vídeos se guardan en el mismo disco).

Pestaña **Administración**: activa **Apagado automático**, por ejemplo a la 1:00, zona horaria
`(UTC+01:00) Madrid`. Al día siguiente se enciende desde el portal (botón **Iniciar**).

**Revisar y crear** → **Crear** → descarga la clave `tenisai_key.pem` cuando la pida
(solo se puede descargar en ese momento). Guárdala en `C:\Users\carlo\.ssh\`.

### Nombre web gratuito

Cuando termine: recurso de la máquina → **Información general** → clic en la **dirección IP
pública** → **Configuración** → **Etiqueta de nombre DNS**: `tenisai-carlos` → Guardar.

Queda un nombre del tipo `tenisai-carlos.spaincentral.cloudapp.azure.com`; ese es el `DOMINIO`.

## 3. Conectarse por SSH (desde PowerShell en Windows)

```powershell
icacls C:\Users\carlo\.ssh\tenisai_key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i C:\Users\carlo\.ssh\tenisai_key.pem azureuser@tenisai-carlos.spaincentral.cloudapp.azure.com
```

(El primer comando deja la clave legible solo para tu usuario; sin él, SSH la rechaza.)

## 4. Preparar el servidor (dentro de la máquina)

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # vuelve a entrar por SSH para que el cambio de grupo tenga efecto
```

Solo con B2s (4 GB): añade 4 GB de memoria de intercambio para que la compilación no falle.

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 5. Descargar el proyecto (repositorio privado)

Una clave de solo lectura para este servidor (deploy key):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tenisai_github -N ""
cat ~/.ssh/tenisai_github.pub
```

Copia la línea que aparece y añádela en GitHub: repositorio `tenisai` → **Settings** →
**Deploy keys** → **Add deploy key** (sin marcar *Allow write access*). Después:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/tenisai_github
EOF
git clone git@github.com:caarlosverde/tenisai.git
cd tenisai
```

## 6. Configurar y arrancar

```bash
cp .env.produccion.example .env
nano .env
```

- `DOMINIO=tenisai-carlos.spaincentral.cloudapp.azure.com` (el nombre del paso 2)
- `JWT_SECRET=` el resultado de `openssl rand -hex 32`

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez tarda entre 10 y 25 minutos (compila la web e instala PyTorch y MediaPipe).
Comprobación:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy   # debe obtener el certificado
```

Abre `https://tenisai-carlos.spaincentral.cloudapp.azure.com` en el navegador.

## Mantenimiento

| Tarea | Cómo |
|---|---|
| Actualizar a la última versión | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Ver errores | `docker compose -f docker-compose.prod.yml logs --tail 100 backend` |
| Apagar y dejar de pagar CPU | Portal → máquina → **Detener** (queda *desasignada*) |
| Encender | Portal → máquina → **Iniciar**; los contenedores arrancan solos |
| Copia de seguridad | Volúmenes `web_datos` (base de datos) y `motor_datos` (vídeos) |

Los datos y el certificado HTTPS están en volúmenes de Docker: sobreviven a reinicios y
apagados. La IP pública puede cambiar al apagar, pero el nombre DNS sigue apuntando bien.

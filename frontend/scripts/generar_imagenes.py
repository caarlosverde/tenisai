"""
Genera los iconos, el logo optimizado y la imagen para compartir enlaces a partir
del logo original (assets/logo-original.jpg, 1024x1024). También los iconos de la app de
Android (si existe android/) y los gráficos de su ficha en Google Play (movil/play/).

Uso (desde frontend/):  ../venv/Scripts/python scripts/generar_imagenes.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / "assets" / "logo-original.jpg"
FONDO = (2, 6, 23)  # #020617, el fondo de la app

# El círculo con la raqueta ocupa el centro-arriba del logo original
RECORTE_CIRCULO = (205, 145, 815, 755)


def fuente(nombres: list[str], tamano: int) -> ImageFont.FreeTypeFont:
    for nombre in nombres:
        ruta = Path("C:/Windows/Fonts") / nombre
        if ruta.exists():
            return ImageFont.truetype(str(ruta), tamano)
    return ImageFont.load_default(size=tamano)


def main() -> None:
    logo = Image.open(ORIGEN).convert("RGB")
    circulo = logo.crop(RECORTE_CIRCULO)

    # Logo de la barra de navegación (se muestra a 36 px; 256 cubre pantallas 3x-7x)
    circulo.resize((256, 256), Image.LANCZOS).save(RAIZ / "public" / "logo.webp", "WEBP", quality=88)

    app = RAIZ / "app"
    # Paleta de 256 colores: el logo es de tonos planos y así pesa una fracción
    for nombre, lado in (("icon.png", 192), ("apple-icon.png", 180)):
        circulo.resize((lado, lado), Image.LANCZOS).quantize(256).save(app / nombre, optimize=True)
    # Next solo decodifica ICO con PNG en RGBA
    circulo.convert("RGBA").save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Iconos de la app instalable (manifest): normales y "maskable". Android recorta los
    # maskable con la forma del fabricante (círculo, gota…): el logo va dentro de la zona
    # segura (el 80 % central) sobre el fondo de la app
    iconos = RAIZ / "public" / "iconos"
    iconos.mkdir(exist_ok=True)
    for lado in (192, 512):
        circulo.resize((lado, lado), Image.LANCZOS).quantize(256).save(
            iconos / f"icono-{lado}.png", optimize=True
        )
        enmascarable = Image.new("RGB", (lado, lado), FONDO)
        logo = circulo.resize((int(lado * 0.72),) * 2, Image.LANCZOS)
        forma = Image.new("L", logo.size, 0)
        ImageDraw.Draw(forma).ellipse((0, 0, *logo.size), fill=255)
        margen = (lado - logo.size[0]) // 2
        enmascarable.paste(logo, (margen, margen), forma)
        enmascarable.quantize(256).save(iconos / f"icono-maskable-{lado}.png", optimize=True)

    # Imagen para compartir enlaces (Open Graph): 1200x630
    og = Image.new("RGB", (1200, 630), FONDO)
    brillo = Image.new("RGB", (1200, 630), FONDO)
    ImageDraw.Draw(brillo).ellipse((-150, -250, 750, 650), fill=(11, 45, 70))
    og = Image.blend(og, brillo.filter(ImageFilter.GaussianBlur(120)), 0.9)

    icono = circulo.resize((380, 380), Image.LANCZOS)
    mascara = Image.new("L", icono.size, 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, *icono.size), fill=255)
    og.paste(icono, (90, 125), mascara)

    dibujo = ImageDraw.Draw(og)
    titulo = fuente(["segoeuib.ttf", "arialbd.ttf"], 92)
    texto = fuente(["segoeui.ttf", "arial.ttf"], 38)
    dibujo.text((530, 190), "Tenis", font=titulo, fill=(248, 250, 252))
    ancho_tenis = dibujo.textlength("Tenis", font=titulo)
    dibujo.text((530 + ancho_tenis, 190), "AI", font=titulo, fill=(103, 232, 249))
    lineas = ["Análisis biomecánico de tu", "golpe con visión artificial"]
    for i, linea in enumerate(lineas):
        dibujo.text((534, 320 + i * 52), linea, font=texto, fill=(203, 213, 225))
    og.save(app / "opengraph-image.jpg", quality=88, optimize=True)

    generadas = [RAIZ / "public" / "logo.webp", app / "icon.png", app / "apple-icon.png",
                 app / "favicon.ico", app / "opengraph-image.jpg", *sorted(iconos.glob("*.png"))]
    generadas += iconos_android(circulo)
    generadas += graficos_google_play(circulo)
    for ruta in generadas:
        print(f"{ruta.relative_to(RAIZ)}: {ruta.stat().st_size / 1024:.1f} KB")


# Densidades de pantalla de Android y su escala respecto a mdpi (1 dp = 1 px)
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def en_circulo(imagen: Image.Image, lado: int) -> Image.Image:
    """El logo redondo, de `lado` px, sobre fondo transparente."""
    logo = imagen.resize((lado, lado), Image.LANCZOS).convert("RGBA")
    forma = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(forma).ellipse((0, 0, lado - 1, lado - 1), fill=255)
    logo.putalpha(forma)
    return logo


def iconos_android(circulo: Image.Image) -> list[Path]:
    """Iconos de la app de Android (android/, generado por Capacitor)."""
    res = RAIZ / "android" / "app" / "src" / "main" / "res"
    if not res.exists():
        return []
    rutas = []
    for densidad, escala in DENSIDADES.items():
        carpeta = res / f"mipmap-{densidad}"
        # Icono clásico (48 dp), para lanzadores sin iconos adaptables: el logo redondo
        lado = round(48 * escala)
        for nombre in ("ic_launcher.png", "ic_launcher_round.png"):
            en_circulo(circulo, lado).save(carpeta / nombre, optimize=True)
            rutas.append(carpeta / nombre)
        # Capa delantera del icono adaptable (108 dp). Cada fabricante lo recorta con su forma
        # (círculo, gota, cuadrado redondeado) dejando visibles los 72 dp centrales: el logo
        # ocupa 66 dp, la zona que ninguna forma recorta. El fondo es el color de la app
        lienzo = round(108 * escala)
        delantera = Image.new("RGBA", (lienzo, lienzo), (0, 0, 0, 0))
        logo = en_circulo(circulo, round(66 * escala))
        margen = (lienzo - logo.size[0]) // 2
        delantera.alpha_composite(logo, (margen, margen))
        delantera.save(carpeta / "ic_launcher_foreground.png", optimize=True)
        rutas.append(carpeta / "ic_launcher_foreground.png")
    return rutas


def graficos_google_play(circulo: Image.Image) -> list[Path]:
    """Icono (512x512) y gráfico destacado (1024x500) de la ficha de Google Play."""
    carpeta = RAIZ / "movil" / "play"
    carpeta.mkdir(parents=True, exist_ok=True)

    # Google Play redondea las esquinas: se entrega cuadrado, sin transparencias
    icono = Image.new("RGB", (512, 512), FONDO)
    logo = en_circulo(circulo, 420)
    icono.paste(logo, (46, 46), logo)
    icono.save(carpeta / "icono-512.png", optimize=True)

    grafico = Image.new("RGB", (1024, 500), FONDO)
    brillo = Image.new("RGB", (1024, 500), FONDO)
    ImageDraw.Draw(brillo).ellipse((-150, -220, 640, 560), fill=(11, 45, 70))
    grafico = Image.blend(grafico, brillo.filter(ImageFilter.GaussianBlur(110)), 0.9)
    logo = en_circulo(circulo, 300)
    grafico.paste(logo, (80, 100), logo)
    dibujo = ImageDraw.Draw(grafico)
    titulo = fuente(["segoeuib.ttf", "arialbd.ttf"], 84)
    texto = fuente(["segoeui.ttf", "arial.ttf"], 34)
    dibujo.text((440, 140), "Tenis", font=titulo, fill=(248, 250, 252))
    dibujo.text((440 + dibujo.textlength("Tenis", font=titulo), 140), "AI", font=titulo,
                fill=(103, 232, 249))
    for i, linea in enumerate(["Análisis biomecánico de tu", "golpe con visión artificial"]):
        dibujo.text((444, 262 + i * 46), linea, font=texto, fill=(203, 213, 225))
    grafico.save(carpeta / "grafico-destacado.png", optimize=True)
    return [carpeta / "icono-512.png", carpeta / "grafico-destacado.png"]


if __name__ == "__main__":
    main()

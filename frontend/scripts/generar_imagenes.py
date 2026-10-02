"""
Genera los iconos, el logo optimizado y la imagen para compartir enlaces a partir
del logo original (assets/logo-original.jpg, 1024x1024).

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

    for ruta in [RAIZ / "public" / "logo.webp", app / "icon.png", app / "apple-icon.png",
                 app / "favicon.ico", app / "opengraph-image.jpg"]:
        print(f"{ruta.relative_to(RAIZ)}: {ruta.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()

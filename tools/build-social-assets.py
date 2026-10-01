#!/usr/bin/env python3
"""Build og-image.png, favicon.png, apple-touch-icon.png, favicon.ico from title-screen assets."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OG_SIZE = (1200, 630)
LOGO_RASTER = ASSETS / "pokemon_logo.svg.png"
OG_SOURCE = ASSETS / "og-source.jpg"


def ensure_logo_raster() -> Path:
    if LOGO_RASTER.exists() and LOGO_RASTER.stat().st_size > 1000:
        return LOGO_RASTER
    svg = ASSETS / "pokemon_logo.svg"
    if not svg.exists():
        sys.exit(f"Missing {svg}")
    subprocess.run(
        ["qlmanage", "-t", "-s", "900", "-o", str(ASSETS), str(svg)],
        check=False,
        capture_output=True,
    )
    if not LOGO_RASTER.exists():
        sys.exit("Could not rasterize pokemon_logo.svg (qlmanage).")
    return LOGO_RASTER


def cover_crop(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def apply_title_overlays(base: Image.Image) -> Image.Image:
    w, h = base.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(180 * (1 - t) * 0.35 + 20 * (1 - t) * 0.5)
        g = int(40 * (1 - t) * 0.35)
        b = int(30 * (1 - t) * 0.35 + 40 * (1 - t) * 0.5)
        a = int(90 + 110 * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b, a))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((w * 0.1, -h * 0.15, w * 0.9, h * 0.85), fill=(255, 200, 80, 55))
    glow = glow.filter(ImageFilter.GaussianBlur(48))
    vignette = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse((-w * 0.15, -h * 0.2, w * 1.15, h * 1.25), fill=255)
    vignette = ImageChops.invert(vignette).point(lambda p: int(p * 0.45))
    out = base.convert("RGBA")
    out = Image.alpha_composite(out, glow)
    out = Image.alpha_composite(out, overlay)
    out = Image.composite(out, base.convert("RGBA"), vignette)
    return out


def load_sprite(name: str, max_px: int) -> Image.Image:
    path = ASSETS / "sprites" / name
    img = Image.open(path).convert("RGBA")
    img.thumbnail((max_px, max_px), Image.Resampling.NEAREST)
    return img


def draw_arena_text(draw: ImageDraw.ImageDraw, cx: int, cy: int, text: str, size: int) -> None:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x, y = cx - tw // 2, cy - th // 2
    for ox, oy, color in [(0, 6, (26, 42, 112, 255)), (0, 10, (26, 42, 112, 200)), (2, 2, (0, 0, 0, 160))]:
        draw.text((x + ox, y + oy), text, font=font, fill=color)
    draw.text((x, y), text, font=font, fill=(255, 216, 74, 255))


def pokeball_rgba(r: int) -> Image.Image:
    """Red top, white bottom (matches title-screen orbs)."""
    d = 2 * r + 2
    layer = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    box = (1, 1, d - 2, d - 2)
    white = Image.new("RGBA", (d, d), (255, 255, 255, 255))
    red = Image.new("RGBA", (d, d), (229, 57, 53, 255))
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).pieslice(box, 180, 360, fill=255)
    layer = Image.composite(red, white, mask)
    draw = ImageDraw.Draw(layer)
    mid = r + 1
    band = max(1, r // 6)
    draw.line([(1, mid), (d - 2, mid)], fill=(18, 18, 18, 255), width=band)
    ir = max(2, r // 4)
    draw.ellipse((mid - ir, mid - ir, mid + ir, mid + ir), fill=(26, 26, 26, 255))
    shine = max(1, ir // 3)
    draw.ellipse(
        (mid - ir + shine, mid - ir + shine, mid + ir - shine, mid + ir - shine),
        fill=(245, 245, 245, 255),
    )
    return layer


def paste_pokeball(img: Image.Image, cx: int, cy: int, r: int) -> None:
    ball = pokeball_rgba(r)
    img.paste(ball, (cx - r - 1, cy - r - 1), ball)


def draw_battle_sparks(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int) -> None:
    """Small clash burst behind the icon focal point."""
    w = max(1, size // 14)
    gold = (255, 216, 74, 220)
    white = (255, 248, 230, 190)
    reach = int(size * 0.42)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        draw.line([(cx, cy), (cx + dx * reach, cy + dy * reach)], fill=gold, width=w)
    s = size // 6
    draw.line([(cx - s, cy - s), (cx + s, cy + s)], fill=white, width=w)
    draw.line([(cx + s, cy - s), (cx - s, cy + s)], fill=white, width=w)


def battle_backdrop(size: int) -> Image.Image:
    grass = cover_crop(Image.open(ASSETS / "grass_bg.png").convert("RGBA"), (size, size))
    arena = cover_crop(Image.open(ASSETS / "arena_bg.png").convert("RGBA"), (size, size))
    base = Image.blend(grass, arena, 0.62)
    return apply_title_overlays(base)


def build_og() -> Image.Image:
    grass = Image.open(ASSETS / "grass_bg.png").convert("RGBA")
    canvas = cover_crop(grass, OG_SIZE)
    canvas = apply_title_overlays(canvas)
    logo = Image.open(ensure_logo_raster()).convert("RGBA")
    lw = int(OG_SIZE[0] * 0.62)
    lh = int(lw * logo.size[1] / logo.size[0])
    logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((OG_SIZE[0] - lw) // 2, 72), logo)

    draw = ImageDraw.Draw(canvas)
    draw_arena_text(draw, OG_SIZE[0] // 2, 72 + lh + 58, "BATTLE ARENA", 56)

    tags = "721+ MEGA  ·  GYM LEADERS  ·  LEGENDARY BOSSES"
    try:
        tfont = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    except OSError:
        tfont = ImageFont.load_default()
    tb = draw.textbbox((0, 0), tags, font=tfont)
    draw.text(((OG_SIZE[0] - (tb[2] - tb[0])) // 2, 72 + lh + 118), tags, font=tfont, fill=(255, 248, 232, 255))

    ray = load_sprite("384.gif", 200)
    canvas.paste(ray, (OG_SIZE[0] - 280, 40), ray)
    pika = load_sprite("25.gif", 150)
    pika.putalpha(pika.getchannel("A").point(lambda a: int(a * 0.55)))
    canvas.paste(pika, (OG_SIZE[0] - 220, OG_SIZE[1] - 240), pika)

    for px, py, pr in [(120, 100, 36), (OG_SIZE[0] - 100, 130, 28), (90, OG_SIZE[1] - 90, 32)]:
        paste_pokeball(canvas, px, py, pr)

    # VS battle strip at bottom
    arena_strip = cover_crop(Image.open(ASSETS / "arena_bg.png").convert("RGBA"), (OG_SIZE[0], 200))
    arena_strip.putalpha(arena_strip.getchannel("A").point(lambda a: int(a * 0.55)))
    canvas.paste(arena_strip, (0, OG_SIZE[1] - 200), arena_strip)
    draw = ImageDraw.Draw(canvas)
    vs_x, vs_y = OG_SIZE[0] // 2, OG_SIZE[1] - 95
    draw_battle_sparks(draw, vs_x, vs_y, 120)
    try:
        vs_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 44)
    except OSError:
        vs_font = ImageFont.load_default()
    vb = draw.textbbox((0, 0), "VS", font=vs_font)
    draw.text((vs_x - (vb[2] - vb[0]) // 2, vs_y - 22), "VS", font=vs_font, fill=(255, 216, 74, 255))
    mon_l = load_sprite("6.gif", 110)
    mon_r = load_sprite("150.gif", 110)
    canvas.paste(mon_l, (vs_x - 200, OG_SIZE[1] - 175), mon_l)
    canvas.paste(mon_r, (vs_x + 90, OG_SIZE[1] - 175), mon_r)

    return canvas.convert("RGB")


def build_icon(size: int) -> Image.Image:
    """Transparent favicon: Rayquaza only, centered."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ray = load_sprite("384.gif", int(size * 0.92))
    rx = (size - ray.width) // 2
    ry = (size - ray.height) // 2
    img.paste(ray, (rx, ry), ray)
    return img


def build_og_from_source() -> Image.Image:
    img = Image.open(OG_SOURCE).convert("RGB")
    return cover_crop(img, OG_SIZE)


def main() -> None:
    ensure_logo_raster()
    if OG_SOURCE.exists():
        build_og_from_source().save(ASSETS / "og-image.png", optimize=True)
    else:
        build_og().save(ASSETS / "og-image.png", optimize=True)
    for size, name in [(32, "favicon.png"), (180, "apple-touch-icon.png")]:
        build_icon(size).save(ASSETS / name, format="PNG", optimize=True)
    build_icon(48).save(ASSETS / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Wrote og-image.png, favicon.png, apple-touch-icon.png, favicon.ico")


if __name__ == "__main__":
    main()

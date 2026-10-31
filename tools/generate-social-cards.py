"""Render the reusable LARI social-card system and review contact sheet.

Requires Pillow on the workstation used to prepare assets. Generated PNGs are
checked into the website repository; the static site build does not need Pillow.
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ASSETS / "social-cards"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1200, 630
FONT_DIR = Path("C:/Windows/Fonts")
FONTS = {
    "sans": ImageFont.truetype(str(FONT_DIR / "segoeui.ttf"), 36),
    "sans_bold": ImageFont.truetype(str(FONT_DIR / "seguisb.ttf"), 36),
    "title": ImageFont.truetype(str(FONT_DIR / "georgia.ttf"), 68),
    "title_bold": ImageFont.truetype(str(FONT_DIR / "georgiab.ttf"), 68),
    "mono": ImageFont.truetype(str(FONT_DIR / "consola.ttf"), 16),
    "small": ImageFont.truetype(str(FONT_DIR / "segoeui.ttf"), 22),
}

CARDS = [
    ("home", "DEVELOPING AI ARCHITECTURE", "Local intelligence.\nExecutable knowledge.", False),
    ("how-it-works", "LARI ARCHITECTURE", "Structured state.\nGoverned execution.", True),
    ("live", "PUBLIC RESEARCH OBSERVATORY", "Evidence travels\nwith the claim.", True),
    ("experiments", "EXPERIMENT ARCHIVE", "Methods. Outcomes.\nLimitations.", False),
    ("research", "LARI RESEARCH", "Questions before\nconclusions.", True),
    ("research-methods", "METHODS NOTE", "Verification and\nclaim scope.", False),
    ("methods", "RESEARCH METHODS", "Test. Verify.\nReview.", True),
    ("capabilities", "APPROVED EVIDENCE INDEX", "Evidence before\ncapability labels.", False),
    ("development", "DEVELOPMENT HISTORY", "A timeline that\nkeeps its dates.", True),
    ("community", "LARI COMMUNITY LAB", "Ask. Discuss.\nPropose a test.", False),
    ("request-experiment", "COMMUNITY LAB", "Request an\nexperiment.", True),
    ("evidence-guide", "PUBLICATION STANDARD", "Evidence labels\nand their limits.", False),
    ("about", "LARITY LABS", "Local Autonomous\nRecursive Intelligence.", True),
]

def fit_font(text, font, max_width):
    draw = ImageDraw.Draw(Image.new("RGB", (2, 2)))
    if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
        return font
    size = font.size
    family = "georgia.ttf" if font == FONTS["title"] else "georgiab.ttf"
    while size > 42:
        size -= 2
        candidate = ImageFont.truetype(str(FONT_DIR / family), size)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= max_width:
            return candidate
    return ImageFont.truetype(str(FONT_DIR / family), 42)

def render_card(name, eyebrow, title, dark):
    bg = (5, 9, 8) if dark else (243, 242, 236)
    ink = (240, 240, 230) if dark else (16, 23, 19)
    muted = (168, 182, 171) if dark else (87, 99, 89)
    accent = (0, 255, 102) if dark else (0, 136, 62)
    image = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(image)
    # An editorial frame and calm phosphor rule make a repeatable page family.
    draw.rectangle((0, 0, 13, H), fill=accent)
    draw.rectangle((56, 42, W - 56, H - 42), outline=(48, 65, 53) if dark else (201, 206, 197), width=2)
    draw.line((88, 253, W - 88, 253), fill=accent, width=2)
    logo_name = "lari-primary-dark.png" if dark else "lari-primary-light.png"
    logo = Image.open(ASSETS / logo_name).convert("RGBA")
    logo.thumbnail((400, 124), Image.Resampling.LANCZOS)
    image.paste(logo, (86, 76), logo)
    draw.text((88, 226), eyebrow.upper(), fill=accent, font=FONTS["mono"])
    title_lines = title.split("\n")
    size = 68 if max(map(len, title_lines)) < 29 else 60
    title_font = ImageFont.truetype(str(FONT_DIR / "georgia.ttf"), size)
    for index, line in enumerate(title_lines):
        title_font = fit_font(line, title_font, 900)
        draw.text((84, 290 + index * (size + 8)), line, fill=ink, font=title_font)
    draw.text((88, 543), "Intelligence you can own. Learning you can verify.", fill=muted, font=FONTS["small"])
    draw.text((W - 278, 548), "WHATSLARI.COM", fill=accent, font=FONTS["mono"])
    output = OUT / f"{name}.png"
    image.save(output, format="PNG", optimize=True)
    return image, output

rendered = []
for card in CARDS:
    image, _ = render_card(*card)
    rendered.append((card[0], image))

snapshot = json.loads((ROOT / "data/approved/snapshot.json").read_text(encoding="utf-8"))
for row in snapshot.get("experiments", []):
    image, _ = render_card(f"experiment-{row['id']}", "APPROVED EXPERIMENT · LARI RESEARCH", row["title"], True)
    rendered.append((f"experiment-{row['id']}", image))

thumb_w, thumb_h = 360, 189
columns = 3
rows = math.ceil(len(rendered) / columns)
sheet = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + 32)), (224, 227, 219))
sheet_draw = ImageDraw.Draw(sheet)
for index, (name, card) in enumerate(rendered):
    x = (index % columns) * thumb_w
    y = (index // columns) * (thumb_h + 32)
    sheet.paste(card.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), (x, y))
    sheet_draw.text((x + 8, y + thumb_h + 6), name, fill=(23, 34, 27), font=FONTS["mono"])
contact = ROOT / "tools/social-cards-contact-sheet.png"
sheet.save(contact, format="PNG", optimize=True)
print(f"Generated {len(rendered)} 1200x630 social card(s) in {OUT}")
print(f"Contact sheet: {contact}")

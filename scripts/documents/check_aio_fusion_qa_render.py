"""Inspect PDFs rendered from the actual Word deliverables, not HTML approximations."""
from pathlib import Path
import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RENDER = Path("/tmp/aio-qa-render")
messages = []
for file in sorted(RENDER.glob("*.pdf")):
    pdf = fitz.open(file)
    internal = "INTERNAL" in file.name
    label = "internal" if internal else "clean"
    thumbs = []
    for i, page in enumerate(pdf):
        text = page.get_text()
        assert text.strip(), (file, i, "empty page")
        expected = "INTERNAL ONLY" if internal else "RELEASE NOT AUTHORISED"
        assert expected in text, (file, i, "missing status")
        for word in page.get_text("words"):
            x0, y0, x1, y1 = word[:4]
            assert x0 >= 0 and y0 >= 0 and x1 <= page.rect.width + 1 and y1 <= page.rect.height + 1, (file, i, word)
        pix = page.get_pixmap(matrix=fitz.Matrix(0.52, 0.52))
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        card = Image.new("RGB", (330, 465), "#dddddd")
        card.paste(image, ((330-image.width)//2, 20))
        ImageDraw.Draw(card).text((8, 4), f"{label} page {i+1}", fill="black")
        thumbs.append(card)
        if (not internal and any(marker in text for marker in ["Aspect\n", "Annual billing", "Actions per month"])) or (internal and i in [0, 2, 7]):
            page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(RENDER / f"{label}-detail-{i+1}.png")
    for start in range(0, len(thumbs), 12):
        group = thumbs[start:start+12]
        sheet = Image.new("RGB", (330*4, 465*((len(group)+3)//4)), "white")
        for n, image in enumerate(group):
            sheet.paste(image, ((n%4)*330, (n//4)*465))
        sheet.save(RENDER / f"{label}-contact-{start//12+1}.jpg")
    messages.append(f"{label}: {len(pdf)} pages rendered in LibreOffice. All pages have status footers; text stays within page bounds.")
print("\n".join(messages))
with (ROOT / "deliverables/aio-fusion-qa-v1.5/verification.txt").open("a") as f:
    f.write("\n".join(messages) + "\n")
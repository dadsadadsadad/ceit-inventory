from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path(r"D:\Webstorm\ceit-inventory\artifacts\capstone-docx-fix\final-page-images")
DESTINATION = Path(r"D:\Webstorm\ceit-inventory\artifacts\capstone-docx-fix\final-contact-sheets")
THUMBNAIL = (372, 526)
PADDING = 22
LABEL_HEIGHT = 32


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    pages = sorted(SOURCE.glob("page-*.png"))
    for sheet_number, start in enumerate(range(0, len(pages), 4), start=1):
        group = pages[start : start + 4]
        canvas = Image.new(
            "RGB",
            (THUMBNAIL[0] * 2 + PADDING * 3, (THUMBNAIL[1] + LABEL_HEIGHT) * 2 + PADDING * 3),
            "white",
        )
        draw = ImageDraw.Draw(canvas)
        for position, page_path in enumerate(group):
            image = Image.open(page_path).convert("RGB")
            image.thumbnail(THUMBNAIL)
            row, column = divmod(position, 2)
            x = PADDING + column * (THUMBNAIL[0] + PADDING)
            y = PADDING + row * (THUMBNAIL[1] + LABEL_HEIGHT + PADDING)
            canvas.paste(image, (x, y))
            page_number = page_path.stem.rsplit("-", 1)[-1]
            draw.text((x, y + THUMBNAIL[1] + 5), f"Page {int(page_number)}", fill="black")
        canvas.save(DESTINATION / f"sheet-{sheet_number:02d}.png")


if __name__ == "__main__":
    main()

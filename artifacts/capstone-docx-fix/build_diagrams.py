from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "updated-media"
BLACK = "#151515"
GRAY = "#f7f7f7"
ORANGE = "#f28b20"
YELLOW = "#ffea00"
BLUE = "#dbeafe"
GREEN = "#dcfce7"
PINK = "#fce7f3"


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def wrapped(draw, text, use_font, width):
    words = text.split()
    lines, line = [], ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if draw.textlength(candidate, font=use_font) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def multiline(draw, box, text, use_font, fill=BLACK, align="center", leading=4):
    x, y, w, h = box
    lines = []
    for part in text.split("\n"):
        lines.extend(wrapped(draw, part, use_font, w) or [""])
    bbox = draw.textbbox((0, 0), "Ay", font=use_font)
    line_height = bbox[3] - bbox[1] + leading
    content_height = line_height * len(lines) - leading
    current_y = y + max(0, (h - content_height) / 2)
    for line in lines:
        line_width = draw.textlength(line, font=use_font)
        if align == "left":
            current_x = x
        elif align == "right":
            current_x = x + w - line_width
        else:
            current_x = x + (w - line_width) / 2
        draw.text((current_x, current_y), line, font=use_font, fill=fill)
        current_y += line_height


def arrow(draw, start, end, color=BLACK, width=2, head=8):
    x1, y1 = start
    x2, y2 = end
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    dx, dy = x2 - x1, y2 - y1
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    point = (x2, y2)
    left = (x2 - head * ux + head * 0.55 * px, y2 - head * uy + head * 0.55 * py)
    right = (x2 - head * ux - head * 0.55 * px, y2 - head * uy - head * 0.55 * py)
    draw.polygon((point, left, right), fill=color)


def box(draw, rect, text, fill=GRAY, outline=BLACK, radius=10, text_size=14, bold=False, padding=10):
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=2)
    x1, y1, x2, y2 = rect
    multiline(draw, (x1 + padding, y1 + padding, x2 - x1 - (2 * padding), y2 - y1 - (2 * padding)), text, font(text_size, bold))


def ellipse(draw, rect, text, text_size=12):
    draw.ellipse(rect, fill="white", outline=BLACK, width=1)
    x1, y1, x2, y2 = rect
    multiline(draw, (x1 + 7, y1 + 7, x2 - x1 - 14, y2 - y1 - 14), text, font(text_size))


def header(image, title):
    draw = ImageDraw.Draw(image)
    width, _ = image.size
    draw.rectangle((0, 0, width - 1, image.height - 1), outline=YELLOW, width=8)
    draw.rounded_rectangle((width - 102, 10, width - 14, 32), radius=4, fill=YELLOW, outline=BLACK, width=1)
    multiline(draw, (width - 96, 12, 76, 17), "UPDATED", font(9, True))
    multiline(draw, (20, 12, width - 150, 26), title, font(16, True), align="left")
    return draw


def save(image, name):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / name, format="PNG", optimize=True)


def proposed_ipo():
    image = Image.new("RGB", (1399, 480), "white")
    draw = header(image, "INPUT - PROCESS - OUTPUT OF THE DEVELOPED SYSTEM")
    columns = [(18, 60, 390, 438), (505, 60, 877, 438), (990, 60, 1380, 438)]
    titles = ["INPUT", "PROCESS", "OUTPUT"]
    texts = [
        "• Existing inventory records\n• Account and role data\n• Item, PC, category, and location data\n• QR labels\n• Borrowing, return, and maintenance details",
        "• Sign in and check role\n• Register or update inventory\n• Generate and scan QR labels\n• Receive and process borrowing and return requests\n• Record maintenance and activity\n• View or export reports",
        "• Centralized inventory register\n• QR labels and limited public item view\n• Borrowing and return history\n• Maintenance tickets and activity history\n• Overview PDF and CSV exports",
    ]
    for rect, title, text in zip(columns, titles, texts):
        draw.rounded_rectangle(rect, radius=6, outline=ORANGE, width=3)
        multiline(draw, (rect[0] + 15, rect[1] + 14, rect[2] - rect[0] - 30, 28), title, font(17, True))
        multiline(draw, (rect[0] + 24, rect[1] + 60, rect[2] - rect[0] - 48, rect[3] - rect[1] - 85), text, font(15), align="left", leading=7)
    arrow(draw, (396, 250), (498, 250), color=ORANGE, width=3, head=13)
    arrow(draw, (884, 250), (982, 250), color=ORANGE, width=3, head=13)
    save(image, "image11.png")


def use_case():
    image = Image.new("RGB", (473, 760), "white")
    draw = header(image, "USE CASE DIAGRAM")
    draw.rounded_rectangle((92, 58, 382, 740), radius=5, outline=BLACK, width=1)
    multiline(draw, (102, 65, 270, 18), "CEIT INVENTORY SYSTEM", font(10, True))
    cases = [
        (112, "Manage user accounts\nand inventory setup"),
        (190, "Manage inventory\nand QR labels"),
        (268, "Process borrowing\nand return requests"),
        (346, "Manage maintenance\ntickets"),
        (424, "View and export\nreports"),
        (502, "View inventory\nrecords"),
        (580, "Update own account"),
        (658, "Open QR label and\nsubmit request"),
    ]
    for y, label in cases:
        ellipse(draw, (148, y, 326, y + 54), label, 11)
    roles = [("Administrator", 126, 8, [0, 1, 2, 3, 4, 6]), ("Staff", 328, 8, [1, 2, 3, 4, 6]), ("Viewer", 530, 8, [4, 5, 6])]
    for name, y, x, links in roles:
        draw.ellipse((x + 18, y, x + 34, y + 16), outline=BLACK, width=1)
        draw.line((x + 26, y + 16, x + 26, y + 48), fill=BLACK, width=1)
        draw.line((x + 8, y + 27, x + 44, y + 27), fill=BLACK, width=1)
        draw.line((x + 26, y + 48, x + 9, y + 70), fill=BLACK, width=1)
        draw.line((x + 26, y + 48, x + 43, y + 70), fill=BLACK, width=1)
        multiline(draw, (x + 2, y + 75, 50, 30), name, font(9, True))
        for link in links:
            target_y = cases[link][0] + 27
            draw.line((x + 52, y + 35, 148, target_y), fill="#555555", width=1)
    x, y = 400, 405
    draw.ellipse((x + 18, y, x + 34, y + 16), outline=BLACK, width=1)
    draw.line((x + 26, y + 16, x + 26, y + 48), fill=BLACK, width=1)
    draw.line((x + 8, y + 27, x + 44, y + 27), fill=BLACK, width=1)
    draw.line((x + 26, y + 48, x + 9, y + 70), fill=BLACK, width=1)
    draw.line((x + 26, y + 48, x + 43, y + 70), fill=BLACK, width=1)
    multiline(draw, (391, 478, 74, 36), "Public QR\nrequester", font(9, True))
    draw.line((400, 440, 326, cases[7][0] + 27), fill="#555555", width=1)
    save(image, "image4.png")


def architecture():
    image = Image.new("RGB", (535, 430), "white")
    draw = header(image, "SYSTEM ARCHITECTURE")
    layers = [
        ((58, 53, 477, 109), "Web or phone browser\nDashboard and public QR page", BLUE),
        ((58, 132, 477, 188), "Next.js and React\nPresentation layer", "#eef2ff"),
        ((38, 211, 497, 285), "Server Actions and Route Handlers\nAuthentication | Inventory | QR | Borrowing | Maintenance | Reports", GREEN),
        ((58, 308, 477, 388), "Prisma ORM and PostgreSQL database\nUsers | Inventory | PC details | Requests | Maintenance | Activity", PINK),
    ]
    for rect, text, fill in layers:
        box(draw, rect, text, fill=fill, text_size=12, bold=True)
    for previous, following in zip(layers, layers[1:]):
        start = ((previous[0][0] + previous[0][2]) // 2, previous[0][3])
        end = ((following[0][0] + following[0][2]) // 2, following[0][1])
        arrow(draw, start, end, width=2)
    save(image, "image5.png")


def dfd():
    image = Image.new("RGB", (612, 429), "white")
    draw = header(image, "LEVEL 0 DATA FLOW DIAGRAM")
    box(draw, (220, 88, 392, 290), "CEIT INVENTORY SYSTEM\n\nAuthentication and account settings\nInventory and QR labels\nBorrowing and return requests\nMaintenance\nReports", fill="#eef2ff", text_size=12, bold=True)
    box(draw, (230, 326, 382, 402), "PostgreSQL data stores\nUsers | Inventory | Requests\nMaintenance | Activity", fill=PINK, text_size=10, bold=True)
    entities = [
        ((18, 105, 142, 165), "Administrator\nInventory setup and accounts", BLUE, (142, 135), (220, 135)),
        ((18, 218, 142, 278), "Staff\nInventory, requests, maintenance", GREEN, (142, 248), (220, 220)),
        ((470, 98, 594, 158), "Viewer\nView inventory and reports", "#f8fafc", (470, 128), (392, 162)),
        ((457, 231, 600, 291), "Public QR requester\nBorrowing or return request", "#fff7ed", (457, 261), (392, 240)),
    ]
    for rect, text, fill, start, end in entities:
        box(draw, rect, text, fill=fill, text_size=10, bold=True)
        arrow(draw, start, end, width=1)
    arrow(draw, (306, 290), (306, 326), width=2)
    arrow(draw, (326, 326), (326, 290), width=2)
    save(image, "image3.png")


def erd():
    image = Image.new("RGB", (612, 429), "white")
    draw = header(image, "ENTITY-RELATIONSHIP DIAGRAM")
    nodes = {
        "user": (25, 75, 130, 118, "User"),
        "session": (25, 145, 130, 188, "User Session"),
        "category": (163, 75, 270, 118, "Category"),
        "location": (163, 145, 270, 188, "Location"),
        "item": (310, 106, 435, 164, "Inventory Item"),
        "computer": (470, 58, 586, 101, "Computer"),
        "software": (470, 123, 586, 166, "Computer Software"),
        "audit": (291, 230, 408, 273, "Inventory Audit"),
        "photo": (445, 230, 566, 273, "Item Photo"),
        "borrow": (115, 318, 257, 361, "Borrow Request"),
        "maintenance": (341, 318, 499, 361, "Maintenance Ticket"),
    }
    for rect in nodes.values():
        box(draw, rect[:4], rect[4], fill="white", text_size=10, bold=True, radius=4)
    lines = [
        ((77, 118), (77, 145)), ((270, 96), (310, 120)), ((270, 166), (310, 150)),
        ((435, 127), (470, 80)), ((528, 101), (528, 123)), ((350, 164), (350, 230)),
        ((400, 164), (500, 230)), ((350, 164), (185, 318)), ((400, 164), (420, 318)),
    ]
    for start, end in lines:
        draw.line((*start, *end), fill=BLACK, width=1)
    multiline(draw, (16, 391, 580, 20), "One-to-many relationships are shown by the connecting lines.", font(9), fill="#555555")
    save(image, "image12.png")


def main():
    proposed_ipo()
    use_case()
    architecture()
    dfd()
    erd()


if __name__ == "__main__":
    main()

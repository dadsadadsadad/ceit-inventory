import hashlib
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
W_VAL = "{%s}val" % NS["w"]


def text_of(element):
    return "".join(node.text or "" for node in element.findall(".//w:t", NS))


def style_of(paragraph):
    style = paragraph.find("w:pPr/w:pStyle", NS)
    return style.get(W_VAL) if style is not None else None


def paragraph_records(root):
    records = []
    for index, paragraph in enumerate(root.findall(".//w:p", NS)):
        text = text_of(paragraph)
        if text.strip():
            records.append({"index": index, "style": style_of(paragraph), "text": text})
    return records


def main():
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    source_bytes = source.read_bytes()
    with zipfile.ZipFile(source) as package:
        names = package.namelist()
        document_root = ET.fromstring(package.read("word/document.xml"))
        body_paragraphs = paragraph_records(document_root)
        relationships = ET.fromstring(package.read("word/_rels/document.xml.rels"))
        media_by_rel = {
            rel.get("Id"): rel.get("Target")
            for rel in relationships.findall("rel:Relationship", NS)
            if rel.get("Type", "").endswith("/image")
        }
        drawings = []
        for index, paragraph in enumerate(document_root.findall(".//w:p", NS)):
            embeds = [blip.get("{%s}embed" % NS["r"])
                      for blip in paragraph.findall(".//a:blip", NS)]
            if embeds:
                drawings.append({
                    "paragraph_index": index,
                    "text": text_of(paragraph),
                    "relationship_ids": embeds,
                    "targets": [media_by_rel.get(embed) for embed in embeds],
                })
        headers_footers = {
            name: paragraph_records(ET.fromstring(package.read(name)))
            for name in names
            if name.startswith("word/header") or name.startswith("word/footer")
        }
        app_pages = None
        if "docProps/app.xml" in names:
            app = ET.fromstring(package.read("docProps/app.xml"))
            pages = app.find("{http://schemas.openxmlformats.org/officeDocument/2006/extended-properties}Pages")
            app_pages = pages.text if pages is not None else None
        sections = []
        for section_index, section in enumerate(document_root.findall(".//w:sectPr", NS)):
            page_size = section.find("w:pgSz", NS)
            page_margins = section.find("w:pgMar", NS)
            sections.append({
                "index": section_index,
                "page_size": {} if page_size is None else dict(page_size.attrib),
                "page_margins": {} if page_margins is None else dict(page_margins.attrib),
            })
        tables = []
        for table_index, table in enumerate(document_root.findall(".//w:tbl", NS)):
            rows = []
            for row in table.findall("w:tr", NS):
                rows.append([text_of(cell) for cell in row.findall("w:tc", NS)])
            tables.append({"index": table_index, "rows": len(rows),
                           "columns": max((len(row) for row in rows), default=0), "cells": rows})
    headings = [
        paragraph for paragraph in body_paragraphs
        if (paragraph["style"] or "").lower().startswith("heading")
        or paragraph["text"].lower().startswith(("chapter ", "references", "appendix"))
    ]
    report = {
        "source": str(source),
        "sha256": hashlib.sha256(source_bytes).hexdigest(),
        "bytes": len(source_bytes),
        "cached_pages": app_pages,
        "paragraph_count": len(document_root.findall(".//w:p", NS)),
        "nonempty_paragraph_count": len(body_paragraphs),
        "style_counts": Counter(paragraph["style"] for paragraph in body_paragraphs),
        "headings": headings,
        "paragraphs": body_paragraphs,
        "tables": tables,
        "sections": sections,
        "headers_footers": headers_footers,
        "drawings": drawings,
    }
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()

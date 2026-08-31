from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET


DOCX_PATH = Path(r"C:\Users\rafae\Downloads\Capstone_ DESIGN AND DEVELOPMENT OF A QR CODE BASED SMART INVENTORY AND ASSET TRACKING SYSTEM FOR COMPUTER LABORATORY EQUIPMENT IN CEIT DEPARTMENT.docx")
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def text_of(paragraph):
    return "".join(node.text or "" for node in paragraph.iter(f"{{{W}}}t"))


def has(paragraph, xpath):
    return paragraph.find(xpath, NS) is not None


def main():
    with zipfile.ZipFile(DOCX_PATH) as package:
        root = ET.fromstring(package.read("word/document.xml"))
    paragraphs = root.find("w:body", NS).findall("w:p", NS)
    for index in range(780, 821):
        paragraph = paragraphs[index]
        style = paragraph.find("w:pPr/w:pStyle", NS)
        style_value = style.get(f"{{{W}}}val") if style is not None else ""
        paragraph_properties = paragraph.find("w:pPr", NS)
        properties_xml = ET.tostring(paragraph_properties, encoding="unicode") if paragraph_properties is not None else ""
        print(
            f"{index}: text={text_of(paragraph)!r}; "
            f"page_before={has(paragraph, 'w:pPr/w:pageBreakBefore')}; "
            f"run_page_break={has(paragraph, './/w:br[@w:type=\"page\"]')}; "
            f"rendered_page_break={has(paragraph, './/w:lastRenderedPageBreak')}; "
            f"section_break={has(paragraph, 'w:pPr/w:sectPr')}; "
            f"keep_next={has(paragraph, 'w:pPr/w:keepNext')}; "
            f"drawing={has(paragraph, './/w:drawing')}; "
            f"style={style_value!r}; properties={properties_xml!r}"
        )


if __name__ == "__main__":
    main()

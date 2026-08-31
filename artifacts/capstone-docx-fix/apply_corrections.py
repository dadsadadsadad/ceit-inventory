import copy
import hashlib
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


SOURCE_HASH = "0d466da355a26c6007b9a7e38a4e2d320af89096a6af1f7ee211b05736108b74"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
XML = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W, "r": R, "a": A, "wp": WP, "rel": REL}

for prefix, namespace in NS.items():
    ET.register_namespace(prefix, namespace)


def qn(namespace, local):
    return f"{{{namespace}}}{local}"


def text_of(paragraph):
    return "".join(node.text or "" for node in paragraph.findall(".//w:t", NS))


def ensure_ppr(paragraph):
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = ET.Element(qn(W, "pPr"))
        paragraph.insert(0, ppr)
    return ppr


def first_rpr(paragraph):
    for run in paragraph.findall(".//w:r", NS):
        rpr = run.find("w:rPr", NS)
        if rpr is not None:
            return copy.deepcopy(rpr)
    return None


def ensure_rpr(run, template=None):
    rpr = run.find("w:rPr", NS)
    if rpr is None:
        rpr = copy.deepcopy(template) if template is not None else ET.Element(qn(W, "rPr"))
        run.insert(0, rpr)
    return rpr


def highlight_rpr(rpr):
    highlight = rpr.find("w:highlight", NS)
    if highlight is None:
        highlight = ET.Element(qn(W, "highlight"))
        rpr.append(highlight)
    highlight.set(qn(W, "val"), "yellow")


def set_run_color(rpr, value):
    color = rpr.find("w:color", NS)
    if color is None:
        color = ET.Element(qn(W, "color"))
        rpr.append(color)
    color.set(qn(W, "val"), value)


def make_run(text, style_source=None, highlighted=True):
    run = ET.Element(qn(W, "r"))
    template = first_rpr(style_source) if style_source is not None else None
    if template is not None or highlighted:
        rpr = ensure_rpr(run, template)
        if highlighted:
            highlight_rpr(rpr)
    text_element = ET.Element(qn(W, "t"))
    if text.startswith(" ") or text.endswith(" ") or "  " in text:
        text_element.set(qn(XML, "space"), "preserve")
    text_element.text = text
    run.append(text_element)
    return run


def replace_text(paragraph, text, style_source=None, highlighted=True):
    ppr = paragraph.find("w:pPr", NS)
    for child in list(paragraph):
        if child is not ppr:
            paragraph.remove(child)
    paragraph.append(make_run(text, style_source or paragraph, highlighted))


def clone_with_text(source, text, highlighted=True):
    cloned = copy.deepcopy(source)
    replace_text(cloned, text, source, highlighted)
    return cloned


def set_keep_with_next(paragraph):
    ppr = ensure_ppr(paragraph)
    if ppr.find("w:keepNext", NS) is None:
        ppr.append(ET.Element(qn(W, "keepNext")))


def set_page_break_before(paragraph):
    ppr = ensure_ppr(paragraph)
    if ppr.find("w:pageBreakBefore", NS) is None:
        ppr.append(ET.Element(qn(W, "pageBreakBefore")))


def set_paragraph_style(paragraph, style_id):
    ppr = ensure_ppr(paragraph)
    style = ppr.find("w:pStyle", NS)
    if style is None:
        style = ET.Element(qn(W, "pStyle"))
        ppr.insert(0, style)
    style.set(qn(W, "val"), style_id)


def force_color(paragraph, value):
    runs = paragraph.findall(".//w:r", NS)
    if not runs:
        return
    for run in runs:
        set_run_color(ensure_rpr(run), value)


def direct_body_paragraphs(body):
    return [element for element in body if element.tag == qn(W, "p")]


def remove_paragraph(body, paragraph):
    if paragraph in list(body):
        body.remove(paragraph)


def insert_after(body, anchor, paragraph):
    body.insert(list(body).index(anchor) + 1, paragraph)


def insert_before(body, anchor, paragraph):
    body.insert(list(body).index(anchor), paragraph)


def apply_fragment(paragraph, old, new):
    current = text_of(paragraph)
    if old not in current:
        raise ValueError(f"Expected text fragment was not found in paragraph: {old}")
    replace_text(paragraph, current.replace(old, new))


REPLACEMENTS = {
    0: "DESIGN AND DEVELOPMENT OF A QR CODE-BASED SMART INVENTORY AND ASSET TRACKING SYSTEM FOR COMPUTER LABORATORY EQUIPMENT IN THE CEIT DEPARTMENT",
    10: "For the Degree of Bachelor of Science in Information Technology",
    50: "The effective management of information technology (IT) equipment is an important part of maintaining an organized, secure, and productive educational environment. Computer laboratories contain numerous valuable assets, including computer units, monitors, keyboards, mice, headsets, networking devices, and other peripherals that are regularly used by students, faculty members, and laboratory personnel. As the number of equipment and users increases, maintaining accurate information regarding the location, condition, availability, borrowing history, and maintenance status of these assets becomes increasingly important. One technology that can support this process is the Quick Response (QR) code, a two-dimensional code that can be scanned using a mobile device or scanner to quickly retrieve stored information. In the present system, a QR code is assigned to each registered inventory record to provide easier identification, monitoring, and updating of asset records.",
    52: "Similar concerns can be observed in Philippine educational settings, where schools and higher education institutions increasingly depend on computers, networking equipment, and other ICT resources for teaching, learning, administration, and research. Maintaining accurate inventory records and using technology resources properly are important in educational institutions. As schools acquire and use more technology-based resources, there is a growing need for systems that can support the monitoring and management of these assets.",
    57: "In response to these concerns, this study proposes the Design and Development of a QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department. The system uses a QR code for each registered inventory record and a centralized digital platform to manage relevant asset information. Administrators and Staff can access and update inventory records, while Viewers can view records and reports. A person who opens a QR label can view limited item information and submit a borrowing or return request. Staff or Administrators review and confirm these requests. The system is intended to reduce dependence on manual spreadsheet-based monitoring while improving the accuracy, accessibility, efficiency, and accountability of laboratory asset management.",
    66: "Design and develop a QR code-based smart inventory and asset tracking system that can provide efficient equipment identification, centralized inventory records, recorded location changes and activity history, and timely updates of equipment information.",
    95: "Figure 1. Screenshot of the Existing Web-Based Laboratory Inventory Application (Rabiah et al., 2022).",
    104: "The system provides different functions for administrators, students, and laboratory technicians. It includes tool and component data, QR-code identification, equipment borrowing, item retrieval, and transaction recording. The tool data menu displays information about laboratory equipment and includes a QR code for identification. During borrowing, students provide their identification and the technician scans the QR code of the required equipment. The system records the borrowing transaction and can generate PDF reports.",
    107: "The system provides several advantages for laboratory inventory management. QR codes allow equipment to be identified quickly through scanning instead of manually searching inventory records.",
    108: "The web-based application centralizes equipment information, supports equipment borrowing, and records transactions automatically. The study reported that QR-code scanning displayed the matching equipment information in the web application.",
    112: "While the system provides QR-code-based inventory and borrowing functions, it focuses on equipment and tool borrowing within a Telecommunication Engineering laboratory. It also uses RFID to identify students during borrowing. Its features are therefore tailored to the laboratory processes of the researchers' institution. The study still supports the development of an inventory system designed for computer hardware, equipment details, recorded location, and condition in an academic department.",
    116: "The research shows that QR-code technology enhances the identification and tracking of laboratory equipment. However, the existing system was designed for Telecommunications Engineering laboratories and focuses on equipment lending and student identification through RFID. The proposed system focuses on computer hardware, equipment, and supplies in an academic department. It provides a centralized inventory database that can include computer specifications, installed software information, recorded location, status, and condition. It uses QR labels for rapid identification and can generate and print a label for each registered inventory record.",
    123: "Sermonia and Pabelona (2025) developed a cloud-based inventory system with Quick Response (QR) tagging for technology workshops. The study addressed traditional inventory practices where tools and equipment were counted and recorded manually in inventory forms. It aimed to manage equipment and user data, generate printed QR codes, scan equipment QR codes, monitor reports, and support a mobile application with Internet synchronization.",
    132: "Figure 2. Screenshot of the Cloud-Based Inventory System with QR Tagging (Sermonia & Pabelona, 2025).",
    138: "The system provides a web-based platform where authorized users can manage equipment information. The equipment page allows users to add and update item details, including name, brand, location, cost, and acquisition date. It also allows users to update status, view equipment history, and generate QR codes for equipment labels. The system can also generate inventory reports.",
    139: "The system also includes a mobile application that lets users view equipment and scan QR codes. When a QR code is scanned, the application displays the related equipment details. Users can record equipment use and submit reports. The mobile application can work offline after login and synchronizes data when an internet connection is available.",
    144: "The system offers several benefits for inventory management. It replaces manual methods with a cloud-based platform that stores information in one place. QR codes make equipment identification faster, while the system shows equipment history and current status. The mobile application can save data locally and synchronize it when an internet connection is available.",
    146: "The system provides inventory tracking and QR-tagging tools, but it was designed for hard-skills technology workshops, including Automotive, Machine Shop, Refrigeration and Air Conditioning, Electronics, and Electricity. The mobile application lets users view equipment, scan QR codes, and submit reports, while inventory management is performed through the web application by authorized users.",
    147: "The study supports the use of QR codes in equipment management. However, its features and covered equipment types were designed for technology workshops and do not fully match the requirements of a computer-related department.",
    151: "The study shows that cloud-based inventory management with QR tagging can improve the monitoring and identification of equipment. It includes equipment registration, QR-code generation and scanning, location management, status monitoring, equipment history, and report generation. These features are related to the objectives of the proposed system.",
    152: "However, the existing system was developed for technology workshops and covers equipment categories such as Automotive, Machine Shop, Refrigeration and Air Conditioning, Electronics, and Electricity. The proposed system focuses on computer laboratory equipment and supplies in one department. It can record computer specifications, hardware and software information, location, status, condition, and other relevant inventory details.",
    153: "Therefore, the study of Sermonia and Pabelona (2025) serves as a reference for the proposed system because it demonstrates the feasibility of QR tagging, cloud-based inventory management, equipment monitoring, and mobile QR-code scanning. The proposed system adapts these concepts to a web system that uses QR labels and can be accessed through a mobile browser.",
    161: "Sulistyo, Achmad, and Purnama (2022) developed an asset management and tracking system for Technical and Vocational Education and Training (TVET) institutions. The study was conducted at Politeknik Negeri Balikpapan and addressed the limitations of paper records and spreadsheets. The researchers developed a web and mobile system that used QR codes to identify movable and fixed assets. The system also used geolocation to record the position of movable assets.",
    163: "Figure 3. Screenshot of the Asset Management and Tracking System (Sulistyo et al., 2022).",
    169: "The study is useful because it provides a web-based asset-management application and an Android application connected to a database. The web application allows administrators to manage asset data, view asset history, and generate QR codes from asset identification numbers. The labels can be attached to physical assets. Through the Android application, administrators and students can scan a QR code to view an asset's specifications. The system also supports borrowing and returning assets through QR-code scanning.",
    175: "The system replaces paper-based and spreadsheet-based records with a cloud database. It uses QR codes for fast asset identification and allows administrators to generate and print QR labels. It records asset history and circulation so administrators can see who used an asset and when it was borrowed or returned. It also provides geolocation information for tracking movable assets.",
    176: "Another strength is that the system provides interfaces for different users. The web application is used to manage asset data and monitor circulation, while the Android application allows administrators and students to scan QR codes and view asset information. Both applications are connected to a database, which allows information to be shared between them.",
    178: "Despite its useful features, the study identifies several challenges in implementing the system.",
    179: "The system requires an Internet connection and suitable infrastructure. Low bandwidth may affect performance. The study also notes that staff and students may need training, supervision, and technical support because they are familiar with manual processes.",
    180: "The researchers also noted a limitation in the geolocation feature. Asset movement is recorded only when users scan the QR code at the required time. If a user does not scan the code, the movement may not be recorded correctly. The mobile application was also limited to Android smartphones during the study.",
    182: "The study shows that QR codes, cloud databases, mobile applications, and asset tracking can be used in educational institutions. It includes functions such as asset registration, QR-code generation and scanning, user history, and location data. These functions can guide the development of inventory systems for schools.",
    183: "However, this system was mainly developed for the Civil Engineering Department at Politeknik Negeri Balikpapan and for both fixed and movable TVET assets. The proposed system focuses on computer hardware, equipment, and supplies in an academic department. It can store computer specifications and other inventory details, record assigned locations, and use QR labels for identification. It does not use geolocation.",
    188: "Hortizuela (2019) developed Asset Guard, a multi-platform asset-management system that uses QR codes and geolocation to manage assets issued to employees. The study aimed to automate asset encoding, inventory management, report preparation, and location recording. It used the Extreme Programming model and QR codes to identify and track assets.",
    190: "Figure 4. Screenshot of the Asset Guard Asset Management System (Hortizuela, 2019).",
    192: "The system includes modules for managing organizational assets. The Encode Asset module allows users to enter asset details and record a location through OpenStreetMap. The Manage Asset module lets users update asset records, change an asset's status, delete records, and print QR codes. A printed QR label contains asset information and a code that can be scanned to retrieve more details.",
    196: "Asset Guard reduces the need for paper records by storing asset details digitally. It uses QR codes so a phone can identify an item and retrieve its information. It allows users to record whether equipment is working, needs repair, or should be retired. It can show an asset's recorded location on a map through OpenStreetMap and print inventory lists, card sheets, and receipts.",
    199: "Asset Guard provides asset-management functions for property issued to employees. It focuses on employee-issued property, inventory checks, and company-owned equipment. Users must scan and update information regularly to keep the records current.",
    203: "The Asset Guard study shows that QR codes can support a multi-platform asset-management system. It includes asset encoding, QR-code generation and scanning, status updates, location recording, inventory management, and report generation. These ideas can guide the development of inventory systems.",
    204: "The original system was mainly designed for managing assets issued to employees. The proposed system focuses on computer hardware, equipment, and supplies in a college department and can record equipment details, computer specifications, location, status, condition, and other relevant inventory information.",
    205: "The Asset Guard study provides a basis for QR-code identification, asset status monitoring, and digital inventory management. The proposed system adapts those ideas to computer hardware and equipment in a school setting without using geolocation.",
    275: "The existing conceptual framework describes the current inventory management process used by the College of Engineering and Information Technology (CEIT) Department for monitoring and managing computer laboratory equipment. Based on the existing inventory records, the department uses a spreadsheet-based manual inventory system to record information about its laboratory properties and defective equipment. The framework follows the Input-Process-Output (IPO) Model to illustrate how equipment information is collected, manually recorded and monitored, and converted into inventory and defective-item reports.",
    285: "The existing process allows the CEIT Department to maintain a record of its available properties and identify equipment that is defective or requires attention. However, because the process is primarily manual and spreadsheet-based, it may have limitations in immediate record updating, recording equipment movement, borrowing and return monitoring, and centralized maintenance monitoring.",
    288: "Figure 5. Input-Process-Output (IPO) Diagram of the Existing Inventory Process.",
    295: "The input phase of the study consists of the data, information, and requirements needed for the development of the proposed system. This includes information about the existing inventory practices of the CEIT Department and the equipment and supplies being managed, such as computer units, monitors, keyboards, mice, headsets, networking devices, cables, adapters, and other laboratory items. Data regarding asset tags, categories, locations, quantities, status, condition, computer specifications, installed software information, borrowing requests, and maintenance records are also considered.",
    300: "This is followed by the system design phase, where the overall structure, database, user interface, QR code functionality, inventory management features, and recorded asset activity are planned. The design includes equipment and supply registration, QR label generation and scanning, role-based account access, public borrowing and return requests with staff review, status and condition monitoring, maintenance tickets, activity history, and reports that can be viewed or exported.",
    301: "During the development phase, the planned system components and functionalities are implemented into a working system. QR codes are assigned to registered inventory records and may be printed as labels. The database stores asset information, computer details, software information, borrowing and return requests, maintenance tickets, audit events, and other relevant data.",
    304: "The output of the conceptual framework is a functional QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department. The system provides a centralized digital inventory. Administrators and Staff can manage records, while Viewers can view records and reports. A QR label opens a limited public item page for borrowing or return requests, and Staff or Administrators review and confirm these requests.",
    305: "The expected outputs include organized inventory records, QR labels, recorded locations, status and condition details, borrowing and return request history, maintenance tickets, activity history, and inventory overview reports with manual PDF or CSV export. The system does not provide GPS, RFID, or real-time physical location tracking. Ultimately, the system is expected to provide the CEIT Department with a more efficient, reliable, and organized approach to managing its computer laboratory equipment.",
    307: "Figure 6. Input-Process-Output (IPO) Diagram of the Developed System.",
    309: "This study seeks to answer the following questions:",
    310: "What challenges are encountered by the CEIT Department in managing computer laboratory equipment through the current manual and spreadsheet-based process, particularly in terms of:",
    311: "1.1. accuracy and updating of inventory records; 1.2. equipment identification and record retrieval; 1.3. borrowing and return monitoring; 1.4. equipment condition, status, and recorded location; and 1.5. maintenance and accountability of laboratory equipment?",
    313: "What functional and non-functional requirements are needed for the development of a QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department?",
    315: "How can the system be designed and developed to provide the following functions:",
    316: "3.1. equipment and supply registration and inventory management; 3.2. QR label generation and scanning; 3.3. borrowing and return-request management; 3.4. recorded location, status, condition, and availability monitoring; 3.5. maintenance-ticket management; 3.6. account access, role-based permissions, and activity history; and 3.7. inventory overview and exportable reports?",
    317: "How can the system be developed through the Software Development Life Cycle (SDLC) and Waterfall Model to address the identified inventory-management requirements of the CEIT Department?",
    319: "How can the developed system be evaluated in terms of:",
    320: "5.1. functionality; 5.2. usability; 5.3. efficiency; 5.4. reliability; and 5.5. asset accountability?",
    322: "To what extent can the developed system address the limitations of the existing manual and spreadsheet-based inventory process, particularly in reducing manual recording, searching, updating, and monitoring of computer laboratory equipment?",
    325: "The general objective of this study is to design and develop a QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department that provides centralized inventory records, QR labels, role-based access, borrowing and return-request management, maintenance tickets, activity history, and reports for computer laboratory equipment.",
    334: "Integrate essential system functionalities, including equipment and supply registration, QR label generation and scanning, borrowing and return requests with staff confirmation, recorded status, condition, and location, maintenance tickets, role-based account access, activity history, and inventory reports that can be viewed or exported.",
    351: "Students may indirectly benefit from better-managed and properly maintained computer laboratory equipment. Improved monitoring and timely identification of defective or unavailable equipment may contribute to a more organized laboratory environment and help ensure that necessary resources are available for academic activities. Students may also open a QR label to view limited item information and submit a borrowing or return request, subject to staff confirmation.",
    378: "The study covers the inventory items managed by the CEIT Department, including equipment and supplies such as computer units, monitors, keyboards, mice, headsets, networking devices, cables, adapters, and other relevant laboratory items. The system maintains asset tag, item description, item type, category, location, quantity, status, condition, manufacturer, model, serial number, purchase date, optional purchase price, notes, and other inventory details. For items marked as computers, it may also store hardware specifications, operating-system details, installed software and license details, the last date checked, and attached item photos.",
    379: "The system uses a unique QR code for each registered inventory record. Logged-in users can generate and print QR labels. A signed-in Administrator or Staff member can use a phone camera to open and update a record, while any person who opens a valid label link can view limited item information and submit a borrowing or return request. The system includes inventory registration, QR labels, request review, status, condition, and location records, maintenance tickets, account roles, activity history, search and filtering, and reports.",
    384: "The dashboard is intended for authenticated CEIT users. It does not provide public access to full inventory records or account functions. However, a person who opens a valid QR-label link may view limited item information and submit a borrowing or return request. Staff or Administrators review and confirm the request.",
    385: "The study focuses on equipment identification, inventory recording, recorded item location, borrowing and return-request monitoring, condition and status monitoring, maintenance documentation, user accountability, and report generation. It does not include automated physical tracking technologies such as GPS, RFID, Bluetooth-based tracking, or real-time location tracking. QR codes are used for item identification. A public QR scan displays limited item information, while signed-in Staff or Administrators can open the full record based on their permissions.",
    386: "Although the system can record installed software and license details for designated computer items, it does not automatically detect unauthorized software, games, or other applications. The system is limited to recording and monitoring equipment and software information rather than performing automated computer-system auditing or software detection.",
    387: "The system does not include automated repair of defective equipment, procurement of replacement equipment, depreciation computation, or automated purchasing processes. It may store purchase price as optional reference information and show a total recorded acquisition value. It does not perform financial accounting. Maintenance functionality is limited to recording and monitoring maintenance-related information.",
    396: "This section presents the important terms used in the study \"Design and Development of a QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department.\" The terms are defined according to their operational meaning within the study or their contextual meaning based on their accepted use in information technology, inventory management, and software development.",
    398: "Refers to a registered inventory item classified as an asset. The system also supports supply items, which are stored in the same inventory register but cannot be borrowed through a QR request.",
    400: "Refers to the recording of the Staff or Administrator associated with inventory actions and the borrower details recorded in borrowing and return requests.",
    402: "Refers to the recording of the current or assigned location of computer laboratory equipment within the CEIT Department.",
    404: "Refers to the recording and review of an inventory item's identification, assigned location, status, condition, changes, and usage history through the system. It does not refer to GPS or real-time physical tracking.",
    405: "Availability.",
    406: "Refers to whether an asset may be requested through the QR page. It depends on the item type, active category and location, status, quantity, and pending borrowing requests.",
    407: "Borrowing and Return Requests.",
    408: "Refers to requests submitted through a scanned QR label to borrow an asset or indicate that borrowed equipment is being returned. A Staff member or Administrator approves or declines a borrowing request and confirms a return before the item quantity is restored.",
    412: "Refers to the physical or operational state of a laboratory item recorded in the system. The available condition values are Excellent, Good, Fair, Poor, and For Repair.",
    416: "Refers to the organized digital storage of inventory, user, request, location, condition, maintenance, and activity information in the PostgreSQL database used by the system.",
    424: "Refers to the system's current inventory overview and manually generated exports. The system can provide an overview PDF and applicable CSV files for inventory, borrowing history, and maintenance service requests.",
    426: "Refers to a service request recorded for inspection, repair, replacement, or other corrective action. A ticket can be open or resolved and includes priority, assigned Staff member, and resolution notes. Resolving a ticket does not automatically change the inventory item status.",
    428: "Refers to a two-dimensional machine-readable code assigned to a registered inventory record. When scanned, it opens the corresponding item information in the system.",
    430: "Refers to opening a QR label using a camera-enabled device or scanner. A public scan shows limited item information and can accept a borrowing or return request. A signed-in Staff member or Administrator can open the full system record based on their permissions.",
    432: "Refers to the digital system that combines centralized equipment and supply management, QR labels, borrowing and return requests, status and condition monitoring, maintenance tickets, activity history, and reporting for CEIT computer laboratory equipment.",
    436: "Refers to the current inventory state of an item as recorded in the system. The available status values are OK, Working, Deployed, Defective, Not Tested, Retired, and Lost. Borrowing availability is determined separately from item type, quantity, status, active category and location, and pending borrowing requests.",
    438: "Refers to the system-supported activity history that records the account associated with inventory actions and the borrower details associated with borrowing and return requests.",
    470: "The study will use the Software Development Life Cycle (SDLC) through the Waterfall Model as the development approach. The development process will consist of requirements analysis, system design, development, testing, deployment, and maintenance. The system includes equipment and supply registration, QR label generation and scanning, centralized inventory records, borrowing and return requests with staff review, status and condition tracking, maintenance tickets, role-based account access, activity history, and inventory reports.",
    505: "Finally, the analyzed data will serve as the basis for the requirements analysis and system design of the proposed system. The identified requirements will guide the development of features such as equipment and supply registration, QR label generation and scanning, borrowing and return-request management, status and condition tracking, recorded location changes, maintenance tickets, role-based account access, activity history, and inventory reports. The gathered data will also serve as a basis for evaluating whether the developed system effectively addresses the limitations of the existing inventory management process in the CEIT Department.",
    519: "The requirements will include equipment and supply registration, QR label generation and scanning, inventory management, borrowing and return-request management, status and condition tracking, recorded location information, maintenance-ticket management, role-based account access, activity history, and inventory reports.",
    525: "The implementation will include equipment and supply registration, QR label generation and scanning, inventory record management, borrowing and return requests, status and condition monitoring, recorded location changes, maintenance tickets, user management, activity history, and inventory reporting. The developed components will be integrated to ensure that the system operates as one inventory and asset-record management platform.",
    555: "Developed System",
    556: "The developed QR Code-Based Smart Inventory and Asset Tracking System for Computer Laboratory Equipment in the CEIT Department improves the existing inventory management process by providing a centralized digital platform for recording, identifying, monitoring, and managing computer laboratory equipment.",
    557: "Each registered inventory record is assigned a unique QR code that corresponds to its digital record. A person who opens a label can view limited item information and submit a borrowing or return request. A signed-in Administrator or Staff member can use the scanning feature to open and update the full record based on their permissions.",
    559: "Register and manage equipment and supplies;",
    561: "Generate and print a unique QR label for each registered inventory record;",
    563: "Open QR labels to view limited item information and submit borrowing or return requests;",
    565: "Allow Administrators and Staff to update inventory information, including status, condition, location, quantity, photos, and computer details;",
    567: "Record location changes and item activity history;",
    569: "Review borrowing requests, approve or decline them, and confirm returns;",
    571: "Monitor item status, condition, quantity, and borrowing availability;",
    573: "Create, assign, and resolve maintenance tickets;",
    575: "Allow Administrators to manage user accounts and roles, and allow every signed-in user to update their own account;",
    577: "Search, filter, sort, and import inventory records from CSV or Excel files;",
    579: "View an inventory overview and manually export the available reports as PDF or CSV files; and",
    581: "Maintain organized and centralized equipment and supply records, including computer hardware, software, and license details when applicable.",
    586: "The system shall allow authorized users to log in using either a registered email address or username and a password.",
    590: "The system shall support the following user roles: Administrator, Staff, and Viewer.",
    592: "The system shall restrict functions according to the assigned role. Administrators can manage accounts, locations, categories, and inventory records. Staff can manage inventory, borrowing, and maintenance. Viewers can view inventory and reports and update only their own account details; they cannot change inventory records or access the Users page.",
    594: "The system shall allow Administrators and Staff to add new inventory items.",
    596: "The system shall allow Administrators and Staff to edit and update equipment information.",
    598: "The system shall allow Administrators and Staff to remove records from active inventory by marking them Retired. Only an Administrator may permanently delete a record when it has no linked history that must be preserved.",
    600: "The system shall record item name, asset tag, description, item type, category, location, quantity, status, condition, manufacturer, model, serial number, purchase date, optional purchase price, notes, and applicable computer details.",
    602: "The system shall generate a unique QR code for each registered inventory record.",
    606: "The system shall allow signed-in users to view and print QR labels for equipment identification.",
    608: "The system shall allow a person to open a QR label using a compatible camera-enabled device. The public scan page shall show limited item information and allow a borrowing or return request. Signed-in Staff or Administrators may use the scan feature to open and update the full record.",
    610: "For a signed-in Staff member or Administrator, the system shall open the corresponding inventory record after a successful scan.",
    612: "The public scan page shall display only the item name, category, location, asset tag, status, and condition.",
    614: "The system shall allow signed-in Administrators and Staff to update applicable equipment information through the retrieved record. Viewers cannot modify inventory records.",
    616: "The system shall maintain centralized records for laboratory equipment and supplies, including applicable computer, software, photo, request, maintenance, and activity information.",
    618: "The system shall allow Administrators and Staff to update the current status of equipment.",
    620: "The system shall record assigned equipment location information and location changes. It shall not determine an item's physical location automatically.",
    622: "The system shall show borrowing availability from the item type, active category and location, item status, quantity, and pending borrowing requests.",
    624: "The system shall maintain activity history for record creation and updates, location changes, scans, imports, borrowing and return workflow updates, maintenance updates, and item-photo changes.",
    625: "6. Borrowing and Return-Request Management",
    626: "The system shall let a person submit a borrowing request from a QR label and let a signed-in Administrator or Staff member approve or decline it.",
    628: "The system shall record the borrower name, student number, contact number, purpose, requested quantity, expected return date, request status, and relevant processing information.",
    630: "The system shall let a borrower submit a return request from a QR label and let a signed-in Administrator or Staff member confirm the return.",
    632: "When a borrowing request is approved, the system shall decrease the item quantity. When a return is confirmed, it shall restore the quantity. A borrowing request has its own status and does not change the item status to Borrowed.",
    634: "The system shall maintain a history of borrowing and return requests.",
    636: "The system shall allow Administrators and Staff to record the current condition of equipment.",
    638: "The system shall allow Administrators and Staff to identify equipment requiring inspection or maintenance through maintenance tickets.",
    640: "The system shall record maintenance, repair, and inspection information as service requests with priority, assigned Staff member, status, and resolution notes.",
    642: "The system shall maintain the maintenance service-request history of equipment.",
    644: "The system shall allow Administrators and Staff to update an item's status separately after maintenance or repair. Resolving a maintenance ticket alone shall not automatically change the item status.",
    646: "The system shall allow signed-in users to search for inventory items.",
    648: "The system shall allow users to filter equipment by category, item type, status, condition, and location.",
    650: "The system shall support search by item name, asset tag, serial number, manufacturer, model, category, and location to help users retrieve equipment information faster.",
    652: "The system shall provide a live inventory overview with record, status, category, and location summaries and a downloadable overview PDF.",
    654: "The system shall allow all signed-in users to export the inventory register as a CSV file.",
    656: "The system shall allow Administrators and Staff to export borrowing history as a CSV file.",
    658: "The system shall allow Administrators and Staff to export maintenance service requests as a CSV file.",
    660: "The system shall provide manual PDF or CSV export options for the supported reports. It shall not schedule or automatically send reports.",
    685: "The system shall protect user accounts through email-or-username sign-in, hashed passwords, secure session cookies, and a temporary lock after repeated failed sign-in attempts.",
    687: "The system shall implement role-based access control for Administrator, Staff, and Viewer accounts.",
    689: "The system shall restrict full inventory and user-information access to signed-in users. Public QR pages shall show only limited item information and shall validate and rate-limit borrowing and return requests.",
    691: "The system shall restrict modifications and permanent deletion of stored data according to the assigned role and record history.",
    706: "System Architecture",
    707: "The system uses a web application architecture rather than a strict Model-View-Controller implementation. Users access the system through a web browser or phone browser. The Next.js application provides React-based pages, server actions, and route handlers for authentication, inventory management, QR scanning, borrowing and return requests, maintenance, and reports. Prisma connects the application to a PostgreSQL database. This separation keeps the user interface, application logic, and stored data organized.",
    708: "Data Layer",
    709: "The data layer uses a PostgreSQL database accessed through Prisma. It stores the information needed by the system and keeps related records connected.",
    710: "The data layer includes:",
    711: "User accounts, usernames, roles, account status, and sessions;",
    713: "Categories and locations;",
    715: "Inventory items classified as assets or supplies;",
    717: "QR codes, printed labels, and activity history;",
    719: "Computer hardware details, installed software, license details, and item photos;",
    721: "Item quantity, status, condition, location, purchase information, and notes;",
    723: "Borrowing and return requests;",
    725: "Maintenance service requests;",
    727: "Public-request rate-limit records; and",
    729: "Dashboard notes and information used for reports.",
    731: "The database stores the information used to prepare the inventory overview and manual exports.",
    732: "Prisma provides controlled database operations, while the application validates inputs and permissions before stored information is changed.",
    733: "Presentation Layer",
    734: "The presentation layer consists of React components and Next.js pages. It provides the screens through which public requesters and signed-in users interact with the application.",
    735: "The presentation layer provides:",
    736: "Login, account-settings, and dashboard pages;",
    738: "Inventory lists, filters, item records, and item-editing forms;",
    740: "QR-label printing and a phone-camera scanning page;",
    742: "A limited public QR item page with borrowing and return-request forms;",
    744: "Borrowing, maintenance, and activity-history pages for authorized users;",
    746: "Computer hardware, software, license, and photo-record interfaces;",
    748: "Report summaries and manual export controls;",
    750: "Administrator-only user, category, and location management pages; and",
    752: "Feedback messages for completed or unsuccessful actions.",
    754: "The interface is designed to work in supported modern desktop and mobile browsers.",
    759: "Application Logic and Access Control",
    760: "The application logic is handled by Next.js server actions and route handlers. It receives requests, validates inputs, checks permissions, applies the required workflow, and reads or updates PostgreSQL data through Prisma.",
    761: "The application logic is responsible for:",
    762: "Processing email-or-username sign-in and account updates;",
    764: "Validating user inputs and preventing unauthorized actions;",
    766: "Enforcing Administrator, Staff, and Viewer permissions;",
    768: "Processing inventory registration, updates, retirement, deletion rules, imports, and photos;",
    770: "Generating QR labels and processing signed-in scan activity;",
    772: "Receiving public borrowing and return requests and allowing Staff or Administrators to process them;",
    774: "Recording item status, condition, quantity, and location changes;",
    776: "Creating, assigning, and resolving maintenance service requests;",
    778: "Recording activity history and retrieving inventory information;",
    780: "Processing search, filters, reports, and manual exports;",
    782: "Protecting public requests with validation and rate limits; and",
    784: "Handling errors and feedback for unsuccessful operations.",
    785: "Through these layers, the system manages laboratory inventory data, QR labels, public borrowing and return requests, maintenance records, account access, and reports without claiming GPS or real-time physical tracking.",
    798: "System Diagrams",
    802: "Figure 7. Use Case Diagram of the CEIT Inventory System.",
    803: "System Architecture Diagram",
    808: "Figure 8. System Architecture Diagram of the CEIT Inventory System.",
    809: "Entity-Relationship Diagram",
    811: "Figure 9. Entity-Relationship Diagram of the CEIT Inventory Database.",
    819: "Figure 10. Data Flow Diagram of the CEIT Inventory System.",
}


TOC_ITEMS = [
    "CHAPTER 1: INTRODUCTION",
    "Background of the Study",
    "Statement of the Problem",
    "Review of Related Literature",
    "Theoretical Framework",
    "Conceptual Framework",
    "Research Questions",
    "Research Objectives",
    "Significance of the Study",
    "Scope and Delimitations",
    "Definition of Terms",
    "CHAPTER 2: METHODS",
    "Research Design",
    "Research Instruments",
    "Data Gathering",
    "Research Development",
    "Current System",
    "Developed System",
    "Functional Requirements",
    "Non-Functional Requirements",
    "System Architecture",
    "System Diagrams",
    "References",
]

TOC_PAGES = [
    3, 3, 6, 8, 16, 20, 26, 30, 33, 35, 38,
    44, 44, 45, 47, 49, 53, 54, 56, 62, 65, 71, 75,
]


REFERENCES = [
    "Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly, 13(3), 319-340. https://doi.org/10.2307/249008",
    "Hortizuela, M. R. (2019). Asset Guard: A multi-platform asset management system using QR code and geolocation. DMMMSU Research and Extension Journal, 3, 29-48. https://doi.org/10.62960/dmmmsu.v3i.18",
    "Ohno, T. (1988). Toyota production system: Beyond large-scale production. Productivity Press.",
    "Rabiah, N. N., Lindawati, & Sarjana. (2022). Web-based laboratory inventory application using QR code and RFID in telecommunication engineering laboratories/workshops. Sinkron: Jurnal dan Penelitian Teknik Informatika, 6(4), 2248-2261. https://doi.org/10.33395/sinkron.v7i4.11624",
    "Sermonia, C. J. G., & Pabelona, R. M., Jr. (2025). Cloud-based inventory system with Quick Response (QR) tagging for technology workshop. International Journal of Research and Scientific Innovation, 12(1), 803-822. https://doi.org/10.51244/IJRSI.2025.12010071",
    "Sulistyo, T., Achmad, K., & Purnama, I. B. I. (2022). The asset management and tracking system for technical and vocational education and training (TVET) institution based on ubiquitous computing. ComTech: Computer, Mathematics and Engineering Applications, 13(1), 23-34. https://doi.org/10.21512/comtech.v13i1.7342",
    "von Bertalanffy, L. (1968). General system theory: Foundations, development, applications. George Braziller.",
]


def main(source_path, output_path):
    source = Path(source_path)
    output = Path(output_path)
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_HASH:
        raise RuntimeError("The source DOCX no longer matches the inspected baseline. Stop and re-audit before editing.")

    with zipfile.ZipFile(source) as zin:
        document_root = ET.fromstring(zin.read("word/document.xml"))
        relationships_root = ET.fromstring(zin.read("word/_rels/document.xml.rels"))

        body = document_root.find("w:body", NS)
        if body is None:
            raise RuntimeError("Document body was not found.")
        paragraphs = direct_body_paragraphs(body)
        if len(paragraphs) != 824:
            raise RuntimeError(f"Expected 824 body paragraphs, found {len(paragraphs)}.")

        for index, replacement in REPLACEMENTS.items():
            replace_text(paragraphs[index], replacement)

        apply_fragment(paragraphs[58], "track asset movement", "record changes in item location and activity history")
        apply_fragment(paragraphs[242], "check-in and check-out tracking", "borrowing-request and return-request management")
        apply_fragment(paragraphs[345], "track equipment movement", "record changes in equipment location and activity history")
        apply_fragment(paragraphs[380], "borrowing and return transactions", "borrowing and return requests")
        apply_fragment(paragraphs[380], "maintenance records, and other", "maintenance records, audit events, and other")
        apply_fragment(paragraphs[528], "check-in and check-out transactions", "borrowing and return-request management")
        apply_fragment(paragraphs[528], "maintenance records, user accountability, and report generation", "maintenance records, account access, activity history, and report generation")
        replace_text(paragraphs[582], "Through these functions, the developed system reduces dependence on manual spreadsheet-based inventory management, minimizes recording errors, improves access to inventory information, strengthens equipment accountability, and supports record review, borrowing management, and maintenance of computer laboratory equipment.")

        # Required headings and visual flow corrections.
        replace_text(paragraphs[88], text_of(paragraphs[88]))
        force_color(paragraphs[88], "000000")
        for index in [45, 46, 48, 88, 132, 287, 306, 375, 376, 460, 462, 464, 466, 482, 798, 800, 801, 803, 806, 809, 810, 815, 817]:
            set_keep_with_next(paragraphs[index])
        for index in [45, 460]:
            set_page_break_before(paragraphs[index])

        # Replace the blank TOC slots with highlighted static entries verified in Word pagination QA.
        for index, label, page in zip(range(22, 45), TOC_ITEMS, TOC_PAGES):
            replace_text(paragraphs[index], f"{label} ................................................ {page}", style_source=paragraphs[48])

        # Introduce missing definitions while retaining the source layout style.
        account_label = clone_with_text(paragraphs[397], "Account Settings.")
        account_definition = clone_with_text(paragraphs[398], "Refers to the page where every signed-in user can update their own email address, username, and password after confirming the current password.")
        administrator_label = clone_with_text(paragraphs[397], "Administrator.")
        administrator_definition = clone_with_text(paragraphs[398], "Refers to the system role that can manage user accounts, roles, categories, locations, inventory records, borrowing and return processing, maintenance, and reports.")
        for new_paragraph in [account_label, account_definition, administrator_label, administrator_definition]:
            insert_before(body, paragraphs[397], new_paragraph)

        inventory_record_label = clone_with_text(paragraphs[419], "Inventory Record.")
        inventory_record_definition = clone_with_text(paragraphs[420], "Refers to the stored entry for an asset or supply item. An inventory record can have a quantity greater than one and receives one unique QR code.")
        insert_after(body, paragraphs[420], inventory_record_label)
        insert_after(body, inventory_record_label, inventory_record_definition)

        staff_label = clone_with_text(paragraphs[431], "Staff.")
        staff_definition = clone_with_text(paragraphs[432], "Refers to the system role that can manage inventory records, QR labels, borrowing and return processing, maintenance tickets, and reports. Staff cannot access the Users page or manage other accounts.")
        insert_after(body, paragraphs[432], staff_label)
        insert_after(body, staff_label, staff_definition)

        viewer_label = clone_with_text(paragraphs[437], "Viewer.")
        viewer_definition = clone_with_text(paragraphs[438], "Refers to the system role that can access permitted read-only inventory and report pages and update only their own account settings. A Viewer cannot modify inventory records or access the Users page.")
        insert_after(body, paragraphs[438], viewer_label)
        insert_after(body, viewer_label, viewer_definition)

        # Populate the new diagram slots and references, then maintain page boundaries.
        replace_text(paragraphs[820], "References", style_source=paragraphs[798])
        set_paragraph_style(paragraphs[820], "Heading1")
        force_color(paragraphs[820], "000000")
        set_page_break_before(paragraphs[820])
        for paragraph, reference in zip([paragraphs[821], paragraphs[822], paragraphs[823]], REFERENCES[:3]):
            replace_text(paragraph, reference, style_source=paragraphs[342])
        previous = paragraphs[823]
        for reference in REFERENCES[3:]:
            new_reference = clone_with_text(paragraphs[342], reference)
            insert_after(body, previous, new_reference)
            previous = new_reference

        # Add an ERD image by cloning the existing DFD drawing footprint and giving it a new relationship.
        existing_ids = []
        for relation in relationships_root.findall("rel:Relationship", NS):
            match = re.fullmatch(r"rId(\d+)", relation.get("Id", ""))
            if match:
                existing_ids.append(int(match.group(1)))
        erd_rel_id = f"rId{max(existing_ids, default=0) + 1}"
        ET.SubElement(relationships_root, qn(REL, "Relationship"), {
            "Id": erd_rel_id,
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
            "Target": "media/image12.png",
        })
        erd_paragraph = copy.deepcopy(paragraphs[817])
        for blip in erd_paragraph.findall(".//a:blip", NS):
            blip.set(qn(R, "embed"), erd_rel_id)
        docpr_ids = [int(node.get("id")) for node in document_root.findall(".//wp:docPr", NS) if (node.get("id") or "").isdigit()]
        for docpr in erd_paragraph.findall(".//wp:docPr", NS):
            docpr.set("id", str(max(docpr_ids, default=0) + 1))
            docpr.set("name", "Entity-Relationship Diagram")
        position = list(body).index(paragraphs[810])
        body.remove(paragraphs[810])
        body.insert(position, erd_paragraph)

        # Remove only the documented dead space and unverified study section.
        remove_indices = set(range(207, 230))
        remove_indices.update([47, 49, 89, 133, 134, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374])
        remove_indices.update(range(441, 460))
        remove_indices.update([461, 463, 465, 467])
        remove_indices.update(range(473, 482))
        remove_indices.update([756, 758, 799, 812, 813, 814, 816])
        remove_indices.update(range(786, 798))
        for index in sorted(remove_indices, reverse=True):
            remove_paragraph(body, paragraphs[index])

        media_replacements = {
            "word/media/image3.png": ROOT_MEDIA / "image3.png",
            "word/media/image4.png": ROOT_MEDIA / "image4.png",
            "word/media/image5.png": ROOT_MEDIA / "image5.png",
            "word/media/image11.png": ROOT_MEDIA / "image11.png",
        }
        document_xml = ET.tostring(document_root, encoding="utf-8", xml_declaration=True)
        rels_xml = ET.tostring(relationships_root, encoding="utf-8", xml_declaration=True)
        output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                if info.filename == "word/document.xml":
                    zout.writestr(info, document_xml)
                elif info.filename == "word/_rels/document.xml.rels":
                    zout.writestr(info, rels_xml)
                elif info.filename in media_replacements:
                    zout.writestr(info, media_replacements[info.filename].read_bytes())
                else:
                    zout.writestr(info, zin.read(info.filename))
            erd_info = zipfile.ZipInfo("word/media/image12.png")
            erd_info.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(erd_info, (ROOT_MEDIA / "image12.png").read_bytes())


ROOT_MEDIA = Path(__file__).resolve().parent / "updated-media"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: apply_corrections.py SOURCE.docx OUTPUT.docx")
    main(sys.argv[1], sys.argv[2])

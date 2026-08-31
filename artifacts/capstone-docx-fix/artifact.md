# Capstone correction contract

- Reference: `C:\Users\rafae\Downloads\Capstone_ DESIGN AND DEVELOPMENT OF A QR CODE BASED SMART INVENTORY AND ASSET TRACKING SYSTEM FOR COMPUTER LABORATORY EQUIPMENT IN CEIT DEPARTMENT.docx`
- Reference SHA-256: `0d466da355a26c6007b9a7e38a4e2d320af89096a6af1f7ee211b05736108b74`
- Baseline: 73 A4 pages in Word, one document section, ten PNG figures, no tables, comments, or tracked changes.
- Output: a separate review copy, never the supplied source document.

## Fidelity rules

- Preserve all source package parts unless a listed paragraph, added table-of-contents slot, or corrected diagram requires a change.
- Keep the cover, authors, institutional styling, existing verified literature review, chapter order, and all unlisted body paragraphs unchanged.
- Do not invent research results, respondents, sampling, test scores, evaluation findings, or later thesis chapters.
- Mark every changed or added text paragraph with Word yellow highlighting.
- Replace corrected diagrams with the same source footprint, a yellow review outline, and a highlighted caption.

## Editable slots

- Cover correction: paragraphs 0 and 10.
- TOC: use the otherwise blank paragraphs 22–44.
- System-alignment text: only the audited paragraph indices in the task-local correction script.
- Literature section: formalize verified studies; remove the unverified Austin (2025) block rather than claim it as a source.
- Figures: replace the proposed IPO, use-case, architecture, and data-flow diagrams; add the missing ERD in the blank slot after architecture.
- Captions and localized whitespace: keep captions with their figures, correct captions, remove only identified blank-paragraph runs, and preserve chapter transitions.

## QA gates

- Verify the source SHA-256 before patching.
- Validate the DOCX package, preserve relationship targets, and inspect the final Word-rendered PDF page by page.
- Verify that every modified paragraph carries Word yellow highlighting and every replacement diagram has a yellow outer border.

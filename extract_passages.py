"""Extract FPGEE review pages and write generation packs. Does not copy the PDF."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf

PDF = Path(r"c:\Users\Joey\Downloads\pharmacy_book.pdf")
OUT_DIR = Path(__file__).resolve().parent
EXTRACT = OUT_DIR / "_extract.json"
PACK_DIR = OUT_DIR / "_packs"

TOC_CHAPTERS = [
    (18, "Study Guide for the FPGEE"),
    (29, "Anatomy and Physiology"),
    (60, "Biochemistry"),
    (95, "Microbiology Related to Human Disease"),
    (121, "Immunology"),
    (149, "Medicinal Chemistry"),
    (187, "Pharmacology"),
    (215, "Pharmacognosy and Dietary Supplements"),
    (245, "Pharmaceutics and Biopharmaceutics"),
    (282, "Clinical Pharmacokinetics"),
    (308, "Clinical Pharmacogenetics and Pharmacogenomics"),
    (336, "Extemporaneous Compounding and Parenteral and Enteral Products"),
    (355, "Fundamentals of Pharmacy Practice"),
    (373, "Health Care Delivery Systems"),
    (389, "Population-Based Care and Pharmacoepidemiology"),
    (400, "Economic and Humanistic Outcomes of Health Care Delivery"),
    (422, "Pharmacy Practice Management"),
    (436, "Pharmacy Law and Regulatory Affairs"),
    (466, "Biostatistics"),
    (489, "Clinical Trial Design"),
    (508, "Ethics in Health Care Practice"),
    (531, "Professional Communications"),
    (550, "Social and Behavioral Aspects of Pharmacy Practice"),
    (576, "Medication Dispensing and Distribution Systems"),
    (606, "Evidence-Based Practice"),
    (631, "Clinical Pathophysiology"),
    (654, "Health Promotion, Disease Prevention, and Population Health"),
    (683, "Patient Assessment"),
    (706, "Clinical Pharmacology and Therapeutic Decision Making"),
    (736, "Toxicology"),
]

# Skip front matter / area divider pages. Study guide is thin; start at anatomy.
CONTENT_START_PDF = 29


def chapter_for_pdf_page(pdf_page: int) -> str:
    name = "Front matter"
    for start, title in TOC_CHAPTERS:
        if pdf_page >= start:
            name = title
        else:
            break
    return name


def printed_page_from_text(text: str, pdf_page: int) -> int:
    m = re.match(r"\s*(\d{1,3})\b", text)
    if m:
        n = int(m.group(1))
        if abs(n - (pdf_page - 1)) <= 2:
            return n
    return pdf_page - 1 if pdf_page > 1 else 1


def clean_text(text: str) -> str:
    text = text.replace("\u2002", " ").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def is_content_page(text: str) -> bool:
    if len(text) < 280:
        return False
    lower = text.lower()
    if "this page intentionally" in lower:
        return False
    return True


def passages_from_page(text: str, max_len: int = 1100) -> list[str]:
    text = text.strip()
    if len(text) < 200:
        return []
    chunks: list[str] = []
    i = 0
    while i < len(text) and len(chunks) < 3:
        chunk = text[i : i + max_len].strip()
        if len(chunk) < 220:
            break
        chunks.append(chunk)
        i += max_len
    return chunks


def main() -> None:
    doc = pymupdf.open(PDF)
    pages = []
    for i in range(doc.page_count):
        raw = doc.load_page(i).get_text()
        text = clean_text(raw)
        pdf_page = i + 1
        pages.append(
            {
                "pdfPage": pdf_page,
                "page": printed_page_from_text(raw, pdf_page),
                "chapter": chapter_for_pdf_page(pdf_page),
                "text": text,
                "chars": len(text),
            }
        )

    EXTRACT.write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")

    content = [
        p
        for p in pages
        if p["pdfPage"] >= CONTENT_START_PDF and is_content_page(p["text"])
    ]

    # Allocate ~1000 passages proportional to chapter length, min 12 each.
    by_ch: dict[str, list] = {}
    for p in content:
        by_ch.setdefault(p["chapter"], []).append(p)

    chapters = [c for c in by_ch if c != "Front matter" and c != "Study Guide for the FPGEE"]
    weights = {c: sum(p["chars"] for p in by_ch[c]) for c in chapters}
    total_w = sum(weights.values()) or 1
    alloc = {c: max(12, round(1000 * weights[c] / total_w)) for c in chapters}
    # Nudge to exactly 1000
    while sum(alloc.values()) > 1000:
        k = max(alloc, key=alloc.get)
        if alloc[k] > 12:
            alloc[k] -= 1
        else:
            break
    while sum(alloc.values()) < 1000:
        k = max(alloc, key=lambda c: weights[c] / alloc[c])
        alloc[k] += 1

    selected = []
    pid = 1
    used_quotes: set[str] = set()

    def add_passage(p: dict, pas: str) -> bool:
        nonlocal pid
        key = re.sub(r"\W+", " ", pas[:120].lower()).strip()
        if len(key) < 24 or key in used_quotes:
            return False
        used_quotes.add(key)
        selected.append(
            {
                "packId": f"p{pid:04d}",
                "pdfPage": p["pdfPage"],
                "page": p["page"],
                "chapter": p["chapter"],
                "text": pas[:1600],
            }
        )
        pid += 1
        return True

    # First pass: one distinct passage per content page.
    for p in content:
        if p["chapter"] not in chapters:
            continue
        for pas in passages_from_page(p["text"], 1200):
            if add_passage(p, pas):
                break

    # Second pass: extra passages from the longest pages until 1000.
    long_pages = sorted(content, key=lambda x: x["chars"], reverse=True)
    for p in long_pages:
        if len(selected) >= 1000:
            break
        if p["chapter"] not in chapters:
            continue
        for pas in passages_from_page(p["text"], 800):
            if len(selected) >= 1000:
                break
            add_passage(p, pas)

    selected = selected[:1000]
    PACK_DIR.mkdir(exist_ok=True)
    # 10 packs of 100
    for i in range(10):
        chunk = selected[i * 100 : (i + 1) * 100]
        (PACK_DIR / f"pack_{i:02d}.json").write_text(
            json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    from collections import Counter

    counts = Counter(x["chapter"] for x in selected)
    summary = {
        "pages": len(pages),
        "contentPages": len(content),
        "passages": len(selected),
        "perChapter": dict(counts),
        "uniquePdfPages": len({x["pdfPage"] for x in selected}),
    }
    (PACK_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

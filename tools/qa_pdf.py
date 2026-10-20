#!/usr/bin/env python3
"""Reproducible, private QA for user-supplied raster comic PDFs.

Requires: pip install pymupdf opencv-python-headless numpy pytesseract
          Tesseract system package + por and eng traineddata.
Only numerical aggregate statistics are saved. Do not upload comic pages or OCR text.
This is a baseline diagnostic, NOT semantic balloon precision/recall.
"""
import argparse
import json
import time
from pathlib import Path
import fitz
import cv2
import numpy as np


def render(page, width):
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).copy()


def bright_regions(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    mask = cv2.inRange(hsv, np.array([0, 0, 195]), np.array([179, 78, 255]))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    h, w = mask.shape
    accepted = []
    for i in range(1, count):
        x, y, ww, hh, area = map(int, stats[i])
        if (ww >= 22 and hh >= 12 and 220 <= area <= w*h*.22 and
                area/(ww*hh) > .18 and .25 < ww/hh < 12):
            accepted.append((i, area))
    return labels, [n for n, _ in sorted(accepted, key=lambda t: -t[1])[:50]]


def ocr_words(rgb):
    import pytesseract
    from pytesseract import Output
    image = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    data = pytesseract.image_to_data(
        image, lang='por+eng', config='--psm 11',
        output_type=Output.DICT, timeout=90)
    return [(int(data['left'][i]), int(data['top'][i]),
             int(data['width'][i]), int(data['height'][i]), float(data['conf'][i]))
            for i, text in enumerate(data['text']) if len(text.strip()) >= 2
            and float(data['conf'][i]) >= 30]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="User-provided PDF (not included in repository)")
    parser.add_argument("--out", default="qa-output", help="Local output directory")
    parser.add_argument("--ocr-pages", default="5,8,9,15,16,20,21,30,31")
    args = parser.parse_args()
    pages = {int(x)-1 for x in args.ocr_pages.split(",") if x.strip()}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(args.pdf)
    report = {
        "page_count": len(doc), "pages_without_text_layer": 0,
        "warning": "Diagnostic OCR-word containment in bright pixels. Not instance accuracy.",
        "per_page": []
    }
    for index, page in enumerate(doc):
        started = time.monotonic()
        no_text = not bool(page.get_text().strip())
        report["pages_without_text_layer"] += int(no_text)
        labels, accepted = bright_regions(render(page, 850))
        record = {
            "page": index+1, "image_only": no_text,
            "bright_region_candidates": len(accepted),
            "ocr_words": None, "words_center_inside_bright_candidate": None
        }
        if index in pages:
            words = ocr_words(render(page, 1500))
            matched = 0
            supported = set(accepted)
            for x, y, w, h, conf in words:
                xx = max(0, min(labels.shape[1]-1, round((x+w/2)*850/1500)))
                yy = max(0, min(labels.shape[0]-1, round((y+h/2)*850/1500)))
                matched += int(int(labels[yy, xx]) in supported)
            record.update(ocr_words=len(words),
                          words_center_inside_bright_candidate=matched)
        record["elapsed_ms"] = round((time.monotonic()-started)*1000)
        report["per_page"].append(record)
    sample = [p for p in report["per_page"] if p["ocr_words"] is not None]
    total = sum(p["ocr_words"] for p in sample)
    covered = sum(p["words_center_inside_bright_candidate"] for p in sample)
    report["summary"] = {
        "sample_pages": [p["page"] for p in sample],
        "sample_ocr_words": total,
        "bright_shape_supported_words": covered,
        "bright_shape_support_ratio": round(covered/total, 3) if total else None
    }
    dest = out/"qa-pdf.json"
    dest.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(dest)
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

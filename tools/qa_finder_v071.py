#!/usr/bin/env python3
"""Offline per-page QA using the SAME JS Finder modules packaged in Chrome.

No comic images, text OCR or pages are copied into the repository.
Output contains metadata only; no accuracy claims without manual ground truth.
"""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path

import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "browser-extension/scripts/vision-evaluate.mjs"

def inspect_pdf(source: Path, pages: list[int], width: int):
    records = []
    with fitz.open(source) as document:
        total = len(document)
        for page_number in pages:
            if page_number < 1 or page_number > total:
                raise ValueError(f"Page {page_number} out of range 1..{total}")
            page = document[page_number-1]
            zoom = min(width/page.rect.width,width/page.rect.height)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom,zoom),colorspace=fitz.csRGB,
                                  alpha=False)
            rgb = np.frombuffer(pix.samples,dtype=np.uint8).reshape(
                pix.height,pix.width,pix.n)
            # RGBA for Chrome ImageData-compatible pixels, no image on disk.
            rgba = np.empty((pix.height,pix.width,4),dtype=np.uint8)
            rgba[:,:,:3]=rgb[:,:,:3]
            rgba[:,:,3]=255
            process = subprocess.run(
                ["node",str(RUNNER),str(pix.width),str(pix.height)],
                input=rgba.tobytes(),capture_output=True,timeout=45,check=False
            )
            if process.returncode:
                raise RuntimeError(f"JS evaluation failed on page {page_number}: "
                                   +process.stderr.decode(errors="replace")[-3000:])
            data = json.loads(process.stdout.decode("utf-8"))
            records.append({"page":page_number,**data})
            print(f"page {page_number}: {len(data['panels'])} panels, "
                  f"{data['textCandidates']} text hypotheses, "
                  f"{data['requiresReview']} masks requiring review")
    return {"sourcePageCount":total,"engine":"PageTranslator JS Finder v0.7.1",
            "meaning":"candidate geometry diagnostics, NOT ground truth precision",
            "pages":records}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("pdf",type=Path)
    p.add_argument("--pages",default="5,8,9,15,16,20,21,30,31")
    p.add_argument("--width",type=int,default=850)
    p.add_argument("--output",type=Path,default=Path("qa-finder-v071.json"))
    args=p.parse_args()
    if args.width<100 or args.width>1000: p.error("--width must be 100..1000")
    page_numbers=[int(n.strip()) for n in args.pages.split(",") if n.strip()]
    data=inspect_pdf(args.pdf,page_numbers,args.width)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"metadata saved: {args.output}")

if __name__=="__main__":
    main()

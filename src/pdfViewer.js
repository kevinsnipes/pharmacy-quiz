import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

let pdfDoc = null;
let pdfBytes = null;

export function hasTextbook() {
  return Boolean(pdfDoc);
}

export async function loadTextbookFromBlob(blob) {
  const bytes = await blob.arrayBuffer();
  pdfBytes = bytes;
  pdfDoc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  return pdfDoc.numPages;
}

export function unloadTextbook() {
  pdfDoc = null;
  pdfBytes = null;
}

function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function findQuoteRects(items, viewport, quote) {
  const target = normalize(quote);
  if (!target || target.length < 8) return [];

  const pieces = items
    .filter((it) => typeof it.str === "string" && it.str.trim())
    .map((it) => {
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const h = Math.max(Math.hypot(tx[2], tx[3]), 8);
      const w = (it.width || 0) * Math.hypot(tx[0], tx[1]);
      return {
        str: it.str,
        x: tx[4],
        y: tx[5] - h,
        w: Math.max(w, 6),
        h,
      };
    });

  const joined = pieces.map((p) => p.str).join(" ");
  const hay = normalize(joined);
  let start = hay.indexOf(target);
  if (start < 0) {
    const words = target.split(" ").slice(0, 8).join(" ");
    start = hay.indexOf(words);
  }
  if (start < 0) return [];

  const end = start + (hay.includes(target) ? target.length : Math.min(target.length, hay.length - start));
  let cursor = 0;
  const rects = [];
  for (const piece of pieces) {
    const next = cursor + piece.str.length + 1;
    if (next > start && cursor < end) {
      rects.push(piece);
    }
    cursor = next;
  }
  return rects;
}

export async function openSourcePage({ pdfPage, page, quote, chapter }) {
  if (!pdfDoc) throw new Error("NO_PDF");

  const overlay = document.createElement("div");
  overlay.className = "pdf-overlay";
  overlay.innerHTML = `
    <div class="pdf-modal" role="dialog" aria-label="Source page from textbook">
      <div class="pdf-toolbar">
        <div>
          <strong>Source in textbook</strong>
          <span class="pdf-sub">Printed page ${page}${chapter ? ` · ${chapter}` : ""} · PDF page ${pdfPage}</span>
        </div>
        <button type="button" class="pdf-close" id="pdf-close">Close</button>
      </div>
      <div class="pdf-stage" id="pdf-stage">
        <div class="pdf-page" id="pdf-page">
          <canvas id="pdf-canvas"></canvas>
          <div class="pdf-hl" id="pdf-hl"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#pdf-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", onKey);
      close();
    }
  });

  const pageIndex = Math.min(Math.max(1, pdfPage), pdfDoc.numPages);
  const pdfPageObj = await pdfDoc.getPage(pageIndex);
  const stage = overlay.querySelector("#pdf-stage");
  const pageBox = overlay.querySelector("#pdf-page");
  const canvas = overlay.querySelector("#pdf-canvas");
  const hl = overlay.querySelector("#pdf-hl");
  const ctx = canvas.getContext("2d");
  const width = Math.min(920, stage.clientWidth - 24 || 860);
  const viewport = pdfPageObj.getViewport({ scale: width / pdfPageObj.getViewport({ scale: 1 }).width });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  pageBox.style.width = `${viewport.width}px`;
  pageBox.style.height = `${viewport.height}px`;

  await pdfPageObj.render({ canvasContext: ctx, viewport }).promise;
  const content = await pdfPageObj.getTextContent();
  const rects = findQuoteRects(content.items, viewport, quote);
  for (const r of rects) {
    const mark = document.createElement("div");
    mark.className = "pdf-mark";
    mark.style.left = `${r.x - 2}px`;
    mark.style.top = `${r.y - 2}px`;
    mark.style.width = `${Math.max(r.w, 8) + 4}px`;
    mark.style.height = `${r.h + 6}px`;
    hl.appendChild(mark);
  }
  if (rects[0]) {
    markScroll(stage, rects[0]);
  }
}

function markScroll(stage, rect) {
  const top = Math.max(0, rect.y - 80);
  stage.scrollTo({ top, behavior: "smooth" });
}

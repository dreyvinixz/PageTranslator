"use strict";

// Executado no contexto da própria extensão, não no site da HQ.
// Todos os arquivos do Tesseract (código, WASM e modelo EN) são empacotados.
let workerPromise = null;
let queue = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("vendor/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/core"),
      langPath: chrome.runtime.getURL("vendor/lang"),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "none"
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

async function recognize(screenshot, rect) {
  if (typeof screenshot !== "string" || !screenshot.startsWith("data:image/png;base64,")) {
    throw new Error("Formato da captura inválido.");
  }
  if (screenshot.length > 25_000_000) {
    throw new Error("A imagem é grande demais para o OCR nesta versão.");
  }
  const image = new Image();
  image.src = screenshot;
  await image.decode();
  const sx = image.naturalWidth / rect.viewportWidth;
  const sy = image.naturalHeight / rect.viewportHeight;
  const x = Math.max(0, Math.floor(rect.x * sx));
  const y = Math.max(0, Math.floor(rect.y * sy));
  const width = Math.min(image.naturalWidth - x, Math.ceil(rect.width * sx));
  const height = Math.min(image.naturalHeight - y, Math.ceil(rect.height * sy));
  if (width < 2 || height < 2) throw new Error("A seleção está fora da área capturada.");
  // Ampliar regiões pequenas melhora a leitura de balões com fontes pequenas.
  const zoom = Math.min(2, Math.max(1, 1000 / width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(4096, Math.round(width * zoom));
  canvas.height = Math.min(4096, Math.round(height * zoom));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const worker = await getWorker();
  const result = await worker.recognize(canvas);
  return {
    text: String(result.data.text || "").trim(),
    confidence: Number(result.data.confidence || 0)
  };
}


async function recognizeViewport(screenshot, viewport, imageRegions) {
  if (typeof screenshot !== "string" || !/^data:image\/(png|jpeg);base64,/.test(screenshot) ||
      screenshot.length > 25_000_000) throw new Error("Captura inválida ou muito grande.");
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width < 50 || viewport.height < 50 || !Array.isArray(imageRegions)) {
    throw new Error("Dimensões da tela ou imagens inválidas.");
  }
  const image = new Image();
  image.src = screenshot;
  await image.decode();
  const width = Math.max(1, Math.round(image.naturalWidth * Math.min(1, 1400 / image.naturalWidth, 1400 / image.naturalHeight)));
  const height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const inputX = image.naturalWidth / viewport.width;
  const inputY = image.naturalHeight / viewport.height;
  const outputX = width / viewport.width;
  const outputY = height / viewport.height;
  let selected = 0;
  for (const raw of imageRegions.slice(0, 12)) {
    if (!raw || ![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite)) continue;
    const x = Math.max(0, raw.x), y = Math.max(0, raw.y);
    const w = Math.min(Math.max(0, raw.width), viewport.width - x);
    const h = Math.min(Math.max(0, raw.height), viewport.height - y);
    if (w < 70 || h < 70) continue;
    ctx.drawImage(image, x * inputX, y * inputY, w * inputX, h * inputY,
      x * outputX, y * outputY, w * outputX, h * outputY);
    selected++;
  }
  if (!selected) return { regions: [], elapsedMs: 0 };
  const worker = await getWorker();
  const start = performance.now();
  // Tesseract.js v6 only includes bounding boxes when blocks output is explicitly enabled.
  const result = await worker.recognize(canvas, {}, { blocks: true });
  const lines = PageTranslatorRegions.collectLines(result.data.blocks,
    viewport.width / width, viewport.height / height, viewport.width, viewport.height);
  return {
    regions: PageTranslatorRegions.groupLines(lines, 12),
    elapsedMs: Math.round(performance.now() - start)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen" ||
      !["PT_RECOGNIZE", "PT_RECOGNIZE_VIEW"].includes(message.type)) return;
  // Both manual and automatic modes share one worker, processed sequentially.
  queue = queue.catch(() => {}).then(() => message.type === "PT_RECOGNIZE_VIEW"
    ? recognizeViewport(message.screenshot, message.viewport, message.imageRegions)
    : recognize(message.screenshot, message.rect));
  queue.then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

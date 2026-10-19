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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen" || message.type !== "PT_RECOGNIZE") return;
  // Um worker é reutilizado por sessão, sem processar duas capturas simultaneamente.
  queue = queue.catch(() => {}).then(() => recognize(message.screenshot, message.rect));
  queue.then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

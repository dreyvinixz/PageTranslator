"use strict";

let offscreenCreation = null;
const OFFSCREEN_PATH = "offscreen.html";
const MAX_OCR_TEXT = 450;
const AUTO_TIMEOUT_MS = 45000;
let autoRunning = false;

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ": tempo limite de " + Math.round(milliseconds / 1000) + "s excedido.")), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function resetOffscreen() {
  try { await chrome.offscreen.closeDocument(); } catch { /* may already be closed */ }
  offscreenCreation = null;
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url]
  });
  if (contexts.length > 0) return;
  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS", "BLOBS"],
      justification: "Executar OCR Tesseract localmente em um Web Worker e recortar a captura em canvas."
    }).finally(() => { offscreenCreation = null; });
  }
  await offscreenCreation;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    console.warn("PageTranslator só pode atuar em páginas HTTP(S).");
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["auto-content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PT_AUTO_TOGGLE" });
  } catch (error) {
    console.error("PageTranslator: não foi possível iniciar nesta página.", error);
  }
});

async function captureAndRecognize(message, sender) {
  const tab = sender.tab;
  const rect = message.rect;
  if (!tab || !tab.id || !rect) throw new Error("Captura sem guia ou seleção válida.");
  const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active.length !== 1 || active[0].id !== tab.id) {
    throw new Error("A guia mudou antes da captura. Selecione o balão novamente.");
  }
  const numbers = ["x", "y", "width", "height", "viewportWidth", "viewportHeight"];
  if (!numbers.every((key) => Number.isFinite(rect[key]))) {
    throw new Error("Coordenadas inválidas.");
  }
  if (rect.width < 12 || rect.height < 12 || rect.viewportWidth <= 0 ||
      rect.viewportHeight <= 0 || rect.width > rect.viewportWidth ||
      rect.height > rect.viewportHeight) {
    throw new Error("Selecione uma região válida dentro da página.");
  }
  // Somente o recorte selecionado será processado. Nada é salvo em disco.
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PT_RECOGNIZE",
    screenshot,
    rect
  });
  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "OCR indisponível.");
  }
  return { text: response.text, confidence: response.confidence };
}


let lastAutoCapture = 0;
async function captureAuto(message, sender) {
  if (autoRunning) throw new Error("OCR_BUSY: há uma leitura em andamento.");
  const tab = sender.tab;
  if (!tab || !tab.id) throw new Error("Aba de origem indisponível.");
  const { viewport, imageRegions } = message;
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width < 50 || viewport.height < 50 || viewport.width > 12000 ||
      viewport.height > 12000 || !Array.isArray(imageRegions) || imageRegions.length > 8) {
    throw new Error("Geometria inválida para OCR automático.");
  }
  if (imageRegions.some((r) => !r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 ||
      r.x + r.width > viewport.width + 2 || r.y + r.height > viewport.height + 2)) {
    throw new Error("Região de imagem fora da área visível.");
  }
  const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active.length !== 1 || active[0].id !== tab.id) {
    throw new Error("A aba mudou: escaneamento interrompido.");
  }
  if (Date.now() - lastAutoCapture < 2800) {
    throw new Error("OCR_INTERVAL: aguarde antes de fazer uma nova captura.");
  }
  autoRunning = true;
  const progress = (label) => chrome.tabs.sendMessage(tab.id, {
    type: "PT_SCAN_PROGRESS", scanId: message.scanId, label
  }).catch(() => {});
  try {
    lastAutoCapture = Date.now();
    await progress("Capturando a área visível…");
    const screenshot = await bounded(
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 82 }),
      12000, "Captura da aba"
    );
    await progress("Preparando o motor de OCR local…");
    await bounded(ensureOffscreen(), 10000, "Inicialização do OCR");
    await progress("Reconhecendo textos (pode demorar na primeira execução)…");
    const response = await bounded(chrome.runtime.sendMessage({
      target: "offscreen",
      type: "PT_RECOGNIZE_VIEW",
      screenshot,
      viewport,
      imageRegions
    }), AUTO_TIMEOUT_MS, "OCR local");
    if (!response || !response.ok) {
      throw new Error(response && response.error || "OCR automático indisponível.");
    }
    return { regions: response.regions || [], elapsedMs: Number(response.elapsedMs) || 0 };
  } catch (error) {
    // A broken/stalled WASM worker should never poison subsequent requests.
    const msg = String(error.message || error);
    if (/tempo limite|message channel closed|receiving end does not exist/i.test(msg)) {
      await bounded(resetOffscreen(), 4000, "Reinício OCR").catch(() => {});
    }
    throw new Error("Falha no reconhecimento: " + msg);
  } finally {
    autoRunning = false;
  }
}
async function openManualSelector(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: "PT_AUTO_STOP" }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await chrome.tabs.sendMessage(tabId, { type: "PT_START" });
}

async function translateOnline(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > MAX_OCR_TEXT || new TextEncoder().encode(clean).length > 500) {
    throw new Error("Selecione um balão de até 450 caracteres para a tradução online.");
  }
  // Nunca enviamos a imagem; somente o texto reconhecido, após clique explícito.
  const url = "https://api.mymemory.translated.net/get?" +
    new URLSearchParams({ q: clean, langpair: "en|pt-BR" }).toString();
  const response = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Serviço de tradução indisponível (HTTP " + response.status + ").");
  const data = await response.json();
  if (Number(data.responseStatus) !== 200 || !data.responseData ||
      typeof data.responseData.translatedText !== "string") {
    throw new Error("O serviço não conseguiu traduzir este texto.");
  }
  return data.responseData.translatedText;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === "offscreen") return;
  if (message.type === "PT_CAPTURE_VIEW") {
    captureAuto(message, sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }
  if (message.type === "PT_MANUAL_REQUEST" && sender.tab && sender.tab.id) {
    openManualSelector(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }
  if (message.type === "PT_CAPTURE") {
    captureAndRecognize(message, sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }
  if (message.type === "PT_TRANSLATE_REMOTE" && sender.tab) {
    translateOnline(message.text)
      .then((translatedText) => sendResponse({ ok: true, translatedText }))
      .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }
});

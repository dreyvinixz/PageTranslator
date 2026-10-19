"use strict";

let offscreenCreation = null;
const OFFSCREEN_PATH = "offscreen.html";
const MAX_OCR_TEXT = 450;

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
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PT_START" });
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

async function translateOnline(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > MAX_OCR_TEXT) {
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

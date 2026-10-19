"use strict";
// Diagnostic Finder v0.3.0. No OCR, no external requests, no continuous capture.
function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("A captura demorou além do limite.")), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:\/\//.test(tab.url || "")) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["finder-core.js", "finder-text.js", "finder-fit.js", "finder-content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PT_FINDER_OPEN" });
  } catch (error) {
    console.error("PageTranslator Finder: falha ao abrir interface.", error);
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PT_FINDER_CAPTURE") return;
  (async () => {
    if (!sender.tab?.id) throw new Error("Solicitação fora de uma página web.");
    const active = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (!active.length || active[0].id !== sender.tab.id) {
      throw new Error("A guia deixou de estar ativa.");
    }
    const image = await withTimeout(chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "jpeg", quality: 72
    }), 6000);
    if (!image.startsWith("data:image/jpeg;base64,")) {
      throw new Error("O navegador não retornou uma captura JPEG válida.");
    }
    return { image };
  })().then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});

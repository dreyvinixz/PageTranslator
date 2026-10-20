"use strict";
// Lightweight Finder with debounced on-scroll analysis. No OCR or external endpoints.
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
      files: ["finder-core.js", "finder-text.js", "finder-fit.js", "finder-association.js", "finder-instances.js", "finder-language.js", "finder-shortcut.js", "finder-auto.js", "regions.js", "finder-content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PT_FINDER_OPEN" });
  } catch (error) {
    console.error("PageTranslator Finder: falha ao abrir interface.", error);
  }
});
let offscreenInit = null;
async function ensureOCRDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenInit) offscreenInit = chrome.offscreen.createDocument({
    url:"finder-offscreen.html", reasons:["BLOBS"],
    justification:"OCR local de recortes escolhidos pelo usuário, sem acesso remoto"
  }).finally(()=>{offscreenInit=null;});
  await offscreenInit;
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PT_FINDER_OCR") {
    (async () => {
      if (!sender.tab?.id || !/^https?:\/\//.test(sender.tab.url || ""))
        throw Error("OCR autorizado somente em aba web.");
      const active=await chrome.tabs.query({active:true,windowId:sender.tab.windowId});
      if (active[0]?.id !== sender.tab.id) throw Error("A aba não está mais ativa.");
      if (typeof message.image!=="string" || message.image.length>6_000_000)
        throw Error("Recorte de OCR inválido ou muito grande.");
      const lang=["por","eng","por+eng"].includes(message.language)
        ? message.language:"por+eng";
      await ensureOCRDocument();
      const response=await withTimeout(chrome.runtime.sendMessage({
        target:"PT_OFFSCREEN",type:"PT_OCR_CROP",image:message.image,language:lang
      }),60000);
      if (!response?.ok) throw Error(response?.error || "OCR sem resultado.");
      return {text:response.text,confidence:response.confidence,lines:response.lines};
    })().then(x=>sendResponse({ok:true,...x}))
      .catch(e=>sendResponse({ok:false,error:String(e.message||e)}));
    return true;
  }

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

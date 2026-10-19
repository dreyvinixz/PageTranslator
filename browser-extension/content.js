(() => {
  "use strict";
  if (globalThis.__pageTranslatorInjected) return;
  globalThis.__pageTranslatorInjected = true;

  let host = null;
  let root = null;
  let stage = "closed";
  let selectedRect = null;
  let original = "";
  let translation = "";
  let generation = 0;
  let previousScroll = null;
  const css = [
    ":host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#f3f8ff}",
    "*{box-sizing:border-box}",
    ".pt-panel{position:fixed;bottom:14px;right:14px;width:min(364px,calc(100vw - 28px));max-height:min(75vh,540px);overflow:auto;padding:14px;border-radius:14px;border:1px solid #4d728d;background:#102039;color:#f5faff;box-shadow:0 12px 45px #0009;pointer-events:auto}",
    ".pt-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:700;font-size:15px}",
    ".pt-description{font-size:12px;color:#d0ddec;margin-bottom:10px}",
    ".pt-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}",
    ".pt-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#bcd2e6;margin:10px 0 3px}",
    ".pt-value{font-size:14px;color:#f4faff;overflow-wrap:anywhere;white-space:pre-wrap;max-height:160px;overflow:auto}",
    ".pt-status{margin-top:8px;color:#f5d496;font-size:12px;white-space:pre-wrap}",
    "button{font:inherit;background:#24425c;border:1px solid #668aa8;color:white;border-radius:8px;padding:7px 9px;cursor:pointer}",
    "button:hover{background:#305d7d}button:disabled{opacity:.6;cursor:wait}",
    "button:focus-visible{outline:2px solid white;outline-offset:2px}",
    ".pt-primary{background:#1576b6;border-color:#2591d6}",
    ".pt-dismiss{font-size:20px;padding:0 4px;border:0;background:transparent}",
    ".pt-select{position:fixed;inset:0;z-index:2;pointer-events:auto;cursor:crosshair;background:rgba(0,0,0,.09);touch-action:none}",
    ".pt-tip{position:fixed;left:50%;top:20px;transform:translateX(-50%);max-width:95vw;background:#102039;color:white;border-radius:8px;padding:10px 12px;font-size:13px;pointer-events:none}",
    ".pt-box{position:fixed;border:2px solid #09a7ef;background:#0da5e822;pointer-events:none}",
    ".pt-translation{position:fixed;display:flex;align-items:center;justify-content:center;text-align:center;padding:7px;background:#fafaf4;border:2px solid #1b222c;border-radius:12px;color:#111;font:600 14px/1.3 system-ui,sans-serif;overflow:auto;overflow-wrap:anywhere;pointer-events:auto;box-shadow:0 2px 12px #0005}",
    ".pt-translation:hover{outline:2px solid #1887c0}"
  ].join("");

  function node(tag, cls, value) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined) n.textContent = value;
    return n;
  }
  function ensureHost() {
    if (!host) {
      host = node("div");
      host.setAttribute("data-pagetranslator", "true");
      root = host.attachShadow({ mode: "open" });
      const style = node("style");
      style.textContent = css;
      root.append(style);
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
    return root;
  }
  function clear() {
    const shadow = ensureHost();
    for (const child of [...shadow.children]) {
      if (child.tagName !== "STYLE") child.remove();
    }
    return shadow;
  }
  function close() {
    if (host) host.style.visibility = "visible";
    generation++;
    stage = "closed";
    selectedRect = null;
    original = "";
    translation = "";
    if (host) host.remove();
  }
  function panel(title, description) {
    const shadow = clear();
    const card = node("section", "pt-panel");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "PageTranslator");
    const header = node("div", "pt-header");
    header.append(node("span", "", title));
    const closeBtn = node("button", "pt-dismiss", "×");
    closeBtn.setAttribute("aria-label", "Fechar PageTranslator");
    closeBtn.addEventListener("click", close);
    header.append(closeBtn);
    card.append(header);
    if (description) card.append(node("div", "pt-description", description));
    shadow.append(card);
    return card;
  }
  function actions(card, buttons) {
    const row = node("div", "pt-actions");
    for (const [label, handler, primary] of buttons) {
      const btn = node("button", primary ? "pt-primary" : "", label);
      btn.addEventListener("click", () => { void handler(btn); });
      row.append(btn);
    }
    card.append(row);
  }
  function showMenu(message = "") {
    if (host) host.style.visibility = "visible";
    generation++;
    stage = "menu";
    selectedRect = null;
    original = "";
    translation = "";
    const card = panel("PageTranslator · EN → PT",
      "Selecione somente o balão. A imagem é analisada localmente e permanece no navegador.");
    actions(card, [
      ["Selecionar balão", () => startSelection(), true],
      ["Automático (experimental)", startAuto, false]
    ]);
    if (message) card.append(node("div", "pt-status", message));
  }
  async function startAuto(btn) {
    btn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "PT_AUTO_REQUEST" });
      if (!result?.ok) throw new Error(result?.error || "Falha ao abrir modo automático.");
      close();
    } catch (error) {
      btn.disabled = false;
      const card = root?.querySelector(".pt-panel");
      card?.append(node("div", "pt-status", "Modo automático indisponível: " + String(error.message || error)));
    }
  }
  function startSelection() {
    generation++;
    stage = "select";
    const shadow = clear();
    const selection = node("div", "pt-select");
    const border = node("div", "pt-box");
    border.hidden = true;
    const tip = node("div", "pt-tip", "Arraste para selecionar um balão · ESC cancela");
    selection.append(border, tip);
    shadow.append(selection);
    const origin = { x: 0, y: 0 };
    let dragging = false;
    function position(event) {
      return { x: Math.max(0, Math.min(innerWidth, event.clientX)),
        y: Math.max(0, Math.min(innerHeight, event.clientY)) };
    }
    function place(event) {
      const end = position(event);
      const x = Math.min(origin.x, end.x), y = Math.min(origin.y, end.y);
      const width = Math.abs(origin.x - end.x), height = Math.abs(origin.y - end.y);
      Object.assign(border.style, {
        left: x + "px", top: y + "px", width: width + "px", height: height + "px"
      });
      return { x, y, width, height,
        viewportWidth: innerWidth, viewportHeight: innerHeight };
    }
    selection.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      selection.setPointerCapture(event.pointerId);
      Object.assign(origin, position(event));
      dragging = true;
      border.hidden = false;
      place(event);
    });
    selection.addEventListener("pointermove", (event) => {
      if (dragging) place(event);
    });
    selection.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      const rect = place(event);
      if (rect.width < 12 || rect.height < 12) {
        showMenu("Selecione uma área maior.");
        return;
      }
      void runManual(rect);
    });
    selection.addEventListener("pointercancel", () => showMenu("Seleção cancelada."));
  }
  async function runManual(rect) {
    const run = ++generation;
    stage = "working";
    selectedRect = rect;
    const card = panel("PageTranslator · Reconhecendo",
      "Somente a área escolhida será analisada. Aguarde o processamento local.");
    const status = node("div", "pt-status", "Capturando balão…");
    card.append(status);
    actions(card, [["Cancelar / voltar", showMenu]]);
    // Keep status visible unless the selected comic box overlaps the panel.
    const panelBounds = card.getBoundingClientRect();
    const intersects = rect.x < panelBounds.right && rect.x + rect.width > panelBounds.left &&
      rect.y < panelBounds.bottom && rect.y + rect.height > panelBounds.top;
    if (host && intersects) host.style.visibility = "hidden";
    await new Promise((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)));
    if (generation !== run || stage !== "working") return;
    status.textContent = "Reconhecendo texto. A primeira vez pode demorar mais…";
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({ type: "PT_CAPTURE", rect }),
        new Promise((_, reject) => setTimeout(() =>
          reject(new Error("O OCR demorou além do limite. Verifique o service worker.")), 55000))
      ]);
      if (generation !== run || stage !== "working") return;
      if (!response?.ok) throw new Error(response?.error || "O OCR não respondeu.");
      original = String(response.text || "").trim();
      if (!original) return showMenu("Não encontrei texto. Tente enquadrar apenas as letras do balão.");
      showResult();
    } catch (error) {
      if (generation !== run || stage !== "working") return;
      showMenu("Não foi possível reconhecer: " + String(error.message || error));
    }
  }
  function showResult(statusMessage = "") {
    generation++;
    stage = "result";
    const card = panel("PageTranslator · Balão", "O inglês original foi preservado.");
    card.append(node("div", "pt-label", "Texto original (EN)"));
    card.append(node("div", "pt-value", original));
    card.append(node("div", "pt-label", "Tradução (PT)"));
    const pt = node("div", "pt-value", translation || "Aguardando tradução.");
    card.append(pt);
    const status = node("div", "pt-status", statusMessage);
    card.append(status);
    actions(card, [
      ["Traduzir online", async (btn) => {
        btn.disabled = true;
        status.textContent = "Enviando somente o texto reconhecido à MyMemory…";
        try {
          const result = await chrome.runtime.sendMessage({ type: "PT_TRANSLATE_REMOTE", text: original });
          if (!result?.ok) throw new Error(result?.error || "Falha na tradução.");
          translation = String(result.translatedText || "").trim();
          showResult("Clique na caixa sobre a imagem para alternar inglês e português.");
        } catch (error) {
          if (btn.isConnected) {
            status.textContent = String(error.message || error);
            btn.disabled = false;
          }
        }
      }, true],
      ["Traduzir local", async (btn) => {
        btn.disabled = true;
        try {
          if (!globalThis.Translator?.create) throw new Error("A Translator API não está disponível.");
          const availability = await globalThis.Translator.availability?.({ sourceLanguage: "en", targetLanguage: "pt" });
          if (availability !== "available") throw new Error("Modelo local indisponível. Use tradução online se concordar com o envio do texto.");
          const translator = await globalThis.Translator.create({ sourceLanguage: "en", targetLanguage: "pt" });
          try { translation = await translator.translate(original); }
          finally { translator.destroy?.(); }
          showResult();
        } catch (error) {
          status.textContent = String(error.message || error);
          if (btn.isConnected) btn.disabled = false;
        }
      }],
      ["Outro balão", startSelection],
      ["Menu", showMenu]
    ]);
    if (translation && selectedRect) showTranslationBox(selectedRect);
  }
  function showTranslationBox(rect) {
    const shadow = ensureHost();
    const view = node("button", "pt-translation", translation);
    view.setAttribute("aria-label", "Tradução sobreposta. Clique para alternar com o original.");
    const width = Math.max(60, Math.min(rect.width, innerWidth - 8));
    const height = Math.max(35, Math.min(rect.height, innerHeight - 8));
    Object.assign(view.style, {
      left: Math.min(Math.max(4, rect.x), innerWidth - width - 4) + "px",
      top: Math.min(Math.max(4, rect.y), innerHeight - height - 4) + "px",
      width: width + "px", height: height + "px",
      fontSize: Math.max(11, Math.min(18, height / 3.7)) + "px"
    });
    let showingOriginal = false;
    view.addEventListener("click", () => {
      showingOriginal = !showingOriginal;
      view.textContent = showingOriginal ? original : translation;
    });
    shadow.append(view);
  }
  function onPageMove() {
    if (stage === "result") {
      // The underlying comic moves; never leave a detached box over unrelated art.
      selectedRect = null;
      showResult("A sobreposição foi removida porque a página se moveu. Escolha outro balão.");
    }
    // Intentionally do not stop an in-flight manual request on scroll.
  }
  window.addEventListener("scroll", onPageMove, true);
  window.addEventListener("resize", onPageMove, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && stage !== "closed") showMenu();
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "PT_MANUAL_CAPTURED") {
      if (host) host.style.visibility = "visible";
      return;
    }
    if (message?.type === "PT_OPEN" || message?.type === "PT_START") {
      showMenu();
      respond({ ok: true });
    } else if (message?.type === "PT_CLOSE_MANUAL") {
      close();
      respond({ ok: true });
    }
  });
})();

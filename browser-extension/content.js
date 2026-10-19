(() => {
  "use strict";
  if (globalThis.__pageTranslatorInjected) return;
  globalThis.__pageTranslatorInjected = true;

  let currentHost = null;
  let cleanup = () => {};
  const css = [
    ":host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#f7fafc}",
    "*{box-sizing:border-box}",
    ".pt-select{position:fixed;inset:0;cursor:crosshair;pointer-events:auto;background:rgba(0,0,0,.09);touch-action:none}",
    ".pt-tip{position:fixed;left:50%;top:16px;transform:translateX(-50%);max-width:92vw;padding:11px 16px;border-radius:10px;background:#0e1726;color:white;font-size:14px;box-shadow:0 6px 24px #0005;text-align:center;pointer-events:none}",
    ".pt-box{position:fixed;border:2px solid #27a7ff;background:rgba(39,167,255,.17);box-shadow:0 0 0 100vmax rgba(0,0,0,.13);pointer-events:none}",
    ".pt-outline{position:fixed;border:2px dashed #27a7ff;border-radius:6px;pointer-events:none}",
    ".pt-card{position:fixed;right:16px;bottom:16px;width:min(390px,calc(100vw - 32px));max-height:min(75vh,560px);overflow:auto;padding:16px;background:#0f1929;border:1px solid #50647e;border-radius:14px;box-shadow:0 14px 60px #0008;pointer-events:auto;font-size:14px;line-height:1.5;color:#f8fafc}",
    ".pt-title{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:16px;font-weight:700;margin-bottom:12px}",
    ".pt-label{font-size:11px;letter-spacing:.08em;color:#aabbd1;text-transform:uppercase;margin:12px 0 4px}",
    ".pt-value{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}",
    ".pt-muted{color:#bdd0e3;font-size:12px;margin-top:10px}",
    ".pt-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}",
    "button{font:inherit;border:1px solid #60758c;background:#243854;color:#f8fafc;padding:7px 10px;border-radius:8px;cursor:pointer}",
    "button:hover{background:#345477}button:disabled{opacity:.55;cursor:progress}",
    ".pt-primary{background:#1675c5;border-color:#1675c5}.pt-primary:hover{background:#248de3}",
    ".pt-close{border:0;background:transparent;font-size:22px;padding:0 4px;line-height:1}",
    ".pt-status{color:#f7d797;white-space:pre-wrap;margin-top:8px;font-size:12px}"
  ].join("");

  function removeUI() {
    cleanup();
    cleanup = () => {};
    if (currentHost) currentHost.remove();
    currentHost = null;
  }

  function makeUI() {
    removeUI();
    const host = document.createElement("div");
    host.setAttribute("data-pagetranslator", "true");
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
    currentHost = host;
    return shadow;
  }

  function el(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function showError(error, rect) {
    showResult(rect || null, "", 0, String(error.message || error));
  }

  function showResult(rect, original, confidence, error) {
    const shadow = makeUI();
    if (rect) {
      const outline = el("div", "pt-outline");
      Object.assign(outline.style, {
        left: rect.x + "px", top: rect.y + "px",
        width: rect.width + "px", height: rect.height + "px"
      });
      shadow.appendChild(outline);
    }
    const card = el("section", "pt-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "PageTranslator");
    const header = el("div", "pt-title");
    header.appendChild(el("span", "", "PageTranslator  ·  EN → PT"));
    const close = el("button", "pt-close", "×");
    close.setAttribute("aria-label", "Fechar");
    close.addEventListener("click", removeUI);
    header.appendChild(close);
    card.appendChild(header);
    card.appendChild(el("div", "pt-label", "Texto reconhecido"));
    const originalEl = el("p", "pt-value", original || "Nenhum texto encontrado.");
    card.appendChild(originalEl);
    card.appendChild(el("div", "pt-label", "Tradução"));
    const translationEl = el("p", "pt-value", "—");
    card.appendChild(translationEl);
    const statusEl = el("div", "pt-status", error || "");
    card.appendChild(statusEl);
    const actions = el("div", "pt-actions");
    const localButton = el("button", "pt-primary", "Traduzir localmente");
    const onlineButton = el("button", "", "Traduzir online");
    const copyButton = el("button", "", "Copiar");
    const retryButton = el("button", "", "Outro balão");
    actions.append(localButton, onlineButton, copyButton, retryButton);
    card.appendChild(actions);
    card.appendChild(el("p", "pt-muted",
      "OCR executado no seu dispositivo. A tradução online envia somente o texto à MyMemory, nunca a imagem."));
    shadow.appendChild(card);

    const ready = Boolean(original && original.trim());
    localButton.disabled = !ready;
    onlineButton.disabled = !ready;
    copyButton.disabled = !ready;

    localButton.addEventListener("click", async () => {
      statusEl.textContent = "";
      if (typeof globalThis.Translator === "undefined") {
        statusEl.textContent = "A tradução local não está disponível neste navegador. Use a tradução online se concordar com o envio do texto.";
        return;
      }
      localButton.disabled = true;
      try {
        // A criação ocorre após o clique do usuário (modelo local pode exigir download).
        const translator = await globalThis.Translator.create({
          sourceLanguage: "en",
          targetLanguage: "pt"
        });
        try {
          translationEl.textContent = await translator.translate(original);
        } finally {
          if (typeof translator.destroy === "function") translator.destroy();
        }
      } catch (err) {
        statusEl.textContent = "Tradução local indisponível: " + String(err.message || err);
      } finally {
        localButton.disabled = false;
      }
    });

    onlineButton.addEventListener("click", async () => {
      onlineButton.disabled = true;
      statusEl.textContent = "Enviando somente o texto reconhecido para tradução…";
      try {
        const result = await chrome.runtime.sendMessage({
          type: "PT_TRANSLATE_REMOTE",
          text: original
        });
        if (!result || !result.ok) throw new Error(result && result.error || "Falha na tradução.");
        translationEl.textContent = result.translatedText;
        statusEl.textContent = "";
      } catch (err) {
        statusEl.textContent = String(err.message || err);
      } finally {
        onlineButton.disabled = false;
      }
    });

    copyButton.addEventListener("click", async () => {
      try {
        const text = translationEl.textContent !== "—" ? translationEl.textContent : original;
        await navigator.clipboard.writeText(text);
        statusEl.textContent = "Texto copiado.";
      } catch {
        statusEl.textContent = "Não foi possível acessar a área de transferência.";
      }
    });
    retryButton.addEventListener("click", startSelection);
    const dismissOnScroll = () => removeUI();
    window.addEventListener("scroll", dismissOnScroll, true);
    window.addEventListener("resize", dismissOnScroll, true);
    const esc = (e) => { if (e.key === "Escape") removeUI(); };
    window.addEventListener("keydown", esc, true);
    cleanup = () => {
      window.removeEventListener("scroll", dismissOnScroll, true);
      window.removeEventListener("resize", dismissOnScroll, true);
      window.removeEventListener("keydown", esc, true);
    };
  }

  function startSelection() {
    const shadow = makeUI();
    const overlay = el("div", "pt-select");
    const box = el("div", "pt-box");
    const tip = el("div", "pt-tip", "Arraste sobre um balão da HQ • ESC para cancelar");
    box.hidden = true;
    shadow.append(overlay, box, tip);
    let start = null;
    let latest = null;
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const point = (e) => ({
      x: clamp(e.clientX, 0, innerWidth),
      y: clamp(e.clientY, 0, innerHeight)
    });
    const update = () => {
      if (!start || !latest) return;
      const x = Math.min(start.x, latest.x);
      const y = Math.min(start.y, latest.y);
      Object.assign(box.style, {
        left: x + "px", top: y + "px",
        width: Math.abs(start.x - latest.x) + "px",
        height: Math.abs(start.y - latest.y) + "px"
      });
    };
    overlay.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      overlay.setPointerCapture(event.pointerId);
      start = latest = point(event);
      box.hidden = false;
      update();
    });
    overlay.addEventListener("pointermove", (event) => {
      if (!start) return;
      latest = point(event);
      update();
    });
    overlay.addEventListener("pointerup", async (event) => {
      if (!start) return;
      latest = point(event);
      const rect = {
        x: Math.min(start.x, latest.x),
        y: Math.min(start.y, latest.y),
        width: Math.abs(start.x - latest.x),
        height: Math.abs(start.y - latest.y),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight
      };
      removeUI();
      if (rect.width < 12 || rect.height < 12) return;
      // Deixe o compositor eliminar a camada de seleção antes da captura.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      try {
        const result = await chrome.runtime.sendMessage({ type: "PT_CAPTURE", rect });
        if (!result || !result.ok) throw new Error(result && result.error || "Falha ao reconhecer texto.");
        showResult(rect, result.text, result.confidence);
      } catch (err) {
        showError(err, rect);
      }
    });
    overlay.addEventListener("pointercancel", removeUI);
    const esc = (event) => { if (event.key === "Escape") removeUI(); };
    window.addEventListener("keydown", esc, true);
    cleanup = () => window.removeEventListener("keydown", esc, true);
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message && message.type === "PT_START") {
      startSelection();
      respond({ ok: true });
    }
  });
})();

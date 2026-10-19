(() => {
  "use strict";
  if (globalThis.__pageTranslatorAutoLoaded) return;
  globalThis.__pageTranslatorAutoLoaded = true;

  const MIN_SCAN_GAP_MS = 2400;
  const SCROLL_IDLE_MS = 750;
  const MAX_AUTO_TRANSLATIONS = 30;
  const MAX_VISIBLE = 10;
  let active = false, onlineAllowed = false, scanPage = false;
  let host = null, shadow = null, status = null, enableOnline = null, fullPage = null;
  let chips = [], scanTimer = null, busy = false, epoch = 0, lastScan = 0;
  let observer = null, translatorPromise = null, translationCount = 0;
  let visibleRegions = [];
  const cache = new Map();
  const styleText = [
    ":host{all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif}",
    "*{box-sizing:border-box}",
    ".pt-panel{position:fixed;right:12px;bottom:12px;max-width:min(355px,calc(100vw - 24px));background:#102037;color:#f6fbff;border:1px solid #5c789a;border-radius:12px;padding:12px;box-shadow:0 8px 40px #0008;pointer-events:auto;font-size:12px;line-height:1.45}",
    ".pt-title{font-size:14px;font-weight:700;margin-bottom:5px}",
    ".pt-status{color:#cbdae9;white-space:pre-wrap;min-height:1.5em;margin-bottom:6px}",
    ".pt-actions{display:flex;flex-wrap:wrap;gap:5px}",
    "button{font:inherit;color:#fff;background:#254466;border:1px solid #6b89aa;border-radius:7px;padding:5px 7px;cursor:pointer}",
    "button:hover{background:#31638e}button:focus-visible{outline:2px solid #fff;outline-offset:2px}",
    ".pt-online{background:#1675b4}",
    ".pt-notice{font-size:11px;color:#d0dcea;margin-top:6px;max-width:340px}",
    ".pt-chip{position:fixed;background:rgba(250,253,255,.95);color:#071d30;border:2px solid #1382bf;box-shadow:0 4px 12px #0006;border-radius:7px;padding:4px 6px;line-height:1.3;font-size:clamp(12px,1vw,15px);font-weight:600;text-align:center;overflow-wrap:anywhere;white-space:normal;max-height:160px;overflow:auto;pointer-events:auto}",
    ".pt-chip.pt-original{background:rgba(20,44,67,.96);color:#fff;border-color:#a2d2ff}"
  ].join("");

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message) {
    if (status && active) status.textContent = message;
  }

  function clearChips() {
    for (const node of chips) node.remove();
    chips = [];
    visibleRegions = [];
  }

  function scheduleScan(delay = SCROLL_IDLE_MS) {
    if (!active) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanTimer = null; void scan(); }, delay);
  }

  function invalidate() {
    if (!active) return;
    epoch++;
    clearChips();
    setStatus("Atualizando após a rolagem…");
    scheduleScan();
  }

  function handleImageLoad(event) {
    if (active && (event.target instanceof HTMLImageElement)) invalidate();
  }

  function imageRects() {
    const nodes = [
      ...document.querySelectorAll("img"),
      ...document.querySelectorAll("canvas")
    ].slice(0, 500);
    const result = [];
    const vw = innerWidth, vh = innerHeight;
    for (const node of nodes) {
      if (node.closest("[data-pagetranslator-auto]") ||
          node.closest("[data-pagetranslator]")) continue;
      const bounds = node.getBoundingClientRect();
      if (bounds.width < 160 || bounds.height < 160 ||
          (node instanceof HTMLImageElement && !node.complete) ||
          (node instanceof HTMLImageElement && node.naturalWidth < 200)) continue;
      const x0 = Math.max(0, bounds.left), y0 = Math.max(0, bounds.top);
      const x1 = Math.min(vw, bounds.right), y1 = Math.min(vh, bounds.bottom);
      const width = x1 - x0, height = y1 - y0;
      if (width < 90 || height < 90) continue;
      if (width * height < 12000) continue;
      result.push({ x: x0, y: y0, width, height, area: width * height });
    }
    result.sort((a, b) => b.area - a.area);
    return result.slice(0, 8).map(({ x, y, width, height }) => ({ x, y, width, height }));
  }

  function clearSession() {
    clearTimeout(scanTimer);
    scanTimer = null;
    epoch++;
    clearChips();
    if (observer) { observer.disconnect(); observer = null; }
    window.removeEventListener("scroll", invalidate, true);
    window.removeEventListener("resize", invalidate, true);
    window.removeEventListener("hashchange", invalidate, true);
    window.removeEventListener("popstate", invalidate, true);
    document.removeEventListener("load", handleImageLoad, true);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (host) host.remove();
    host = null;
    shadow = null;
    status = null;
    enableOnline = null;
    fullPage = null;
    chips = [];
  }

  function stop() {
    active = false;
    clearSession();
    onlineAllowed = false;
    scanPage = false;
    translationCount = 0;
    cache.clear();
    if (translatorPromise) {
      translatorPromise.then((translator) => {
        if (translator && typeof translator.destroy === "function") translator.destroy();
      }).catch(() => {});
      translatorPromise = null;
    }
  }

  function handleVisibility() {
    if (document.visibilityState !== "visible") {
      epoch++;
      clearChips();
    } else if (active) {
      scheduleScan(500);
    }
  }

  async function getTranslator() {
    if (typeof globalThis.Translator === "undefined") return null;
    if (!translatorPromise) {
      translatorPromise = globalThis.Translator.create({
        sourceLanguage: "en", targetLanguage: "pt"
      }).catch(() => null);
    }
    return translatorPromise;
  }

  async function translate(text) {
    const key = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (cache.has(key)) return cache.get(key);
    let translated = null;
    const translator = await getTranslator();
    if (translator) {
      try { translated = await translator.translate(text); } catch { /* online fallback requires opt-in */ }
    }
    if (!translated && onlineAllowed && translationCount < MAX_AUTO_TRANSLATIONS) {
      translationCount++;
      const response = await chrome.runtime.sendMessage({ type: "PT_TRANSLATE_REMOTE", text });
      if (response && response.ok) translated = response.translatedText;
    }
    if (translated) {
      cache.set(key, translated);
      if (cache.size > 100) cache.delete(cache.keys().next().value);
    }
    return translated;
  }

  function draw(regions, currentEpoch) {
    clearChips();
    if (!shadow || !active || currentEpoch !== epoch) return;
    const vw = innerWidth, vh = innerHeight;
    for (const region of regions.slice(0, MAX_VISIBLE)) {
      const b = region.bbox, original = String(region.text || "").trim();
      if (!b || !original || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) continue;
      if (b.x1 <= b.x0 || b.y1 <= b.y0 || b.y0 >= vh) continue;
      const chip = make("button", "pt-chip pt-original", original);
      const width = Math.min(vw - 12, Math.max(125, (b.x1 - b.x0) + 16));
      // Prevent labels running below the viewport or outside its right edge.
      chip.style.width = width + "px";
      chip.style.left = Math.max(4, Math.min(vw - width - 4, b.x0 - 8)) + "px";
      chip.style.top = Math.max(4, Math.min(vh - 35, b.y0 - 6)) + "px";
      chip.title = "Original EN: " + original + "\nClique para alternar EN/PT";
      chip.setAttribute("aria-label", "Texto original em inglês: " + original);
      const entry = { chip, original, translated: "", flipped: false };
      chip.addEventListener("click", () => {
        entry.flipped = !entry.flipped;
        present(entry);
      });
      shadow.appendChild(chip);
      chips.push(chip);
      region.entry = entry;
    }
  }

  function present(entry) {
    if (!entry.chip.isConnected) return;
    const useOriginal = entry.flipped || !entry.translated;
    entry.chip.textContent = useOriginal ? entry.original : entry.translated;
    entry.chip.classList.toggle("pt-original", useOriginal);
    entry.chip.setAttribute("aria-label", (useOriginal ? "Original: " : "Tradução: ") +
      (useOriginal ? entry.original : entry.translated));
  }

  async function translateVisible(regions, currentEpoch) {
    let done = 0;
    for (const region of regions.slice(0, MAX_VISIBLE)) {
      if (!active || currentEpoch !== epoch) return;
      if (!region.entry) continue;
      try {
        const result = await translate(region.entry.original);
        if (!active || currentEpoch !== epoch) return;
        if (typeof result === "string" && result.trim()) {
          region.entry.translated = result.trim();
          present(region.entry);
          done++;
        }
      } catch (err) {
        if (!active || currentEpoch !== epoch) return;
        setStatus("Tradução indisponível: " + String(err.message || err));
        return;
      }
    }
    if (active && currentEpoch === epoch) {
      setStatus(done
        ? done + " fala(s) traduzida(s). Toque no texto para alternar EN/PT."
        : "Textos encontrados. Para traduzir, habilite Online ou use Chrome com tradução local.");
    }
  }

  async function scan() {
    if (!active || busy || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastScan < MIN_SCAN_GAP_MS) {
      scheduleScan(MIN_SCAN_GAP_MS - (now - lastScan) + 100);
      return;
    }
    const regions = scanPage
      ? [{ x: 0, y: 0, width: innerWidth, height: innerHeight }]
      : imageRects();
    if (!regions.length) {
      clearChips();
      setStatus("Nenhuma imagem grande visível. Use Página toda ou Seleção manual.");
      return;
    }
    const currentEpoch = ++epoch;
    busy = true;
    clearChips();
    setStatus("Reconhecendo os balões visíveis (OCR local)…");
    try {
      // A toolbar and previous overlays must not enter the screenshot.
      if (host) host.style.visibility = "hidden";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!active || currentEpoch !== epoch) return;
      lastScan = Date.now();
      const response = await chrome.runtime.sendMessage({
        type: "PT_CAPTURE_VIEW",
        viewport: { width: innerWidth, height: innerHeight },
        imageRegions: regions
      });
      if (!active || currentEpoch !== epoch) return;
      if (!response || !response.ok) throw new Error(response && response.error || "Falha no OCR.");
      const candidates = Array.isArray(response.regions) ? response.regions.slice(0, MAX_VISIBLE) : [];
      if (host) host.style.visibility = "visible";
      draw(candidates, currentEpoch);
      visibleRegions = candidates;
      if (candidates.length) {
        setStatus(candidates.length + " região(ões) de texto · OCR " + response.elapsedMs + " ms");
        void translateVisible(candidates, currentEpoch);
      } else {
        setStatus("OCR concluído, mas nenhum texto inglês confiável foi localizado.");
      }
    } catch (err) {
      if (active && currentEpoch === epoch) {
        const message = String(err.message || err);
        if (message.includes("OCR_INTERVAL")) scheduleScan(1600);
        setStatus("Não foi possível analisar: " + message);
      }
    } finally {
      if (host) host.style.visibility = "visible";
      busy = false;
      if (active && currentEpoch !== epoch) scheduleScan(900);
    }
  }

  function start() {
    if (active) return;
    active = true;
    const h = make("div");
    h.setAttribute("data-pagetranslator-auto", "true");
    document.documentElement.appendChild(h);
    host = h;
    shadow = h.attachShadow({ mode: "open" });
    const style = make("style");
    style.textContent = styleText;
    shadow.appendChild(style);
    const panel = make("section", "pt-panel");
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "PageTranslator automático");
    panel.appendChild(make("div", "pt-title", "PageTranslator · Auto EN → PT"));
    status = make("div", "pt-status", "Identificando imagens…");
    status.setAttribute("role", "status");
    panel.appendChild(status);
    const buttons = make("div", "pt-actions");
    const rescan = make("button", "", "Atualizar");
    const togglePage = make("button", "", "Página toda");
    const online = make("button", "pt-online", "Online: ativar");
    const manual = make("button", "", "Seleção manual");
    const pause = make("button", "", "Desligar");
    enableOnline = online;
    fullPage = togglePage;
    buttons.append(rescan, togglePage, online, manual, pause);
    panel.appendChild(buttons);
    panel.appendChild(make("div", "pt-notice",
      "OCR local. Ao ativar Online, somente textos reconhecidos serão enviados à MyMemory, inclusive após rolar (máximo de 30 pedidos por sessão). Não use com conteúdo sensível."));
    shadow.appendChild(panel);

    rescan.addEventListener("click", invalidate);
    togglePage.addEventListener("click", () => {
      scanPage = !scanPage;
      fullPage.textContent = scanPage ? "Somente imagens" : "Página toda";
      invalidate();
    });
    online.addEventListener("click", () => {
      onlineAllowed = !onlineAllowed;
      enableOnline.textContent = onlineAllowed ? "Online: desligar" : "Online: ativar";
      const currentEpoch = epoch;
      if (onlineAllowed && visibleRegions.length) {
        void translateVisible(visibleRegions, currentEpoch);
      } else {
        setStatus(onlineAllowed
          ? "Tradução online autorizada nesta aba e sessão. Atualize para processar."
          : "Tradução online desativada.");
      }
    });
    manual.addEventListener("click", () => {
      stop();
      void chrome.runtime.sendMessage({ type: "PT_MANUAL_REQUEST" });
    });
    pause.addEventListener("click", stop);

    window.addEventListener("scroll", invalidate, true);
    window.addEventListener("resize", invalidate, true);
    window.addEventListener("hashchange", invalidate, true);
    window.addEventListener("popstate", invalidate, true);
    document.addEventListener("load", handleImageLoad, true);
    document.addEventListener("visibilitychange", handleVisibility);
    if (document.body) {
      observer = new MutationObserver((changes) => {
        if (changes.some((change) =>
          (change.type === "attributes" && change.target instanceof HTMLImageElement) ||
          [...change.addedNodes].some((node) =>
            node.nodeType === Node.ELEMENT_NODE && (
              node.matches?.("img,canvas") || node.querySelector?.("img,canvas")
            )))) invalidate();
      });
      observer.observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset"]
      });
    }
    scheduleScan(200);
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message && message.type === "PT_AUTO_TOGGLE") {
      if (active) stop(); else start();
      respond({ ok: true, enabled: active });
    } else if (message && message.type === "PT_AUTO_STOP") {
      stop();
      respond({ ok: true });
    }
  });
})();

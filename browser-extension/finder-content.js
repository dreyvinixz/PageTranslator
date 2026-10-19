(() => {
  "use strict";
  if (globalThis.__pageTranslatorFinderLoaded) return;
  globalThis.__pageTranslatorFinderLoaded = true;
  const Core = globalThis.PageTranslatorFinderCore;
  if (!Core) throw new Error("PageTranslator: finder-core.js não foi carregado.");

  let host = null, root = null, mode = "comic", state = "closed", epoch = 0;
  let items = [], inspected = null, lastMs = 0, lastStatus = "Pronto para identificar imagens.";
  let restoring = null;

  const css = [
    ":host{all:initial;position:fixed;inset:0;z-index:2147483646;font:13px/1.45 system-ui,sans-serif;pointer-events:none;color:#f6fbff}",
    "*{box-sizing:border-box}",
    ".pt-menu{position:fixed;right:14px;bottom:14px;width:min(370px,calc(100vw - 28px));max-height:80vh;overflow-y:auto;background:#102239;color:#f4f8ff;border:1px solid #6187a9;border-radius:12px;padding:14px;box-shadow:0 9px 36px #0009;pointer-events:auto}",
    ".pt-head{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px;margin-bottom:7px}",
    ".pt-sub{color:#baccdd;margin:0 0 10px;font-size:12px}",
    ".pt-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}",
    "button{font:inherit;padding:7px 9px;background:#274564;color:#f7fcff;border:1px solid #6f98b8;border-radius:8px;cursor:pointer}",
    "button:hover{background:#366484}button:focus-visible{outline:2px solid white;outline-offset:2px}",
    "button[aria-pressed=true]{background:#177dbf;border-color:#87d4ff}",
    ".pt-primary{background:#1680b8;border-color:#62addb}.pt-close{padding:1px 5px;background:transparent;border:0;font-size:20px}",
    ".pt-status{padding:7px 9px;margin-top:10px;background:#263d55;border-radius:7px;white-space:pre-wrap;font-size:12px}",
    ".pt-count{margin-top:9px;color:#a9e1ff;font-size:12px}",
    ".pt-rect{position:fixed;border:2px solid #21bbef;background:rgba(24,171,222,.09);pointer-events:auto;border-radius:5px;cursor:pointer;padding:0;box-shadow:0 0 0 1px #0b263e55}",
    ".pt-rect[data-kind=balloon-candidate]{border-color:#ffcb58;background:rgba(255,203,88,.11);border-style:dashed}",
    ".pt-num{position:absolute;left:0;top:0;padding:1px 5px;background:#006998;color:white;border-radius:3px;font:700 11px system-ui}",
    ".pt-rect[data-kind=balloon-candidate] .pt-num{background:#99631b}",
    ".pt-selected{outline:3px solid white;outline-offset:1px}",
    ".pt-layer{position:fixed;inset:0;pointer-events:none}",
    ".pt-select{position:fixed;inset:0;z-index:2;background:#0002;pointer-events:auto;cursor:crosshair;touch-action:none}",
    ".pt-preview{position:absolute;border:2px solid #20d3ff;background:#09a9e52c;pointer-events:none}",
    ".pt-tip{position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:9px 12px;border-radius:9px;background:#102239;color:#fff;white-space:nowrap;font-size:13px;pointer-events:none;max-width:95vw}",
    ".pt-details{white-space:pre-wrap;overflow-wrap:anywhere;background:#1c344b;padding:9px;border:1px solid #456581;border-radius:8px;margin-top:10px;font-size:12px}",
    ".pt-small{font-size:11px;color:#bbd1e5;margin-top:10px}"
  ].join("");

  function el(tag, cls = "", value) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined) e.textContent = value;
    return e;
  }
  function ensure() {
    if (!host) {
      host = el("div");
      host.setAttribute("data-pagetranslator-finder", "true");
      root = host.attachShadow({ mode: "open" });
      const style = el("style");
      style.textContent = css;
      root.append(style);
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
    return root;
  }
  function clear() {
    const shadow = ensure();
    for (const e of Array.from(shadow.children)) if (e.tagName !== "STYLE") e.remove();
    return shadow;
  }
  function stop() {
    epoch++;
    state = "closed";
    if (host) host.remove();
    items = [];
  }
  function button(text, handler, cls = "", pressed) {
    const b = el("button", cls, text);
    if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", () => { void handler(b); });
    return b;
  }
  function render(message = lastStatus) {
    lastStatus = message;
    state = "menu";
    const shadow = clear();
    const layer = el("div", "pt-layer");
    shadow.append(layer);
    for (let i = 0; i < items.length; i++) {
      const c = items[i], r = c.rect;
      const outline = button(String(i + 1), () => {
        inspected = i;
        render("Região #" + (i + 1) + " selecionada. Confira as informações abaixo.");
      }, "pt-rect" + (inspected === i ? " pt-selected" : ""));
      outline.setAttribute("data-kind", c.kind);
      outline.setAttribute("title", c.label);
      outline.setAttribute("aria-label", c.label + " #" + (i + 1));
      Object.assign(outline.style, {
        left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px"
      });
      outline.textContent = "";
      outline.append(el("span", "pt-num", String(i + 1)));
      layer.append(outline);
    }
    const card = el("section", "pt-menu");
    const head = el("div", "pt-head");
    head.append(el("span", "", "PageTranslator · Finder 0.3.0"));
    head.append(button("×", stop, "pt-close"));
    card.append(head);
    card.append(el("p", "pt-sub",
      "Diagnóstico de regiões na tela. Esta versão NÃO executa OCR nem traduz."));
    card.append(el("div", "", "Modo de detecção"));
    const modes = el("div", "pt-row");
    modes.append(button("Genérico", () => changeMode("generic"), "", mode === "generic"));
    modes.append(button("Quadrinhos", () => changeMode("comic"), "", mode === "comic"));
    card.append(modes);
    const actions = el("div", "pt-row");
    actions.append(button("Selecionar imagem (manual)", startManual, "pt-primary"));
    actions.append(button("Identificar imagens (Finder)", startFinder, "pt-primary"));
    card.append(actions);
    if (items.length) {
      const images = items.filter((c) => c.kind !== "balloon-candidate").length;
      const balloons = items.length - images;
      card.append(el("div", "pt-count",
        images + " imagem(ns) / " + balloons + " possível(is) balão(ões) · " + lastMs + " ms"));
      const controls = el("div", "pt-row");
      controls.append(button("Limpar caixas", () => {
        items = [];
        inspected = null;
        render("Caixas ocultadas. Clique Finder para identificar novamente.");
      }));
      card.append(controls);
    }
    card.append(el("div", "pt-status", message));
    if (inspected !== null && items[inspected]) {
      const c = items[inspected], r = c.rect;
      card.append(el("div", "pt-details",
        "#" + (inspected + 1) + " · " + c.label + "\n" +
        "X: " + Math.round(r.x) + " · Y: " + Math.round(r.y) + "\n" +
        "Largura: " + Math.round(r.width) + " · Altura: " + Math.round(r.height) +
        (c.score === undefined ? "" : "\nÍndice heurístico: " + Math.round(c.score * 100) + "%") +
        "\nEste resultado não confirma que seja um balão."));
    }
    card.append(el("div", "pt-small",
      "Genérico: imagens, canvas e fundos de elementos HTML. Quadrinhos: acrescenta uma busca visual por áreas claras que podem conter falas. As caixas amarelas são hipóteses, não OCR."));
    shadow.append(card);
  }

  function changeMode(value) {
    epoch++;
    mode = value;
    items = [];
    inspected = null;
    render(value === "generic"
      ? "Modo Genérico selecionado. Identificação por elementos da página."
      : "Modo Quadrinhos selecionado. Finder buscará imagens e possíveis balões.");
  }

  function pageRect(node) {
    const b = node.getBoundingClientRect();
    const x = Math.max(0, b.left), y = Math.max(0, b.top);
    const right = Math.min(innerWidth, b.right), bottom = Math.min(innerHeight, b.bottom);
    const width = right - x, height = bottom - y;
    if (width < 45 || height < 40 || width * height < 3600) return null;
    return { x, y, width, height };
  }
  function collectImages() {
    const nodes = document.querySelectorAll("img,canvas,video,svg,[style*='background-image']");
    const candidates = [];
    for (const n of Array.from(nodes).slice(0, 500)) {
      if (n.closest("[data-pagetranslator-finder]")) continue;
      if (n instanceof HTMLImageElement && (!n.complete || n.naturalWidth === 0)) continue;
      let kind = "image", label = "Imagem";
      if (n instanceof HTMLCanvasElement) { kind = "canvas"; label = "Canvas renderizado"; }
      else if (n instanceof HTMLVideoElement) { kind = "video"; label = "Vídeo"; }
      else if (n instanceof SVGElement) { kind = "svg"; label = "Gráfico vetorial SVG"; }
      else if (!(n instanceof HTMLImageElement)) { kind = "background"; label = "Imagem de fundo CSS"; }
      const rect = pageRect(n);
      if (rect) candidates.push({ kind, label, rect });
    }
    return Core.dedupe(candidates, 18);
  }
  function startManual() {
    epoch++;
    state = "select";
    items = [];
    inspected = null;
    const shadow = clear();
    const surface = el("div", "pt-select");
    const tip = el("div", "pt-tip", "Arraste para marcar uma imagem ou região · ESC cancela");
    const preview = el("div", "pt-preview");
    preview.hidden = true;
    surface.append(preview, tip);
    shadow.append(surface);
    let anchor = null;
    function point(ev) {
      return { x: Math.max(0, Math.min(innerWidth, ev.clientX)),
        y: Math.max(0, Math.min(innerHeight, ev.clientY)) };
    }
    function bounds(ev) {
      const p = point(ev);
      const x = Math.min(anchor.x, p.x), y = Math.min(anchor.y, p.y);
      const width = Math.abs(anchor.x - p.x), height = Math.abs(anchor.y - p.y);
      Object.assign(preview.style, {
        left: x + "px", top: y + "px", width: width + "px", height: height + "px"
      });
      return { x, y, width, height };
    }
    surface.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      surface.setPointerCapture(ev.pointerId);
      anchor = point(ev);
      preview.hidden = false;
    });
    surface.addEventListener("pointermove", (ev) => { if (anchor) bounds(ev); });
    surface.addEventListener("pointercancel", () => render("Seleção cancelada."));
    surface.addEventListener("pointerup", (ev) => {
      if (!anchor) return;
      const rect = bounds(ev);
      anchor = null;
      if (rect.width < 20 || rect.height < 20) {
        render("Selecione uma região de pelo menos 20 × 20 pixels.");
        return;
      }
      const matching = collectImages().filter((item) =>
        Core.overlapArea(rect, item.rect) > rect.width * rect.height * 0.35);
      items = [{
        kind: "manual",
        label: "Região manual" + (matching.length ? " · " + matching[0].label : " · origem visual desconhecida"),
        rect
      }];
      inspected = 0;
      lastMs = 0;
      render("Seleção marcada sem OCR: " + Math.round(rect.width) +
        " × " + Math.round(rect.height) + " pixels. Clique na caixa para inspecionar.");
    });
  }
  async function startFinder() {
    const thisScan = ++epoch;
    state = "scanning";
    const start = performance.now();
    inspected = null;
    items = collectImages();
    render("Imagens encontradas. " +
      (mode === "comic" ? "Procurando possíveis balões claros…" : "Varredura Genérica concluída."));
    if (mode !== "comic") {
      lastMs = Math.round(performance.now() - start);
      render("Finder Genérico concluído. As caixas azuis indicam elementos de imagem.");
      return;
    }
    const pages = items.filter((x) => ["image", "canvas", "background", "svg"].includes(x.kind));
    if (!pages.length) {
      render("Nenhuma imagem visível detectada. Use Selecionar imagem (manual).");
      return;
    }
    // A captured screenshot is requested only once per explicit click; never during scroll.
    try {
      const currentHost = host;
      if (currentHost) currentHost.style.visibility = "hidden";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const timeout = new Promise((_, reject) => setTimeout(
        () => reject(new Error("Tempo limite da captura (7 segundos).")), 7000));
      const screenshot = await Promise.race([
        chrome.runtime.sendMessage({ type: "PT_FINDER_CAPTURE" }), timeout
      ]);
      if (currentHost) currentHost.style.visibility = "visible";
      if (!screenshot?.ok || typeof screenshot.image !== "string") {
        throw new Error(screenshot?.error || "Captura não retornou uma imagem.");
      }
      if (thisScan !== epoch) return;
      const image = new Image();
      image.src = screenshot.image;
      await image.decode();
      if (thisScan !== epoch) return;
      const ratio = Math.min(1, 850 / image.naturalWidth, 850 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * ratio));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D não está disponível.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      image.src = "";
      canvas.width = canvas.height = 0;
      const scaleX = data.width / innerWidth, scaleY = data.height / innerHeight;
      const allowed = pages.map((p) => ({
        x: p.rect.x * scaleX, y: p.rect.y * scaleY,
        width: p.rect.width * scaleX, height: p.rect.height * scaleY
      }));
      const balloons = Core.findLightRegions(data, allowed, { limit: 12 });
      if (thisScan !== epoch) return;
      const mapped = balloons.map((c) => ({
        ...c, label: "Possível balão (heurística visual)",
        rect: {
          x: c.rect.x / scaleX, y: c.rect.y / scaleY,
          width: c.rect.width / scaleX, height: c.rect.height / scaleY
        }
      }));
      items = [...items, ...mapped].slice(0, 28);
      lastMs = Math.round(performance.now() - start);
      render("Finder Quadrinhos concluído: azul = imagens; amarelo tracejado = possíveis balões. Não houve OCR.");
    } catch (e) {
      if (thisScan !== epoch) return;
      lastMs = Math.round(performance.now() - start);
      render("Imagens detectadas, mas a análise visual não terminou: " + String(e.message || e));
    } finally {
      if (host) host.style.visibility = "visible";
    }
  }

  window.addEventListener("scroll", () => {
    if (state !== "closed" && state !== "select" && state !== "scanning" && items.length) {
      epoch++;
      items = [];
      inspected = null;
      render("Página rolou. Caixas removidas para evitar posições erradas. Clique Finder novamente.");
    }
  }, true);
  window.addEventListener("resize", () => {
    if (state !== "closed" && state !== "select") {
      epoch++;
      items = [];
      inspected = null;
      render("Tamanho da página mudou. Clique Finder para atualizar.");
    }
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && state === "select") render("Seleção cancelada.");
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "PT_FINDER_OPEN") {
      epoch++;
      ensure();
      render("Escolha Genérico ou Quadrinhos; depois Seleção manual ou Finder.");
      respond({ ok: true });
    }
  });
})();

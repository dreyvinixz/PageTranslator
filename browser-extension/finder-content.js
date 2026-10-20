(() => {
  "use strict";
  if (globalThis.__pageTranslatorFinderLoaded) return;
  globalThis.__pageTranslatorFinderLoaded = true;
  const Core = globalThis.PageTranslatorFinderCore;
  const TextDetector = globalThis.PageTranslatorTextCandidates;
  const BalloonFit = globalThis.PageTranslatorBalloonFit;
  const AutoScan = globalThis.PageTranslatorAutoScanner;
  const Association = globalThis.PageTranslatorAssociation;
  const Shortcut = globalThis.PageTranslatorShortcut;
  const Instances = globalThis.PageTranslatorInstances;
  const Panels = globalThis.PageTranslatorPanels;
  const Language = globalThis.PageTranslatorLanguage;
  const OCRRegions = globalThis.PageTranslatorRegions;
  if (!Core || !TextDetector || !BalloonFit || !AutoScan || !Association || !Shortcut || !Instances || !Panels || !Language || !OCRRegions) throw new Error("PageTranslator: módulos de detecção não foram carregados.");

  let host = null, root = null, mode = "comic", state = "closed", epoch = 0;
  let items = [], inspected = null, lastMs = 0, lastStatus = "Pronto para identificar imagens.";
  // Scanner is event-driven (scroll/image/resize), not a background polling loop.
  let autoScanner = null;
  let shortcut = Shortcut.DEFAULT, recordingShortcut = false;
  let manualRestore = null;
  let ocrBusy = false, sourcePreference = "auto", targetPreference = "en";
  let lastPanels = [], lastOCRDiagnostics = null;

  const css = [
    ":host{all:initial;position:fixed;inset:0;z-index:2147483646;font:13px/1.45 system-ui,sans-serif;pointer-events:none;color:#f6fbff}",
    "*{box-sizing:border-box}",
    ".pt-menu{position:fixed;right:16px;bottom:16px;width:min(400px,calc(100vw - 32px));max-height:82vh;overflow-y:auto;background:linear-gradient(160deg,#10233b,#06182c 68%);color:#f4f8ff;border:1px solid #315575;border-radius:18px;padding:18px;box-shadow:0 16px 50px #000a;pointer-events:auto}",
    ".pt-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}",
    ".pt-brand{display:flex;align-items:center;gap:10px;min-width:0}.pt-logo{width:46px;height:46px;object-fit:contain;flex:none}.pt-brand-title{font-size:17px;font-weight:800;letter-spacing:-.4px;color:#f7fdff}.pt-brand-sub{font-size:11px;color:#78ddf1;font-weight:600}",
    ".pt-section{margin-top:13px;font-size:11px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;color:#8db5d6}",
    ".pt-sub{color:#bfd1e3;margin:0 0 12px;font-size:12px;line-height:1.5}",
    ".pt-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}",
    "button{font:inherit;padding:7px 9px;background:#274564;color:#f7fcff;border:1px solid #6f98b8;border-radius:8px;cursor:pointer}",
    "button:hover{background:#366484}button:focus-visible{outline:2px solid white;outline-offset:2px}",
    "button[aria-pressed=true]{background:#177dbf;border-color:#87d4ff}",
    ".pt-primary{background:#1680b8;border-color:#62addb}.pt-close{padding:1px 5px;background:transparent;border:0;font-size:20px}",
    ".pt-status{padding:10px 11px;margin-top:13px;background:#0b3043;border:1px solid #23546b;border-radius:10px;white-space:pre-wrap;font-size:12px}",
    ".pt-count{margin-top:9px;color:#a9e1ff;font-size:12px}",
    ".pt-rect{position:fixed;border:2px solid #21bbef;background:rgba(24,171,222,.09);pointer-events:auto;border-radius:5px;cursor:pointer;padding:0;box-shadow:0 0 0 1px #0b263e55}",
    ".pt-rect[data-kind=balloon-candidate],.pt-rect[data-kind=text-region-candidate]{border-color:#ffcb58;background:rgba(255,203,88,.11);border-style:dashed}",
    ".pt-num{position:absolute;left:0;top:0;padding:1px 5px;background:#006998;color:white;border-radius:3px;font:700 11px system-ui}",
    ".pt-rect[data-kind=balloon-candidate] .pt-num,.pt-rect[data-kind=text-region-candidate] .pt-num{background:#99631b}",
    ".pt-selected{outline:3px solid white;outline-offset:1px}",
    ".pt-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px;color:#afd1e8;font-size:11px}.pt-key{font:700 12px ui-monospace,monospace;padding:3px 7px;border:1px solid #45738d;border-radius:6px;background:#16384b;color:#e3fbff}",
    ".pt-rect[data-risk=mixing] .pt-num{background:#bd3345}",
    ".pt-rect[data-risk=mixing]{border-color:#ff6073;border-style:solid}",
    ".pt-layer{position:fixed;inset:0;pointer-events:none}",
    ".pt-select{position:fixed;inset:0;z-index:2;background:#0002;pointer-events:auto;cursor:crosshair;touch-action:none}",
    ".pt-preview{position:absolute;border:2px solid #20d3ff;background:#09a9e52c;pointer-events:none}.pt-preview[hidden]{display:none}",
    ".pt-tip{position:fixed;left:50%;top:14px;transform:translateX(-50%);padding:9px 12px;border-radius:9px;background:#102239;color:#fff;white-space:nowrap;font-size:13px;pointer-events:none;max-width:95vw}",
    ".pt-details{white-space:pre-wrap;overflow-wrap:anywhere;background:#0c2a42;padding:12px;border:1px solid #345a75;border-radius:10px;margin-top:10px;font-size:12px;line-height:1.65}",
    ".pt-small{font-size:11px;color:#bbd1e5;margin-top:10px}",
    ".pt-options{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.pt-field{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#b3ccdf}.pt-field select{background:#17364d;color:#e8fbff;border:1px solid #557e9a;border-radius:8px;padding:7px 10px;font:inherit}",
    ".pt-ocr-text{margin:10px 0;padding:10px;background:#122f44;border-radius:8px;color:#f6fcff;white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto}"
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
    autoScanner?.stop();
    epoch++;
    state = "closed";
    if (host) host.remove();
    items = [];
    lastPanels=[];
    recordingShortcut = false;
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
      if(mode==="comic" && !["text-region-candidate","balloon-candidate"].includes(c.kind))continue;
      const outline = button(String(i + 1), () => {
        inspected = i;
        render("Região #" + (i + 1) + " selecionada. Confira as informações abaixo.");
      }, "pt-rect" + (inspected === i ? " pt-selected" : ""));
      outline.setAttribute("data-kind", c.kind);
      if (c.risk) outline.setAttribute("data-risk", "mixing");
      outline.setAttribute("title", c.label);
      outline.setAttribute("aria-label", c.label + " #" + (i + 1));
      Object.assign(outline.style, {
        left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px"
      });
      outline.textContent = "";
      if(c.maskPolygon?.length>=4) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("viewBox","0 0 "+r.width+" "+r.height);
        svg.style.cssText="position:fixed;pointer-events:none;overflow:visible;"+
          "left:"+r.x+"px;top:"+r.y+"px;width:"+r.width+"px;height:"+r.height+"px";
        const poly = document.createElementNS("http://www.w3.org/2000/svg","polygon");
        poly.setAttribute("points",c.maskPolygon.map(([x,y])=>
          (x-r.x).toFixed(1)+","+(y-r.y).toFixed(1)).join(" "));
        poly.setAttribute("fill",c.risk?"rgba(241,84,111,.08)":"rgba(11,217,232,.08)");
        poly.setAttribute("stroke",c.risk?"#f15b73":"#04e0e9");
        poly.setAttribute("stroke-width","2");
        svg.append(poly);
        layer.append(svg);
        outline.style.borderColor="transparent";
        outline.style.background="transparent";
      }
      outline.append(el("span", "pt-num", String(i + 1)));
      layer.append(outline);
    }
    const card = el("section", "pt-menu");
    const head = el("div", "pt-head");
    const brand = el("div", "pt-brand");
    const logo = el("img", "pt-logo");
    logo.src = chrome.runtime.getURL("assets/logo.svg");
    logo.alt = "Logotipo PageTranslator";
    const brandText = el("div");
    brandText.append(el("div", "pt-brand-title", "PageTranslator"),
      el("div", "pt-brand-sub", "FINDER 0.7.1 · PREVIEW"));
    brand.append(logo, brandText);
    head.append(brand);
    const close = button("×", stop, "pt-close");
    close.setAttribute("aria-label", "Fechar Finder");
    head.append(close);
    card.append(head);
    card.append(el("p", "pt-sub",
      "Máscaras de instâncias candidatas · OCR PT/EN sob demanda · tradução local quando disponível."));
    card.append(el("div", "pt-section", "Modo de detecção"));
    const modes = el("div", "pt-row");
    modes.append(button("Genérico", () => changeMode("generic"), "", mode === "generic"));
    modes.append(button("Quadrinhos", () => changeMode("comic"), "", mode === "comic"));
    card.append(modes);
    const actions = el("div", "pt-row");
    actions.append(button("Selecionar imagem (manual)", startManual, "pt-primary"));
    actions.append(button("Identificar imagens (Finder)", () => autoScanner.refresh(), "pt-primary"));
    const scanOCR = button("Localizar textos por OCR", scanVisibleTextOCR, "pt-primary");
    scanOCR.disabled = ocrBusy;
    actions.append(scanOCR);
    actions.append(button(autoScanner?.enabled ? "Auto ao rolar: ligado" : "Auto ao rolar: pausado",
      () => {
        if (autoScanner.enabled) {
          autoScanner.stop();
          epoch++; // Drop any in-flight result when stopping.
          render("Varredura automática pausada. Clique Finder para reativar.");
        } else {
          autoScanner.start();
          render("Varredura ativada: detectando agora e após cada rolagem.");
        }
      }, "", autoScanner?.enabled));
    card.append(actions);
    const keys = el("div", "pt-meta");
    keys.append(el("span", "", "Atalho para ligar/desligar:"));
    keys.append(el("kbd", "pt-key", shortcut));
    keys.append(button(recordingShortcut ? "Pressione a combinação…" : "Personalizar",
      () => {
        recordingShortcut = true;
        render("Pressione F2–F12 ou uma combinação com Ctrl, Alt, Shift ou Meta. Esc cancela.");
      }));
    card.append(keys);
    if (items.length) {
      const images = items.filter((c) => !["balloon-candidate", "text-region-candidate"].includes(c.kind)).length;
      const balloons = items.filter((c) => ["balloon-candidate", "text-region-candidate"].includes(c.kind)).length;
      card.append(el("div", "pt-count",
        images + " imagem(ns) / " + balloons + " região(ões) de fala candidata(s) · " + lastMs + " ms"));
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
      const status = c.status === "REVIEW_REQUIRED" ? "REVISÃO NECESSÁRIA" :
        c.status === "PROVISIONAL_INSTANCE" ? "Instância com máscara (provisória)" :
        c.status === "CANDIDATE" ? "Hipótese de associação" :
        c.status === "TEXT_ONLY" ? "Texto sem balão confirmado" :
        "Seleção manual: não analisada";
      const shape = c.balloonHypothesis === "rounded" ? "Possível balão arredondado" :
        c.balloonHypothesis === "caption" ? "Possível caixa narrativa" :
        c.balloonId ? "Forma indeterminada" : "Não confirmado";
      const neighbors = c.nearbyTextGroupIds?.length
        ? c.nearbyTextGroupIds.join(", ") : "Nenhum grupo próximo reconhecido";
      card.append(el("div", "pt-details",
        "#" + (inspected + 1) + " · " + c.label + "\n" +
        "Status: " + status + "\n" +
        "É balão? " + shape + "\n" +
        "Possui texto? " + (c.textGroupId
          ? "Traços semelhantes a letras (" + (c.lineCount || "?") +
            " linhas); OCR pendente" : "Não avaliado") + "\n" +
        "O texto pertence ao balão? " +
          (c.balloonId ? c.balloonId + " (hipótese)" : "Sem atribuição segura") + "\n" +
        "Balões candidatos à associação: " +
          (c.candidateBalloonIds?.join(", ") || "nenhum") + "\n" +
        "Grupos de texto vizinhos: " + neighbors + "\n" +
        "Idioma do texto: " + (c.ocr?.language || "ainda não identificado") + "\n" +
        "Tradução: " + (c.translation ? "disponível neste par" : "ainda não verificada") + "\n" +
        (c.panelId ? "Quadro atribuído: "+c.panelId+"\n":"") +
        (lastOCRDiagnostics ? "OCR: preparação "+lastOCRDiagnostics.initMs+" ms · reconhecimento "+lastOCRDiagnostics.ocrMs+" ms\n":"") +
        (c.maskPixelCount ? "Máscara da instância: " + c.maskPixelCount + " pixels\n" : "") +
        "Recorte: X " + Math.round(r.x) + " · Y " + Math.round(r.y) +
          " · " + Math.round(r.width) + " × " + Math.round(r.height) + "\n" +
        (c.fit ? "Enquadramento: " + c.fit + "\n" : "") +
        (c.reason ? "Diagnóstico: " + c.reason + "\n" : "") +
        (c.risk ? "ATENÇÃO: não usar este recorte para tradução automática." :
          "Geometria candidata; validação visual ainda necessária.")));
      const options = el("div", "pt-options");
      function dropdown(labelText,current,values,callback) {
        const holder=el("label","pt-field");
        holder.append(el("span","",labelText));
        const select=el("select","");
        for(const [value,label] of values){
          const option=el("option","",label);
          option.value=value;
          if(value===current)option.selected=true;
          select.append(option);
        }
        select.addEventListener("change",()=>callback(select.value));
        holder.append(select);
        return holder;
      }
      options.append(
        dropdown("Idioma de origem",sourcePreference,
          [["auto","Automático"],["pt","Português"],["en","Inglês"]],
          v=>{sourcePreference=v;chrome.storage.local.set({sourcePreference:v});}),
        dropdown("Traduzir para",targetPreference,
          Object.entries(Language.languages),
          v=>{targetPreference=v;chrome.storage.local.set({targetPreference:v});})
      );
      card.append(options);
      if(c.ocr?.text) {
        card.append(el("div","pt-section","Texto reconhecido · OCR local"));
        card.append(el("div","pt-ocr-text",c.ocr.text));
        if(c.translation) {
          card.append(el("div","pt-section","Tradução"));
          card.append(el("div","pt-ocr-text",c.translation));
        }
        const tr=button("Traduzir localmente",()=>translateSelected(inspected),"pt-primary");
        tr.disabled=ocrBusy || c.ocr.language==="und" && sourcePreference==="auto";
        card.append(tr);
      } else {
        const read=button(ocrBusy?"Reconhecendo texto…":"Ler texto (OCR local)",
          ()=>readSelected(inspected),"pt-primary");
        read.disabled=ocrBusy || Boolean(c.risk);
        card.append(read);
      }
      if(c.risk)card.append(el("div","pt-small",
        "Recorte ambíguo: refine manualmente antes do OCR."));
      card.append(button("Refinar enquadramento manualmente", () => startManual(), "pt-primary"));
    }
    card.append(el("div", "pt-small",
      "O auto-scroll permanece independente do OCR. As máscaras são estimativas geométricas; não implicam balões semanticamente confirmados."));
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
    if (autoScanner.enabled) autoScanner.request("mode", 150);
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
    autoScanner.stop(); // Manual markup must remain until the user resumes Finder.
    manualRestore = { items: items.slice(), inspected };
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
    surface.addEventListener("pointercancel", () => cancelManual());
    surface.addEventListener("pointerup", (ev) => {
      if (!anchor) return;
      const rect = bounds(ev);
      anchor = null;
      if (rect.width < 20 || rect.height < 20) {
        cancelManual("Seleção insuficiente. Repita com pelo menos 20 × 20 pixels.");
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
      manualRestore = null;
      lastMs = 0;
      render("Seleção marcada sem OCR: " + Math.round(rect.width) +
        " × " + Math.round(rect.height) + " pixels. Clique na caixa para inspecionar.");
    });
  }
  async function scanVisibleTextOCR() {
    if (ocrBusy || state==="select" || mode!=="comic") return;
    const selectedBefore=inspected;
    const generation=++epoch;
    autoScanner.stop(); // Explicit expensive OCR pass; never every scroll.
    ocrBusy=true;
    render("Capturando página visível para OCR local; auto-scroll temporariamente pausado.");
    try {
      if(host)host.style.visibility="hidden";
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const shot=await chrome.runtime.sendMessage({type:"PT_FINDER_CAPTURE"});
      if(!shot?.ok || !shot.image)throw Error((shot?.code?"["+shot.code+"] ":"")+(shot?.error||"Captura falhou."));
      if(generation!==epoch)return;
      const photo=new Image();photo.src=shot.image;await photo.decode();
      const ratio=Math.min(1,1400/photo.naturalWidth,1400/photo.naturalHeight,
        Math.sqrt(1800000/(photo.naturalWidth*photo.naturalHeight)));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.floor(photo.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.floor(photo.naturalHeight*ratio));
      const ctx=canvas.getContext("2d");
      if(!ctx)throw Error("Canvas indisponível.");
      ctx.drawImage(photo,0,0,canvas.width,canvas.height);
      const width=canvas.width,height=canvas.height;
      const encoded=canvas.toDataURL("image/jpeg",.84);
      canvas.width=canvas.height=0;photo.src="";
      if(host)host.style.visibility="visible";
      render("Lendo português e inglês em todo o conteúdo visível. Aguarde…");
      const output=await chrome.runtime.sendMessage({
        type:"PT_FINDER_OCR",image:encoded,language:"por+eng"
      });
      if(!output?.ok)throw Error((output?.code?"["+output.code+"] ":"")+(output?.error||"OCR não respondeu."));
      if(generation!==epoch)return;
      lastOCRDiagnostics=output.diagnostics||null;
      // OCR lines never group across detected comic panels.
      const sourceLines=output.lines||[];
      const panelGroups=lastPanels.length?lastPanels.map(p=>sourceLines.filter(line=>{
        const b=line.bbox;
        if(!b)return false;
        const px=((b.x0+b.x1)/2)*innerWidth/width;
        const py=((b.y0+b.y1)/2)*innerHeight/height;
        return px>=p.rect.x && px<p.rect.x+p.rect.width &&
          py>=p.rect.y && py<p.rect.y+p.rect.height;
      })):[sourceLines];
      const candidates=panelGroups.flatMap(group=>
        OCRRegions.groupLinesConservative(group,24)).slice(0,30);
      let added=0,updated=0;
      function overlap(a,b){
        const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
        const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
        return w*h;
      }
      for(const region of candidates){
        const b=region.bbox;
        const scaled={x:b.x0*innerWidth/width,y:b.y0*innerHeight/height,
          width:(b.x1-b.x0)*innerWidth/width,
          height:(b.y1-b.y0)*innerHeight/height};
        if(scaled.width<12||scaled.height<7||scaled.width>innerWidth*.9)continue;
        const match=items.find(i=>i.inkRect&&overlap(i.inkRect,scaled)/
          Math.min(i.inkRect.width*i.inkRect.height,scaled.width*scaled.height)>.48);
        const language=Language.lexical(region.text).language;
        const ocr={text:region.text,confidence:region.confidence,language,
          languageMethod:"lexicon-heuristic"};
        if(match){
          if(!match.ocr?.text){match.ocr=ocr;updated++;}
          continue;
        }
        const margin=6;
        items.push({
          kind:"text-region-candidate",label:"Texto encontrado por OCR (balão não confirmado)",
          status:"TEXT_ONLY",textGroupId:"ocr-text-"+(added+1),
          inkRect:scaled,rect:{
            x:Math.max(0,scaled.x-margin),y:Math.max(0,scaled.y-margin),
            width:Math.min(innerWidth-scaled.x+margin,scaled.width+margin*2),
            height:Math.min(innerHeight-scaled.y+margin,scaled.height+margin*2)
          },ocr,balloonId:null,detectedLanguage:language,translationSupported:null,
          reason:"OCR_TEXT_WITHOUT_CONFIRMED_BALLOON",risk:false
        });
        added++;
        if(added>=24)break;
      }
      inspected=selectedBefore;
      render("OCR local concluído: "+updated+" candidato(s) completado(s), "+added+
        " região(ões) textual(is) adicional(is). Estas regiões NÃO são balões confirmados.");
    }catch(error){
      if(generation===epoch)render("Varredura OCR indisponível: "+String(error.message||error));
    }finally{
      if(host)host.style.visibility="visible";
      ocrBusy=false;
      if(generation===epoch&&state!=="closed")render(lastStatus);
    }
  }
  async function readSelected(index) {
    const c=items[index];
    if(!c || ocrBusy || c.risk || !c.rect) return;
    ocrBusy=true;
    autoScanner.stop(); // Keep the chosen text while OCR is running.
    const currentEpoch=++epoch;
    const previousIndex=inspected;
    render("Preparando recorte local: o OCR só recebe a região escolhida.");
    try {
      if(host)host.style.visibility="hidden";
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const capture=await chrome.runtime.sendMessage({type:"PT_FINDER_CAPTURE"});
      if(!capture?.ok || !capture.image)throw Error((capture?.code?"["+capture.code+"] ":"")+(capture?.error||"Captura não disponível."));
      if(currentEpoch!==epoch) return;
      const photo=new Image();
      photo.src=capture.image;await photo.decode();
      const ratioX=photo.naturalWidth/innerWidth,ratioY=photo.naturalHeight/innerHeight;
      const r=c.rect;
      const sx=Math.max(0,Math.floor(r.x*ratioX)),sy=Math.max(0,Math.floor(r.y*ratioY));
      const sw=Math.min(photo.naturalWidth-sx,Math.ceil(r.width*ratioX));
      const sh=Math.min(photo.naturalHeight-sy,Math.ceil(r.height*ratioY));
      if(sw<12||sh<12)throw Error("Recorte fora dos limites da captura.");
      const zoom=Math.min(2,1200/sw,1200/sh);
      const cvs=document.createElement("canvas");
      cvs.width=Math.max(1,Math.round(sw*zoom));
      cvs.height=Math.max(1,Math.round(sh*zoom));
      const ctx=cvs.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw Error("Canvas OCR indisponível.");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,cvs.width,cvs.height);
      if(c.maskPolygon?.length>3){
        ctx.save();ctx.beginPath();
        c.maskPolygon.forEach(([x,y],i)=>{
          const px=(x-r.x)*ratioX*zoom,py=(y-r.y)*ratioY*zoom;
          if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        });
        ctx.closePath();ctx.clip();
      }
      ctx.drawImage(photo,sx,sy,sw,sh,0,0,cvs.width,cvs.height);
      if(c.maskPolygon?.length>3)ctx.restore();
      const encoded=cvs.toDataURL("image/png");
      cvs.width=cvs.height=0;photo.src="";
      if(encoded.length>5_500_000)throw Error("Recorte grande demais: refine manualmente.");
      if(host)host.style.visibility="visible";
      const language=sourcePreference==="pt"?"por":
        sourcePreference==="en"?"eng":"por+eng";
      render("Executando OCR local de " + (language==="por+eng"?"português e inglês":language) + "…");
      const result=await chrome.runtime.sendMessage({type:"PT_FINDER_OCR",image:encoded,language});
      if(!result?.ok)throw Error((result?.code?"["+result.code+"] ":"")+(result?.error||"OCR não respondeu."));
      lastOCRDiagnostics=result.diagnostics||null;
      if(!result.text?.trim())throw Error("Nenhuma palavra identificada. Refine o recorte.");
      const detection=await Language.detect(result.text,sourcePreference);
      if(currentEpoch!==epoch || !items.includes(c))return;
      c.ocr={text:result.text,confidence:result.confidence,
        language:detection.language,languageMethod:detection.method};
      c.translation=null;
      inspected=previousIndex;
      render("OCR local concluído. Origem: " + detection.language +
        ". Verifique a transcrição antes de traduzir.");
    }catch(error){
      if(currentEpoch===epoch)render("OCR indisponível: " + String(error.message||error));
    }finally{
      if(host)host.style.visibility="visible";
      ocrBusy=false;
      if(currentEpoch===epoch && state!=="closed")render(lastStatus);
    }
  }
  async function translateSelected(index) {
    const c=items[index];
    if(!c?.ocr?.text||ocrBusy)return;
    const source=sourcePreference==="auto"?c.ocr.language:sourcePreference;
    const target=targetPreference;
    if(source==="und"||!source) {
      render("Idioma desconhecido: selecione manualmente Português ou Inglês.");return;
    }
    // Invoke immediately from click so model download retains browser user gesture.
    let translation;
    try{translation=Language.startTranslation(c.ocr.text,source,target);}
    catch(error){render("Tradução indisponível: "+String(error.message||error));return;}
    ocrBusy=true;
    render("Traduzindo localmente " + source.toUpperCase() + " → " + target.toUpperCase() +
      " (pode requerer download do pacote de idiomas)…");
    try{
      const result=await translation;
      if(!items.includes(c))return;
      c.translation=result;
      render("Tradução concluída. Confira o texto original ao lado da tradução.");
    }catch(error){render("Par indisponível ou download falhou: "+String(error.message||error));}
    finally{ocrBusy=false;if(state!=="closed")render(lastStatus);}
  }
  function cancelManual(message = "Seleção cancelada: regiões anteriores restauradas.") {
    if (state !== "select") return;
    if (manualRestore) {
      items = manualRestore.items;
      inspected = manualRestore.inspected;
    }
    manualRestore = null;
    render(message);
  }
  async function startFinder() {
    const thisScan = ++epoch;
    state = "scanning";
    const start = performance.now();
    inspected = null;
    items = collectImages();
    render("Imagens encontradas. " +
      (mode === "comic" ? "Procurando padrões de letras e possíveis balões…" : "Varredura Genérica concluída."));
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
    // Captures follow explicit Finder activation and debounced scrolling only; no polling.
    try {
      const currentHost = host;
      if (currentHost) currentHost.style.visibility = "hidden";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const screenshot = await chrome.runtime.sendMessage({ type: "PT_FINDER_CAPTURE" });
      if (currentHost) currentHost.style.visibility = "visible";
      if (!screenshot?.ok || typeof screenshot.image !== "string") {
        throw new Error((screenshot?.code?"["+screenshot.code+"] ":"")+(screenshot?.error || "Captura não retornou uma imagem."));
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
      // First detect panel gutters; then keep ink, masks and shapes in the panel.
      // The fallback is the image element when no reliable gutter exists.
      const panels=Panels.findPanels(data,allowed,{maxDepth:4}).slice(0,12);
      const limitedPanels=panels.length?panels:allowed.slice(0,8).map((rect,i)=>({
        id:"panel-"+(i+1),rect
      }));
      lastPanels=limitedPanels.map(p=>({id:p.id,rect:{
        x:p.rect.x/scaleX,y:p.rect.y/scaleY,
        width:p.rect.width/scaleX,height:p.rect.height/scaleY
      }}));
      const originalShapes=Core.findLightRegions(data,allowed,{limit:20});
      const shapes=limitedPanels.flatMap(p=>originalShapes.map(s=>{
        const piece=Panels.intersect(s.rect,p.rect);
        return piece && piece.width*piece.height>=220 ?
          {...s,rect:piece,panelId:p.id}:null;
      }).filter(Boolean)).slice(0,36);
      const inkCandidates=limitedPanels.flatMap(p=>
        TextDetector.findTextCandidates(data,[p.rect],{limit:8})
          .map(t=>({...t,panelId:p.id,panelRect:p.rect}))
      ).filter((t,i,a)=>!a.some((other,j)=>j<i &&
        Core.overlapArea(t.inkRect,other.inkRect)/
          Math.min(t.inkRect.width*t.inkRect.height,
            other.inkRect.width*other.inkRect.height)>.80)).slice(0,20);
      const bounded=Panels.confineTextToPanels(inkCandidates,limitedPanels);
      const instances=Instances.buildInstances(data,shapes,bounded);
      const balloons=BalloonFit.refineSpeechRegions(data,bounded,{limit:20})
        .map(c=>{const panel=limitedPanels.find(p=>p.id===c.panelId);
          if(!panel)return {...c,panelRisk:true};
          const rect=Panels.intersect(c.rect,panel.rect);
          return {...c,rect:rect||c.rect,panelRisk:c.panelRisk||!rect};
        });
      if (thisScan !== epoch) return;
      const mapped = balloons.map((c) => {
        const area = c.rect.width * c.rect.height;
        const supporting = shapes.find((s) => {
          const areaShape = s.rect.width * s.rect.height;
          const overlap = Core.overlapArea(c.rect, s.rect);
          return areaShape >= area * 0.55 && areaShape <= area * 1.6 &&
            overlap / Math.min(area, areaShape) >= 0.55;
        });
        return {
        ...c, label: supporting?.shape === "rectangular" ? "Texto em possível caixa retangular" :
          supporting?.shape === "rounded" ? "Texto em possível balão arredondado" :
          "Região com traços de letras em fundo claro",
        rect: {
          x: c.rect.x / scaleX, y: c.rect.y / scaleY,
          width: c.rect.width / scaleX, height: c.rect.height / scaleY
        },
        inkRect: c.inkRect ? {
          x: c.inkRect.x / scaleX, y: c.inkRect.y / scaleY,
          width: c.inkRect.width / scaleX, height: c.inkRect.height / scaleY
        } : undefined
      }; });
      // Rectangular label overlap is okay; collision of unpadded ink is not.
      const safeCandidates = Core.markMixedInkRegions(mapped).map((c) => ({
        ...c, risk: c.risk || c.fitRisk || c.panelRisk
      }));
      // Both inputs must share viewport coordinates: old v0.5 passed downscaled
      // shape boxes against CSS-pixel text boxes and lost valid associations.
      const viewportShapes = shapes.map(shape => ({...shape,rect:{
        x:shape.rect.x/scaleX,y:shape.rect.y/scaleY,
        width:shape.rect.width/scaleX,height:shape.rect.height/scaleY
      }}));
      const assigned = Association.associate(viewportShapes, safeCandidates).map((c,i) => {
        const instance=instances[i];
        return {
        ...c,
        ...(instance ? {
          instanceId:instance.id,
          maskPixelCount:instance.maskPixelCount,
          maskPolygon:instance.maskPolygon.map(([x,y])=>[x/scaleX,y/scaleY]),
          splitFromConnectedShape:instance.splitFromConnectedShape,
          balloonId:instance.id,
          // Old bbox contamination can be eliminated by an isolated mask.
          // Never suppress genuine ink overlap or two competing shapes.
          status:(instance.risk || c.panelRisk || ["INK_OVERLAP","MULTIPLE_BALLOON_CANDIDATES"].includes(c.reason))
            ?"REVIEW_REQUIRED":"PROVISIONAL_INSTANCE",
          risk:Boolean(instance.risk || c.panelRisk ||
            ["INK_OVERLAP","MULTIPLE_BALLOON_CANDIDATES"].includes(c.reason)),
          reason:instance.splitFromConnectedShape && !instance.risk &&
            !["INK_OVERLAP","MULTIPLE_BALLOON_CANDIDATES"].includes(c.reason)
              ?"SEPARATED_BY_SEEDED_MASK":c.reason,
          rect:{x:instance.bbox.x/scaleX,y:instance.bbox.y/scaleY,
            width:instance.bbox.width/scaleX,height:instance.bbox.height/scaleY}
        }:{}),
        label: c.status === "REVIEW_REQUIRED" ? "Região com associação ambígua" :
          c.balloonHypothesis === "rounded" ? "Possível balão arredondado com texto" :
          c.balloonHypothesis === "caption" ? "Possível caixa narrativa com texto" :
          "Texto em região visual ainda não classificada"
      }; });
      items = [...items.filter(x=>x.kind==="manual"), ...assigned].slice(0,28);
      // Do not render giant DOM image bounds as if they were comic balloons.
      lastMs = Math.round(performance.now() - start);
      render("Finder Quadrinhos: falas candidatas isoladas. Atualização automática durante a leitura. Vermelho = revisão necessária. Clique na caixa para OCR local sob demanda.");
    } catch (e) {
      if (thisScan !== epoch) return;
      lastMs = Math.round(performance.now() - start);
      render("Imagens detectadas, mas a análise visual não terminou: " + String(e.message || e));
    } finally {
      if (host) host.style.visibility = "visible";
    }
  }

  // DOM handling remains separate from scheduling so scroll bursts cannot
  // create concurrent screenshots or keep stale rectangles at wrong positions.
  function invalidateViewport(reason) {
    if (state === "closed" || state === "select") return;
    ++epoch;
    const hadRegions = items.length > 0 || inspected !== null;
    items = [];
    inspected = null;
    lastPanels=[];
    if (hadRegions || (autoScanner?.busy && !lastStatus.startsWith("Conteúdo mudou"))) {
      render(reason === "hidden" ? "Aba em segundo plano: leitura suspensa." :
        "Conteúdo mudou; aguardando a rolagem terminar para identificar novamente…");
    }
  }
  autoScanner = AutoScan.createAutoScanner({
    scan: () => startFinder(),
    isVisible: () => document.visibilityState === "visible" &&
      state !== "closed" && state !== "select",
    invalidate: invalidateViewport,
    onError: (error) => {
      ++epoch;
      render("Scanner pausado após falha: " + String(error.message || error) +
        ". Clique Finder para tentar novamente.");
    }
  }, { idleMs: 1000, gapMs: 4000 });

  window.addEventListener("scroll", (event) => {
    if (host && event.composedPath?.().includes(host)) return;
    if (state === "closed" || state === "select") return;
    if (autoScanner.enabled) autoScanner.request("scroll", 1000);
    else invalidateViewport("scroll");
  }, true);
  window.addEventListener("resize", () => {
    if (state === "closed" || state === "select") return;
    if (autoScanner.enabled) autoScanner.request("resize", 1100);
    else invalidateViewport("resize");
  }, true);
  document.addEventListener("load", (event) => {
    if (event.target instanceof HTMLImageElement && autoScanner.enabled &&
        state !== "select") autoScanner.request("image", 1300);
  }, true);
  document.addEventListener("visibilitychange", () => {
    autoScanner.visibilityChanged();
  });
  // Read the preference from extension storage (not the comic website's storage).
  chrome.storage.local.get({ finderShortcut: Shortcut.DEFAULT, sourcePreference:"auto", targetPreference:"en" }).then(settings => {
    if (Shortcut.valid(settings.finderShortcut)) shortcut = settings.finderShortcut;
    if (["auto","pt","en"].includes(settings.sourcePreference)) sourcePreference=settings.sourcePreference;
    if (Language.languages[settings.targetPreference]) targetPreference=settings.targetPreference;
    if (state !== "closed" && state !== "select" && !recordingShortcut) render();
  }).catch(error => console.warn("PageTranslator: atalho padrão preservado.", error));

  window.addEventListener("keydown", (ev) => {
    if (recordingShortcut) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        recordingShortcut = false;
        render("Alteração de atalho cancelada.");
        return;
      }
      const next = Shortcut.shortcutFromEvent(ev);
      if (next && Shortcut.valid(next)) {
        ev.preventDefault();
        ev.stopPropagation();
        recordingShortcut = false;
        shortcut = next;
        chrome.storage.local.set({ finderShortcut: shortcut }).catch(error =>
          console.warn("PageTranslator: falha ao persistir atalho.", error));
        render("Atalho definido: " + shortcut + ". Ele funciona nesta página após ativar a extensão.");
      }
      return;
    }
    if (ev.key === "Escape" && state === "select") {
      ev.preventDefault();
      cancelManual();
      return;
    }
    if (ev.repeat || Shortcut.editable(ev.target)) return;
    if (Shortcut.shortcutFromEvent(ev) !== shortcut) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (state === "closed") {
      ensure();
      autoScanner.start();
      render("Finder reativado pelo atalho " + shortcut + ".");
    } else stop();
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "PT_FINDER_OPEN") {
      epoch++;
      ensure();
      autoScanner.start();
      render("Finder automático ativo. Atalho: " + shortcut + ". A leitura atualiza quando você rolar.");
      respond({ ok: true });
    }
  });
})();

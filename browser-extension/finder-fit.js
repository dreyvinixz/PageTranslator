/* Refine independent text regions toward their surrounding balloon boundaries.
   OCR-free; no model download, no remote service, and no shared speech ownership. */
(function (root) {
  "use strict";

  function valid(r) {
    return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
      r.width > 0 && r.height > 0;
  }
  function intersection(a, b) {
    const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return w * h;
  }
  function contains(outer, inner, gap = 0) {
    return outer.x <= inner.x - gap && outer.y <= inner.y - gap &&
      outer.x + outer.width >= inner.x + inner.width + gap &&
      outer.y + outer.height >= inner.y + inner.height + gap;
  }
  function refineSpeechRegions(image, candidates, opts = {}) {
    const { width: w, height: h, data } = image || {};
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 ||
        w * h > 1500000 || !data || data.length < w * h * 4 ||
        !Array.isArray(candidates)) return [];
    const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
    const cores = candidates.filter((c) => valid(c.inkRect)).map((c) => c.inkRect);
    const maxCandidates = clamp(opts.limit || 18, 1, 25);
    // A near-white/neutral background (not bright colored windows) is the only
    // condition under which a boundary-directed expansion is attempted.
    function white(x, y) {
      const index = (y * w + x) * 4;
      const r = data[index], g = data[index + 1], b = data[index + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return r >= 210 && g >= 210 && b >= 200 && mx - mn <= 55;
    }
    function fraction(axis, pos, ink) {
      let tested = 0, hits = 0;
      const x0 = clamp(Math.floor(ink.x), 0, w - 1);
      const y0 = clamp(Math.floor(ink.y), 0, h - 1);
      const x1 = clamp(Math.ceil(ink.x + ink.width), x0 + 1, w);
      const y1 = clamp(Math.ceil(ink.y + ink.height), y0 + 1, h);
      if (axis === "x") {
        if (pos < 0 || pos >= w) return 0;
        for (let y = y0; y < y1; y += 2) {
          tested++;
          if (white(pos, y)) hits++;
        }
      } else {
        if (pos < 0 || pos >= h) return 0;
        for (let x = x0; x < x1; x += 2) {
          tested++;
          if (white(x, pos)) hits++;
        }
      }
      return tested ? hits / tested : 0;
    }
    function scan(axis, ink, direction, limit) {
      const edge = axis === "x"
        ? (direction < 0 ? ink.x : ink.x + ink.width)
        : (direction < 0 ? ink.y : ink.y + ink.height);
      let best = null, misses = 0;
      for (let step = 1; step <= limit; step++) {
        const pos = clamp(Math.floor(edge + direction * step), 0,
          axis === "x" ? w - 1 : h - 1);
        const ratio = fraction(axis, pos, ink);
        if (ratio >= 0.28) {
          best = pos;
          misses = 0;
        } else if (++misses >= 4) {
          break;
        }
      }
      // No clear boundary within search budget: don't expand into a large
      // white panel or window based on weak evidence.
      return best !== null && misses >= 4 ? best : null;
    }

    return candidates.slice(0, maxCandidates).map((c, i) => {
      if (!valid(c.rect) || !valid(c.inkRect)) return { ...c, fit: "text-only" };
      const ink = c.inkRect;
      const base = c.rect;
      // A failed light-background test is a safe fallback for dark/colored balloons:
      // improve text isolation rather than inventing an ungrounded outline.
      const stepsX = Math.ceil(clamp(ink.width * 0.85, 12, 62));
      const stepsY = Math.ceil(clamp(ink.height * 2.5 + 8, 16, 70));
      const left = scan("x", ink, -1, stepsX);
      const right = scan("x", ink, 1, stepsX);
      const top = scan("y", ink, -1, stepsY);
      const bottom = scan("y", ink, 1, stepsY);
      let x0 = clamp(Math.floor(Math.min(base.x, left === null ? base.x : left - 2)), 0, w - 1);
      let y0 = clamp(Math.floor(Math.min(base.y, top === null ? base.y : top - 2)), 0, h - 1);
      let x1 = clamp(Math.ceil(Math.max(base.x + base.width,
        right === null ? base.x + base.width : right + 3)), 1, w);
      let y1 = clamp(Math.ceil(Math.max(base.y + base.height,
        bottom === null ? base.y + base.height : bottom + 3)), 1, h);
      let crop = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      let blocked = false;
      for (let j = 0; j < cores.length; j++) {
        if (j === i) continue;
        const foreign = cores[j];
        if (!valid(foreign) || intersection(crop, foreign) <= 0) continue;
        // Choose the smallest crop reduction that keeps our own text intact.
        const cuts = [
          { side: "left", value: foreign.x + foreign.width + 2 },
          { side: "right", value: foreign.x - 2 },
          { side: "top", value: foreign.y + foreign.height + 2 },
          { side: "bottom", value: foreign.y - 2 }
        ];
        const options = [];
        for (const cut of cuts) {
          let a = crop.x, b = crop.y, cRight = crop.x + crop.width,
              dBottom = crop.y + crop.height;
          if (cut.side === "left") a = Math.max(a, cut.value);
          if (cut.side === "right") cRight = Math.min(cRight, cut.value);
          if (cut.side === "top") b = Math.max(b, cut.value);
          if (cut.side === "bottom") dBottom = Math.min(dBottom, cut.value);
          const proposal = { x: a, y: b, width: cRight - a, height: dBottom - b };
          if (valid(proposal) && contains(proposal, ink)) {
            options.push({ proposal, loss: crop.width * crop.height - proposal.width * proposal.height });
          }
        }
        if (options.length) {
          options.sort((a, b) => a.loss - b.loss);
          crop = options[0].proposal;
        } else {
          blocked = true;
        }
      }
      const contamination = cores.some((foreign, j) => i !== j &&
        valid(foreign) && intersection(crop, foreign) > 0);
      const expansions = [
        base.x - crop.x, base.y - crop.y,
        crop.x + crop.width - base.x - base.width,
        crop.y + crop.height - base.y - base.height
      ];
      const meaningful = expansions.some((v) => v >= 3);
      return {
        ...c, rect: crop,
        fit: blocked || contamination ? "review" : meaningful ? "balloon-margin" : "text-only",
        fitRisk: Boolean(blocked || contamination)
      };
    });
  }
  root.PageTranslatorBalloonFit = { refineSpeechRegions, intersection };
})(typeof globalThis === "object" ? globalThis : self);

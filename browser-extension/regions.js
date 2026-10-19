/* Pure geometry heuristics: text regions approximating speech balloons, not image segmentation. */
(function (root) {
  "use strict";

  function finiteRect(b) {
    if (!b || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) return null;
    if (b.x1 <= b.x0 || b.y1 <= b.y0) return null;
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  }

  function collectLines(blocks, scaleX, scaleY, maxX, maxY) {
    const result = [];
    if (!Array.isArray(blocks) || !(scaleX > 0) || !(scaleY > 0)) return result;
    for (const block of blocks.slice(0, 200)) {
      for (const paragraph of (block.paragraphs || []).slice(0, 100)) {
        for (const line of (paragraph.lines || []).slice(0, 100)) {
          const bbox = finiteRect(line.bbox);
          const text = String(line.text || "").replace(/\s+/g, " ").trim();
          const confidence = Number(line.confidence);
          if (!bbox || !text || text.length > 350 || !Number.isFinite(confidence) ||
              confidence < 32 || !/[a-z]{2}/i.test(text)) continue;
          const x0 = Math.max(0, bbox.x0 * scaleX);
          const y0 = Math.max(0, bbox.y0 * scaleY);
          const x1 = Math.min(maxX, bbox.x1 * scaleX);
          const y1 = Math.min(maxY, bbox.y1 * scaleY);
          if (x1 - x0 < 8 || y1 - y0 < 6 || x1 - x0 > maxX * 0.85) continue;
          result.push({ text, confidence, bbox: { x0, y0, x1, y1 } });
        }
      }
    }
    return result.slice(0, 180);
  }

  function overlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  function joinable(last, next) {
    const a = last.bbox, b = next.bbox;
    const h1 = a.y1 - a.y0, h2 = b.y1 - b.y0;
    const gap = b.y0 - a.y1;
    if (gap < -Math.min(h1, h2) * 0.55 || gap > Math.max(13, 1.35 * Math.max(h1, h2))) return false;
    const w1 = a.x1 - a.x0, w2 = b.x1 - b.x0;
    const intersection = overlap(a.x0, a.x1, b.x0, b.x1);
    const centerDistance = Math.abs((a.x0 + a.x1 - b.x0 - b.x1) / 2);
    if (intersection / Math.min(w1, w2) < 0.3 && centerDistance > 0.3 * Math.max(w1, w2)) return false;
    const combinedHeight = Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0);
    if (combinedHeight > Math.max(180, h1 * 8)) return false;
    return true;
  }

  function groupLines(lines, maxRegions = 12) {
    const sorted = (Array.isArray(lines) ? lines : [])
      .filter((line) => finiteRect(line.bbox) && typeof line.text === "string")
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const clusters = [];
    for (const line of sorted) {
      const bbox = line.bbox;
      const text = line.text.trim();
      if (!text) continue;
      let chosen = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < clusters.length; i++) {
        const group = clusters[i];
        if (group.text.length + text.length >= 350 || !joinable(group.last, line)) continue;
        const dy = Math.abs(bbox.y0 - group.last.bbox.y1);
        if (dy < bestDistance) { chosen = i; bestDistance = dy; }
      }
      if (chosen < 0) {
        clusters.push({
          text, bbox: { ...bbox }, confidence: Number(line.confidence) || 0,
          count: 1, last: line
        });
      } else {
        const cluster = clusters[chosen];
        cluster.text += " " + text;
        cluster.confidence += Number(line.confidence) || 0;
        cluster.count++;
        cluster.bbox = {
          x0: Math.min(cluster.bbox.x0, bbox.x0),
          y0: Math.min(cluster.bbox.y0, bbox.y0),
          x1: Math.max(cluster.bbox.x1, bbox.x1),
          y1: Math.max(cluster.bbox.y1, bbox.y1)
        };
        cluster.last = line;
      }
    }
    return clusters
      .filter((g) => g.text.length >= 3 && /[a-z]{2}/i.test(g.text))
      .map((g) => ({
        text: g.text, confidence: Math.round(g.confidence / g.count),
        bbox: {
          x0: Math.round(g.bbox.x0), y0: Math.round(g.bbox.y0),
          x1: Math.round(g.bbox.x1), y1: Math.round(g.bbox.y1)
        },
        lineCount: g.count
      }))
      .slice(0, Math.max(0, Math.min(20, maxRegions)));
  }

  root.PageTranslatorRegions = { collectLines, groupLines };
})(typeof globalThis === "object" ? globalThis : self);

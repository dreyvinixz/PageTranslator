/* PageTranslator Finder: deterministic, OCR-free candidate geometry. */
(function (scope) {
  "use strict";
  function validRect(rect) {
    return Boolean(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width > 0 && rect.height > 0);
  }
  function overlapArea(a, b) {
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return width * height;
  }
  function dedupe(rects, limit = 15) {
    const sorted = rects.filter((x) => validRect(x.rect))
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    const kept = [];
    for (const item of sorted) {
      const area = item.rect.width * item.rect.height;
      if (!kept.some((other) =>
        overlapArea(item.rect, other.rect) / Math.min(area,
          other.rect.width * other.rect.height) > 0.88)) kept.push(item);
      if (kept.length >= limit) break;
    }
    return kept;
  }

  // Bright, approximately uniform connected regions are only *balloon candidates*.
  // No semantic segmentation, OCR, or external AI services are involved.
  function findLightRegions(image, permittedRects, options = {}) {
    const { width, height, data } = image || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 ||
        height <= 0 || width * height > 1500000 ||
        !data || data.length < width * height * 4 ||
        !Array.isArray(permittedRects) || !permittedRects.length) return [];
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    const results = [];
    const maxResults = Math.min(25, Math.max(1, options.limit || 18));
    const minSize = Math.max(12, Math.round(Math.min(width, height) * 0.035));
    const maxArea = Math.max(1500, Math.round(total * 0.30));
    function bright(i) {
      const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
      return r >= 192 && g >= 192 && b >= 185 &&
        Math.max(r, g, b) - Math.min(r, g, b) <= 56;
    }
    function insidePage(px, py) {
      return permittedRects.some((r) =>
        px >= r.x && py >= r.y && px <= r.x + r.width && py <= r.y + r.height);
    }
    // Stride-free scan; small canvas (<= 850px across) keeps CPU bounded.
    for (let i = 0; i < total; i++) {
      if (visited[i] || !bright(i)) continue;
      let head = 0, tail = 0;
      visited[i] = 1;
      queue[tail++] = i;
      let x0 = width, y0 = height, x1 = 0, y1 = 0;
      while (head < tail) {
        const n = queue[head++], x = n % width, y = (n / width) | 0;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
        const adjacent = [x > 0 ? n - 1 : -1, x < width - 1 ? n + 1 : -1,
          y > 0 ? n - width : -1, y < height - 1 ? n + width : -1];
        for (const j of adjacent) {
          if (j < 0 || visited[j]) continue;
          visited[j] = 1;
          if (bright(j)) queue[tail++] = j;
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const boxArea = w * h, aspect = w / h, fill = tail / boxArea;
      if (w < minSize || h < minSize * 0.65 ||
          boxArea > maxArea || boxArea < 350 ||
          tail < 220 || fill < 0.42 || aspect < 0.68 || aspect > 8) continue;
      const centerX = x0 + w / 2, centerY = y0 + h / 2;
      if (!insidePage(centerX, centerY)) continue;
      // Reject mostly blank bright panels/margins: need dark details inside.
      let dark = 0, samples = 0;
      const stepx = Math.max(1, Math.floor(w / 18));
      const stepy = Math.max(1, Math.floor(h / 12));
      for (let y = y0 + 2; y < y1 - 1; y += stepy) {
        for (let x = x0 + 2; x < x1 - 1; x += stepx) {
          const idx = (y * width + x) * 4;
          samples++;
          if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 < 115) dark++;
        }
      }
      const darkRatio = samples ? dark / samples : 0;
      if (darkRatio < 0.007 || darkRatio > 0.42) continue;
      // Corner occupancy distinguishes rectangular caption boxes from ovals
      // only approximately; these are *shape guesses*, not semantic labels.
      const corners = [
        [x0 + Math.round(w * 0.10), y0 + Math.round(h * 0.10)],
        [x1 - Math.round(w * 0.10), y0 + Math.round(h * 0.10)],
        [x0 + Math.round(w * 0.10), y1 - Math.round(h * 0.10)],
        [x1 - Math.round(w * 0.10), y1 - Math.round(h * 0.10)]
      ];
      const litCorners = corners.filter(([x, y]) => bright(y * width + x)).length;
      const shape = litCorners >= 3 ? "rectangular" :
        litCorners <= 1 ? "rounded" : "unknown";
      const score = Math.min(0.89, Math.max(0.28,
        0.28 + 0.40 * fill + (darkRatio >= 0.02 ? 0.12 : 0) +
        (aspect >= 1.1 && aspect <= 4 ? 0.07 : 0)));
      results.push({
        kind: "balloon-candidate", shape, score: Number(score.toFixed(2)),
        rect: { x: x0, y: y0, width: w, height: h }
      });
      if (results.length >= maxResults * 3) break;
    }
    return dedupe(results, maxResults);
  }
  scope.PageTranslatorFinderCore = { validRect, overlapArea, dedupe, findLightRegions };
})(typeof globalThis !== "undefined" ? globalThis : self);

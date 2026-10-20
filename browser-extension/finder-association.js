/* Conservative speech/text association for Finder previews.
   Candidates are geometry hypotheses, never confirmed OCR or translations. */
(function (root) {
  "use strict";
  const good = r => !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.width > 0 && r.height > 0;
  const area = r => r.width * r.height;
  function intersection(a, b) {
    if (!good(a) || !good(b)) return 0;
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  }
  function proximity(a, b) {
    const dx = Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width);
    const dy = Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height);
    return Math.hypot(dx, dy);
  }
  function associate(shapes, regions, options = {}) {
    if (!Array.isArray(shapes) || !Array.isArray(regions)) return [];
    const shapeList = shapes.filter(s => good(s?.rect)).slice(0, 30);
    const textList = regions.filter(t => good(t?.inkRect) && good(t?.rect)).slice(0, 30);
    const support = textList.map(t => shapeList.map((s, i) => ({
      index: i, coverage: intersection(s.rect, t.inkRect) / area(t.inkRect)
    })).filter(c => c.coverage >= 0.60).sort((a, b) => b.coverage - a.coverage));
    const owners = support.map(matches => matches.length === 1 && matches[0].coverage >= 0.78
      ? matches[0].index : null);
    const sharedCounts = new Map();
    for (const owner of owners) if (owner !== null) sharedCounts.set(owner,
      (sharedCounts.get(owner) || 0) + 1);
    return textList.map((t, i) => {
      const matches = support[i], owner = owners[i];
      const mixedInk = textList.some((other, j) => j !== i &&
        intersection(t.inkRect, other.inkRect) /
          Math.min(area(t.inkRect), area(other.inkRect)) > 0.12);
      const tooClose = Math.max(12, Math.min(42, Math.max(t.inkRect.width,
        t.inkRect.height) * 0.30));
      const neighbors = textList.map((other, j) =>
        j !== i && proximity(t.inkRect, other.inkRect) <= tooClose ? j + 1 : null)
        .filter(Number.isInteger);
      const ambiguous = matches.length > 1 || (matches.length && owner === null) ||
        (owner !== null && sharedCounts.get(owner) > 1);
      const risk = Boolean(t.risk || t.fitRisk || mixedInk || ambiguous);
      const hypothesis = owner === null ? "unverified" :
        shapeList[owner].shape === "rounded" ? "rounded" :
        shapeList[owner].shape === "rectangular" ? "caption" : "unknown";
      const status = risk ? "REVIEW_REQUIRED" : owner === null ? "TEXT_ONLY" : "CANDIDATE";
      return {
        ...t, risk, status,
        textGroupId: "text-" + (i + 1),
        // Shape identities are local to this screenshot, not persistent IDs.
        balloonId: owner === null ? null : "shape-" + (owner + 1),
        candidateBalloonIds: matches.map(m => "shape-" + (m.index + 1)),
        balloonHypothesis: hypothesis,
        nearbyTextGroupIds: neighbors.map(n => "text-" + n),
        detectedLanguage: null, translationSupported: null,
        reason: mixedInk ? "INK_OVERLAP" : t.fitRisk ? "CROP_CONTAMINATION" :
          matches.length > 1 ? "MULTIPLE_BALLOON_CANDIDATES" :
          owner !== null && sharedCounts.get(owner) > 1 ? "SHARED_BALLOON_CANDIDATE" :
          matches.length && owner === null ? "INSUFFICIENT_COVERAGE" :
          t.risk ? "CROP_CONTAMINATION" : owner === null ?
          "BALLOON_NOT_CONFIRMED" : "PROVISIONAL_ASSOCIATION"
      };
    });
  }
  root.PageTranslatorAssociation = { associate, intersection, proximity };
})(typeof globalThis === "object" ? globalThis : self);

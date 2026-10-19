/* Debounced, serialized, event-driven auto-scan scheduler.
 * Runs only while explicitly enabled, on an active/visible page.
 * No polling and no capture until the UI requests a scan. */
(function (scope) {
  "use strict";
  function createAutoScanner(callbacks, options = {}) {
    const idleMs = Math.max(200, options.idleMs ?? 1000);
    const gapMs = Math.max(1800, options.gapMs ?? 4000);
    const now = callbacks.now || Date.now;
    const setTimer = callbacks.setTimer || setTimeout;
    const clearTimer = callbacks.clearTimer || clearTimeout;
    let enabled = false;
    let disposed = false;
    let busy = false;
    let timer = null;
    let lastStart = -Infinity;
    let pending = false;

    function unschedule() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    }
    function schedule(delay = idleMs) {
      unschedule();
      if (!enabled || disposed || !callbacks.isVisible()) return;
      const remaining = Math.max(0, gapMs - (now() - lastStart));
      timer = setTimer(() => {
        timer = null;
        void execute();
      }, Math.max(delay, remaining));
    }
    async function execute() {
      if (!enabled || disposed || !callbacks.isVisible()) return;
      if (busy) { pending = true; return; }
      busy = true;
      lastStart = now();
      try {
        await callbacks.scan();
      } catch (error) {
        enabled = false; // No retry storm after capture failure.
        unschedule();
        callbacks.onError?.(error);
      } finally {
        busy = false;
        if (pending && enabled && !disposed) {
          pending = false;
          schedule(idleMs);
        }
      }
    }
    function start() {
      if (disposed) return;
      enabled = true;
      schedule(0);
    }
    function stop() {
      enabled = false;
      pending = false;
      unschedule();
    }
    function request(reason, delay = idleMs) {
      if (disposed || !enabled) return;
      callbacks.invalidate?.(reason);
      if (busy) {
        pending = true;
        return;
      }
      schedule(delay);
    }
    function refresh() {
      if (disposed) return;
      enabled = true;
      request("manual", 0);
    }
    function visibilityChanged() {
      if (disposed || !enabled) return;
      if (!callbacks.isVisible()) {
        unschedule();
        callbacks.invalidate?.("hidden");
      } else {
        request("visible", 500);
      }
    }
    function dispose() { stop(); disposed = true; }
    return {
      start, stop, request, refresh, visibilityChanged, dispose,
      get enabled() { return enabled; },
      get busy() { return busy; }
    };
  }
  scope.PageTranslatorAutoScanner = { createAutoScanner };
})(typeof globalThis === "object" ? globalThis : self);

/* Shortcut model for Finder. A single function key or modifier+letter is valid.
   Text fields are never intercepted. Keyboard choice stays in chrome.storage.local. */
(function(root) {
  "use strict";
  const DEFAULT = "F9";
  const MODIFIERS = new Set(["Shift", "Alt", "Control", "Meta"]);
  function editable(node) {
    if (!node || typeof node.closest !== "function") return Boolean(node?.isContentEditable);
    return Boolean(node.isContentEditable || node.closest(
      "input,textarea,select,[contenteditable=''],[contenteditable='true'],[role='textbox']"));
  }
  function shortcutFromEvent(ev) {
    if (!ev || ev.isComposing || MODIFIERS.has(ev.key)) return null;
    let key;
    if (/^Key[A-Z]$/.test(ev.code || "")) key = ev.code.slice(3);
    else if (/^Digit[0-9]$/.test(ev.code || "")) key = ev.code.slice(5);
    else if (/^F([2-9]|1[0-2])$/.test(ev.key || "")) key = ev.key;
    else return null;
    const mods = [
      ev.ctrlKey ? "Ctrl" : null,
      ev.altKey ? "Alt" : null,
      ev.shiftKey ? "Shift" : null,
      ev.metaKey ? "Meta" : null
    ].filter(Boolean);
    if (mods.length === 0 && !/^F([2-9]|1[0-2])$/.test(key)) return null;
    return [...mods, key].join("+");
  }
  function valid(value) {
    if (typeof value !== "string" || value.length > 40) return false;
    return /^F([2-9]|1[0-2])$/.test(value) ||
      /^(?:(?:Ctrl|Alt|Shift|Meta)\+){1,4}(?:[A-Z0-9]|F(?:[2-9]|1[0-2]))$/.test(value) &&
      new Set(value.split("+").slice(0, -1)).size === value.split("+").length - 1;
  }
  root.PageTranslatorShortcut = { DEFAULT, editable, shortcutFromEvent, valid };
})(typeof globalThis === "object" ? globalThis : self);

// The few Obsidian helpers the editor calls, so the harness runs in a plain browser.
const apply = (el, o = {}) => {
  if (typeof o === 'string') o = { cls: o };
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.type) el.type = o.type;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  return el;
};
window.createEl = (tag, o) => apply(document.createElement(tag), o);
window.createDiv = (o) => window.createEl('div', o);
window.createSpan = (o) => window.createEl('span', o);
window.createSvg = (tag, o) => apply(document.createElementNS('http://www.w3.org/2000/svg', tag), o);
Node.prototype.instanceOf = function (type) {
  return this instanceof type;
};
Event.prototype.instanceOf = function (type) {
  return this instanceof type;
};

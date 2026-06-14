// ── Paste sanitizer ──────────────────────────────────────────────────
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "span",
  "a", "img", "ul", "ol", "li",
  "table", "tbody", "thead", "tr", "td", "th",
  "div", "h1", "h2", "h3", "h4", "h5", "h6",
]);

const ALLOWED_ATTRS = {
  a:     ["href", "target", "rel", "style"],
  img:   ["src", "alt", "style"],
  td:    ["colspan", "rowspan", "style", "valign", "align", "width"],
  th:    ["colspan", "rowspan", "style", "valign", "align"],
  tr:    ["style", "valign"],
  table: ["cellpadding", "cellspacing", "border", "style", "width"],
  span:  ["style"],
  div:   ["style"],
  p:     ["style"],
};

const SAFE_CSS = [
  "color", "background-color", "font-weight", "font-style",
  "font-size", "font-family", "text-decoration", "text-align",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "border-radius", "width", "max-width", "height", "max-height",
  "line-height", "letter-spacing", "vertical-align", "display",
  "border-collapse", "border-spacing", "white-space",
];

const IMG_SAFE_CSS = ["border", "border-radius", "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "padding", "opacity"];

function sanitizeStyle(styleStr, isImg = false) {
  if (!styleStr) return "";
  const allowed = isImg ? IMG_SAFE_CSS : SAFE_CSS;
  return styleStr.split(";").map(s => s.trim()).filter(s => {
    if (!s) return false;
    return allowed.includes(s.split(":")[0].trim().toLowerCase());
  }).join("; ");
}

function isTrackingPixel(node) {
  const w = node.getAttribute("width"), h = node.getAttribute("height");
  const src = node.getAttribute("src") || "";
  if ((w === "1" && h === "1") || (w === "0" && h === "0")) return true;
  if (/track|pixel|beacon|open\.gif|spacer/i.test(src)) return true;
  if (/^data:image\/.{1,15};base64,[A-Za-z0-9+/]{0,80}=*$/.test(src)) return true;
  return false;
}

function sanitizeNode(node, doc) {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "meta" || tag === "link") return null;
  
  if (!ALLOWED_TAGS.has(tag)) {
    const frag = doc.createDocumentFragment();
    Array.from(node.childNodes).forEach(c => { const s = sanitizeNode(c, doc); if (s) frag.appendChild(s); });
    return frag;
  }
  
  if (tag === "img") {
    if (isTrackingPixel(node)) return null;
    const el = doc.createElement("img");
    const src = (node.getAttribute("src") || "").trim();
    if (!src || !/^(https?:|data:image\/)/i.test(src)) return null;
    el.setAttribute("src", src);
    el.setAttribute("alt", node.getAttribute("alt") || "");
    const rawStyle = sanitizeStyle(node.getAttribute("style") || "", true);
    // Keep max-width:100% and height:auto, but allow it to be overriden by rawStyle if present
    el.setAttribute("style", `display:block;max-width:100%;height:auto;margin:4px 0;cursor:pointer;${rawStyle ? rawStyle + ";" : ""}`);
    return el;
  }
  
  const el = doc.createElement(tag);
  const allowed = ALLOWED_ATTRS[tag] || [];
  Array.from(node.attributes).forEach(attr => {
    const name = attr.name.toLowerCase();
    if (!allowed.includes(name)) return;
    if (name === "style") { 
      const c = sanitizeStyle(attr.value); 
      if (c) el.setAttribute("style", c); 
    } else if (name === "href") { 
      if (/^(https?:|mailto:)/i.test(attr.value.trim())) el.setAttribute("href", attr.value.trim()); 
    } else {
      el.setAttribute(name, attr.value);
    }
  });
  
  Array.from(node.childNodes).forEach(c => { const s = sanitizeNode(c, doc); if (s) el.appendChild(s); });
  return el;
}

export function sanitizeHtml(html) {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const result = document.createDocumentFragment();
  Array.from(doc.body.childNodes).forEach(n => { const s = sanitizeNode(n, document); if (s) result.appendChild(s); });
  const w = document.createElement("div");
  w.appendChild(result);
  return w.innerHTML;
}

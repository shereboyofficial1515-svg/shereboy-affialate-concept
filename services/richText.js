// services/richText.js
// All rich text from the dashboard passes through here before it is stored, so
// a pasted script or tracking pixel can never reach a visitor's browser.

const sanitizeHtml = require('sanitize-html');

const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'blockquote', 'div', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'], '*': ['style'] },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow', target: '_blank' })
  }
};

function cleanHtml(html) {
  return sanitizeHtml(String(html || ''), OPTIONS).trim();
}

/** Plain text for summaries, meta tags and AI context. */
function toPlainText(html) {
  return sanitizeHtml(String(html || '').replace(/<\/(p|div|li|h[2-4])>|<br\s*\/?>/gi, '$& '), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// SVG can contain scripts, so only drawing elements survive. Event handlers,
// <script>, <foreignObject>, external links and CSS are all removed.
const SVG_OPTIONS = {
  allowedTags: ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask'],
  allowedAttributes: {
    '*': ['id', 'class', 'd', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'width', 'height', 'points', 'viewbox', 'viewBox', 'xmlns', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'mask', 'role', 'aria-label', 'preserveaspectratio']
  },
  allowedSchemes: [],
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false, xmlMode: true },
  nonTextTags: ['script', 'style', 'foreignObject']
};

/** Returns a safe copy of an SVG, or null if it isn't a usable one. */
function cleanSvg(text) {
  if (!/<svg[\s>]/i.test(text)) return null;
  const withoutProlog = text.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!ENTITY[\s\S]*?>/gi, '');
  const options = {
    ...SVG_OPTIONS,
    allowedTags: [...SVG_OPTIONS.allowedTags, 'linearGradient', 'radialGradient', 'clipPath'],
    allowedAttributes: { '*': [...SVG_OPTIONS.allowedAttributes['*'], 'gradientUnits', 'gradientTransform', 'preserveAspectRatio'] }
  };
  const clean = sanitizeHtml(withoutProlog, options).trim();
  return /^<svg[\s>]/i.test(clean) ? clean : null;
}

module.exports = { cleanHtml, toPlainText, cleanSvg };

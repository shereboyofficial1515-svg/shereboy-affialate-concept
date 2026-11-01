// services/themeCss.js
// Turns the Appearance settings into CSS variable overrides on top of style.css.
// Only used for values the settings validator has already checked (hex colours,
// fixed choices, numbers), so nothing here can inject arbitrary CSS.

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, amount) => rgbToHex(hexToRgb(a).map((c, i) => c + (hexToRgb(b)[i] - c) * amount));

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Whichever of black-ish or white reads better on this colour. */
const readableOn = (hex) => (luminance(hex) > 0.4 ? '#0B2A2F' : '#FFFFFF');

const RADIUS = { small: [4, 6, 10], medium: [8, 12, 18], large: [12, 18, 28] };
const BUTTON = { rounded: '10px', pill: '999px', square: '3px' };
const FONT = {
  jakarta: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif"
};

const DARK_TOKENS = `
  --text: #E8EFF0;
  --page-bg: #0C1719;
  --surface: #13222A;
  --nav-bg: rgba(19, 34, 42, .96);
  --gray-25: #101E23;
  --gray-50: #1A2C33;
  --gray-100: #27393F;
  --gray-300: #3E5259;
  --gray-500: #A3B5BA;
  --gray-700: #C5D2D5;
  --green-50: #12321F;
  --green-700: #6FD79B;
  --red-50: #3A1A17;
  --red-600: #F59388;
  --amber-800: #F2C46B;
  --teal-50: #123B37;`;

function themeCss(appearance, homepage = {}) {
  const { primary, secondary, accent, background, text, button_style: button, border_radius: radius, font, base_font_size: size, container_width: width, product_columns: columns } = appearance;
  const [sm, md, lg] = RADIUS[radius] || RADIUS.medium;
  const rules = [`:root {
  --teal-700: ${primary};
  --teal-800: ${mix(primary, '#000000', 0.18)};
  --teal-50: ${mix(primary, '#FFFFFF', 0.91)};
  --on-primary: ${readableOn(primary)};
  --link: ${primary};
  --ink: ${secondary};
  --ink-2: ${mix(secondary, '#FFFFFF', 0.1)};
  --glow: ${mix(secondary, primary, 0.65)};
  --amber-500: ${accent};
  --on-accent: ${readableOn(accent)};
  --text: ${text};
  --page-bg: ${background};
  --radius-sm: ${sm}px;
  --radius-md: ${md}px;
  --radius-lg: ${lg}px;
  --btn-radius: ${BUTTON[button] || BUTTON.rounded};
  --font-body: ${FONT[font] || FONT.jakarta};
  --container: ${width}px;
}
html { font-size: ${(size / 16) * 100}%; }`];

  rules.push(`:root[data-theme="dark"] {${DARK_TOKENS}\n  --link: ${mix(primary, '#FFFFFF', 0.5)};\n}`);
  if (columns !== 'auto') {
    rules.push(`@media (min-width: 900px) { .product-grid { grid-template-columns: repeat(${Number(columns)}, minmax(0, 1fr)); } }`);
  }
  if (homepage.hero_background && /^(https:\/\/|\/)[^"'()\s\\]+$/.test(homepage.hero_background)) {
    rules.push(`.hero { background-image: linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.4)), url("${homepage.hero_background}"); background-size: cover; background-position: center; }`);
  }
  return rules.join('\n');
}

module.exports = { themeCss };

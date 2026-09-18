// public/js/icons.js
// A single, dependency-free icon set (plain inline SVG strings) used
// everywhere the site previously used emoji — category badges, footer
// social links, the AI widget, and the admin dashboard sidebar.
//
// Why inline SVG instead of an icon font or emoji: emoji render
// differently (and sometimes as colorful, cartoonish glyphs) across
// devices/OSes, which undercuts a "premium" look. Plain-stroke SVGs
// stay visually consistent everywhere and inherit currentColor, so
// they always match the surrounding text color automatically.

const ICONS = {
    // ---------- Category icons (used by render.js categoryCardHTML) ----------
    electronics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    fashion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 5 7l2 3-2 1 2 9h10l2-9-2-1 2-3-4-3"/><path d="M9 4a3 3 0 0 0 6 0"/></svg>',
    beauty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1.6 2 2.4 4 2.4 6a2.4 2.4 0 1 1-4.8 0c0-2 .8-4 2.4-6Z"/><path d="M7 14h10l-1 7H8l-1-7Z"/><path d="M7 14a5 5 0 0 1 10 0"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-6 9 6-9 6-9-6Z"/><path d="M3 9v6l9 6 9-6V9"/></svg>',

    // ---------- Footer social links ----------
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 2h-3.1v13.2a2.9 2.9 0 1 1-2.1-2.8v-3.2a6.1 6.1 0 1 0 5.2 6V8.7a7.7 7.7 0 0 0 4.5 1.4V7a4.6 4.6 0 0 1-4.5-4.5V2Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z"/><path d="M8.3 8.6c-.3.6-.5 1.6.5 3.2 1.2 2 3 3.5 5 4.1 1.2.4 1.9.1 2.4-.4l.5-.6-2-1.6-.6.6c-.2.2-.5.2-.8 0-.7-.4-1.9-1.4-2.5-2.4-.2-.3-.1-.6.1-.8l.5-.5-1.3-2.1-.6.4Z" fill="currentColor" stroke="none"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',

    // ---------- AI shopping assistant widget ----------
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.4-.7L4 21l1.7-5.1A8.5 8.5 0 1 1 21 11.5Z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.4 3.4 1.6 5.7 4 7.5-2.4 1.8-3.6 4.1-4 7.5-.4-3.4-1.6-5.7-4-7.5 2.4-1.8 3.6-4.1 4-7.5Z"/><path d="M19 3c.2 1.4.7 2.3 1.8 3.1-1.1.8-1.6 1.7-1.8 3.1-.2-1.4-.7-2.3-1.8-3.1 1.1-.8 1.6-1.7 1.8-3.1Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11.5 20.5 3l-6 17-3.5-6.5L3 11.5Z"/></svg>',

    // ---------- Admin dashboard sidebar ----------
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V10M12 19V4M20 19v-7"/></svg>',
    products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="M3 8v8l9 5 9-5V8"/></svg>',
    categories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    subscribers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 4.5c1.8.5 3 2 3 3.8 0 1.7-1.1 3.2-2.7 3.7"/><path d="M17.5 14.2c2 .6 3.3 2 3.3 4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',

    // ---------- Misc ----------
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18.3 5.6 21.7 7 14.5l-5.3-5 7.2-.9L12 2Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 6 6L20 6"/></svg>',
    'arrow-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    'arrow-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    'external-link': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4.8l1.6 3h5.2l1.6-3H21"/><path d="M5.5 5h13l2.5 7v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-6l2.5-7Z"/></svg>'
};

// Small helper: returns an <span> wrapper with the icon inlined, so call
// sites can just do  icon('home', 'cat-icon')  instead of repeating the
// wrapper markup everywhere.
function icon(name, className = '') {
    return `<span class="icon${className ? ' ' + className : ''}">${ICONS[name] || ICONS.default}</span>`;
}
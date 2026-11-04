// The dashboard's phone layout depends on the order of its CSS, which a browser
// test run at desktop width would never notice.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const css = fs.readFileSync('admin/css/admin.css', 'utf8');
const html = fs.readFileSync('views/admin/dashboard.html', 'utf8');

test('phone rules come after every base rule they replace', () => {
  const phoneBlock = css.indexOf('@media (max-width: 860px)');
  assert.ok(phoneBlock > 0);
  assert.equal(css.lastIndexOf('@media (max-width: 860px)'), phoneBlock, 'there is one phone block');
  const before = css.slice(0, phoneBlock);
  const after = css.slice(phoneBlock);
  for (const selector of ['.menu-toggle', '.sidebar', '.main', '.dash', '.modal-overlay', '.editor-bar']) {
    assert.ok(before.includes(`${selector} {`), `${selector} has a base rule`);
    assert.ok(after.includes(`${selector} {`), `${selector} has a phone rule`);
  }
  assert.match(after, /\.menu-toggle \{ display: inline-flex/, 'the menu button is shown on phones');
  // Nothing but other media queries may follow, or it could override the phone rules
  const outsideMedia = after.replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.equal(outsideMedia, '', 'no base rules after the phone rules');
});

test('the dashboard page is set up for phones', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1.0"/);
  for (const id of ['menuToggle', 'navBackdrop', 'drawerClose', 'drawerUser']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!html.includes('user-scalable=no'), 'people can still zoom');
});

test('file pickers are not display:none, which some phones refuse to open', () => {
  for (const file of ['admin/js/media.js', 'admin/js/ai.js']) {
    assert.ok(!/type="file"[^>]*\shidden/.test(fs.readFileSync(file, 'utf8')), file);
  }
});

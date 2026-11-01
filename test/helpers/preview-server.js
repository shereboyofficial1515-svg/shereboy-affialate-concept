// test/helpers/preview-server.js
// Runs the real site against an in-memory copy of the catalogue, with a local
// stand-in for Resend, so the whole site and admin dashboard can be clicked
// through without touching production data or sending any email.
//
//   npm run preview       then open http://localhost:3100
//   Sign in by visiting   http://localhost:3100/__preview/login
//   ...or as an editor    http://localhost:3100/__preview/login?as=editor
//   Emails "sent" so far  http://localhost:3100/__preview/emails
//
// This file is never loaded by server.js, so none of this exists in production.

const path = require('path');
const { startApp } = require('./harness');

const { createFakeSupabase } = require('./fakeSupabase');
const fixture = require(path.join(__dirname, '..', 'fixtures', 'catalogue.json'));

// Uploaded files live in memory here and are served back on this address
createFakeSupabase.storageBase = 'http://localhost:3100/__preview/storage/';
process.env.PREVIEW_IMAGE_BASE = createFakeSupabase.storageBase;

(async () => {
  const ctx = await startApp({ seed: fixture, env: { NODE_ENV: 'development', EMAIL_SEND_INTERVAL_MS: '50', PUBLIC_SITE_URL: 'http://localhost:3100', GEMINI_API_KEY: 'preview-key-not-real', SETTINGS_ENCRYPTION_KEY: 'preview-only' } });
  ctx.ai.reply = (request) => {
    const prompt = request.contents[0].parts[0].text;
    if (/Return only JSON: \{"seo_title/.test(prompt)) return '{"seo_title":"Preview SEO title","seo_description":"Preview SEO description from the stand-in AI."}';
    if (/Return only JSON: \{"category/.test(prompt)) return '{"category":"Electronics","reason":"Stand-in answer for the preview."}';
    if (/Return only JSON: \{"subject/.test(prompt)) return '{"subject":"Preview subject","heading":"Preview heading","preheader":"Preview","body":"Stand-in email text."}';
    if (/Return only the title|Return plain text only/.test(prompt)) return 'Stand-in suggestion from the preview AI';
    return '<p><strong>Stand-in suggestion.</strong> The preview uses a fake AI, so this text is not real output.</p>';
  };

  const express = require('express');
  const proxy = express();
  proxy.get('/__preview/login', (req, res) => {
    const role = ['admin', 'editor'].includes(req.query.as) ? req.query.as : 'admin';
    if (role === 'editor') {
      ctx.db.users.editor = { id: 'e1', email: 'editor@example.test', user_metadata: {}, app_metadata: {} };
      if (!ctx.db.table('admin_roles').length) ctx.db.table('admin_roles').push({ email: 'editor@example.test', role: 'editor' });
    }
    res.cookie('sb_token', role, { httpOnly: true, sameSite: 'strict' });
    res.redirect('/admin/dashboard.html');
  });
  proxy.get('/__preview/emails', (req, res) => res.json(ctx.resend.emails));
  proxy.get('/__preview/emails/:index', (req, res) => res.type('html').send(ctx.resend.emails[req.params.index].html));

  const appPath = path.join(__dirname, '..', '..', 'server.js');
  proxy.use((req, res, next) => {
    // Storage in the preview is in memory: serve uploaded files back to the browser
    const match = req.path.match(/^\/__preview\/storage\/(.+)$/);
    if (!match) return next();
    const object = ctx.db.objects.get(decodeURIComponent(match[1]));
    if (!object) return res.sendStatus(404);
    return res.type(object.options.contentType).send(object.body);
  });
  proxy.use(require(appPath));
  proxy.listen(3100, () => console.log('Preview running on http://localhost:3100 (in-memory data, no real email)'));
})();

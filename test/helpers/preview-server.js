// test/helpers/preview-server.js
// Runs the real site against an in-memory copy of the catalogue, with a local
// stand-in for Resend, so the whole site and admin dashboard can be clicked
// through without touching production data or sending any email.
//
//   npm run preview       then open http://localhost:3100
//   Sign in by visiting   http://localhost:3100/__preview/login
//   Emails "sent" so far  http://localhost:3100/__preview/emails
//
// This file is never loaded by server.js, so none of this exists in production.

const path = require('path');
const { startApp } = require('./harness');

const fixture = require(path.join(__dirname, '..', 'fixtures', 'catalogue.json'));

(async () => {
  const ctx = await startApp({ seed: fixture, env: { NODE_ENV: 'development', EMAIL_SEND_INTERVAL_MS: '50', PUBLIC_SITE_URL: 'http://localhost:3100' } });

  const express = require('express');
  const proxy = express();
  proxy.get('/__preview/login', (req, res) => {
    res.cookie('sb_token', 'admin', { httpOnly: true, sameSite: 'strict' });
    res.redirect('/admin/dashboard.html');
  });
  proxy.get('/__preview/emails', (req, res) => res.json(ctx.resend.emails));
  proxy.get('/__preview/emails/:index', (req, res) => res.type('html').send(ctx.resend.emails[req.params.index].html));

  const appPath = path.join(__dirname, '..', '..', 'server.js');
  proxy.use(require(appPath));
  proxy.listen(3100, () => console.log('Preview running on http://localhost:3100 (in-memory data, no real email)'));
})();

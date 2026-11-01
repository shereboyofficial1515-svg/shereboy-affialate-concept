# SHEREBOY AFFILIATE CONCEPT

A premium, framework-free affiliate marketing website with a secure admin
dashboard, full product management system, and a Gemini-powered AI shopping
assistant. Built for **SHEREBOY TECH LTD**.

No React/Vue/Angular — the frontend is plain HTML5, CSS3, and vanilla
JavaScript (ES6+). The backend is Node.js + Express, with **Supabase**
(PostgreSQL + Auth) for all data and admin authentication.

---

## 1. Requirements

- Node.js 18 or newer
- npm
- A free [Supabase](https://supabase.com) project

## 2. Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
```

**Set up Supabase:**

1. Create a project at [supabase.com](https://supabase.com) (or use an existing one).
2. Open **SQL Editor** in your Supabase dashboard, paste the contents of
   `database/schema.sql`, and run it. Then run each file in
   `database/migrations/` in order. This creates the `categories`, `products`,
   `testimonials`, `subscribers`, `contact_messages`, `email_campaigns`,
   `email_logs` and `product_clicks` tables (there's intentionally no `users`
   table — admin accounts are managed by Supabase Auth's built-in `auth.users`).
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ keep this secret —
     it bypasses Row Level Security and must never reach the browser)
4. Paste those three values into your `.env`, plus your `ADMIN_EMAIL` /
   `ADMIN_PASSWORD` and (optionally) `GEMINI_API_KEY`.

```bash
# 3. Seed the database (creates your Supabase Auth admin account +
#    sample categories/products/testimonials)
npm run seed

# 4. Start the server
npm start
```

Visit **http://localhost:3000** for the site and
**http://localhost:3000/admin/login.html** for the admin dashboard.

Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`.

> ⚠️ Change the admin password after your first login (Supabase dashboard →
> Authentication → Users → select the user → reset/update password).
> Re-running `npm run seed` won't overwrite an existing admin account.

## 3. Managing products (no code editing required)

Everything is managed from **Admin → Products** and **Admin → Categories**:

- **Add product**: name, price, discount %, category, affiliate link,
  availability, featured/deal flags, specifications, and up to 8 images.
- **Edit / delete**: same modal, pre-filled with existing data.
- Products you publish appear on the live site (`/products.html`,
  `/index.html`) immediately — no HTML files to touch.
- **Categories**: add/edit/delete; deleting a category doesn't delete its
  products, they simply become "Uncategorized."
- **Messages**: view everything submitted through the Contact form.
- **Subscribers / Campaigns / Send log**: see section 4c.
- **Testimonials**: add real customer quotes. The homepage section stays hidden
  while none are published.
- **Verified deal** and **rating** on a product are only shown when you set them.
  Leave them empty unless you have really checked the deal or have real rating data.

## 4. The AI shopping assistant

The floating chat widget (bottom-right on every public page) calls
`POST /api/ai/chat`, which uses **Google's Gemini API**
(`gemini-2.5-flash` by default — configurable via `GEMINI_MODEL` in `.env`).

- It is grounded in your **live product catalog and a short FAQ** — it does
  not invent products, prices, or links.
- If `GEMINI_API_KEY` isn't set, the widget still works but tells the visitor
  the assistant isn't configured yet, instead of failing silently.
- Note: `gemini-1.5-flash` has been retired by Google — this project uses
  `gemini-2.5-flash`. If Google renames/retires that model in the future,
  just update `GEMINI_MODEL` in `.env`.

## 4b. Public product API (SHEREBOY TECH LTD integration)

A read-only feed that lets https://shereboytechltd.site showcase products. Product management stays
here — the company site can only read.

| Route | Purpose |
|---|---|
| `GET /api/public/products?page=1&pageSize=24&category=<slug>&q=<text>&featured=true&deal=true&available=true` | Paginated products (pageSize ≤ 48) |
| `GET /api/public/products/featured?limit=8` | Products marked as featured |
| `GET /api/public/products/:slug` | One product (404 if missing) |
| `GET /api/public/categories` | Categories that currently have products |
| `GET /api/public/status` | Connection check: product, available and featured counts |

Each product: `id, slug, name, description` (plain text), `image {url, alt} | null, images[],
category {name, slug} | null, price {current, previous | null, discountPercent, currency: "NGN"},
isFeatured, isDeal, availability, isAvailable, productUrl` (this site's product page),
`affiliateUrl` (the partner-store tracking link exactly as entered — query parameters intact — or
null if invalid), `addedAt, updatedAt`. Image paths whose files no longer exist are omitted rather
than returned as broken links. Invalid parameters → 400; writes → 405. GET only, no credentials;
browser CORS is limited to `PUBLIC_API_ALLOWED_ORIGINS`.

When `COMPANY_SITE_WEBHOOK_URL` and `COMPANY_SITE_WEBHOOK_SECRET` are set, creating, editing or
deleting a product (or editing/deleting a category) sends a signed notice (`X-Affiliate-Timestamp`,
`X-Affiliate-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`) containing only the event name
and slug, so the company site refreshes immediately.

Optional: run `database/migrations/001_products_updated_at.sql` to record when each product was
last edited.

### Product images

New product images are saved to the public Supabase Storage bucket
`SUPABASE_PRODUCT_IMAGES_BUCKET` (default `product-images`, created automatically). Previously
images were written to `public/uploads` on the server's disk, which hosts such as Render erase on
every deploy — products uploaded that way lost their images and need them re-uploaded once from
the dashboard.

If products are left with dead `/uploads/...` paths, `npm run recover-images` previews restoring
each one from its own affiliate listing (nothing changes until you add `-- --apply`, which first
writes a backup to `backups/`). A product whose listing can't be read or whose title doesn't match
is left alone and reported, so it can be uploaded by hand.

New uploads are converted on the server to WebP (1200px, plus a 480px copy for phones) and a 480px
JPEG for email clients.

## 4c. Newsletter and email (Resend)

Signups use double opt-in: nobody receives marketing email until they click the link sent to their
own address. Every marketing email has an unsubscribe link and a one-click `List-Unsubscribe`
header. The API key stays on the server.

**Connect Resend (needed once):**

1. Create an account at [resend.com](https://resend.com) and an API key. Set `RESEND_API_KEY`.
2. In Resend → **Domains**, add `shereboyaffiliateconcept.shop`, then add the SPF and DKIM records it
   shows you to your DNS (Cloudflare). Wait until the domain shows **Verified**.
3. Add a DMARC record in DNS: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:you@yourdomain`.
4. Set `EMAIL_FROM`, e.g. `SHEREBOY AFFILIATE CONCEPT <deals@shereboyaffiliateconcept.shop>`.
5. In Resend → **Webhooks**, add `https://shereboyaffiliateconcept.shop/api/email/webhook` with all
   `email.*` events, and set `RESEND_WEBHOOK_SECRET` to its signing secret. This powers delivery
   statistics and stops mail to addresses that bounce or complain.
6. Set `EMAIL_POSTAL_ADDRESS` to your real business address.

**Dashboard:**

- **Subscribers**: search, filter by status, send a confirmation, unsubscribe, delete. Subscribers from
  before this system start as *pending*; use **Ask all pending to confirm** once.
- **Campaigns**: write a campaign, choose products, send yourself a test, then send to all confirmed
  subscribers. **Weekly newsletter** pre-fills a draft from the last 7 days' products and the biggest
  savings for you to review and send. It's a button, not a schedule: nothing goes out by itself.
- **Send log**: every attempt, with the reason for any failure.

If sending is interrupted (a restart or deploy), **Resume** continues without emailing anyone twice.

## 4d. Tests and local preview

```bash
npm test          # runs against an in-memory database and a mock Resend server
npm run preview   # the full site on http://localhost:3100, with no real data or email
```

In the preview, `/__preview/login` signs in to the dashboard and `/__preview/emails` lists what would
have been sent. Neither exists in production.

## 5. Project structure

```
/project
├── public/            # Static frontend: HTML pages, CSS, JS, images, uploads
│   ├── css/style.css
│   ├── js/             # api.js, layout.js, render.js, main.js, page scripts
│   ├── images/
│   └── uploads/        # Product images land here (created by Multer)
├── admin/              # Admin-only static assets (login page, admin CSS/JS)
├── views/admin/         # Protected dashboard.html (requires a valid session)
├── routes/              # Express route definitions
├── controllers/         # Route handler logic
├── middleware/           # auth (Supabase session check), upload (Multer), validate
├── database/
│   ├── schema.sql         # Run once in the Supabase SQL Editor
│   └── seed.js             # npm run seed — admin user + sample data
├── models/                # Data-access layer (Category, Product) via Supabase
├── config/supabase.js     # Supabase client setup (anon + service-role clients)
├── services/geminiService.js  # Gemini API integration
├── services/imageStorage.js   # Image optimization and Supabase Storage
├── services/email/            # Resend client, templates, subscriptions, campaign sender
├── scripts/recover-product-images.js
├── test/                      # npm test, plus the local preview server
├── utils/asyncHandler.js
├── .env.example
├── server.js
└── package.json
```

## 6. Security features included

- **Supabase Auth** for admin sessions — no local password hashing or
  JWT-signing code in this app; Supabase issues and verifies the session
  token, which is stored in an httpOnly cookie (`sb_token`)
- **Row Level Security** enabled on every table (see `database/schema.sql`),
  with no policies attached — only the server-side `service_role` key
  (never exposed to the browser) can read/write; the `anon` key has zero
  table access by default
- Helmet for secure HTTP headers
- Rate limiting: global limiter + stricter limiters on `/api/auth/login`
  and `/api/ai/chat`
- `xss-clean` sanitizes request input
- Multer restricts uploads to image MIME types, random filenames, 5MB/file cap
- Input validation on products, contact form, newsletter, and login
- `SameSite=strict` cookies mitigate CSRF for the admin session

**Before going to production**, also:
- Set `NODE_ENV=production` (enables secure cookies)
- Put the app behind HTTPS (e.g. via your host or a reverse proxy)
- Rotate your Supabase `service_role` key immediately if it's ever
  accidentally exposed (client-side code, a public repo, etc.)

## 7. Deployment instructions

**Any Node-friendly host works (Render, Railway, a VPS, etc.). General steps:**

1. Push this project to a Git repository (`.env` is gitignored — don't
   commit it; your Supabase project already holds all persistent data, so
   there's no local database file to worry about losing on redeploy).
2. On your host, set the environment variables from `.env.example`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, etc.) in the host's
   dashboard/secrets manager.
3. Set the start command to `npm start` and build command to `npm install`.
4. If you haven't already, run `database/schema.sql` in your Supabase SQL
   Editor and `npm run seed` once (locally, or via the host's console/SSH)
   to create your admin account and sample data.
5. Uploaded product images go to Supabase Storage, so they survive redeploys.
6. Point your domain at the host, and confirm `/admin/login.html` is reachable
   only over HTTPS in production.

## 8. Sample data

Running `npm run seed` adds:
- 1 admin account in **Supabase Auth** (from your `.env`)
- 5 categories (Electronics, Home & Kitchen, Fashion, Beauty & Personal Care,
  Phones & Accessories)
- 6 sample products with placeholder affiliate links (replace these with
  real links before going live)

---

Built by **SHEREBOY TECH LTD** — Warri/Sapele, Delta State, Nigeria.

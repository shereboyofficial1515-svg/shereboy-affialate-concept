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
   `database/schema.sql`, and run it. This creates the `categories`,
   `products`, `testimonials`, `subscribers`, and `contact_messages` tables
   (there's intentionally no `users` table — admin accounts are managed by
   Supabase Auth's built-in `auth.users`).
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
- **Messages / Subscribers**: view everything submitted through the Contact
  form and newsletter signup.

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
- Consider adding a Content-Security-Policy tailored to your CDN usage
  (Helmet's CSP is disabled by default here to avoid breaking Google Fonts —
  tighten it once you know your final asset origins)

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
5. Uploaded product images are still written to `public/uploads/` on the
   server's local disk — on hosts with an **ephemeral filesystem**, mount a
   persistent volume for that folder, or images will disappear on redeploy.
   (Product/category/testimonial *data* itself is always safe in Supabase.)
6. Point your domain at the host, and confirm `/admin/login.html` is reachable
   only over HTTPS in production.

## 8. Sample data

Running `npm run seed` adds:
- 1 admin account in **Supabase Auth** (from your `.env`)
- 5 categories (Electronics, Home & Kitchen, Fashion, Beauty & Personal Care,
  Phones & Accessories)
- 6 sample products with placeholder affiliate links (replace these with
  real links before going live)
- 3 sample testimonials

---

Built by **SHEREBOY TECH LTD** — Warri/Sapele, Delta State, Nigeria.

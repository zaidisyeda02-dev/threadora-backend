# Threadora Backend Rebuild

Portable Node.js rebuild of the canonical Threadora women's fashion store
(Design 08: dusty rose, muted mauve, champagne and ivory). This is step 1
of the backend rebuild project: a source project that can be deployed to
Hostinger as a Node Web App with MySQL. It is not live yet. No Hostinger
change was made to build it, and the static live site at
https://luminous-palegreen-crane-44.hostingersite.com/ was not touched.
That static site stays as the fallback until this backend is deployed and
verified live on a separate new temp domain.

## What it is

- Express app, entry file `server.js`, start command `node server.js`.
  No build step is needed. The frontend is plain files in `public/`.
- The shop frontend is the canonical Threadora frontend, copied verbatim
  from the live static export: same Design 08 palette, same needle and
  thread THREADORA logo, same opening animation with Skip intro, same 7
  pages (Homepage, Shop and Category, Product Detail, Cart Your Bag,
  Checkout, About Our Story, Contact Get in Touch), same copy, same
  filters, same cart and checkout flow. The only changes are that
  products now load from the API, orders, newsletter signups and contact
  messages are saved to the database, and the footer links to the Admin
  Panel.
- 12 products, 4 dresses, 4 kurtis, 4 casual wear, with the exact PKR
  prices from the canonical build, including Champagne Satin Slip Dress
  PKR 15,400 and Ivory Linen Shirt Set PKR 7,600, with the two corrected
  modest photos, full cover, same colours. Product photos are files in
  `public/images/`, not embedded data. All 16 images were byte scanned:
  no EXIF, IPTC, XMP or C2PA metadata was present.
- Facts come only from the Resources PDF
  (`workspace/your_files/threadora-resources-v1/threadora-resources-v1.pdf`).
  Contact details are placeholders, Not provided yet, shown on the
  Contact page as "to be added soon (placeholder)". No reviews, ratings,
  prices or client details were invented.

## Backend

- MySQL only, through the `mysql2` driver. Tables in `db/schema.sql`:
  products, orders, order_items, subscribers, messages, admins, sessions.
  The tables are created automatically on first start, and the 12
  products are seeded from `db/seed-products.json` when the products
  table is empty. Orders, subscribers, messages and admins start empty
  in production.
- Order placement: the server reads prices and sizes from the database
  and computes the total itself. A price sent by the browser is ignored.
  Order numbers are TH-1001, TH-1002 and so on.
- Newsletter and contact messages are saved to the database.
- Admin Panel at `/admin.html`, linked from the site footer. First use
  the owner sets her own admin email and password (minimum 8 characters).
  Passwords are salted with scrypt, never stored in plain text. Sign in
  returns a session token that lives for 30 days. Wrong passwords are
  rejected. The panel shows live stats (Orders, Revenue, Messages,
  Subscribers) and Orders, Messages and Subscribers tabs. Order status
  (New, Confirmed, Dispatched, Delivered, Cancelled) and message status
  (New, Read, Replied) can be changed and the change persists.

## API

- `GET /api/health`
- `GET /api/products` and `GET /api/products/:id`
- `POST /api/orders` with customerName, phone, address, city, notes and
  items (productId, size, qty). Returns orderNumber and total.
- `POST /api/newsletter` with email.
- `POST /api/contact` with name, subject and message.
- `GET /api/admin/status`, `POST /api/admin/setup`, `POST /api/admin/signin`,
  `POST /api/admin/signout`
- `GET /api/admin/data` (Bearer token), `PATCH /api/admin/orders/:id`,
  `PATCH /api/admin/messages/:id` (Bearer token)

## Environment variables

No credential is hardcoded anywhere. Set these in the environment:

| Variable | Value |
|---|---|
| PORT | Port to listen on. Hostinger sets this. Local default 3000. |
| DB_HOST | MySQL host. On Hostinger use 127.0.0.1, not localhost. |
| DB_PORT | MySQL port. 3306. |
| DB_USER | MySQL user. |
| DB_PASSWORD | MySQL password. |
| DB_NAME | MySQL database name. |

Copy `.env.example` to `.env` for local runs and fill in real values.
Never commit `.env`.

## Run locally

1. Install Node 18 or newer, and MySQL or MariaDB.
2. Create the database and a user, for example:
   `CREATE DATABASE threadora;`
   `CREATE USER 'threadora'@'127.0.0.1' IDENTIFIED BY 'a-strong-password';`
   `GRANT ALL PRIVILEGES ON threadora.* TO 'threadora'@'127.0.0.1';`
3. `npm install`
4. Set the environment variables in `.env` or the shell.
5. `node server.js`, then open http://127.0.0.1:3000
6. `node scripts/verify.js` runs the end to end check (pages, products,
   order saving, newsletter, contact, admin setup, sign in, wrong
   password rejection, admin data and status changes). It needs the
   server running.

## Deploy to Hostinger (next step, not done yet)

1. Push this folder to a GitHub repository. GitHub is not connected yet,
   that connection is needed at this step.
2. In Hostinger hPanel create a new Web App website on a new temp domain.
   Do not overwrite the existing static live site. Use Node version 22.
3. Deploy from the GitHub repository. Build command: `npm install`.
   Entry file: `server.js`. Start command: `node server.js`.
4. In hPanel create a MySQL database and user, then create the tables
   with `db/schema.sql` (the app also creates them on first start).
5. Set the environment variables in the Web App settings: DB_HOST
   127.0.0.1, DB_PORT 3306, DB_USER, DB_PASSWORD, DB_NAME, and PORT
   if Hostinger asks for it. Never put credentials in the code.
6. Restart the app, open the live URL and verify every page, a full
   order, newsletter, contact, admin setup and sign in, at desktop and
   phone widths, before sending any link.

## Verification, done locally on 18 November 2026

- API check `node scripts/verify.js`: 25 checks, 0 failed on a clean
  database (pages, 12 products with exact prices, order saving with
  server computed totals, invalid size rejected, client sent totals
  ignored, newsletter, contact, admin first use setup, second setup
  refused, wrong password rejected, correct sign in, admin data, order
  and message status changes that persist).
- DOM execution check (jsdom, real app.js against the running server):
  23 checks, 0 failed (intro with Skip intro, hero ELEGANT EVERYDAY
  WEAR, Shop 12 of 12, Kurtis filter 4, Champagne detail PKR 15,400
  with High neckline and Long sleeves, Add to Bag count 1, cart
  subtotal, checkout confirmation with a TH order number, About,
  Contact placeholder, newsletter, Admin Panel sign in, wrong password
  error, dashboard with stats and orders, no JS errors).
- One real bug was found and fixed during verification: the canonical
  frontend read detail page ids with `clean.slice(10)` on a 9 character
  "/product/" prefix, so a direct load or refresh of a detail page
  showed "This piece is not in the boutique". The rebuild uses
  `slice(9)`. In the canonical build this only showed on direct load,
  because in site navigation the id comes from the button, not the URL.
- One more bug was found and fixed: mysql2 already parses JSON columns,
  so the first version crashed parsing sizes and details a second time.
- Not yet verified: a real rendered browser check at 390px for
  horizontal overflow and console errors. No browser could be launched
  locally (Playwright Chromium download failed and its install approval
  timed out; the bundled Muse browser refuses headless Playwright
  launches). The CSS is verbatim from the canonical build, which was
  verified at 390px with no overflow, and the only frontend changes are
  data loading and the slice fix above. A real browser check must still
  happen before any live deploy.
- Hero full picture fix, applied 18 November 2026: the rebuild frontend
  copied the hero before the canonical fix, so it still cropped the
  portrait photo with max-height 560px and object-fit cover. It now
  mirrors the canonical fix in client/src/App.tsx: desktop is a split,
  full photo at natural height on the left and the ELEGANT EVERYDAY
  WEAR panel on the right, mobile stays stacked with the photo above
  the panel. Words, prices, products and other pages unchanged.
  Checked by syntax check on app.js, served files containing hero-split
  with no 560px left, and the hero block read back from the running
  server. A real rendered check at 390px and on desktop is still open
  before any live deploy.

## Colour ranges and Interlinkz footer, aligned with the live site, 18 November 2026

- The live static site gives every product a colours range and shows
  "By Interlinkz" in the footer. The rebuild frontend was copied before
  those fixes, so it was aligned to the same approach, with no new
  products and no change to any name, price, photo, size or design.
- `db/seed-products.json` gives each of the 12 products a `colors`
  array (photo colour first), copied exactly from the live site:
  Rosewater Pleated Gown Dusty Rose, Blush Pink, Rose Pink; Mauve Wrap
  Midi Dress Mauve, Rose Print, Slate Blue; Champagne Satin Slip Dress
  Champagne, Sand; Ivory Summer Dress Ivory, Mint, White; Blush
  Embroidered Kurti Blush Pink, Champagne, Sand; Rose Pink Kurti Rose
  Pink, Dusty Rose; Mehreen Printed Kurta Rose Print, Ivory, White;
  Slate Print Kurta Set Slate Blue, Mauve, Mint; Sand Linen Co-ord Set
  Sand, Champagne, Mauve; Ivory Linen Shirt Set Ivory, Blush Pink,
  Dusty Rose; Mint Summer Shorts Set Mint, Rose Pink; Everyday Tee and
  Denim Look White, Rose Print, Slate Blue. Every one of the 11 colours
  returns exactly 3 products, one dress, one kurti and one casual piece.
- `db/schema.sql` adds a `colors` JSON column to products, and
  `src/db.js` adds the column to an existing table if it is missing and
  aligns the colours from the seed file on start. The API returns
  `colors` for every product. `public/app.js` derives the colour
  dropdown from the ranges, filters on any colour in the range, lists
  each product's colours on its Shop card, and shows a Colours row with
  swatch dots on detail pages. `public/styles.css` adds the
  `.card-colors` and `.color-dot` rules. The shared footer shows
  "By Interlinkz" under THREADORA on every page.
- Re-check, real rendered browser, Chrome for Testing 158, local
  MariaDB on port 3308, server on 3001, 18 November 2026: all 8 pages
  at 390px and 1280px, scrollWidth equals the viewport everywhere, no
  horizontal overflow; zero real JS errors (only Google Fonts blocked
  by the sandbox proxy, as before); no broken images after scrolling at
  390px; hero full at both widths (390px 358x477, 1280px 560x745);
  Rose Pink returns exactly Rosewater Pleated Gown, Rose Pink Kurti and
  Mint Summer Shorts Set; footer shows BY INTERLINKZ on Home, Shop and
  Cart. API check `node scripts/verify.js`: 34 checks, 0 failed.
  Local test data was cleared afterwards: 12 products, 0 orders,
  0 subscribers, 0 messages, 0 admins.

## Known items

- Two images are over about 500 KB: `blush-embroidered-kurti.jpg`
  (1.1 MB) and `boutique.png` (1.2 MB). They are the canonical images,
  kept verbatim. They are worth compressing in a later optimisation pass.
- The shop cart is kept in the browser for the visit only, as in the
  canonical build. Orders are saved to the database at checkout.
- No live backend exists yet. This project has only been run and
  verified locally.

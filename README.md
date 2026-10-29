# Technologist Academy Node Service Template

A starter repository for building Node.js HTTP services in the Technologist Academy.

It gives you a working Express service with TypeScript and a production build already wired together, so you can start writing features. Out of the box it exposes a single `GET /health` endpoint that reports service status and uptime.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| [nvm](https://github.com/nvm-sh/nvm) | latest | Required. Manages your Node version per project. |
| Node.js | 22 | Pinned in [.nvmrc](.nvmrc). Install it with nvm, not with a system installer. |
| npm | 10+ | Ships with Node 22. |

Install nvm, then from the repository root run:

```sh
nvm install   # reads .nvmrc and installs Node 22
nvm use       # switches this shell to Node 22
```

Run `nvm use` every time you open a new terminal in this project, or configure your shell to do it automatically. Using a different Node version may cause confusing build failures.

Verify you are on the right version:

```sh
node -v   # should print v22.x.x
```

## Quick start

```sh
nvm use
npm ci             # install exact dependency versions from package-lock.json
printf 'PORT=3000\n' > .env
npm run dev        # start the service with hot reload
```

Then in another terminal:

```sh
curl http://localhost:3000/health
# {"status":"ok","uptime":1.234}
```

Use `npm ci` rather than `npm install`. It installs the exact versions recorded in `package-lock.json`, so everyone on the team runs identical dependencies. Use `npm install` only when you are deliberately adding or upgrading a package.

## Making it your own

After clicking **Use this template** on GitHub and creating your own repository:

1. Clone your new repository and run the quick start steps above.
2. Update the identity fields in [package.json](package.json):
   - `name` — your service name in kebab-case, e.g. `booking-service`
   - `description` — one line describing what your service does
   - `author` and `license`
   - `version` — reset to `0.1.0` if you prefer to start fresh
3. Replace this README with documentation for your own service.
4. Set `PORT` in your local `.env` if your service should use a different port, and keep it in sync with the URL in this README.
5. Delete or replace the sample `/health` route once you have real endpoints — though keeping a health check is good practice for deployments.

Never commit your `.env` file. It is listed in [.gitignore](.gitignore). The quick-start command creates it with `PORT=3000`, matching the example URL.

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `tsx watch src/index.ts` | Runs the service from TypeScript source and restarts on file changes. Use this while developing. |
| `npm run format` | `biome format --write src` | Formats application source files. |
| `npm run lint` | `biome lint src` | Lints application source files. |
| `npm run typecheck` | `tsc` | Checks types without emitting files. |
| `npm test` | `vitest run` | Runs automated tests in `src/tests/`, grouped by controllers, services and utilities. Browser tests in `e2e/` are not included. |
| `npm run build` | `tsc` then `esbuild` | Type-checks, then bundles the service into `dist/index.js` for production. |
| `npm start` | `node dist/index.js` | Runs the built output. Requires `npm run build` first. |
Before pushing, run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run build`.

## Project structure

```
.
├── src/
│   ├── index.ts          # entry point: config, server startup, shutdown
│   ├── app.ts            # builds the Express app, configures Nunjucks and registers routes
│   ├── controllers/      # Express routers that handle requests and render views
│   ├── services/         # calls to the backend API (fetching products and their current prices)
│   ├── models/           # TypeScript interfaces describing the backend's JSON responses
│   └── schemas/          # Zod schemas that check backend responses match the models
├── views/                # Nunjucks templates (.njk) rendered by the controllers
│   └── main.njk          # base template: header, burger menu and page blocks; every view extends it
├── .env                  # your local secrets and config (not committed)
├── .env.example          # template listing required env variables
├── .github/              # GitHub configuration
├── .gitignore            # files git should ignore
├── .npmrc                # pins the public npm registry for this project
├── .nvmrc                # the Node version this project uses
├── package.json          # project metadata, scripts and dependencies
├── package-lock.json     # exact dependency versions, committed
└── tsconfig.json         # TypeScript compiler and type-checking options
```

Generated folders — `node_modules/` and `dist/` — are ignored by git and safe to delete and regenerate.

### Why `app.ts` and `index.ts` are separate

[src/app.ts](src/app.ts) creates and configures the Express app but never starts listening. [src/index.ts](src/index.ts) reads configuration and starts the server. Keeping those responsibilities separate makes route registration independent from server startup.

Navigation is visible in normal document flow by default, including the signed-in
logout form. After the menu script initializes successfully, it enables the
slide-out drawer and reveals its open/close controls. Navigation remains usable
if JavaScript is disabled or the menu script cannot load.

The shared drawer makes the header and main content inert while open, keeping
background controls out of keyboard and assistive-technology navigation.
Closing it by its close button, the overlay or Escape restores the regions'
previous inert state before returning focus to the menu toggle.
Tab and Shift+Tab wrap within the open drawer, and the existing slide transitions
respect reduced-motion preferences. "Shop all products" is a single navigation
label without subtitle text.

## Adding a new route

Say you want a `GET /bookings` endpoint.

**1. Create the router** in `src/controllers/bookings.ts`:

```ts
import { Router, type Request, type Response } from 'express'

export const bookingsRouter = Router()

bookingsRouter.get('/', (_req: Request, res: Response) => {
  res.json({ bookings: [] })
})
```

**2. Register it** in [src/app.ts](src/app.ts):

```ts
import { bookingsRouter } from './controllers/bookings'

// inside createApp(), before `return app`
app.use('/bookings', bookingsRouter)
```

Imports do not need a `.js` extension — this project is configured for bundler-style module resolution.

**3. Verify:**

```sh
npm run typecheck
npm run build
```

If your route reads a JSON request body, add `app.use(express.json({ limit: '100kb' }))` in `createApp()` before your routes.

## Configuration

Environment variables are loaded from `.env` by [dotenv](https://github.com/motdotla/dotenv) at startup.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | yes | Port the service listens on. The service exits at startup if it is missing or invalid. |
| `SESSION_SECRET` | yes in production | Secret used to sign the session cookie. |
| `CUSTOMER_ACCOUNT_SERVICE_URL` | yes | Base URL of the customer account service. Login calls `POST {url}/auth/verify`. |

## Login

| Route | Description |
| --- | --- |
| `GET /login`, `POST /login` | Sign-in page and form submission. Locks sign-in after 5 consecutive failed attempts. |
| `POST /logout` | Ends the session. |
| `GET /account` | Account page, requires sign-in. Signed-out visitors are redirected to `/login?returnTo=...`. |
| `GET /forgot-password` | Placeholder page. |

### Home page

`GET /home` requires sign-in and displays up to three visible, published,
non-deleted products from the backend product API, ranked by `salesNo` descending,
then product ID descending for equal sales totals (numeric portions compare
numerically, so ID `10` ranks above `9`). The API must return a non-negative integer
`salesNo` for each product. The selection is made on each page request, with
current prices and product-detail links. Products render on the server
without requiring JavaScript. “View all products” opens `/products`.
Backend failures show an error and a retry link rather than demo products.

### Product detail pages

Each product card links to `GET /products/:productID`. This route freshly requests
`GET /products/:productID` from the backend (a `{ "product": {...} }` response)
and its current price, then renders the shared `views/products/show.njk`
template. It does not reuse the catalogue response. Missing or hidden products
return `404`; backend failures return `502`. A failed price lookup still shows
the product with "Price unavailable". Detail pages are served with `Cache-Control: no-store`.

Products with multiple images show a vertical thumbnail list to the left of the
main image. Clicking a thumbnail (or activating it with Enter or Space) replaces
the main image and marks that thumbnail as selected. Images are sorted by their
non-negative integer `imageOrder`, ascending. The image with `imageOrder: 0`
appears at the top, is selected initially, and is used as the catalogue thumbnail.
If there is no image with order 0, the image with the lowest order is used instead.
Products with one image show it without thumbnails, and products with
no images show "No image available".

Product responses include `categories` (category ID, name, nullable description,
and department ID) and `departments` (department ID, name, nullable description).
Both arrays are validated and retained for catalogue and detail responses.
Detail pages list categories after the description, grouped by `departmentID`
with each department name shown once as a heading. Categories without a matching
department remain visible under "Other categories". When there are no categories,
any departments are shown below the product title. Empty sections are hidden.

The products page includes a category dropdown populated from the products'
categories, deduplicated by category ID and sorted alphabetically by name.
When different IDs have the same name (ignoring case and surrounding whitespace),
their labels include the full category ID, for example `Accessories (ID: c0)`,
including in the selected-category summary. Unique names remain unchanged.
Select a category and press "Filter products" to submit its ID to
`GET /products?category=<categoryID>`. The selection is retained, and all category
options remain available after filtering. "All categories" removes the category
filter while keeping any product-name search; "Clear search" removes both.
A link to a category that is no longer available shows an explicit message.

The frontend forwards nonempty, trimmed `q` (product name) and `category`
(category ID) query parameters to the backend's `GET /products` endpoint.
The backend must implement case-insensitive partial-name matching and combine
both filters when supplied, returning the existing `{ products: [...] }` shape.
This backend filtering contract must be implemented separately: the frontend
does not fall back to local matching if the API ignores the parameters.
For an active search or category filter, a separate unfiltered `GET /products`
request provides all category dropdown options without fetching prices for
that unfiltered catalogue. Prices are fetched only for the search results.

Between the price and description, detail pages show a quantity dropdown from
1 to the available stock (capped at 10) and an "Add to basket" button underneath. Out-of-stock
products show quantity 0 with both controls disabled. These controls are UI-only:
the button does not yet save items or call a basket API.

### Product images

The home-page hero uses the first image of the highest-ranked featured product:
highest `salesNo`, then highest product ID for ties. Image ordering uses the
existing ascending `imageOrder` rule. If that product has no usable image, the
hero displays "No image available"; it does not substitute a lower-selling product.

No new backend endpoint is needed. `GET /products` must return the actual
non-negative integer `salesNo` for each product and its `productImages` records
(`imageID`, `productID`, `imageUrl`, and non-negative integer `imageOrder`).
If `salesNo` exists in the database but is absent from the API response, add it
to the backend product query/selection and response mapping. Image URLs must use
the supported `/images/<filename>` path and reference an existing local image
or an image served by the backend. The frontend does not query the database directly.

Local product illustrations live in `public/images/product-1.svg` through
`product-10.svg` and are served at `/images/product-N.svg`. Local files take
precedence; image paths without a matching local file use the backend proxy.
The product-10 image record must reference `/images/product-10.svg` for the
eyeshadow palette, rather than sharing product-9's hammer image.

Both backend product endpoints must include `imageOrder` on every image.
Missing, fractional, or negative orders fail response validation rather than
silently displaying an incorrect image order.

The browser never contacts the backend directly, so `API_BASE_URL` can be an internal-only address. Backend image URLs such as `/images/product-1.svg` are rewritten to the same path on this frontend, and `GET /images/:fileName` fetches the image from the backend on the server and returns it. Only single, plain file names under the backend's `/images/` path are proxied; anything else (other hosts, nested paths, `..`) is dropped from the page or returns `404`. Responses must have an `image/*` content type and be at most 5 MB, otherwise the route returns `502`.
Run the automated tests with `npm test`. They live under `src/tests/controllers`,
`src/tests/services` and `src/tests/utils`, and use Supertest and Vitest without
requiring a running backend or a local `.env` file.

The server binds to `0.0.0.0` so it is reachable from outside a container. Add any new environment variables to your local `.env` and document them in this section.

## Troubleshooting

**`Cannot find module` or unexpected type errors** — you may be on the wrong Node version. Run `nvm use`, then `rm -rf node_modules && npm ci`.

**`PORT environment variable is not set`** — create a `.env` file in the repository root and add `PORT=3000`.

**`EADDRINUSE`** — another process is already using that port. Stop it, or change `PORT` in `.env`.

**`npm start` fails with a missing file** — run `npm run build` first to generate `dist/`.

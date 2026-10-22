# KORA Fragrance House

KORA is a React and Vite perfume shop with a hosted product studio. Netlify Functions serves the catalog API, Netlify Database stores products, Netlify Blobs stores photos, and Netlify Identity protects administrator access.

## Run locally

From the repository root, run `npm ci`, then `netlify dev --port 8889`, then open http://localhost:8889. Use Netlify Dev rather than Vite alone so API routes and authentication are available.

## Deploy

The root `netlify.toml` configures the application directory, build command, publish directory, functions, and application routes. Netlify applies the migrations in `netlify/database/migrations` during deployment. The initial migration seeds six starter fragrances once; redeploying does not overwrite edits or restore deleted products. The storefront falls back to starter scents if the online catalog is temporarily unavailable.

## Administrator setup

In the Netlify dashboard for this project, open Identity and invite the administrator's email address. After the invitation is accepted, open that user and add the `admin` role. Use `/admin` to sign in, manage fragrances, upload photos, hide products, or mark them sold out. Accounts without the admin role cannot read hidden products or change the catalog. Public registration never grants admin access.

Invitation and password recovery links work when they return to either the homepage or `/admin`. The studio includes a password recovery link. Existing local SQLite or Supabase passwords are not used by the hosted application. Existing external catalog data is not imported automatically; the hosted database starts with the six starter fragrances.

## Development checks

From the repository root, run `npm run check` and `npm run lint`. From the repository root, define schema changes in `db/schema.ts` and generate a named migration with `npx drizzle-kit generate --name describe_change`. Netlify applies migrations during deployment; do not apply them manually.

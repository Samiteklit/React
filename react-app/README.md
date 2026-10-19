# KORA Fragrance House

KORA is a React + Vite perfume shop with a product admin. It can run locally on SQLite or use Supabase for its product catalog and photos.

## Run the shop

```bash
pnpm install
pnpm dev
```

Open the local address shown in the terminal. Visit `/admin` to manage fragrances.

## Supabase setup

The Supabase project URL and publishable key belong in the ignored `.env.local` file as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is meant for browser use; never put a Supabase `service_role` or secret key in frontend code.

1. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. It creates the catalog, admin allowlist, RLS policies, and public product-image bucket. Running it again is safe.
2. In Supabase Auth, create an administrator user. Disable public sign-ups if only dashboard-created accounts should exist.
3. Add that user's email to the allowlist by running this in the SQL Editor, replacing the email:

   ```sql
   INSERT INTO public.admin_users (user_id)
   SELECT id FROM auth.users WHERE lower(email) = lower('admin@example.com')
   ON CONFLICT (user_id) DO NOTHING;
   ```

4. The storefront reads active products publicly. The admin uses Supabase Auth; only users in `admin_users` may see hidden products, edit the catalog, or upload/delete photos.
5. To migrate the local SQLite catalog, temporarily add `KORA_MIGRATION_EMAIL` and `KORA_MIGRATION_PASSWORD` to `.env.local` for the allowlisted administrator, then run `pnpm migrate:supabase`. The migration is safe to rerun and leaves SQLite untouched. Remove these migration credentials from `.env.local` afterward.
6. Restart the app after changing `.env.local` so Vite reloads its public environment variables.

The local admin-password hash is not migrated. Without the Vite Supabase variables, the app continues using its local SQLite database and local admin login.

## Local data

- Product information: `data/kora.sqlite`
- Product photos: `data/uploads/`

Keep a copy of the `data` folder if you want a backup. The local development server listens only on this computer.

# Supabase Auth and Resend setup

The application uses Supabase Auth for credentials and recovery, Supabase `members` rows for Nexus profiles, and Appwrite for the existing chat data. A Vercel serverless function creates an unconfirmed Supabase user, generates a six-digit code, and sends signup, resend, and recovery codes directly through the Resend API. After validating the code, it exchanges a short-lived Supabase token hash for the browser auth session. `RESEND_API_KEY` is server-only and must never be exposed through a `VITE_` variable or browser bundle.

## 1. Apply the database migration

Schema changes are versioned SQL files under `supabase/migrations/`. Builds and browser-facing code never apply SQL. An operator explicitly runs `npm run db:setup:dry` to review migration files, then `npm run db:setup` to apply pending migrations. The CLI applies each migration in a transaction, takes an advisory lock, records its version and SHA-256 checksum in `public.nexus_schema_migrations`, and verifies the required tables, functions, and Auth triggers. Editing an already-applied migration is rejected; create a new timestamped migration instead. The baseline migration provisions member/profile rows for Supabase Auth users, applies RLS, removes public access to the legacy password column, and installs the persistent email-code rate-limit RPC required by the Vercel email endpoint.

Set `SUPABASE_DB_URL` locally in ignored `.env.local` to a PostgreSQL connection string from Supabase (prefer the Session pooler connection string when the operator machine cannot connect directly). It is a highly privileged secret. The Supabase anon and service-role API keys cannot execute arbitrary DDL; the CLI checks them against Supabase Auth endpoints, but only the explicit migration command uses the database URL to apply checked-in migration files. Do not upload `SUPABASE_DB_URL` to Vercel, expose it to browser code, or run migrations from a browser bot or build hook.

The migration retains the old nullable `members.password` column temporarily to avoid silently destroying legacy data. New accounts do not write to it. Existing browser/Appwrite accounts without verified email addresses cannot be automatically linked safely; have those users register with an email and follow a supervised recovery/relink process. After legacy account disposition, remove the old column with:

```sql
alter table public.members drop column if exists password;
```

Create admin identities through Supabase Auth, then promote only the intended account in the SQL Editor:

```sql
update public.members
set role = 'admin'
where auth_user_id = (
  select id from auth.users where lower(email) = lower('admin@your-domain.com')
);
```

## 2. Configure auth URLs

In Supabase Dashboard, open **Authentication → URL Configuration**:

- Site URL: `https://nexus-chat-world.com`
- Redirect URLs: `https://nexus-chat-world.com/verify-email`
- Redirect URLs: `https://nexus-chat-world.com/verify-email?purpose=recovery`
- For local development, add `http://localhost:5173/verify-email` and `http://localhost:5173/verify-email?purpose=recovery`.

Keep **Confirm email** enabled in **Authentication → Providers → Email**. App verification codes expire after 10 minutes, allow at most five guesses, and are rate-limited by the database RPC installed by the schema migration. Supabase's built-in email templates are not used for these flows.

## 3. Configure Resend API

In Resend, use the verified domain `nexus-chat-world.com` and create an API key with send-only permissions. The server function sends through `https://api.resend.com/emails` using these Vercel Production variables:

- `RESEND_API_KEY` (encrypted server variable)
- `RESEND_FROM=admin@nexus-chat-world.com`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (encrypted server variable)

The Supabase service-role key is used only by the Vercel function to generate OTPs; never prefix it with `VITE_`.

## 4. Vercel environment

Set these in **Vercel → Project → Settings → Environment Variables** for Production, Preview, and Development as appropriate:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not add `SUPABASE_SERVICE_ROLE_KEY`, the Postgres connection string, or `RESEND_API_KEY` to frontend `VITE_` variables. The database connection string stays local to the operator's migration environment and is not required by the Vercel app. Redeploy after environment changes.

## 5. Verify the flow

1. Register with an email address and an 8-character-minimum password; confirm the six-digit code is delivered by Resend.
2. Verify the code, then sign in; the profile row should be created by the database trigger.
3. Request password recovery; verify the recovery code is delivered by Resend.
4. Verify the code, set a new password, and sign in with it.
5. In Supabase SQL Editor, verify `members.password` is not selected by anon/authenticated roles and that a user can only select their own member row.

# Supabase Auth and Resend setup

The application uses Supabase Auth for credentials and recovery, Supabase `members` rows for Nexus profiles, and Appwrite for the existing chat data. The Resend API key is configured in Supabase Auth SMTP settings; it must never be exposed through a `VITE_` variable or browser bundle.

## 1. Apply the database migration

Review and run `supabase-schema.sql` in the Supabase SQL Editor before deploying the new auth flow. It provisions a member/profile row for each Supabase Auth user, scopes member access with RLS, and removes public access to the legacy password column.

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
- Redirect URLs: `https://nexus-chat-world.com/login`
- Redirect URLs: `https://nexus-chat-world.com/reset-password`
- For local development, add `http://localhost:5173/login` and `http://localhost:5173/reset-password`.

## 3. Configure Resend SMTP

In Resend, use the verified domain `nexus-chat-world.com` and create an API key with the minimum permissions needed for sending. In Supabase Dashboard, open **Authentication → SMTP Settings**, enable custom SMTP, and configure:

- Host: `smtp.resend.com`
- Port: `465` with SSL, or `587` with STARTTLS
- Username: `resend`
- Password: the Resend API key
- Sender email: `noreply@nexus-chat-world.com`
- Sender name: `Nexus Chat`

Use the password reset template with Supabase's `{{ .ConfirmationURL }}` link. Test the confirmation and recovery messages from Supabase Auth after saving SMTP settings.

## 4. Vercel environment

Set these in **Vercel → Project → Settings → Environment Variables** for Production, Preview, and Development as appropriate:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not add `SUPABASE_SERVICE_ROLE_KEY`, the Postgres connection string, or `RESEND_API_KEY` to frontend `VITE_` variables. The Resend key belongs in Supabase SMTP configuration, not the client app. Redeploy after environment changes.

## 5. Verify the flow

1. Register with an email address and an 8-character-minimum password.
2. Confirm the address using the Supabase Auth email.
3. Sign in with email/password; the profile row should be created by the database trigger.
4. Request password recovery and verify the link opens the production reset page.
5. Set a new password, confirm the session is closed, and sign in with the new password.
6. In Supabase SQL Editor, verify `members.password` is not selected by anon/authenticated roles and that a user can only select their own member row.

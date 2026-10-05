# Nexus Chat

## Authentication setup

Supabase Auth handles account credentials and password recovery. Appwrite remains the chat data provider. Follow [the Supabase Auth and Resend setup guide](docs/supabase-auth-setup.md) before deploying the auth migration.

## Vercel environment variables

The Vercel sync command uploads the generated environment values to the Production target, encrypts private credentials, and removes the obsolete `VITE_APPWRITE_API_KEY` and `VITE_ADMIN_PASSWORD` variables. It requires a Vercel access token and project ID; the token is read from `VERCEL_TOKEN` and is never written to project files or printed.

1. In Vercel, open your account or team settings, select **Tokens**, and create a new token scoped to the team that owns this project. Revoke the token that was pasted into the previous command/README excerpt. Set an expiration appropriate for your deployment workflow.
2. Find the project ID in the project's **Settings > General** page. For a team project, also find the team ID.
3. Put the deployment values in `.env.local` using the server-only names from `.env.example`. Never use `VITE_` for the Appwrite API key or admin password.
4. In PowerShell, set the project identifiers and enter a fresh token using a secure prompt. This keeps the token out of command history and does not echo it:

	```powershell
	$env:VERCEL_PROJECT_ID = "prj_your_project_id"
	$env:VERCEL_TEAM_ID = "team_your_team_id" # omit for a personal project
	$secureToken = Read-Host "Vercel token" -AsSecureString
	$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
	try {
	    $env:VERCEL_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
	} finally {
	    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
	}
	try {
	    npm run vercel:env:dry
	    if ($LASTEXITCODE -ne 0) { throw "Vercel environment dry run failed; do not sync yet." }
	    $confirmation = Read-Host 'Review the dry-run output. Type SYNC to update Vercel Production variables'
	    if ($confirmation -ceq 'SYNC') {
	        npm run vercel:env:sync
	        if ($LASTEXITCODE -ne 0) { throw "Vercel environment sync failed." }
	    } else {
	        Write-Output 'Sync cancelled; no Vercel changes were made.'
	    }
	} finally {
	    Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
	    Remove-Item Env:VERCEL_PROJECT_ID -ErrorAction SilentlyContinue
	    Remove-Item Env:VERCEL_TEAM_ID -ErrorAction SilentlyContinue
	}
	```

The dry run reports missing variable names only. The sync command updates existing Production-only variables, creates missing ones, then removes the legacy public secret variables. It fails rather than changing variables currently shared with Preview or Development, so adjust those target scopes in Vercel first if prompted.

# Appwrite Web platform setup

Register each browser origin that hosts the app as a Web platform in the Appwrite project used by `VITE_APPWRITE_PROJECT_ID`. In the Appwrite Console, open the project, go to **Settings → Platforms**, choose **Add platform → Web app**, and add the hostname:

- `www.nexus-chat-world.com`
- `nexus-chat-world.com`

Add any Vercel preview hostname used to test the app as a separate Web platform. Enter hostnames only; do not include `https://`, a path, or a trailing slash. Appwrite rejects browser API calls from origins that are not registered, often with `general_unknown_origin` and a browser CORS error. No redeploy is required after adding a platform; reload the app after the change.

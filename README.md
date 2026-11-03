# VYBE

VYBE is a responsive React, TypeScript, and Vite app with server-backed account registration and sign-in, a dark-first interface, and a sample messaging workspace.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` runs the TypeScript check and creates a production bundle in `dist/`. `npm test` checks the authentication handler.

## Accounts and deployment

The opening screen always offers sign-in and account creation. Registration and email/password sign-in use `/api/auth`, a Vercel Node function connected to a **private** Vercel Blob store. Passwords are salted and hashed with scrypt on the server. Sessions use random tokens in Secure, HttpOnly, SameSite cookies; credentials and account records are never saved in browser storage. Registration does not verify email ownership yet.

Link the Vercel project to a private Blob store and set `BLOB_READ_WRITE_TOKEN` in its server environment. Never use a `VITE_` prefix for this token. Deploy with Vercel to serve both the UI and the API. For local full-stack development, use `vercel dev`; `npm run dev` alone serves only the UI.

Authentication always appears on a fresh page load, even if a session cookie exists. Account creation is rate-limited with conditional private-store writes, and duplicate emails cannot overwrite existing accounts. Display handles are not unique and are not login identifiers.

## What works

- Browse seeded one-to-one and group conversations, filter/search chats, and switch between Chats, Calls, Communities, Updates, and Profile.
- Open or start a conversation, send text, reply to messages, add a reaction, attach a local file name, and choose emoji.
- Conversations currently exist only in the signed-in workspace's memory; reloading discards sample chat changes. No chats or account credentials are cached locally.
- Responsive layouts, light/dark appearance, and clear preview states for actions that need a real service.

## Prototype limitations

Account registration and login are server-backed. The chat workspace is still sample data, not a connected messaging service: it does not yet deliver messages between users, synchronize conversations, verify email, reset passwords, provide real calls/stories/community creation, or implement end-to-end encryption. File attachments add a filename rather than uploading the file. The Expo wrapper loads the deployed site; EAS update/push setup limitations are documented in `mobile/README.md`.

# VYBE

VYBE is a responsive React, TypeScript, and Vite messaging app with server-backed accounts and private one-to-one conversations, a dark-first interface, and a mobile-friendly Expo WebView shell.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` runs the TypeScript check and creates a production bundle in `dist/`. `npm test` checks authentication, conversation access controls, persistence, concurrent sends, idempotent retries, replies, reactions and read positions.

## Accounts and deployment

The opening screen always offers sign-in and account creation. Registration and email/password sign-in use `/api/auth`, a Vercel Node function connected to a **private** Vercel Blob store. Passwords are salted and hashed with scrypt on the server. Sessions use random tokens in Secure, HttpOnly, SameSite cookies; credentials and account records are never saved in browser storage. Registration does not verify email ownership yet.

Link the Vercel project to a private Blob store and set `BLOB_READ_WRITE_TOKEN` in its server environment. Never use a `VITE_` prefix for this token. Deploy with Vercel to serve both the UI and the API. For local full-stack development, use `vercel dev`; `npm run dev` alone serves only the UI.

Authentication always appears on a fresh page load, even if a session cookie exists. Account creation is rate-limited with conditional private-store writes, and duplicate emails cannot overwrite existing accounts. Display handles are not unique and are not login identifiers.

## Messaging

1. Register two accounts (use separate browsers/devices to keep separate sessions).
2. Select **New conversation** and enter the other account's registered email.
3. Send a message. The other account sees the conversation and message on its next sync, normally within four seconds while the page is visible.
4. Sign out, reload and sign in again: the conversation history is read from the server.

`/api/messages` validates the HttpOnly session cookie, its expiry and the account before every operation. Only the two conversation participants can read or mutate a conversation. Contact lookup requires an exact email; there is no public account directory. Display handles are not unique.

Messages, replies, per-user heart reactions and read positions live in private Blob records. Deterministic conversation IDs prevent duplicate threads. Conditional writes with bounded retries prevent concurrent sends from losing messages. Client-generated message IDs make retries idempotent, and server revision numbers prevent slower responses from rolling back newer UI state. Drafts remain in memory if a send fails; no success or delivery check appears until the server confirms storage.

The app polls every four seconds while visible and resumes when the page becomes visible or the network reconnects. This is **polling, not WebSocket real-time delivery**. A message check means stored on the server, not read by the recipient. Search, unread filters, reply, emoji, reactions, appearance and sign-out work with actual account data. There are no seeded contacts or fake presence indicators.

With the private store token set in your shell, `npm run test:blob` runs an opt-in storage integration check (creating and deleting one random `verification/` record). For a linked local project you can use `node --env-file=.env.local --test server/blob.integration.test.mjs`. It verifies large-record conditional writes: reads request identity encoding because compressed Blob responses expose weak ETags, which cannot be used for `ifMatch`.

## Current limits

This is a small-scale messaging implementation, not a production-scale chat service. Each account is limited to 100 conversations and each conversation to 1,000 messages (an explicit error is shown at the limit). Mutations are limited to 60 per minute per account. Blob storage is not a transactional database: inbox registration uses independent conditional writes, and retrying conversation creation repairs a partial inbox registration. Sync currently reads the full conversation history; a database with indexed membership and cursor pagination is needed before scaling.

Messages are **not end-to-end encrypted**. Email ownership verification, password reset, blocking/reporting, account deletion, file uploads, groups, voice/video calls, push notifications and background delivery are not implemented. Unsupported navigation sections were removed rather than populated with fake activity. The attachment control explicitly says uploads are unavailable. Expired session and rate-limit records need a retention/cleanup job before sustained production use.

The Expo wrapper loads the deployed site; EAS update/push setup limitations are documented in `mobile/README.md`. API tests use an in-memory adapter; deployment also requires live two-account verification against the private Blob store.

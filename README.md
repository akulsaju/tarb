# VYBE

VYBE is a responsive React, TypeScript, and Vite messaging app with server-backed accounts and private one-to-one conversations, a dark-first interface, and a mobile-friendly Expo WebView shell.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` runs the TypeScript check and creates a production bundle in `dist/`. `npm test` checks authentication, conversation access controls, persistence, concurrent sends, idempotent retries, replies, reactions, read positions, profile edits, status audiences and 24-hour expiry.

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

## Profile and status

The navigation is organized into **Chats**, **Status** and **Profile**. Profile separates identity, account details, appearance, privacy/data and sign-out.

- **Edit profile & photo** changes your display name, profile status (up to 140 characters) and photo. Choose JPEG, PNG or WebP up to 10 MB; the browser center-crops and re-encodes it as a 256px JPEG, removing original metadata. You can remove the photo and return to initials. Changes only take effect after **Save profile** succeeds. Email and display handle remain unchanged.
- Profile records are stored privately in `profiles/{accountId}.json`. The messaging sync returns current profiles only for the signed-in user and people sharing a conversation, so names/photos/status messages stay consistent in chat lists and headers. Tap a conversation header to view the contact's profile. Version checks prevent silently overwriting edits from another device.
- **Status** publishes text-only posts with three background choices, up to 700 characters and 10 active posts. Each expires 24 hours after the server accepts it. Your current conversation contacts can view it (including a new contact added during those 24 hours); there is no public feed or individual audience selector. Posts are not read receipts or presence indicators.
- You can view and delete your own posts with confirmation. Deletion only acts on the authenticated user's records. Expired/deleted posts are omitted by the server, and the UI also hides locally expired posts between syncs using server-adjusted time. Expiry means removal from view, not guaranteed physical deletion: expired records are pruned on the owner's next status mutation; a retention job is still needed for automatic storage erasure.

Photo data is included in private profile JSON, not served through public upload URLs. Sync currently transfers profile photos along with history, so this is deliberately a small-scale implementation. Status image/video uploads and viewer lists are not implemented.

## Current limits

This is a small-scale messaging implementation, not a production-scale chat service. Each account is limited to 100 conversations and each conversation to 1,000 messages (an explicit error is shown at the limit). Mutations are limited to 60 per minute per account. Blob storage is not a transactional database: inbox registration uses independent conditional writes, and retrying conversation creation repairs a partial inbox registration. Sync currently reads the full conversation history; a database with indexed membership and cursor pagination is needed before scaling.

Messages are **not end-to-end encrypted**. Email ownership verification, password reset, blocking/reporting, account deletion, message attachments, groups, voice/video calls, push notifications and background delivery are not implemented. Unsupported navigation sections were removed rather than populated with fake activity. The attachment control explicitly says message uploads are unavailable; profile photo saving is implemented separately. Expired session and rate-limit records need a retention/cleanup job before sustained production use.

The Expo wrapper loads the deployed site; EAS update/push setup limitations are documented in `mobile/README.md`. API tests use an in-memory adapter; deployment also requires live two-account verification against the private Blob store.

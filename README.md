# VYBE

VYBE is a responsive, Liquid Glass-inspired messaging app prototype built with React, TypeScript, and Vite.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` runs the TypeScript check and creates a production bundle in `dist/`.

## What works in this prototype

- Browse seeded one-to-one and group conversations, filter/search chats, and switch between Chats, Calls, Communities, Updates, and Profile.
- Open or start a conversation, send text, reply to messages, add a reaction, attach a local file name, and choose emoji.
- Conversation history is saved to this browser's local storage.
- Responsive layouts, light/dark appearance, and clear preview states for actions that need a real service.

## Prototype limitations

This is a front-end prototype, not a connected messaging service or a packaged native mobile app. It has no sign-in, server, multi-device synchronization, push notifications, functioning calls/stories/community creation, or end-to-end encryption. The seeded contacts and activity are sample data; local-storage messages remain in this browser only. File attachments currently add a local filename to the conversation rather than uploading the file.

# VYBE Mobile (Expo)

A native Expo shell (SDK 58) that loads the deployed VYBE web app with loading, retry, dark entry and optional standalone-build over-the-air update handling.

## Run in Expo Go

```sh
npm install
npx expo start
```

Use Node 22.13 or newer for SDK 58. Scan the QR code with an **SDK 58-compatible Expo Go** (phone and computer on the same Wi-Fi). Expo Go for SDK 55 cannot run this project; changing JavaScript cannot add SDK 58 native modules to an older client. Alternatively, use an SDK 58 development build.

The app opens the live site in dark mode with the server-backed sign-up/sign-in screen.

## What's wired up

- **OTA updates (`expo-updates`)**: only standalone release builds import this module. When EAS updates are configured and enabled, the app checks for an update, downloads it and offers a restart banner. Expo Go and development builds skip the import entirely.
- **Notifications**: not implemented. The placeholder permission prompt and local welcome notification were removed; they did not deliver messages and their eager native imports could prevent Expo Go from starting.
- **Dark entry**: the shell loads `?theme=dark` and uses dark native loading/error screens and a light status bar. The web app offers registration and sign-in on each fresh page load.

## Enabling remote updates and push notifications (needs your Expo account)

These require signing in to Expo/EAS — run once, interactively:

```sh
npx eas login
npx eas update:configure   # writes updates.url + EAS projectId into app.json
npx eas build --platform android --profile production   # builds the APK/AAB
npx eas update --branch production --message "..."      # ships an OTA update to installed APKs
```

Push notifications require a separate implementation: a compatible native notifications library, device-token registration, Android FCM/iOS APNs credentials and a server delivery path. None of that is active.

## Startup troubleshooting

If Expo Go shows `Cannot find native module 'ExpoApplication'`, close the failed experience and restart Metro from `mobile/` with `npx expo start --clear`, then scan the new QR code. The app no longer imports the notification package at startup. Verify that your Expo Go supports SDK 58; an older runtime still requires a compatible Expo Go or a rebuilt development client.

After adding or changing native modules in a standalone/development build, rebuild and reinstall it; a Metro reload or OTA update cannot install native modules. `npm test` checks that Expo Go/development startup does not import standalone update modules.

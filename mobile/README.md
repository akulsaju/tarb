# VYBE Mobile (Expo)

A native Expo shell (SDK 58) that loads the deployed VYBE web app with loading, retry, dark-mode sync, notification, and over-the-air update handling.

## Run in Expo Go

```sh
npm install
npx expo start
```

Scan the QR code with Expo Go (phone and computer on the same Wi-Fi). The app automatically matches your device dark/light appearance.

## What's wired up

- **OTA updates (`expo-updates`)**: on launch the app checks for a published update, downloads it, and offers a one-tap restart banner.
- **Notifications (`expo-notifications`)**: requests permission on first launch and schedules a local welcome notification. Android 13+ permission is declared.
- **Appearance sync**: the device color scheme is passed to the web app (`?theme=dark|light`) so the native shell and web UI match.

## Enabling remote updates and push notifications (needs your Expo account)

These require signing in to Expo/EAS — run once, interactively:

```sh
npx eas login
npx eas update:configure   # writes updates.url + EAS projectId into app.json
npx eas build --platform android --profile production   # builds the APK/AAB
npx eas update --branch production --message "..."      # ships an OTA update to installed APKs
```

Push notifications additionally need an FCM server key/credentials (`eas credentials`) and a server or the Expo push API to send messages to device tokens (`Notifications.getExpoPushTokenAsync()`). None of that is active until the EAS project is created; in Expo Go, `expo-updates` is disabled by design, so the update banner only appears in standalone builds.

import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import * as Updates from 'expo-updates'

const VYBE_URL = 'https://vybe-lac.vercel.app'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export default function App() {
  const webView = useRef(null)
  const dark = true
  const [failed, setFailed] = useState(false)
  const [update, setUpdate] = useState(null) // 'checking' | 'downloading' | 'ready' | null

  useEffect(() => {
    registerForNotifications()
    checkForUpdate()
  }, [])

  async function registerForNotifications() {
    try {
      const { status } = await Notifications.getPermissionsAsync()
      const final = status === 'granted' ? status : (await Notifications.requestPermissionsAsync()).status
      if (final === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Welcome to VYBE',
            body: 'You will be notified here when something new arrives.',
          },
          trigger: { seconds: 6, channelId: 'default' },
        })
      }
    } catch {
      // Notifications unavailable in this environment
    }
  }

  async function checkForUpdate() {
    if (!Updates.isEnabled) return
    try {
      setUpdate('checking')
      const result = await Updates.checkForUpdateAsync()
      if (result.isAvailable) {
        setUpdate('downloading')
        await Updates.fetchUpdateAsync()
        setUpdate('ready')
      } else {
        setUpdate(null)
      }
    } catch {
      setUpdate(null)
    }
  }

  async function applyUpdate() {
    try {
      await Updates.reloadAsync()
    } catch {
      setUpdate(null)
    }
  }

  const uri = `${VYBE_URL}?theme=${dark ? 'dark' : 'light'}`
  const theme = dark ? darkTheme : lightTheme

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {update === 'ready' && (
          <View style={[styles.updateBar, { backgroundColor: theme.accent }]}>
            <Text style={styles.updateText}>A new version of VYBE is ready</Text>
            <TouchableOpacity onPress={applyUpdate} style={styles.updateButton}>
              <Text style={styles.updateButtonText}>Restart</Text>
            </TouchableOpacity>
          </View>
        )}
        {update === 'downloading' && (
          <View style={[styles.updateBar, { backgroundColor: theme.accentSoft }]}>
            <ActivityIndicator color={theme.accent} size="small" />
            <Text style={[styles.updateText, { color: theme.accent }]}>Downloading update…</Text>
          </View>
        )}
        {failed ? (
          <View style={[styles.fallback, { backgroundColor: theme.background }]}>
            <Text style={[styles.fallbackTitle, { color: theme.text }]}>Couldn’t reach VYBE</Text>
            <Text style={[styles.fallbackText, { color: theme.muted }]}>Check your connection and try again.</Text>
            <TouchableOpacity
              style={[styles.retry, { backgroundColor: theme.accent }]}
              onPress={() => {
                setFailed(false)
                webView.current?.reload()
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            ref={webView}
            source={{ uri }}
            style={[styles.webview, { backgroundColor: theme.background }]}
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.loading, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.accent} size="large" />
                <Text style={[styles.loadingText, { color: theme.accent }]}>Opening VYBE…</Text>
              </View>
            )}
            onError={() => setFailed(true)}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            pullToRefreshEnabled
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const lightTheme = {
  background: '#f3f5fa',
  text: '#242637',
  muted: '#73778d',
  accent: '#6d5bd0',
  accentSoft: '#eeeaff',
}

const darkTheme = {
  background: '#171927',
  text: '#f2f1f8',
  muted: '#b7b6c8',
  accent: '#a99cf4',
  accentSoft: '#37334f',
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: { fontSize: 15, fontWeight: '600' },
  updateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  updateText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  updateButton: {
    backgroundColor: 'rgba(255,255,255,.22)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9,
  },
  updateButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  fallbackTitle: { fontSize: 20, fontWeight: '700' },
  fallbackText: { fontSize: 14, textAlign: 'center' },
  retry: { marginTop: 12, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14 },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})

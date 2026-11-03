import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { StatusBar } from 'expo-status-bar'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { loadNativeUpdates } from './native-runtime.mjs'

const VYBE_URL = 'https://vybe-lac.vercel.app'

export default function App() {
  const webView = useRef(null)
  const updates = useRef(null)
  const dark = true
  const [failed, setFailed] = useState(false)
  const [update, setUpdate] = useState(null)
  const [updateError, setUpdateError] = useState('')

  useEffect(() => {
    let active = true
    async function checkForUpdate() {
      try {
        const nativeUpdates = loadNativeUpdates({
          isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
          isDevelopment: __DEV__,
          load: () => require('expo-updates'),
        })
        if (!nativeUpdates) return
        updates.current = nativeUpdates
        setUpdate('checking')
        const result = await nativeUpdates.checkForUpdateAsync()
        if (!active) return
        if (result.isAvailable) {
          setUpdate('downloading')
          await nativeUpdates.fetchUpdateAsync()
          if (active) setUpdate('ready')
        } else {
          setUpdate(null)
        }
      } catch (error) {
        console.warn('VYBE update check failed:', error)
        if (active) {
          setUpdate(null)
          setUpdateError('Could not check for app updates. Messaging is still available.')
        }
      }
    }
    void checkForUpdate()
    return () => { active = false }
  }, [])

  async function applyUpdate() {
    try {
      if (!updates.current) throw new Error('Native updates are unavailable.')
      await updates.current.reloadAsync()
    } catch (error) {
      console.warn('VYBE update restart failed:', error)
      Alert.alert('Could not restart VYBE', 'Please close and reopen the app to apply the downloaded update.')
    }
  }

  const uri = `${VYBE_URL}?theme=${dark ? 'dark' : 'light'}`
  const theme = dark ? darkTheme : lightTheme

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        {updateError && <View style={[styles.updateBar, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.updateText, { color: theme.text, flex: 1 }]}>{updateError}</Text>
          <TouchableOpacity accessibilityLabel="Dismiss update error" onPress={() => setUpdateError('')} style={styles.updateButton}>
            <Text style={{ color: theme.text }}>Dismiss</Text>
          </TouchableOpacity>
        </View>}
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

import { useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { StatusBar } from 'expo-status-bar'

const VYBE_URL = 'https://vybe-lac.vercel.app'

export default function App() {
  const webView = useRef(null)
  const [failed, setFailed] = useState(false)

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {failed ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>Couldn’t reach VYBE</Text>
            <Text style={styles.fallbackText}>Check your connection and try again.</Text>
            <TouchableOpacity
              style={styles.retry}
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
            source={{ uri: VYBE_URL }}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color="#6d5bd0" size="large" />
                <Text style={styles.loadingText}>Opening VYBE…</Text>
              </View>
            )}
            onError={() => setFailed(true)}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f5fa' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f5fa',
    gap: 14,
  },
  loadingText: { color: '#6d5bd0', fontSize: 15, fontWeight: '600' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  fallbackTitle: { color: '#242637', fontSize: 20, fontWeight: '700' },
  fallbackText: { color: '#73778d', fontSize: 14, textAlign: 'center' },
  retry: {
    marginTop: 12,
    backgroundColor: '#6d5bd0',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})

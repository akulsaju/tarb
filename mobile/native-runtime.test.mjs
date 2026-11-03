import assert from 'node:assert/strict'
import test from 'node:test'
import { loadNativeUpdates } from './native-runtime.mjs'

test('Expo Go never imports standalone native update modules', () => {
  for (const isDevelopment of [true, false]) {
    assert.equal(loadNativeUpdates({
      isExpoGo: true, isDevelopment,
      load() { throw new Error('Native module is not installed in Expo Go') },
    }), null)
  }
})

test('development builds skip native update initialization', () => {
  assert.equal(loadNativeUpdates({
    isExpoGo: false, isDevelopment: true,
    load() { throw new Error('Updates must not load in development') },
  }), null)
})

test('standalone release builds use enabled updates and skip unconfigured updates', () => {
  for (const isEnabled of [true, false]) {
    const updates = { isEnabled }
    assert.equal(loadNativeUpdates({
      isExpoGo: false, isDevelopment: false, load: () => updates,
    }), isEnabled ? updates : null)
  }
})

test('a missing module in a release build propagates to the app error handler', () => {
  assert.throws(() => loadNativeUpdates({
    isExpoGo: false, isDevelopment: false,
    load() { throw new Error('Missing native module') },
  }), /Missing native module/)
})

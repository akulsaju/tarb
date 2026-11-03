export function loadNativeUpdates({ isExpoGo, isDevelopment, load }) {
  if (isExpoGo || isDevelopment) return null
  const updates = load()
  return updates.isEnabled ? updates : null
}

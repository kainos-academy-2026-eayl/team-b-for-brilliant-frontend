export function safeRedirect(target: unknown, fallback = '/account'): string {
  if (typeof target !== 'string') return fallback
  const isLocalPath =
    target.startsWith('/') && !target.startsWith('//') && !target.includes('\\')
  return isLocalPath ? target : fallback
}

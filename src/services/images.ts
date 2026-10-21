export const IMAGE_ROUTE_PREFIX = '/images/'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface ProxiedImage {
  body: Buffer
  contentType: string
  cacheControl: string
}

export function isSafeImageFileName(fileName: string): boolean {
  return SAFE_FILE_NAME.test(fileName) && !fileName.includes('..')
}

/**
 * Maps a backend image URL to a path served by this frontend, so the browser never
 * needs to reach the backend directly. Returns null if the image can't be proxied.
 */
export function toProxiedImageUrl(
  imageUrl: string,
  baseUrl: string,
): string | null {
  let url: URL
  try {
    url = new URL(imageUrl, baseUrl)
  } catch {
    return null
  }

  if (url.origin !== new URL(baseUrl).origin) {
    return null
  }

  if (!url.pathname.startsWith(IMAGE_ROUTE_PREFIX)) {
    return null
  }

  const fileName = decodeURIComponent(
    url.pathname.slice(IMAGE_ROUTE_PREFIX.length),
  )
  if (!isSafeImageFileName(fileName)) {
    return null
  }

  return `${IMAGE_ROUTE_PREFIX}${encodeURIComponent(fileName)}`
}

export async function fetchImage(
  fileName: string,
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ProxiedImage | null> {
  if (!isSafeImageFileName(fileName)) {
    return null
  }

  const response = await fetchFn(
    new URL(`${IMAGE_ROUTE_PREFIX}${encodeURIComponent(fileName)}`, baseUrl),
    { signal: AbortSignal.timeout(5000) },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch image ${fileName}: HTTP ${response.status}`,
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Backend returned non-image content for ${fileName}`)
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image ${fileName} exceeds the maximum allowed size`)
  }

  const body = Buffer.from(await response.arrayBuffer())
  if (body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image ${fileName} exceeds the maximum allowed size`)
  }

  return {
    body,
    contentType,
    cacheControl:
      response.headers.get('cache-control') ?? 'public, max-age=3600',
  }
}

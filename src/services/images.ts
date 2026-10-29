// Image URLs exposed by the frontend use this route prefix.
export const IMAGE_ROUTE_PREFIX = '/images/';
// Limit each downloaded image to 5 MiB.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Allow plain file names, not directory paths or arbitrary URL characters.
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Keep the file name separate from its public URL and filesystem path.
const FAILSAFE_FILE_NAME = 'placeholder.svg';
const FAILSAFE_IMAGE_URL = `${IMAGE_ROUTE_PREFIX}${FAILSAFE_FILE_NAME}`;

// Keep the downloaded bytes and response headers needed by the image controller.
export interface ProxiedImage {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

export function isSafeImageFileName(fileName: string): boolean {
  // Reject traversal markers even when the remaining characters are allowed.
  return SAFE_FILE_NAME.test(fileName) && !fileName.includes('..');
}

/**
 * Maps a backend image URL to a path served by this frontend, so the browser never
 * needs to reach the backend directly. Faulty URLs use the local placeholder.
 */
export function toProxiedImageUrl(
  imageUrl: string,
  baseUrl: string,
): string | null {
  // Invalid backend configuration is an error, not a faulty product image.
  const backendUrl = new URL(baseUrl);
  let url: URL;
  try {
    // Resolve relative image paths against the backend address.
    url = new URL(imageUrl, backendUrl);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    console.warn('Invalid product image URL; using the local placeholder.');
    return FAILSAFE_IMAGE_URL;
  }

  // Do not proxy images hosted on a different origin.
  if (url.origin !== backendUrl.origin) {
    console.warn('Product image has an unsupported origin; using the local placeholder.');
    return FAILSAFE_IMAGE_URL;
  }

  // Only backend paths under /images/ are eligible for proxying.
  if (!url.pathname.startsWith(IMAGE_ROUTE_PREFIX)) {
    console.warn('Product image has an unsupported path; using the local placeholder.');
    return FAILSAFE_IMAGE_URL;
  }

  // Decode before validating so encoded directory separators cannot bypass checks.
  let fileName: string;
  try {
    fileName = decodeURIComponent(url.pathname.slice(IMAGE_ROUTE_PREFIX.length));
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    console.warn('Product image has invalid URL encoding; using the local placeholder.');
    return FAILSAFE_IMAGE_URL;
  }
  // Reject nested paths, traversal markers and unsupported file-name characters.
  if (!isSafeImageFileName(fileName)) {
    console.warn('Product image has an unsafe file name; using the local placeholder.');
    return FAILSAFE_IMAGE_URL;
  }

  // Return a frontend-relative URL, with the file name safely encoded.
  return `${IMAGE_ROUTE_PREFIX}${encodeURIComponent(fileName)}`;
}

async function getFailsafeImage(reason: string): Promise<ProxiedImage> {
  console.warn(`${reason}; using the local placeholder.`);
  // Read locally rather than retrying the backend or recursively fetching a fallback.
  // A missing placeholder throws so the controller can log and report the failure.
  return {
    body: await readFile(path.resolve('public/images', FAILSAFE_FILE_NAME)),
    contentType: 'image/svg+xml',
    cacheControl: 'no-store',
  };
}

/**
 * Downloads an image from the backend for the frontend controller to serve.
 * Unsafe requests return null. Unusable responses use the local placeholder;
 * network errors and local file errors propagate to the controller.
 */
export async function fetchImage(
  fileName: string,
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ProxiedImage | null> {
  // Validate again because callers can invoke this function without URL mapping.
  if (!isSafeImageFileName(fileName)) {
    return null;
  }

  // Keep the backend request under /images/ and stop waiting after five seconds.
  const response = await fetchFn(
    new URL(`${IMAGE_ROUTE_PREFIX}${encodeURIComponent(fileName)}`, baseUrl),
    { signal: AbortSignal.timeout(5000) },
  );

  if (!response.ok) {
    return getFailsafeImage(`Backend image request failed with HTTP ${response.status}`);
  }

  // Check that the backend declares image content before reading its body.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    return getFailsafeImage('Backend response is not an image');
  }

  // Reject an oversized declared length before downloading the response body.
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_IMAGE_BYTES) {
    return getFailsafeImage('Declared image size exceeds the maximum allowed size');
  }

  // Also check the actual byte count because Content-Length can be missing or wrong.
  // This check happens after the entire body has been buffered.
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return getFailsafeImage('Downloaded image exceeds the maximum allowed size');
  }

  // Preserve the backend's cache policy, or allow caching for one hour by default.
  return {
    body,
    contentType,
    cacheControl:
      response.headers.get('cache-control') ?? 'public, max-age=3600',
  };
}
import { readFile } from 'node:fs/promises';
import path from 'node:path';

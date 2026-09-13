export interface PostWastPublishResult {
  id?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export type PostWastMediaType = "image" | "video";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function startsWithBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function containsBytes(
  bytes: Uint8Array,
  expected: number[],
  startAt = 0,
  endAt = bytes.length,
): boolean {
  const lastStart = Math.min(endAt, bytes.length - expected.length);
  for (let start = startAt; start <= lastStart; start += 1) {
    if (startsWithBytes(bytes.slice(start), expected)) return true;
  }
  return false;
}

/**
 * Performs a best-effort browser-side signature check before upload.
 * Host servers must repeat validation because browser checks are not a
 * security boundary.
 */
export async function hasValidPostWastFileSignature(
  file: File,
  mediaType: PostWastMediaType,
): Promise<boolean> {
  try {
    const bytes = new Uint8Array(
      await file.slice(0, mediaType === "image" ? 12 : 4096).arrayBuffer(),
    );

    if (mediaType === "image") {
      if (file.type === "image/jpeg") {
        return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
      }
      if (file.type === "image/png") {
        return startsWithBytes(
          bytes,
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        );
      }
      if (file.type === "image/webp") {
        return (
          startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
          startsWithBytes(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
        );
      }
      return false;
    }

    if (file.type === "video/webm") {
      return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    }

    if (file.type === "video/mp4" || file.type === "video/quicktime") {
      return containsBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4, 512);
    }

    return false;
  } catch {
    return false;
  }
}

export async function fetchPostWastResponse(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetcher(input, init);
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("PostWast publish request timed out.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Reads the host server response without requiring a JSON body.
 *
 * The publishing contract allows any successful 2xx response, so a host
 * project may return 204 or an empty 201 response. Invalid JSON on a
 * successful response is treated as an empty result rather than turning a
 * completed publish into a client-side failure.
 */
export async function readPostWastResponse(
  response: Response,
): Promise<PostWastPublishResult> {
  const body = await response.text();
  let parsed: unknown;

  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const serverMessage =
      isObject(parsed) && typeof parsed.error === "string"
        ? parsed.error
        : undefined;
    throw new Error(
      serverMessage ?? `PostWast publish failed with HTTP ${response.status}.`,
    );
  }

  return isObject(parsed) ? (parsed as PostWastPublishResult) : {};
}

/**
 * Only returns same-origin-style paths or explicit HTTP(S) URLs.
 * Protocol-relative URLs and javascript/data URLs are rejected.
 */
export function safePostWastUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;

  if (candidate.startsWith("//")) return null;
  if (candidate.startsWith("/")) {
    return candidate;
  }

  try {
    const base =
      typeof window !== "undefined"
        ? window.location.href
        : "http://localhost/";
    const url = new URL(candidate, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

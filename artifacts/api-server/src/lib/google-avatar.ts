const GOOGLE_AVATAR_MAX_BYTES = 450_000;

function isAllowedGoogleAvatarHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "googleusercontent.com" || normalized.endsWith(".googleusercontent.com");
}

function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function fetchGoogleAvatarDataUrl(
  pictureUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(pictureUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !isAllowedGoogleAvatarHost(url.hostname)) {
    return null;
  }
  url.searchParams.set("sz", "256");

  const response = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
  });
  if (!response.ok || response.status >= 300 || !response.body) {
    return null;
  }
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > GOOGLE_AVATAR_MAX_BYTES) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > GOOGLE_AVATAR_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const mime = detectImageMime(bytes);
  if (!mime) return null;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
import { randomUUID } from "node:crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path");
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}

async function signObjectUrl(
  fullPath: string,
  method: "GET" | "PUT",
  ttlSec: number,
): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL (${response.status})`);
  }
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Object storage did not return a signed URL");
  return body.signed_url;
}

export class InsightObjectStorage {
  private getPrivateDir(): string {
    const raw = process.env["PRIVATE_OBJECT_DIR"]?.trim();
    if (!raw) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return raw.replace(/\/+$/, "");
  }

  async createUploadTarget(): Promise<{ uploadURL: string; objectPath: string }> {
    const id = randomUUID();
    const relative = `uploads/${id}`;
    const uploadURL = await signObjectUrl(`${this.getPrivateDir()}/${relative}`, "PUT", 900);
    return { uploadURL, objectPath: `/objects/${relative}` };
  }

  async download(objectPath: string): Promise<Response> {
    if (!/^\/objects\/uploads\/[a-f0-9-]+$/i.test(objectPath)) {
      return new Response(null, { status: 404 });
    }
    const relative = objectPath.replace(/^\/objects\//, "");
    const signedURL = await signObjectUrl(`${this.getPrivateDir()}/${relative}`, "GET", 300);
    return fetch(signedURL, { signal: AbortSignal.timeout(30_000) });
  }

  async detectRasterContentType(objectPath: string): Promise<"image/png" | "image/jpeg" | "image/webp" | null> {
    const response = await this.download(objectPath);
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const bytes: number[] = [];
    try {
      while (bytes.length < 16) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes.push(...value.slice(0, 16 - bytes.length));
      }
    } finally {
      await reader.cancel();
    }
    const b = Uint8Array.from(bytes);
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
    return null;
  }
}
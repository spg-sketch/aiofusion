import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Response as ExpressResponse } from "express";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const EMAIL_LOGO_OBJECT_PATH = "email/aio-fusion-logo.png";

type ObjectLocation = {
  bucketName: string;
  objectName: string;
};

function parseObjectPath(rawPath: string): ObjectLocation {
  const parts = rawPath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS contains an invalid object-storage path");
  }
  return {
    bucketName: parts[0]!,
    objectName: parts.slice(1).join("/"),
  };
}

/**
 * Resolves the first public object-storage root. Public roots are provisioned
 * by Replit and can be different per environment, so this is intentionally
 * derived at runtime rather than committed as a bucket URL.
 */
export function getPublicEmailLogoLocation(): ObjectLocation {
  const publicRoot = process.env.PUBLIC_OBJECT_SEARCH_PATHS
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

  if (!publicRoot) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured for the email logo");
  }

  const { bucketName, objectName } = parseObjectPath(publicRoot);
  return {
    bucketName,
    objectName: `${objectName.replace(/\/+$/, "")}/${EMAIL_LOGO_OBJECT_PATH}`,
  };
}

async function getSignedObjectUrl(
  location: ObjectLocation,
  method: "GET" | "PUT",
): Promise<string> {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: location.bucketName,
        object_name: location.objectName,
        method,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not create a ${method} URL for the email logo (${response.status})`);
  }

  const body = await response.json() as { signed_url?: unknown };
  if (typeof body.signed_url !== "string" || !body.signed_url) {
    throw new Error("Object storage returned no read URL for the email logo");
  }
  return body.signed_url;
}

async function ensurePublicEmailLogo(location: ObjectLocation): Promise<void> {
  // The upload script normally seeds this object before deployment. This
  // one-time self-heal covers an environment where the object-store bucket was
  // created after the code was already published.
  const sourcePath = path.resolve(
    process.cwd(),
    "artifacts/aio-fusion/public/images/logo-color.png",
  );
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Email logo is absent from object storage and source is missing: ${sourcePath}`);
  }

  const uploadResponse = await fetch(await getSignedObjectUrl(location, "PUT"), {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: fs.readFileSync(sourcePath),
    signal: AbortSignal.timeout(30_000),
  });
  if (!uploadResponse.ok) {
    throw new Error(`Could not seed the email logo in object storage (${uploadResponse.status})`);
  }
}

/**
 * Streams the immutable public logo from app storage. The browser-visible
 * route is stable across web deploys; the image bytes are not.
 */
export async function servePublicEmailLogo(res: ExpressResponse): Promise<void> {
  const location = getPublicEmailLogoLocation();
  let objectResponse = await fetch(await getSignedObjectUrl(location, "GET"));
  if (objectResponse.status === 404) {
    await ensurePublicEmailLogo(location);
    objectResponse = await fetch(await getSignedObjectUrl(location, "GET"));
  }
  if (!objectResponse.ok || !objectResponse.body) {
    throw new Error(`Could not read the email logo from object storage (${objectResponse.status})`);
  }

  res.status(200);
  res.setHeader("Content-Type", objectResponse.headers.get("content-type") ?? "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  const length = objectResponse.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);

  Readable.fromWeb(objectResponse.body as ReadableStream<Uint8Array>).pipe(res);
}
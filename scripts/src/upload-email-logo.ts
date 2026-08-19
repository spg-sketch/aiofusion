import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { objectStorageClient } from "./lib/object-storage";

const EMAIL_LOGO_OBJECT_PATH = "email/aio-fusion-logo.png";
const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../artifacts/aio-fusion/public/images/logo-color.png",
);

function getPublicLogoLocation(): { bucketName: string; objectName: string } {
  const publicRoot = process.env.PUBLIC_OBJECT_SEARCH_PATHS
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  if (!publicRoot) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is required to upload the email logo");
  }

  const parts = publicRoot.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS contains an invalid object-storage path");
  }

  return {
    bucketName: parts[0]!,
    objectName: `${parts.slice(1).join("/").replace(/\/+$/, "")}/${EMAIL_LOGO_OBJECT_PATH}`,
  };
}

async function uploadEmailLogo(): Promise<void> {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source email logo is missing: ${sourcePath}`);
  }

  const { bucketName, objectName } = getPublicLogoLocation();
  await objectStorageClient.bucket(bucketName).file(objectName).save(
    fs.readFileSync(sourcePath),
    {
      resumable: false,
      metadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
      },
    },
  );

  console.log("Uploaded the durable email logo to public object storage.");
}

uploadEmailLogo().catch((error) => {
  console.error("Could not upload the durable email logo:", error);
  process.exit(1);
});
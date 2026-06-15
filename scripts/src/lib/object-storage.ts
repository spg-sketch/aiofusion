import { Storage } from "@google-cloud/storage";

// Replit's object storage is GCS-backed and authenticated through the local
// sidecar (no static credentials, no hardcoded keys). This is the same auth
// setup the api-server uses for object storage, kept here so backup jobs can
// write durable dumps to the bucket from a standalone script / scheduled job.
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

// The private object dir looks like `/<bucket>/.private`. We keep backups under
// a `db-backups/` prefix inside that private area so they are never publicly
// served and survive container restarts / redeploys.
export function getBackupLocation(): { bucketName: string; prefix: string } {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Provision object storage (Object Storage tool) " +
        "before running backups so dumps are stored durably.",
    );
  }
  // privateDir is "/<bucket>/<maybe/nested/dir>"
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const dir = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const prefix = `${dir ? `${dir}/` : ""}db-backups`;
  return { bucketName, prefix };
}

export function getBackupBucket() {
  const { bucketName } = getBackupLocation();
  return objectStorageClient.bucket(bucketName);
}

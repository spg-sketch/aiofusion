import { Storage, type Bucket } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

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
export type BackupEnvironment = "staging" | "production";

export interface BackupDestination {
  enabled: boolean;
  environment: BackupEnvironment;
  bucketName?: string;
  prefix?: string;
  identifier: string;
}

export function getBackupLocation(
  env: NodeJS.ProcessEnv = process.env,
): BackupDestination {
  const environment = env.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (environment !== "staging" && environment !== "production") {
    throw new Error(
      "DEPLOYMENT_ENV must explicitly be staging or production for backup jobs.",
    );
  }

  const enabledValue = env.BACKUP_ENABLED?.trim().toLowerCase();
  if (enabledValue !== "true" && enabledValue !== "false") {
    throw new Error(
      "BACKUP_ENABLED must explicitly be true or false for backup jobs.",
    );
  }
  if (enabledValue === "false") {
    return {
      enabled: false,
      environment,
      identifier: `${environment}:disabled`,
    };
  }

  const bucketName = env.BACKUP_BUCKET_ID?.trim();
  const prefix = env.BACKUP_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  if (!bucketName || !prefix) {
    throw new Error(
      "Enabled backup jobs require explicit BACKUP_BUCKET_ID and BACKUP_PREFIX.",
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(bucketName)) {
    throw new Error("BACKUP_BUCKET_ID is not a valid bucket identifier.");
  }
  if (prefix.includes("..")) {
    throw new Error("BACKUP_PREFIX must not contain '..'.");
  }

  return {
    enabled: true,
    environment,
    bucketName,
    prefix,
    identifier: `${environment}:gs://${bucketName}/${prefix}`,
  };
}

export function getBackupBucket(destination = getBackupLocation()) {
  if (!destination.enabled || !destination.bucketName) {
    throw new Error(`Backup destination is not enabled (${destination.identifier}).`);
  }
  const { bucketName } = destination;
  return objectStorageClient.bucket(bucketName);
}

export async function verifyBackupDestination(
  destination: BackupDestination,
  bucket: Pick<Bucket, "file"> = getBackupBucket(destination),
): Promise<void> {
  if (!destination.enabled || !destination.prefix) {
    throw new Error(`Backup destination is not enabled (${destination.identifier}).`);
  }

  const probe = bucket.file(
    `${destination.prefix}/.capability-probes/${randomUUID()}.txt`,
  );
  const expected = `aio-fusion-backup-probe:${destination.environment}`;
  let created = false;

  try {
    await probe.save(expected, { contentType: "text/plain" });
    created = true;
    const [downloaded] = await probe.download();
    if (downloaded.toString("utf8") !== expected) {
      throw new Error("probe read returned unexpected content");
    }
    await probe.delete();
    created = false;
    const [stillExists] = await probe.exists();
    if (stillExists) {
      throw new Error("probe object still exists after delete");
    }
  } catch (error) {
    throw new Error(
      `Backup destination capability probe failed for ${destination.identifier}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    if (created) {
      await probe.delete({ ignoreNotFound: true }).catch(() => undefined);
    }
  }
}

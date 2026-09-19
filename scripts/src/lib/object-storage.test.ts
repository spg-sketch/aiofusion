import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBackupLocation } from "./object-storage.js";
import { verifyBackupDestination } from "./object-storage.js";

describe("backup destination configuration", () => {
  it("requires an explicit staging or production environment", () => {
    assert.throws(
      () => getBackupLocation({ BACKUP_ENABLED: "false" }),
      /DEPLOYMENT_ENV/,
    );
  });

  it("supports intentionally disabling staging", () => {
    assert.deepEqual(
      getBackupLocation({
        DEPLOYMENT_ENV: "staging",
        BACKUP_ENABLED: "false",
      }),
      {
        enabled: false,
        environment: "staging",
        identifier: "staging:disabled",
      },
    );
  });

  it("requires an explicit bucket and prefix for enabled jobs", () => {
    assert.throws(
      () =>
        getBackupLocation({
          DEPLOYMENT_ENV: "production",
          BACKUP_ENABLED: "true",
        }),
      /BACKUP_BUCKET_ID and BACKUP_PREFIX/,
    );
  });

  it("identifies enabled staging and production destinations", () => {
    for (const environment of ["staging", "production"] as const) {
      const destination = getBackupLocation({
        DEPLOYMENT_ENV: environment,
        BACKUP_ENABLED: "true",
        BACKUP_BUCKET_ID: `aio-fusion-${environment}`,
        BACKUP_PREFIX: "/.private/db-backups/",
      });
      assert.equal(destination.environment, environment);
      assert.equal(
        destination.identifier,
        `${environment}:gs://aio-fusion-${environment}/.private/db-backups`,
      );
    }
  });

  it("creates, reads, deletes, and confirms removal of a probe object", async () => {
    const calls: string[] = [];
    let value = Buffer.alloc(0);
    let exists = false;
    const file = {
      async save(content: string) {
        calls.push("create");
        value = Buffer.from(content);
        exists = true;
      },
      async download() {
        calls.push("read");
        return [value];
      },
      async delete() {
        calls.push("delete");
        exists = false;
        return [{}];
      },
      async exists() {
        calls.push("confirm-delete");
        return [exists];
      },
    };
    const bucket = {
      file(name: string) {
        assert.match(name, /^\.private\/db-backups\/\.capability-probes\/.+\.txt$/);
        return file;
      },
    };

    await verifyBackupDestination(
      {
        enabled: true,
        environment: "staging",
        bucketName: "aio-fusion-staging",
        prefix: ".private/db-backups",
        identifier:
          "staging:gs://aio-fusion-staging/.private/db-backups",
      },
      bucket as never,
    );

    assert.deepEqual(calls, ["create", "read", "delete", "confirm-delete"]);
  });
});
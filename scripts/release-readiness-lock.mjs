import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { hostname } from "node:os";

async function processStart(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch {
    return null;
  }
}

async function ownerIsAlive(owner) {
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !owner.token || owner.host !== hostname()) {
    throw new Error("Release check lock has an unknown owner. Inspect it before removing it; no approval was granted.");
  }
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code !== "EPERM") throw error;
  }
  const currentStart = await processStart(owner.pid);
  return !owner.processStart || !currentStart || owner.processStart === currentStart;
}

/**
 * One repository-wide lock is shared by readiness and explicit fresh checks.
 * Hard-linking a complete record publishes ownership atomically: contenders
 * never see an empty/partially written owner file. Dead owners fail closed,
 * rather than guessing that their detached test processes have also stopped.
 */
export async function acquireReleaseReadinessLock({
  lockPath,
  source,
  environment,
  onWaiting = () => {},
  timeoutMs = 2 * 60 * 60_000,
  intervalMs = 250,
  linkFile = link,
  isOwnerAlive = ownerIsAlive,
} = {}) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner = {
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    processStart: await processStart(process.pid),
    environment,
    gitTree: source.gitTree,
  };
  const temporaryPath = `${lockPath}.${owner.token}.tmp`;
  const observedOwners = new Map();
  let contended = false;
  const deadline = Date.now() + timeoutMs;
  await writeFile(temporaryPath, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  try {
    while (true) {
      try {
        await linkFile(temporaryPath, lockPath);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        // Preserve contention even if the owner releases between this failed
        // link and our read. Its durable gate evidence carries the outcome.
        contended = true;
      }
      let existing;
      try {
        existing = JSON.parse(await readFile(lockPath, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw new Error("Release check lock could not be read. Inspect it before retrying; no approval was granted.", { cause: error });
      }
      if (!await isOwnerAlive(existing)) {
        // A normally finishing process can release and exit after our read.
        // Recheck ownership before treating that harmless handoff as a crash.
        try {
          const current = JSON.parse(await readFile(lockPath, "utf8"));
          if (current.token !== existing.token) continue;
        } catch (error) {
          if (error.code === "ENOENT") continue;
          throw error;
        }
        throw new Error("A release check was interrupted. Confirm its workers have stopped, then remove release-evidence/readiness.lock and retry.");
      }
      if (!observedOwners.has(existing.token)) {
        observedOwners.set(existing.token, existing);
        onWaiting(existing);
      }
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for the running release check. No approval was granted; inspect its progress before retrying.");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } finally {
    await unlink(temporaryPath);
  }
  return {
    contended,
    observedOwners: [...observedOwners.values()],
    async release() {
      const current = JSON.parse(await readFile(lockPath, "utf8"));
      if (current.token !== owner.token) {
        throw new Error("Release check ownership changed unexpectedly; no approval was granted.");
      }
      await unlink(lockPath);
    },
  };
}
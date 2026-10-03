import net from "node:net";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Test-only process preload. Never imported by application code.
const file = process.env.AIO_SECURITY_CAPTURE_FILE;
if (!file?.startsWith("/tmp/aio-security-mail-") ||
    process.env.RESEND_API_KEY !== "aio-features-synthetic-resend-key") {
  throw new Error("Security audit capture requires its temporary fixture and synthetic key.");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.resend.com" && url.pathname.startsWith("/emails")) {
    const body = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "";
    appendFileSync(file, JSON.stringify({ destination: "captured-email", message: JSON.parse(body) }) + "\n", { mode: 0o600 });
    return Response.json({ id: `security_${randomUUID()}` });
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Security audit blocked outbound HTTP.");
  }
  return originalFetch(input, init);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node socket options may be normalised into an [options, callback] array.
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const host = typeof first === "object" && first !== null ? first.host ?? first.hostname :
    typeof normalized[1] === "string" ? normalized[1] : "localhost";
  if (host && !["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Security audit blocked outbound socket.");
  }
  return connect.apply(this, args);
};
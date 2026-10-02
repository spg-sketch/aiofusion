import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const originalFetch = globalThis.fetch;
const captureFile = process.env.AIO_FEATURE_EMAIL_CAPTURE_FILE;
const captureEnabled = process.env.AIO_FEATURE_EMAIL_CAPTURE === "1";
const syntheticKey = "aio-features-synthetic-resend-key";

if (captureEnabled) {
  if (!captureFile?.startsWith("/tmp/aio-feature-mail-")
      || process.env.RESEND_API_KEY !== syntheticKey) {
    throw new Error("Feature email capture requires a private temporary file and the synthetic Resend key.");
  }

  globalThis.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl);
    if (url.hostname !== "api.resend.com" || !url.pathname.startsWith("/emails")) {
      return originalFetch(input, init);
    }

    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() !== "POST") {
      return Response.json({ error: { message: "Feature fixture only accepts email send requests." } }, { status: 405 });
    }

    const body = init?.body
      ? typeof init.body === "string" ? init.body : Buffer.from(init.body).toString("utf8")
      : input instanceof Request ? await input.clone().text() : "";
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      return Response.json({ error: { message: "Email send payload was not valid JSON." } }, { status: 400 });
    }
    appendFileSync(captureFile, `${JSON.stringify({ message, capturedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    return Response.json({ id: `feature_${randomUUID()}` }, { status: 200 });
  };
}
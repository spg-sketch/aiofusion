import { createServer, type Server } from "node:http";
import { Agent, fetch as undiciFetch } from "undici";
import { ipKeyGenerator } from "express-rate-limit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let origin: string;
const agent = new Agent();

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/page" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><title>Synthetic page</title><body>Compatibility fixture</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await agent.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("updated runtime dependency compatibility", () => {
  it("reads an HTML response with the application's custom-dispatcher API", async () => {
    const response = await undiciFetch(`${origin}/page`, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Compatibility fixture");
  });

  it("keeps redirect handling manual so each destination can be validated", async () => {
    const response = await undiciFetch(`${origin}/redirect`, { dispatcher: agent, redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/page");
    expect(response.url).toBe(`${origin}/redirect`);
    await response.body?.cancel();
  });

  it("retains readable response streams for bounded body readers", async () => {
    const response = await undiciFetch(`${origin}/page`, { dispatcher: agent });
    const reader = response.body!.getReader();
    let text = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    expect(text).toContain("Synthetic page");
    reader.releaseLock();
  });

  it("keeps distinct IPv4 clients separate", () => {
    expect(ipKeyGenerator("192.0.2.1")).toBe("192.0.2.1");
    expect(ipKeyGenerator("192.0.2.1")).not.toBe(ipKeyGenerator("192.0.2.2"));
  });

  it("preserves IPv6 subnet grouping rather than allowing address rotation", () => {
    expect(ipKeyGenerator("2001:db8:abcd:1200::1", 56))
      .toBe(ipKeyGenerator("2001:db8:abcd:12ff::2", 56));
    expect(ipKeyGenerator("2001:db8:abcd:1200::1", 56))
      .not.toBe(ipKeyGenerator("2001:db8:abcd:1300::1", 56));
  });
});
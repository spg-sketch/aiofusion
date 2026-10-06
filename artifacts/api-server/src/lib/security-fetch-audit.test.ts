import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture socket selection, not a real internal/third-party request.
const state = vi.hoisted(() => ({
  ipv4: [] as string[], ipv6: [] as string[], pins: [] as string[],
  fetch: vi.fn(), connector: vi.fn(),
}));
vi.mock("dns/promises", () => ({
  resolve4: async () => state.ipv4, resolve6: async () => state.ipv6,
}));
vi.mock("undici", () => ({
  buildConnector: () => state.connector,
  Agent: class {
    constructor(options: { connect: (options: unknown, callback: () => void) => void }) {
      options.connect({ hostname: "probe.invalid" }, () => {});
    }
    close = async () => {};
  },
  fetch: state.fetch,
}));
import { fetchSiteContent, fetchGeoAuditContext } from "./safe-fetch";

beforeEach(() => {
  state.ipv4 = []; state.ipv6 = []; state.pins = [];
  state.connector.mockImplementation((options: { hostname: string }) => state.pins.push(options.hostname));
  state.fetch.mockReset();
  state.fetch.mockImplementation(async () => new Response("<html><body>fixture</body></html>"));
});

describe("security audit network boundaries (no outbound requests)", () => {
  it("rejects ordinary private IPv4 and IPv6 before selecting a socket", async () => {
    for (const address of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      state.ipv6 = [address];
      await expect(fetchSiteContent("https://probe.invalid")).rejects.toThrow("private IP");
    }
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("records confirmed hexadecimal IPv4-mapped loopback bypass without making a request", async () => {
    state.ipv6 = ["::ffff:7f00:1"];
    await expect(fetchSiteContent("https://probe.invalid")).resolves.toMatchObject({ text: "fixture" });
    expect(state.pins).toEqual(["::ffff:7f00:1"]);
    expect(state.fetch).toHaveBeenCalledOnce();
    // Characterisation of an open finding, NOT a test that endorses safety.
    // A separately approved fix should change this to expect rejection.
  });

  it("revalidates redirect destinations and rejects a private next hop", async () => {
    state.ipv4 = ["93.184.216.34"];
    state.fetch.mockImplementationOnce(async () => new Response(null, {
      status: 302, headers: { location: "http://127.0.0.1/" },
    }));
    await expect(fetchSiteContent("https://probe.invalid")).rejects.toThrow("Private IP");
    expect(state.fetch).toHaveBeenCalledOnce();
  });

  it("streams robots/sitemap resources without using unbounded Response.text()", async () => {
    state.ipv4 = ["93.184.216.34"];
    const robots = new Response("Sitemap: https://probe.invalid/sitemap.xml");
    const text = vi.spyOn(robots, "text");
    state.fetch.mockImplementationOnce(async () => new Response("<html><body>A readable public homepage fixture for audit testing.</body></html>", { headers: { "content-type": "text/html" } }))
      .mockImplementationOnce(async () => robots)
      .mockImplementationOnce(async () => new Response("<urlset></urlset>"));
    await fetchGeoAuditContext("https://probe.invalid");
    expect(text).not.toHaveBeenCalled();
  });
});
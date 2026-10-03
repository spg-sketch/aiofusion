import { describe, expect, it } from "vitest";
import { getSafeReturnTo } from "./safe-return-to";

describe("post-login return paths", () => {
  it.each([
    "/",
    "/dashboard",
    "/aio-fusion/library?project=42#saved",
    "/library?next=https%3A%2F%2Fexample.invalid",
    "/library?title=hello%20world",
    "/articles/a%2Fb",
    "/articles/../library",
  ])("preserves a valid internal destination: %s", (value) => {
    expect(getSafeReturnTo(value)).toBe(value);
    expect(new URL(getSafeReturnTo(value), "https://app.invalid").origin)
      .toBe("https://app.invalid");
  });

  it.each([
    undefined,
    null,
    42,
    ["/dashboard"],
    {},
    "",
    "dashboard",
    "https://example.invalid",
    "//example.invalid",
    "///example.invalid",
    "/\\example.invalid",
    "/\\\\example.invalid",
    "\\/example.invalid",
    "/\t/example.invalid",
    "/\n/example.invalid",
    "/\r/example.invalid",
    "/\u0000/example.invalid",
    "/\u007f/example.invalid",
    " /dashboard",
  ])("falls back safely for an invalid destination: %j", (value) => {
    expect(getSafeReturnTo(value)).toBe("/");
  });
});
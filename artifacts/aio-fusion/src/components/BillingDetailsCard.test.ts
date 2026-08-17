import { describe, it, expect } from "vitest";
import { composeAddress, splitAddress } from "./BillingDetailsCard";

describe("billing address compose/split", () => {
  it("round-trips a full six-field address", () => {
    const a = { company: "Acme Ltd", line1: "1 High Street", line2: "Suite 4", city: "London", postcode: "SW1A 1AA", country: "United Kingdom" };
    expect(splitAddress(composeAddress(a))).toEqual(a);
  });

  it("round-trips without the optional line 2 and country", () => {
    const a = { company: "Acme Ltd", line1: "1 High Street", line2: "", city: "London", postcode: "SW1A 1AA", country: "" };
    expect(splitAddress(composeAddress(a))).toEqual(a);
  });

  it("maps a legacy four-line free-text address into sensible fields", () => {
    const legacy = "Acme Ltd\n1 High Street\nLondon\nSW1A 1AA";
    expect(splitAddress(legacy)).toEqual({
      company: "Acme Ltd",
      line1: "1 High Street",
      line2: "",
      city: "London",
      postcode: "SW1A 1AA",
      country: "",
    });
  });

  it("handles empty input and skips blank lines when composing", () => {
    expect(splitAddress("")).toEqual({ company: "", line1: "", line2: "", city: "", postcode: "", country: "" });
    expect(composeAddress({ company: " Acme ", line1: "", line2: "", city: "London", postcode: "", country: "" })).toBe("Acme\nLondon");
  });
});

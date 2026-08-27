import { describe, expect, it } from "vitest";
import { getSessionIdentityLabels } from "./PlatformHomePage";

describe("platform home account identity labels", () => {
  it("keeps the owner, company and access level separate", () => {
    expect(
      getSessionIdentityLabels({
        username: "bluhalo",
        role: "agency",
        membershipRole: "owner",
        userName: "Spencer Gallagher",
        userEmail: "spg@bluhalo.com",
        companyName: "Bluhalo IO Ltd",
      }),
    ).toEqual({
      signedInAs: "Spencer Gallagher",
      companyName: "Bluhalo IO Ltd",
      access: "Owner",
    });
  });

  it("uses email when a content member does not have a name", () => {
    expect(
      getSessionIdentityLabels({
        username: "bluhalo",
        role: "agency",
        membershipRole: "content",
        userName: null,
        userEmail: "abbe@example.test",
        companyName: "Bluhalo IO Ltd",
      }),
    ).toEqual({
      signedInAs: "abbe@example.test",
      companyName: "Bluhalo IO Ltd",
      access: "Content Team Member",
    });
  });
});
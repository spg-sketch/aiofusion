import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LegalDocumentPage from "./LegalDocumentPage";
import { legalDocuments, type LegalDocumentKind } from "./legalDocuments";
afterEach(cleanup);
describe("legal review documents", () => {
  for (const kind of Object.keys(legalDocuments) as LegalDocumentKind[]) {
    it(`renders ${kind} with status, substantive sections and working document destinations`, () => {
      render(<LegalDocumentPage documentKind={kind} onLogin={() => {}} onBack={() => {}} onNavigate={() => {}} />);
      expect(screen.getByRole("complementary", { name: "Legal review status" })).toBeTruthy();
      expect(screen.getByText("Awaiting legal and business review")).toBeTruthy();
      for (const section of legalDocuments[kind].sections) expect(screen.getByRole("heading", { name: section.title })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Journalist privacy rights" })).toHaveAttribute("href", "/journalist-privacy");
      expect(screen.getAllByRole("button", { name: "Cookie preferences" }).length).toBeGreaterThan(0);
    });
  }
});

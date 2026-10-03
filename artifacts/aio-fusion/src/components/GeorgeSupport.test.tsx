import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GeorgeSupport } from "./GeorgeSupport";

const { search, getGuide } = vi.hoisted(() => ({ search: vi.fn(), getGuide: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  searchGeorgeSupport: search,
  useGetPublishedHowto: getGuide,
  getGetPublishedHowtoQueryKey: (id: string) => ["/api/howto", id],
}));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  getGuide.mockReturnValue({
    data: { id: "guide-one", title: "Measurement guide", description: "Detailed instructions", body: [
      { type: "paragraph", runs: [{ text: "Full current guide instructions" }] },
    ] },
    isLoading: false, isError: false, refetch: vi.fn(),
  });
});
afterEach(cleanup);

function ask(question = "measurement") {
  render(<GeorgeSupport open onClose={() => {}} anonMode />);
  const input = screen.getByPlaceholderText("Type your question…");
  fireEvent.change(input, { target: { value: question } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("shows a guide excerpt and opens the latest complete published guide without leaving support", async () => {
  search.mockResolvedValue({ results: [{
    id: "guide:guide-one", source: "guide", guideId: "guide-one",
    category: "Guidance Library · Guide", question: "Measurement guide", answer: "Relevant measurement excerpt",
  }] });
  ask();
  expect(await screen.findByText("Relevant measurement excerpt")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Open full guide" }));
  expect(screen.getByText("Full current guide instructions")).toBeVisible();
  expect(getGuide).toHaveBeenCalledWith("guide-one", expect.objectContaining({ query: expect.objectContaining({ refetchOnMount: "always" }) }));
  fireEvent.click(screen.getByRole("button", { name: "Back to George's results" }));
  expect(screen.getByText("Relevant measurement excerpt")).toBeVisible();
});

it("keeps FAQs and guides together as labelled choices", async () => {
  search.mockResolvedValue({ results: [
    { id: "faq:1", source: "faq", category: "General", question: "FAQ answer", answer: "FAQ instructions" },
    { id: "guide:one", source: "guide", guideId: "one", category: "Guidance Library · Guide", question: "Guide answer", answer: "Guide excerpt" },
  ] });
  ask();
  fireEvent.click(await screen.findByRole("button", { name: /FAQ answer/ }));
  expect(screen.getByText("FAQ instructions")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open full guide" })).toBeNull();
});

it("distinguishes a search failure from no matches and lets the user retry", async () => {
  search.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce({ results: [] });
  ask();
  expect(await screen.findByRole("alert")).toHaveTextContent("Support search could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  expect(await screen.findByText(/don't have an answer for that/)).toBeVisible();
});

it("handles an unpublished guide after it was returned by search", async () => {
  search.mockResolvedValue({ results: [{
    id: "guide:one", source: "guide", guideId: "one", category: "Guide", question: "Guide", answer: "Excerpt",
  }] });
  getGuide.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: { status: 404 }, refetch: vi.fn() });
  ask();
  fireEvent.click(await screen.findByRole("button", { name: "Open full guide" }));
  expect(screen.getByRole("alert")).toHaveTextContent("no longer published or has been removed");
  expect(screen.queryByText("Full current guide instructions")).toBeNull();
});
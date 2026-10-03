// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const detail = vi.fn();
vi.mock("@workspace/api-client-react", () => ({
  useListPublishedHowto: (...a: unknown[]) => list(...a),
  getListPublishedHowtoQueryKey: () => ["/api/howto"],
  useGetPublishedHowto: (...a: unknown[]) => detail(...a),
  getGetPublishedHowtoQueryKey: (id: string) => [`/api/howto/${id}`],
}));
import { GuidancePage } from "./GuidancePage";

const entries = [
  { id: "a-guide", title: "Alpha guide", description: "d1", type: "Guide", readTime: "3 min", displayOrder: 1, status: "published", createdAt: "", updatedAt: "", publishedAt: "", body: [
    { type: "paragraph", runs: [{ text: "See " }, { text: "docs", href: "https://example.com", bold: true }, { text: " and " }, { text: "bad", href: "http://insecure.test" }] },
    { type: "video", url: "https://video.example/x", caption: "Watch" },
  ] },
  { id: "b-vid", title: "Beta video", description: "d2", type: "Video", readTime: "2 min", displayOrder: 2, status: "published", createdAt: "", updatedAt: "", publishedAt: "", body: [] },
];
const ok = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });

describe("GuidancePage", () => {
  beforeEach(() => { list.mockReset(); detail.mockReset(); });
  afterEach(cleanup);

  it("shows loading, error with retry, and empty states distinctly", () => {
    list.mockReturnValue({ ...ok(undefined), isLoading: true });
    const { rerender } = render(<GuidancePage onBack={() => {}} />);
    expect(screen.getByTestId("library-loading")).toBeTruthy();
    const refetch = vi.fn();
    list.mockReturnValue({ ...ok(undefined), isError: true, error: new Error("boom"), refetch });
    rerender(<GuidancePage onBack={() => {}} />);
    fireEvent.click(screen.getByTestId("button-retry-library"));
    expect(refetch).toHaveBeenCalled();
    list.mockReturnValue(ok([]));
    rerender(<GuidancePage onBack={() => {}} />);
    expect(screen.getByTestId("library-empty")).toBeTruthy();
  });

  it("lists cards, filters by type, and hides manage unless allowed", () => {
    list.mockReturnValue(ok(entries));
    const { rerender } = render(<GuidancePage onBack={() => {}} />);
    expect(screen.queryByTestId("button-manage-library")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-Video"));
    expect(screen.queryByTestId("card-howto-a-guide")).toBeNull();
    expect(screen.getByTestId("card-howto-b-vid")).toBeTruthy();
    const onManage = vi.fn();
    rerender(<GuidancePage onBack={() => {}} canManage onManage={onManage} />);
    fireEvent.click(screen.getByTestId("button-manage-library"));
    expect(onManage).toHaveBeenCalled();
  });

  it("renders detail with safe links only, and a distinct missing state", () => {
    list.mockReturnValue(ok(entries));
    detail.mockReturnValue(ok(entries[0]));
    const { unmount } = render(<GuidancePage onBack={() => {}} />);
    fireEvent.click(screen.getByTestId("card-howto-a-guide"));
    expect(screen.getByTestId("detail-title").textContent).toBe("Alpha guide");
    expect(screen.getByText("docs").closest("a")?.getAttribute("href")).toBe("https://example.com");
    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("Watch").closest("a")?.getAttribute("rel")).toContain("noopener");
    unmount();
    detail.mockReturnValue({ ...ok(undefined), isError: true, error: { status: 404 } });
    render(<GuidancePage onBack={() => {}} />);
    fireEvent.click(screen.getByTestId("card-howto-a-guide"));
    expect(screen.getByTestId("detail-missing")).toBeTruthy();
  });

  it("uses the first resolved saved image, preserves its description, and keeps failure layout stable", () => {
    const imageGuide = { ...entries[0], body: [
      { type: "image", mediaId: "unresolved", altText: "Not resolved" },
      { type: "image", mediaId: "first", url: "https://example.com/first.jpg", altText: "Project set-up screen", caption: "Original caption" },
      { type: "image", mediaId: "second", url: "https://example.com/second.jpg", altText: "Second screen" },
    ] };
    list.mockReturnValue(ok([imageGuide]));
    detail.mockReturnValue(ok(imageGuide));
    render(<GuidancePage onBack={() => {}} />);
    const preview = screen.getByRole("img", { name: "Project set-up screen" });
    expect(preview).toHaveAttribute("src", "https://example.com/first.jpg");
    expect(screen.queryByRole("img", { name: "Second screen" })).toBeNull();
    expect(preview).toHaveClass("opacity-0");
    const frame = preview.parentElement;
    expect(frame).toHaveClass("aspect-[16/10]");
    fireEvent.load(preview);
    expect(preview).toHaveClass("opacity-100");
    fireEvent.error(preview);
    expect(screen.queryByRole("img", { name: "Project set-up screen" })).toBeNull();
    expect(frame).toHaveClass("aspect-[16/10]");
    fireEvent.click(screen.getByRole("button", { name: /Alpha guide.*Read guide/ }));
    expect(screen.getByRole("img", { name: "Project set-up screen" })).toHaveAttribute("src", "https://example.com/first.jpg");
    expect(screen.getByRole("img", { name: "Second screen" })).toBeTruthy();
    expect(screen.getByText("Original caption")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-back-guidance"));
    expect(screen.getByTestId("card-howto-a-guide")).toBeTruthy();
  });

  it("provides no-image fallbacks, all three opening actions, and intentional single and collection layouts", () => {
    const article = { ...entries[0], id: "article", type: "Article", title: "An article" };
    list.mockReturnValue(ok([...entries, article]));
    detail.mockReturnValue(ok(entries[1]));
    const { rerender } = render(<GuidancePage onBack={() => {}} />);
    expect(screen.getByTestId("guidance-collection")).toHaveClass("lg:grid-cols-3");
    expect(screen.queryByRole("img", { name: /screen/ })).toBeNull();
    expect(screen.getByRole("button", { name: /An article.*Read article/ })).toBeTruthy();
    fireEvent.click(screen.getByTestId("filter-Article"));
    expect(screen.getByTestId("guidance-collection")).not.toHaveClass("sm:grid-cols-2");
    expect(screen.getByTestId("card-howto-article")).toHaveClass("md:grid-cols-2");
    fireEvent.click(screen.getByTestId("filter-Video"));
    fireEvent.click(screen.getByRole("button", { name: /Beta video.*Watch video/ }));
    fireEvent.click(screen.getByTestId("button-back-guidance"));
    expect(screen.getByTestId("filter-Video")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("card-howto-a-guide")).toBeNull();
    list.mockReturnValue(ok([entries[0]]));
    rerender(<GuidancePage onBack={() => {}} />);
    expect(screen.getByTestId("library-empty")).toHaveTextContent("No video entries");
  });

  it("returns to platform home and retries a detail failure", () => {
    list.mockReturnValue(ok(entries));
    const retry = vi.fn();
    detail.mockReturnValue({ ...ok(undefined), isError: true, error: new Error("Offline"), refetch: retry });
    const onBack = vi.fn();
    render(<GuidancePage onBack={onBack} />);
    fireEvent.click(screen.getByTestId("button-back"));
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("card-howto-a-guide"));
    expect(screen.getByTestId("detail-error")).toHaveTextContent("Offline");
    fireEvent.click(screen.getByTestId("button-retry-detail"));
    expect(retry).toHaveBeenCalledOnce();
  });
});

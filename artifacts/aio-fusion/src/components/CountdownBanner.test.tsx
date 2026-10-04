// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CountdownBanner from "./CountdownBanner";

describe("shared AI countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts down even when the caller does not supply a start timestamp", async () => {
    render(<CountdownBanner active durationSeconds={60} />);
    expect(screen.getAllByText("1:00")).toHaveLength(2);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getAllByText("0:55")).toHaveLength(2);
  });

  it("uses the original start when remounted, then keeps showing overtime", async () => {
    const startedAt = Date.now();
    const view = render(<CountdownBanner active durationSeconds={60} startedAt={startedAt} />);
    await act(async () => vi.advanceTimersByTimeAsync(45_000));
    view.unmount();
    render(<CountdownBanner active durationSeconds={60} startedAt={startedAt} />);
    expect(screen.getAllByText("0:15")).toHaveLength(2);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByText("Still working - the estimate has passed")).toBeTruthy();
    expect(screen.getByText("+0:05")).toBeTruthy();
  });

  it("catches up immediately after time passes in the background", () => {
    const startedAt = Date.now();
    render(<CountdownBanner active durationSeconds={60} startedAt={startedAt} />);
    vi.setSystemTime(startedAt + 30_000);
    fireEvent(window, new Event("focus"));
    expect(screen.getAllByText("0:30")).toHaveLength(2);
    vi.setSystemTime(startedAt + 75_000);
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByText("Still working - the estimate has passed")).toBeTruthy();
  });

  it("hides after completion and starts a fresh clock for the next run", async () => {
    const view = render(<CountdownBanner active durationSeconds={60} />);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    view.rerender(<CountdownBanner active={false} durationSeconds={60} />);
    expect(view.container.textContent).toBe("");
    view.rerender(<CountdownBanner active durationSeconds={60} />);
    expect(screen.getAllByText("1:00")).toHaveLength(2);
  });
});
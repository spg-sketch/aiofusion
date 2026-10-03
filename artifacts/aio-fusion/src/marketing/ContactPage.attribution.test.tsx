import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookDemoForm, EnquiryForm } from "./ContactPage";
import { heardAboutOptions } from "./HeardAboutField";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each([
  { Form: BookDemoForm, endpoint: "book-demo", submit: "Request a Demo" },
  { Form: EnquiryForm, endpoint: "enquiry", submit: "Send Message" },
])("$endpoint attribution", ({ Form, endpoint, submit }) => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Example Person" } });
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "example@example.invalid" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Ltd" } });
    if (endpoint === "book-demo") {
      fireEvent.change(screen.getByLabelText(/What are you hoping/), { target: { value: "A demo" } });
    } else {
      fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: "An enquiry" } });
      fireEvent.change(screen.getByLabelText(/Message/), { target: { value: "Please get in touch" } });
    }
  };
  const fetchMock = () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", mock);
    return mock;
  };
  it("keeps the approved 18 options in order, with search in the middle", () => {
    render(<Form />);
    const select = screen.getByLabelText("How did you hear about us?") as HTMLSelectElement;
    expect(Array.from(select.options).slice(1).map(option => option.text)).toEqual(heardAboutOptions);
    expect(heardAboutOptions).toHaveLength(18);
    expect(heardAboutOptions[8]).toBe("Google or another search engine");
    expect(heardAboutOptions[9]).toBe("Spencer Gallagher");
    expect(select.required).toBe(false);
  });
  it("gives simultaneously mounted forms distinct accessible attribution controls", () => {
    render(<><Form /><Form /></>);
    const selects = screen.getAllByLabelText("How did you hear about us?") as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    expect(selects[0].id).not.toBe(selects[1].id);
  });
  it("allows submission without an attribution answer", async () => {
    const mock = fetchMock();
    render(<Form />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: submit }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.heardAbout).toBeUndefined();
    expect(mock.mock.calls[0][0]).toContain(`/contact/${endpoint}`);
  });
  it.each([
    ["AI assistant - other", "Which AI assistant?"],
    ["Other", "Please specify"],
  ])("sends %s and its detail", async (source, label) => {
    const mock = fetchMock();
    render(<Form />);
    fill();
    fireEvent.change(screen.getByLabelText("How did you hear about us?"), { target: { value: source } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: "  Example source  " } });
    fireEvent.click(screen.getByRole("button", { name: submit }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({
      heardAbout: source, heardAboutDetail: "Example source",
    });
  });
  it("clears stale detail when the selected source changes", async () => {
    const mock = fetchMock();
    render(<Form />);
    fill();
    const select = screen.getByLabelText("How did you hear about us?");
    fireEvent.change(select, { target: { value: "Other" } });
    fireEvent.change(screen.getByLabelText("Please specify"), { target: { value: "Old detail" } });
    fireEvent.change(select, { target: { value: "Spencer Gallagher" } });
    expect(screen.queryByLabelText("Please specify")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: submit }));
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({
      heardAbout: "Spencer Gallagher", heardAboutDetail: "",
    });
  });
});
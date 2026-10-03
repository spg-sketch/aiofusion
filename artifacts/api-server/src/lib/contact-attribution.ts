import { ContactHeardAboutSource } from "@workspace/api-zod";

const options = new Set<string>(Object.values(ContactHeardAboutSource));

export function parseContactAttribution(body: Record<string, unknown>) {
  const source = body.heardAbout;
  if (source === undefined || source === null || source === "") {
    return { heardAbout: null, heardAboutDetail: null };
  }
  if (typeof source !== "string" || !options.has(source)) {
    throw new Error("Please select a valid answer to 'How did you hear about us?'.");
  }
  const acceptsDetail = source === "Other" || source === "AI assistant - other";
  const detail = body.heardAboutDetail;
  if (acceptsDetail && detail !== undefined && detail !== null
      && (typeof detail !== "string" || detail.trim().length > 300)) {
    throw new Error("Please keep the additional source information to 300 characters.");
  }
  return {
    heardAbout: source,
    heardAboutDetail: acceptsDetail && typeof detail === "string" ? detail.trim() || null : null,
  };
}
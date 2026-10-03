import { guides } from "./howto-review-content.mjs";

export const BATCH = "howto-editorial-review-v1";

export function validateCatalogue(entries = guides) {
  const ids = new Set();
  const orders = new Set();
  for (const { entry } of entries) {
    if (ids.has(entry.id) || orders.has(entry.displayOrder)) throw new Error("Duplicate catalogue identity or order.");
    ids.add(entry.id); orders.add(entry.displayOrder);
    if (!/^review-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || entry.status !== "draft" ||
        !entry.title || !entry.description || !/^\d+ min read$/.test(entry.readTime) ||
        JSON.stringify(entry).includes("\u2014")) throw new Error("Invalid draft catalogue metadata.");
    const steps = entry.body.filter((b) => b.type === "step");
    if (steps.length < 4 || steps.some((s, i) => s.number !== i + 1 || !s.title || !s.runs[0]?.text)) {
      throw new Error("Incomplete numbered instructions.");
    }
    if (!entry.body.some((b) => b.type === "image" && b.mediaId && b.altText && b.caption)) {
      throw new Error("Every draft requires a described existing shared image.");
    }
  }
}

export async function importDrafts({ target, baseUrl, apply = false, fetcher = fetch, credentials, onSummary = async () => {} }) {
  validateCatalogue();
  if (!["development", "staging"].includes(target)) throw new Error("Choose development or staging explicitly.");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
    throw new Error("Use HTTPS, or loopback HTTP for an isolated fixture.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use a credential-free service origin with no path or query.");
  }
  const summary = { batch: BATCH, target, origin: url.origin, mode: apply ? "apply" : "preview",
    outcomes: [], created: 0, skipped: 0, failed: 0, uncertain: 0, planned: 0 };
  let cookie = "";
  const headers = () => ({
    "Content-Type": "application/json", "X-Howto-Draft-Batch": BATCH, "X-Howto-Target": target,
    ...(cookie ? { Cookie: cookie } : {}),
  });
  // Credentials remain runtime-only. Never include responses, cookies or errors
  // from sign-in in the persisted summary.
  if (credentials) {
    const login = await fetcher(`${url.origin}/api/platform/login`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials), signal: AbortSignal.timeout(30_000),
    });
    if (!login.ok) throw new Error("Existing editorial sign-in failed; no batch writes attempted.");
    cookie = (login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") || ""])
      .map((item) => item.split(";")[0]).filter(Boolean).join("; ");
    if (!cookie) throw new Error("Sign-in requires further confirmation; no batch writes attempted.");
  }
  try {
    const inventory = await fetcher(`${url.origin}/api/admin/howto`, {
      headers: headers(), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!inventory.ok || inventory.headers.get("X-Howto-Target") !== target) {
      throw new Error("Authorized matching-target inventory unavailable; no batch writes attempted.");
    }
    const existing = await inventory.json();
    if (!Array.isArray(existing)) throw new Error("Invalid editorial inventory.");
    const completed = new Set((inventory.headers.get("X-Howto-Batch-Completed") || "").split(",").filter(Boolean));
    const mediaResponse = await fetcher(`${url.origin}/api/admin/insights/media`, {
      headers: headers(), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!mediaResponse.ok) throw new Error("Shared-media inventory unavailable; no batch writes attempted.");
    const media = await mediaResponse.json();
    if (!Array.isArray(media)) throw new Error("Invalid shared-media inventory.");
    const mediaById = new Map(media.map((m) => [m.id, m]));
    // Reuse active shared media. No uploads or metadata overwrites.
    for (const mediaId of new Set(guides.flatMap(({ entry }) => entry.body.filter((b) => b.type === "image").map((b) => b.mediaId)))) {
      const asset = mediaById.get(mediaId);
      if (!asset || asset.deletedAt || !["image/png", "image/jpeg", "image/webp"].includes(asset.contentType)) {
        throw new Error(`Required existing image unavailable: ${mediaId}. No batch writes attempted.`);
      }
      const imageUrl = new URL(asset.publicUrl, url);
      if (imageUrl.origin !== url.origin) throw new Error("Image origin requires separate review; no writes attempted.");
      const imageResponse = await fetcher(imageUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!imageResponse.ok || !imageResponse.headers.get("content-type")?.startsWith("image/")) {
        throw new Error(`Image delivery unavailable: ${mediaId}. No batch writes attempted.`);
      }
      await imageResponse.arrayBuffer();
    }
    summary.baseline = existing.map(({ id, title, status, updatedAt }) => ({ id, title, status, updatedAt }));
    for (const { entry } of guides) {
      if (completed.has(entry.id)) {
        summary.skipped++; summary.outcomes.push({ id: entry.id, outcome: "skipped", reason: "Durable completion recorded, including deliberately deleted entries." });
      } else if (!apply) {
        const present = existing.some((e) => e.id === entry.id);
        summary[present ? "skipped" : "planned"]++;
        summary.outcomes.push({ id: entry.id, outcome: present ? "skipped" : "planned",
          reason: present ? "Existing id will be preserved." : "Read-only preview; not saved." });
      } else {
        // No retries. An ambiguous response stops the batch, and a later run
        // reconciles the server's durable completion ledger before any writes.
        try {
          const result = await fetcher(`${url.origin}/api/admin/howto`, {
            method: "POST", headers: headers(), redirect: "error", body: JSON.stringify(entry),
            signal: AbortSignal.timeout(30_000),
          });
          if (result.status === 201) {
            const saved = await result.json();
            if (saved.id !== entry.id || saved.status !== "draft") throw new Error("Uncertain create response.");
            summary.created++; summary.outcomes.push({ id: entry.id, outcome: "created" });
          } else if (result.status === 200) {
            const skipped = await result.json();
            if (skipped.id !== entry.id || skipped.outcome !== "skipped") throw new Error("Uncertain skip response.");
            summary.skipped++; summary.outcomes.push({ id: entry.id, outcome: "skipped", reason: "Existing or completed entry preserved." });
          } else if (result.status >= 400 && result.status < 500) {
            summary.failed++; summary.outcomes.push({ id: entry.id, outcome: "failed", reason: `Server rejected create (${result.status}).` });
            break;
          } else throw new Error("Uncertain server response.");
        } catch {
          summary.uncertain++; summary.outcomes.push({ id: entry.id, outcome: "uncertain",
            reason: "Stop. Run a read-only preview to reconcile the server ledger before resuming." });
          break;
        }
      }
      await onSummary(summary);
    }
    if (apply && !summary.failed && !summary.uncertain) {
      const check = await fetcher(`${url.origin}/api/admin/howto`, { headers: headers(), redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!check.ok) throw new Error("Post-import verification unavailable.");
      const rows = await check.json();
      const createdIds = new Set(summary.outcomes.filter((o) => o.outcome === "created").map((o) => o.id));
      if (rows.filter((r) => createdIds.has(r.id)).length !== createdIds.size ||
          rows.some((r) => createdIds.has(r.id) && (r.status !== "draft" || r.publishedAt != null ||
            !r.body.some((b) => b.type === "image" && b.url && b.altText)))) {
        throw new Error("Post-import draft or media verification failed.");
      }
      summary.verifiedNewDrafts = createdIds.size;
    }
    return summary;
  } finally {
    await onSummary(summary);
    if (cookie) {
      try { await fetcher(`${url.origin}/api/platform/logout`, { method: "POST", headers: { Cookie: cookie }, signal: AbortSignal.timeout(5_000) }); } catch {}
    }
  }
}

export function reviewDocument(summary) {
  const outcomes = new Map((summary?.outcomes || []).map((o) => [o.id, o]));
  const baseline = summary?.baseline || [
    { id: "getting-started", title: "Getting started with AIO Fusion", status: "published" },
    { id: "aio-diagnostic", title: "Running an AIO Diagnostic", status: "published" },
    { id: "comms-planner", title: "Building a comms plan that scores", status: "published" },
    { id: "content-optimiser", title: "Optimising content for AI citation", status: "published" },
    { id: "measuring-growth", title: "Measuring AI authority growth", status: "published" },
    { id: "multiple-projects", title: "Working with multiple projects", status: "published" },
  ];
  const lines = [
    "# How-to drafts: Natalie's editorial review", "",
    "## Target and saving status", "",
    summary ? `${summary.mode === "blocked" ? "**No guides saved: target authoring is blocked by unavailable existing editorial access.** " : ""}Target: **${summary.target}**, origin: ${summary.origin}. Mode: **${summary.mode}**. Created: ${summary.created}; skipped: ${summary.skipped}; failed: ${summary.failed}; uncertain: ${summary.uncertain}; preview-only planned: ${summary.planned}.`
      : "**Not saved to a target.** This is the prepared catalogue, not a staging or live CMS inventory. Development baseline was inspected through a read-only database query. Authorized target saving remains required.",
    "",
    "Each review-* id below is a reserved catalogue identity until its outcome says created. A skipped entry can have been deliberately deleted; do not claim that it remains available. Management route: `/admin/howto`; filter Draft and search the exact id. The current management screen does not select an entry through an id query parameter.",
    "",
    "## Existing coverage, preserved unchanged", "",
    ...baseline.map((b) => `- \`${b.id}\`: ${b.title} (${b.status}).`), "",
    "Existing broad topics are referenced in the matrix below. New guides are narrower workflow supplements, not replacements. Existing wording mentioning other models, fixed audit duration, guaranteed automatic saving, restoration from Archived Projects or old control names needs Natalie's separate review. No existing entries, IDs, images or bodies were edited.",
    "",
    "## Review checklist", "",
    "P1 = core or safety-critical workflow; P2 = useful specialist workflow. Source notes below mean implementation inspection, not a successful external provider/payment journey. Every guide still needs editorial review.", "",
    "| Review | Guide | Audience | Priority | Existing overlap | Reserved draft ID / outcome | Selected shared image | Verification notes |",
    "|---|---|---|---|---|---|---|---|",
    ...guides.map(({ entry, editorial: e }) =>
      `| [ ] | ${entry.title} | ${e.audience} | ${e.priority} | ${e.overlap} | \`${entry.id}\` / ${outcomes.get(entry.id)?.outcome || "not saved"} | \`${entry.body.find((b) => b.type === "image").mediaId}\` | ${e.source}; source-inspected; role/control wording needs final review |`),
    "",
    "## Intentional omissions and blocked topics", "",
    "- Project archiving/restoring from Project Hub: the current Archive handler opens a static empty Archived Projects screen rather than persisting an archive transition. Do not document it as functioning. Agency client archiving is a different workflow and is not verified by that screen.",
    "- Full session/device management and automatic logout of all other devices on password change: not promised. The existing personal two-factor panel has trusted-device controls; a dedicated guide to those is deferred pending editorial review.",
    "- Automatic pitch sending, automatic publication to external websites, automatic acceptance of shared contact corrections or public discoveries: not supported by these guides.",
    "- Perplexity/Gemini or other model audits: intentionally omitted; the customer model scope is ChatGPT and Claude.",
    "- Steward/platform-administrator procedures and destructive account deletion: outside the customer workflow library; do not broaden ordinary customer or editorial permissions.",
    "- Signup and account-type selection have a source-inspected draft; real provider callbacks, verification email, initial package purchase, checkout/tax and invitation-email delivery still need environment checks before those claims are approved.",
    "- Agency client access issuance varies by agency type. Agency Partner Client Projects must remain managed, without promised independent client sign-in. Legacy nonpartner agency credential issuance is not covered by the Partner guide.",
    "",
    "## Image provenance", "",
    "The selected assets are existing AIO Fusion shared-media editorial illustrations: article-1-pr-ai (collaboration), article-3-b2b-authority (strategy) and article-4-agentic-media (communication). Each was visually inspected from the checked-in approved Insights library and found in the development shared-media inventory. They are not customer screenshots or invented product screens. No new image generation or upload is needed. The importer verifies active metadata and delivered image content before writing.",
    "",
    "Each guide has descriptive alt text and an explicit illustration caption. Its first saved image provides the library-card preview. Card crop and complete body presentation must be verified in the isolated browser journey; this does not establish published staging App Storage delivery.",
    "",
    "## Natalie's review and publication steps", "",
    "1. Sign in with your already-approved editorial identity in the explicitly confirmed environment. No new permissions are required or granted by the importer.",
    "2. Open Manage How-to Library, filter Draft and search the entry id. If access is missing, confirm the existing Insights identity rather than assigning a broader role.",
    "3. Read the whole guide in Preview. Return to Edit to revise the continuous Guide content box, titles, descriptions and reading-time labels.",
    "4. Select words to format them. Select an image and use Change image to choose an existing asset or upload through the shared picker. Check Image description and Caption after replacement.",
    "5. Choose Save draft and wait for confirmed saved feedback. Reopen the entry to check the retained text and images.",
    "6. Decide independently whether to Publish this entry. Drafts are hidden from anonymous readers and GEO George. Published entries enter George by default unless Available in GEO George is unticked.",
    "7. Mark your checkbox only after completing your own review. This document does not assert that Natalie's real sign-in has been tested.",
    "",
    "## Safety, reruns and environment caveats", "",
    "The importer is an explicit one-off operation, never application startup or the initial published seed migration. Preview performs only GET requests after existing sign-in. Apply creates only new illustrated drafts through existing CMS authorization and validation. A transactional per-entry ledger preserves edited, published, deleted and colliding entries on later runs. No automatic retries follow uncertain writes; stop and reconcile using preview. Media are reused without changing their metadata.",
    "",
    "Run evidence and unresolved checks are recorded in docs/howto-library-editorial-handoff.md. A local built-code journey with a temporary PostgreSQL database is fixture evidence only, not staging/live saving or Natalie identity evidence.", "",
    "## Complete prepared copy", "",
  ];
  for (const { entry } of guides) {
    lines.push(`### ${entry.title}`, "", `Reserved id: \`${entry.id}\`; ${entry.readTime}; order ${entry.displayOrder}.`, "", entry.description, "");
    for (const b of entry.body) {
      if (b.type === "image") lines.push(`Image: \`${b.mediaId}\`. Alt: ${b.altText}. Caption: ${b.caption}`, "");
      else if (b.type === "step") lines.push(`${b.number}. **${b.title}**: ${b.runs.map((r) => r.text).join("")}`, "");
      else lines.push(`${b.type === "heading" ? "**" : b.type === "tip" ? "Tip: " : ""}${b.runs.map((r) => r.text).join("")}${b.type === "heading" ? "**" : ""}`, "");
    }
  }
  return lines.join("\n");
}

import type { ExactTargetPhrase } from "./exactTargetPhrases";

export type MeasurementSettings = {
  version: number;
  runsPerPhrase: number;
  providers: Array<{ provider: "chatgpt" | "claude"; model: string }>;
};

export type PhraseMeasurement = {
  phrase: ExactTargetPhrase;
  provider: "chatgpt" | "claude";
  model: string;
  methodologyVersion: number;
  effectiveQuery: string;
  status: "complete" | "partial" | "failed";
  expectedRuns: number;
  completedRuns: number;
  mentionRuns: number;
  mentioned: boolean | null;
  answerPosition: number | null;
  citations: string[];
  citedDomains: string[];
  shareOfVoice: number | null;
  competitors: Array<{ name: string; mentions: number }>;
  failureLabel: string | null;
};

export type ImpactAudit = {
  id: string;
  savedAt: string;
  result: {
    checkedAt: string;
    phraseMeasurements?: PhraseMeasurement[];
    measurementSettings?: MeasurementSettings;
  };
};

export type ImpactOutreach = {
  id: number;
  storyKey: string;
  status: string;
  articleSnapshot: { title: string };
  contactSnapshot: { name: string };
  outletSnapshot: { name: string };
  targetPhrases: ExactTargetPhrase[];
  createdAt: string;
  activities: Array<{ id: number; toStatus: string; note: string; occurredAt: string }>;
  placements: Array<{
    id: number;
    headline: string;
    canonicalUrl: string;
    publicationDate: string;
    verification: "user_claimed" | "page_verified";
    supportingEvidence: string;
    verifiedFacts: Record<string, unknown>;
  }>;
};

export type ImpactTimelineEvent = {
  id: string;
  at: string;
  kind: "content" | "outreach" | "placement";
  label: string;
  detail: string;
  href?: string;
  navigation?: "content" | "media-research";
  storyKey?: string;
};

export type ImpactComparison = {
  phrase: ExactTargetPhrase;
  provider: "chatgpt" | "claude";
  model: string;
  status: "comparable" | "baseline-only" | "unavailable" | "not-comparable";
  statusLabel: string;
  baseline?: { auditId: string; checkedAt: string; measurement: PhraseMeasurement };
  followUp?: { auditId: string; checkedAt: string; measurement: PhraseMeasurement };
  attemptedFollowUp?: { auditId: string; checkedAt: string; measurement: PhraseMeasurement };
  deltas?: {
    mentionRuns: number;
    answerPosition: number | null;
    citations: number;
    citedDomains: number;
    shareOfVoice: number | null;
    competitorMentions: number;
  };
  timeline: ImpactTimelineEvent[];
};

export type ImpactContent = {
  id: string;
  title: string;
  createdAt: string;
  releasedAt?: string;
  targetPhrases?: ExactTargetPhrase[];
  targetPhraseIds?: string[];
};

function sameSettings(a: PhraseMeasurement, b: PhraseMeasurement): boolean {
  return a.provider === b.provider
    && a.model === b.model
    && a.expectedRuns === b.expectedRuns
    && a.methodologyVersion === b.methodologyVersion
    && a.effectiveQuery === b.effectiveQuery;
}

function completed(measurement: PhraseMeasurement): boolean {
  return measurement.status === "complete" && measurement.completedRuns === measurement.expectedRuns;
}

function competitorTotal(measurement: PhraseMeasurement): number {
  return measurement.competitors.reduce((sum, item) => sum + item.mentions, 0);
}

function timelineFor(
  phraseId: string,
  from: string,
  to: string,
  outreach: ImpactOutreach[],
  content: ImpactContent[],
): ImpactTimelineEvent[] {
  const events: ImpactTimelineEvent[] = [];
  for (const item of content) {
    const phraseIds = item.targetPhrases?.map((phrase) => phrase.id) ?? item.targetPhraseIds ?? [];
    if (!phraseIds.includes(phraseId)) continue;
    const at = item.releasedAt || item.createdAt;
    if (at > from && at <= to) events.push({
      id: `content-${item.id}`,
      at,
      kind: "content",
      label: item.title,
      detail: item.releasedAt ? "Content released" : "Content created",
      navigation: "content",
      storyKey: item.id,
    });
  }
  for (const record of outreach) {
    if (!record.targetPhrases.some((phrase) => phrase.id === phraseId)) continue;
    for (const activity of record.activities) {
      if (activity.occurredAt > from && activity.occurredAt <= to) events.push({
        id: `activity-${activity.id}`,
        at: activity.occurredAt,
        kind: "outreach",
        label: `${record.articleSnapshot.title || "Article"}: ${activity.toStatus}`,
        detail: [record.contactSnapshot.name, record.outletSnapshot.name, activity.note].filter(Boolean).join(" · "),
        navigation: "media-research",
        storyKey: record.storyKey,
      });
    }
    for (const placement of record.placements) {
      if (placement.publicationDate > from && placement.publicationDate <= to) events.push({
        id: `placement-${placement.id}`,
        at: placement.publicationDate,
        kind: "placement",
        label: placement.headline,
        detail: placement.verification === "page_verified" ? "Page-verified placement" : "User-claimed placement, not page verified",
        href: placement.canonicalUrl,
        navigation: "media-research",
        storyKey: record.storyKey,
      });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function buildMediaVisibilityImpact(
  audits: ImpactAudit[],
  outreach: ImpactOutreach[],
  content: ImpactContent[],
): ImpactComparison[] {
  const chronological = [...audits].sort((a, b) => a.result.checkedAt.localeCompare(b.result.checkedAt));
  const keys = new Map<string, ExactTargetPhrase>();
  for (const audit of chronological) {
    for (const measurement of audit.result.phraseMeasurements ?? []) {
      keys.set(`${measurement.phrase.id}:${measurement.provider}`, measurement.phrase);
    }
  }
  const comparisons: ImpactComparison[] = [];
  for (const [key, phrase] of keys.entries()) {
    const provider = key.endsWith(":chatgpt") ? "chatgpt" as const : "claude" as const;
    const samples = chronological.flatMap((audit) =>
      (audit.result.phraseMeasurements ?? [])
        .filter((measurement) => measurement.phrase.id === phrase.id && measurement.provider === provider)
        .map((measurement) => ({ auditId: audit.id, checkedAt: audit.result.checkedAt, measurement })),
    );
    const latestIncomplete = [...samples].reverse().find((sample) => !completed(sample.measurement));
    const baseline = samples.find((sample) => completed(sample.measurement));
    if (!baseline) {
      comparisons.push({
      phrase, provider, model: samples[0]?.measurement.model ?? "Unknown",
      status: "unavailable",
      statusLabel: samples.length ? "No complete baseline" : "No measurement",
      attemptedFollowUp: latestIncomplete,
      timeline: [],
      });
      continue;
    }
    const later = samples.filter((sample) => sample.checkedAt > baseline.checkedAt);
    const followUp = [...later].reverse().find((sample) => completed(sample.measurement) && sameSettings(baseline.measurement, sample.measurement));
    if (!followUp) {
      const incompatible = later.some((sample) => completed(sample.measurement) && !sameSettings(baseline.measurement, sample.measurement));
      const attemptedFollowUp = [...later].reverse().find((sample) => !completed(sample.measurement) || !sameSettings(baseline.measurement, sample.measurement));
      comparisons.push({
        phrase, provider, model: baseline.measurement.model, baseline, attemptedFollowUp,
        status: incompatible ? "not-comparable" : "baseline-only",
        statusLabel: incompatible ? "Later check used different settings" : attemptedFollowUp ? "Follow-up attempted but incomplete" : "Baseline established, follow-up needed",
        timeline: [],
      });
      continue;
    }
    const before = baseline.measurement;
    const after = followUp.measurement;
    comparisons.push({
      phrase,
      provider,
      model: before.model,
      baseline,
      followUp,
      attemptedFollowUp: [...later].reverse().find((sample) =>
        sample.checkedAt > followUp.checkedAt
        && (!completed(sample.measurement) || !sameSettings(baseline.measurement, sample.measurement))
      ),
      status: "comparable",
      statusLabel: "Comparable before-and-after checks",
      deltas: {
        mentionRuns: after.mentionRuns - before.mentionRuns,
        answerPosition: before.answerPosition === null || after.answerPosition === null ? null : after.answerPosition - before.answerPosition,
        citations: after.citations.length - before.citations.length,
        citedDomains: after.citedDomains.length - before.citedDomains.length,
        shareOfVoice: before.shareOfVoice === null || after.shareOfVoice === null ? null : after.shareOfVoice - before.shareOfVoice,
        competitorMentions: competitorTotal(after) - competitorTotal(before),
      },
      timeline: timelineFor(phrase.id, baseline.checkedAt, followUp.checkedAt, outreach, content),
    });
  }
  return comparisons.sort((a, b) => a.phrase.text.localeCompare(b.phrase.text) || a.provider.localeCompare(b.provider));
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function value(value: number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "Not measured" : `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export function mediaVisibilityImpactHtml(projectName: string, comparisons: ImpactComparison[]): string {
  const rows = comparisons.map((item) => `<section>
    <h2>${esc(item.phrase.text)} <small>${esc(item.phrase.intentGroup)} · ${esc(item.provider === "chatgpt" ? "ChatGPT" : "Claude")} · ${esc(item.model)}</small></h2>
    <p><strong>Status:</strong> ${esc(item.statusLabel)}</p>
    ${item.baseline?.measurement.effectiveQuery && item.baseline.measurement.effectiveQuery !== item.phrase.text ? `<p><strong>Effective query measured:</strong> ${esc(item.baseline.measurement.effectiveQuery)}</p>` : ""}
    ${item.baseline ? `<p><strong>Baseline:</strong> ${esc(item.baseline.checkedAt)} · mentions ${item.baseline.measurement.mentionRuns}/${item.baseline.measurement.completedRuns} · position ${esc(item.baseline.measurement.answerPosition ?? "Not mentioned")} · citations ${item.baseline.measurement.citations.length} · domains ${esc(item.baseline.measurement.citedDomains.join(", ") || "None")} · share of voice ${item.baseline.measurement.shareOfVoice === null ? "Not measured" : `${item.baseline.measurement.shareOfVoice}%`} · competitor mentions ${competitorTotal(item.baseline.measurement)}${item.baseline.measurement.failureLabel ? ` · ${esc(item.baseline.measurement.failureLabel)}` : ""}</p>` : ""}
    ${item.followUp ? `<p><strong>Follow-up:</strong> ${esc(item.followUp.checkedAt)} · mentions ${item.followUp.measurement.mentionRuns}/${item.followUp.measurement.completedRuns} · position ${esc(item.followUp.measurement.answerPosition ?? "Not mentioned")} · citations ${item.followUp.measurement.citations.length} · domains ${esc(item.followUp.measurement.citedDomains.join(", ") || "None")} · share of voice ${item.followUp.measurement.shareOfVoice === null ? "Not measured" : `${item.followUp.measurement.shareOfVoice}%`} · competitor mentions ${competitorTotal(item.followUp.measurement)}${item.followUp.measurement.failureLabel ? ` · ${esc(item.followUp.measurement.failureLabel)}` : ""}</p>` : ""}
    ${item.attemptedFollowUp ? `<p><strong>Excluded check:</strong> ${esc(item.attemptedFollowUp.checkedAt)} · ${esc(item.attemptedFollowUp.measurement.failureLabel || (sameSettings(item.baseline?.measurement ?? item.attemptedFollowUp.measurement, item.attemptedFollowUp.measurement) ? item.attemptedFollowUp.measurement.status : "Measurement settings were not comparable"))}${item.attemptedFollowUp.measurement.effectiveQuery !== item.phrase.text ? ` · effective query ${esc(item.attemptedFollowUp.measurement.effectiveQuery)}` : ""}</p>` : ""}
    ${item.deltas ? `<p><strong>Calculated change:</strong> mentions ${value(item.deltas.mentionRuns)} · position ${value(item.deltas.answerPosition)} · citations ${value(item.deltas.citations)} · cited domains ${value(item.deltas.citedDomains)} · share of voice ${value(item.deltas.shareOfVoice, " points")} · competitor mentions ${value(item.deltas.competitorMentions)}</p>` : ""}
    <h3>Evidence between checks</h3>
    ${item.timeline.length ? `<ul>${item.timeline.map((event) => `<li>${esc(event.at)} · ${esc(event.detail)} · ${event.href ? `<a href="${esc(event.href)}">${esc(event.label)}</a>` : esc(event.label)}</li>`).join("")}</ul>` : "<p>No linked content, outreach or placement evidence in this interval.</p>"}
  </section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Media visibility impact · ${esc(projectName)}</title><style>body{font:14px Arial;color:#172033;max-width:1000px;margin:32px auto;padding:0 24px}h1,h2{color:#0a1628}section{border:1px solid #d8dee8;border-radius:12px;padding:18px;margin:18px 0}small{color:#64748b}p,li{line-height:1.55}.notice{background:#fff7ed;padding:14px;border-radius:8px}</style></head><body><h1>Media Visibility Impact</h1><p>${esc(projectName)} · exported ${esc(new Date().toISOString())}</p><p class="notice"><strong>Interpretation:</strong> These checks measure change observed after recorded activity. They show timing and correlation only. They do not prove that content, outreach or a placement caused an LLM response to change.</p>${rows || "<p>No phrase-level measurements are available. Run a new Earned Media Visibility Audit to establish a baseline.</p>"}</body></html>`;
}
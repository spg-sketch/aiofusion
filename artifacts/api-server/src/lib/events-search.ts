export type EventOpportunity = {
  type: "Conference entry" | "Award entry" | "Speaker" | "Sponsorship";
  cost: string;
  deadline: string;
  contactDetails?: string;
  notes?: string;
  actionable: boolean;
};

export type VerifiedEvent = {
  rank: number;
  name: string;
  url: string;
  category: string;
  date: string;
  startDate: string;
  endDate: string;
  audience: string;
  titleDescription: string;
  location: string;
  confirmStatus: "C";
  authority: number;
  relevanceReason: string;
  opportunities: EventOpportunity[];
  sourceCheckedAt: string;
};

const OPPORTUNITY_BY_MARKETING_TYPE: Record<string, EventOpportunity["type"][]> = {
  "Trade Conferences": ["Conference entry"],
  "Conference Sponsorships": ["Sponsorship"],
  "Trade Speaker": ["Speaker"],
  "Trade Awards": ["Award entry"],
  Networking: ["Conference entry"],
};

function text(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function canonicalEventUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|gclid$|fbclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function strictDate(value: unknown): Date | null {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw ? null : parsed;
}

export function dateAppearsOnPage(isoDate: string, pageText: string): boolean {
  const parsed = strictDate(isoDate);
  if (!parsed) return false;
  const day = parsed.getUTCDate();
  const monthLong = parsed.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const monthShort = parsed.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = parsed.getUTCFullYear();
  const haystack = pageText.toLowerCase();
  return [
    isoDate,
    `${day} ${monthLong} ${year}`,
    `${day} ${monthShort} ${year}`,
    `${monthLong} ${day}, ${year}`,
    `${monthShort} ${day}, ${year}`,
  ].some((format) => haystack.includes(format.toLowerCase()));
}

function dateFormats(isoDate: string): string[] {
  const parsed = strictDate(isoDate);
  if (!parsed) return [];
  const day = parsed.getUTCDate();
  const monthLong = parsed.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const monthShort = parsed.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = parsed.getUTCFullYear();
  return [isoDate, `${day} ${monthLong} ${year}`, `${day} ${monthShort} ${year}`, `${monthLong} ${day}, ${year}`, `${monthShort} ${day}, ${year}`];
}

export function deadlineAppearsOnPage(isoDate: string, pageText: string): boolean {
  const haystack = pageText.toLowerCase();
  return dateFormats(isoDate).some((format) => {
    const index = haystack.indexOf(format.toLowerCase());
    if (index < 0) return false;
    const before = haystack.slice(Math.max(0, index - 70), index);
    const after = haystack.slice(index + format.length, index + format.length + 70);
    const openingImmediatelyBefore = /\b(open|opens|opening)\b[^.!?;\n]{0,25}$/.test(before);
    const openingImmediatelyAfter = /^[^.!?;\n]{0,25}\b(open|opens|opening)\b/.test(after);
    if (openingImmediatelyBefore || openingImmediatelyAfter) return false;
    const closingLanguage = /\b(deadline|entries close|entry closes|applications close|application closes|apply by|submit by|submissions close|submission closes|speaker proposals close|nominations close|nomination closes)\b/;
    return closingLanguage.test(before.slice(-60)) || closingLanguage.test(after.slice(0, 60));
  });
}

export function publishedValueAppearsOnPage(value: string, pageText: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate === "Not published" || candidate.length > 200) return false;
  return pageText.toLowerCase().includes(candidate.toLowerCase());
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function regionMatches(location: string, region: "UK" | "NA"): boolean {
  const value = location.toLowerCase();
  if (region === "UK") return /\b(uk|united kingdom|england|scotland|wales|northern ireland|london|manchester|birmingham|glasgow|edinburgh|cardiff|belfast)\b/.test(value);
  return /\b(usa|united states|canada|north america|new york|washington|california|chicago|boston|toronto|vancouver|montreal)\b/.test(value) ||
    /\bu\.s\.(?:a\.)?\b/.test(value);
}

export function regionAppearsOnPage(region: "UK" | "NA", pageText: string): boolean {
  return regionMatches(pageText, region);
}

function selectedOpportunityTypes(marketingTypes: string[]): Set<EventOpportunity["type"]> {
  const selected = marketingTypes.flatMap((type) => OPPORTUNITY_BY_MARKETING_TYPE[type] ?? []);
  return new Set(selected.length ? selected : ["Conference entry"]);
}

function meaningfulNameTokens(name: string): string[] {
  const tokens: string[] = name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens
    .filter((token) => token.length >= 4 && !["annual", "event", "conference", "awards", "summit", "expo"].includes(token));
}

export function eventNameAppearsOnPage(name: string, pageText: string): boolean {
  const haystack = pageText.toLowerCase();
  const tokens = meaningfulNameTokens(name);
  return tokens.length > 0 && tokens.slice(0, 3).every((token) => haystack.includes(token));
}

export function normaliseEventResults(
  rawItems: unknown[],
  options: {
    marketingTypes: string[];
    categories: string[];
    period: "6m" | "12m";
    region: "UK" | "NA";
    citations: string[];
    now?: Date;
  },
): VerifiedEvent[] {
  const checkedAt = options.now ?? new Date();
  const now = new Date(Date.UTC(checkedAt.getUTCFullYear(), checkedAt.getUTCMonth(), checkedAt.getUTCDate()));
  const rangeEnd = addMonths(now, options.period === "12m" ? 12 : 6);
  const categoryByKey = new Map(options.categories.map((category) => [category.toLowerCase(), category]));
  const allowedOpportunityTypes = selectedOpportunityTypes(options.marketingTypes);
  const citations = new Set(options.citations.map(canonicalEventUrl).filter((url): url is string => !!url));
  const seenUrls = new Set<string>();
  const seenEvents = new Set<string>();

  const events = rawItems.slice(0, 20).flatMap((raw, index): VerifiedEvent[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 240);
    const url = canonicalEventUrl(text(item.url, 2000));
    const start = strictDate(item.startDate);
    const end = strictDate(item.endDate) ?? start;
    const location = text(item.location, 300);
    const requestedCategory = text(item.category, 200);
    const category = options.categories.length
      ? categoryByKey.get(requestedCategory.toLowerCase()) ?? ""
      : requestedCategory;
    if (!name || !url || !citations.has(url) || !start || !end || start < now || start > rangeEnd || end < start) return [];
    if (!regionMatches(location, options.region) || (options.categories.length > 0 && !category)) return [];
    const eventKey = `${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${start.toISOString().slice(0, 10)}`;
    if (seenUrls.has(url) || seenEvents.has(eventKey)) return [];
    seenUrls.add(url);
    seenEvents.add(eventKey);

    const opportunities = (Array.isArray(item.opportunities) ? item.opportunities : []).slice(0, 3).flatMap((rawOpportunity): EventOpportunity[] => {
      if (!rawOpportunity || typeof rawOpportunity !== "object") return [];
      const opportunity = rawOpportunity as Record<string, unknown>;
      const type = text(opportunity.type, 40) as EventOpportunity["type"];
      if (!allowedOpportunityTypes.has(type)) return [];
      const deadlineDate = strictDate(opportunity.deadline);
      return [{
        type,
        cost: text(opportunity.cost, 200) || "Not published",
        deadline: deadlineDate ? deadlineDate.toISOString().slice(0, 10) : "",
        contactDetails: undefined,
        notes: text(opportunity.notes, 800) || undefined,
        actionable: false,
      }];
    });
    if (opportunities.length === 0) return [];

    return [{
      rank: index + 1,
      name,
      url,
      category,
      date: start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
        ? start.toISOString().slice(0, 10)
        : `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      audience: text(item.audience, 800),
      titleDescription: text(item.titleDescription, 800),
      location,
      confirmStatus: "C",
      authority: typeof item.authority === "number" ? Math.max(0, Math.min(100, Math.round(item.authority))) : 0,
      relevanceReason: text(item.relevanceReason, 1000),
      opportunities,
      sourceCheckedAt: checkedAt.toISOString(),
    }];
  });

  const actionable = events
    .flatMap((event) => event.opportunities.map((opportunity) => ({ opportunity, deadline: strictDate(opportunity.deadline) })))
    .filter((item): item is { opportunity: EventOpportunity; deadline: Date } => !!item.deadline && item.deadline >= now)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
    .slice(0, 3);
  for (const item of actionable) item.opportunity.actionable = true;
  return events.sort((a, b) => b.authority - a.authority).map((event, index) => ({ ...event, rank: index + 1 }));
}

export function recomputeActionableOpportunities(events: VerifiedEvent[], now = new Date()): VerifiedEvent[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const event of events) {
    for (const opportunity of event.opportunities) opportunity.actionable = false;
  }
  const next = events
    .flatMap((event) => event.opportunities.map((opportunity) => ({ opportunity, deadline: strictDate(opportunity.deadline) })))
    .filter((item): item is { opportunity: EventOpportunity; deadline: Date } => !!item.deadline && item.deadline >= today)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
    .slice(0, 3);
  for (const item of next) item.opportunity.actionable = true;
  return events;
}
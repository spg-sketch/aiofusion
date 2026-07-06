export type CycleHistory = { cycle: number; history: { date: string; score: number }[] };

export type Client = {
  id: string;
  name: string;
  sector: string;
  initials: string;
  color: string;
  contentCount: number;
  avgScore: number;
  scoreTrend: number;
  activePlans: number;
  lastActive: string;
  recentActivity: string;
  logo?: string;
  owner?: string;
  deletedAt?: string | null;
};

export type GenerateStep = "idle" | "scraping" | "generating" | "saving" | "scoring" | "done" | "error";

export type NavItem = { label: string; id: string; locked?: boolean; sub?: string };
export type NavSection = { section: string; color: string; items: NavItem[] };

export type Rating = "green" | "amber" | "red";

export type DiagnosticResult = {
  overallScore: number;
  categories: Array<{
    name: string;
    score: number;
    max: number;
    status: string;
    findings: string[];
    recommendations: string[];
  }>;
  strengths: string[];
  warnings: string[];
  criticalGaps: string[];
  priorityActions: Array<{
    priority: string;
    action: string;
    timeframe: string;
    impact: string;
    category: string;
  }>;
  summary: string;
  provider?: string;
  fetchedUrl?: string;
  pagesFetched?: string[];
  pageFacts?: {
    metaTitle: string;
    hasMetaDescription: boolean;
    hasCanonical: boolean;
    openGraphTagCount: number;
    jsonLdBlockCount: number;
    jsonLdTypes: string[];
    microdataCount: number;
    h1Count: number;
    h2Count: number;
    h3Count: number;
    imagesTotal: number;
    imagesWithAlt: number;
    imagesWithoutAlt: number;
    listCount: number;
    tableCount: number;
    hasRobotsTxt: boolean;
    sitemapUrlCount: number | null;
  };
  sources?: {
    claude?: { score: number; summary: string };
    openai?: { score: number; summary: string };
  };
};

export type SavedDiagnostic = { id: string; savedAt: string; result: DiagnosticResult };

export type SavedScored = { id: string; savedAt: string; score: number };

export type ArchiveItem = {
  id: string;
  title: string;
  contentType: string;
  spokesperson?: string;
  status: "Draft" | "Final";
  tags: string[];
  body: string;
  headline?: string;
  standfirst?: string;
  bodyCopy?: string;
  selectedMessages?: string[];
  mediaCats?: string[];
  pubDate?: string;
  createdAt: string;
  releasedAt?: string;
  releaseChannel?: string;
  source?: "optimiser" | "creator";
  projectId?: string;
};

export type PlannerStatus = "Planned" | "Drafting" | "Review" | "Approved";

export type PlannerProject = {
  id: string;
  title: string;
  contentType: string;
  spokesperson: string;
  keyMessage: string;
  audience: string;
  channels: string[];
  week: number;
  status: PlannerStatus;
  releaseDate: string;
  notes: string;
};

export type ScoringConfig = {
  typeWeights: Record<string, { vis: number; auth: number }>;
  channels: string[];
  channelBase: number;
  channelStep: number;
  channelCap: number;
  statusMultipliers: Record<PlannerStatus, number>;
};

export type CreatorFieldKey = "headline" | "standfirst" | "pitch" | "transcript" | "actionNotes";

export type ConfidenceFlag = "V" | "P" | "U";

export type MediaJournalist = {
  name: string;
  title: string;
  email: string;
  confidence: ConfidenceFlag;
  roleCurrency: string;
};

export type MediaListItem = {
  rank: number;
  publication: string;
  url: string;
  category: string;
  categoryRank: number;
  description: string;
  readership: string;
  reach: string;
  reachVerified: boolean;
  journalists: MediaJournalist[];
  noBeatContactNote?: string;
  authority: number;
  authorityNote?: string;
  pitchAngle: string;
  suggestedPlacement?: string;
};

export type EventConfirmFlag = "C" | "U";

export type EventOpportunity = {
  type: "Conference entry" | "Award entry" | "Speaker" | "Sponsorship";
  cost: string;
  deadline: string;
  contactDetails?: string;
  notes?: string;
  actionable?: boolean;
};

export type EventItem = {
  rank: number;
  name: string;
  url: string;
  category: string;
  date: string;
  audience: string;
  titleDescription: string;
  location: string;
  confirmStatus: EventConfirmFlag;
  authority: number;
  relevanceReason: string;
  opportunities: EventOpportunity[];
};

export type PublicView =
  | "landing" | "about" | "contact" | "insights" | "pricing"
  | "for-inhouse" | "for-agencies" | "for-agents" | "trust-security"
  | "privacy-policy" | "terms-conditions";

export type Outlet = {
  id: number;
  name: string;
  category: string;
  website: string;
  description: string;
  country: string;
  reachBand: string;
  accountId: string | null;
};

export type Contact = {
  id: number;
  outletId: number | null;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
  accountId: string;
  outletName?: string;
  outletCategory?: string;
};

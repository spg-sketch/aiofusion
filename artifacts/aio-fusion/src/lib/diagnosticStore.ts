import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
export const ratingConfig = {
  green: {
    bg: "#EFF7F2",
    color: "#3D9B6B",
    icon: CheckCircle2,
    label: "Strong",
  },
  amber: {
    bg: "#FDF6ED",
    color: "#B8821F",
    icon: AlertTriangle,
    label: "Needs Work",
  },
  red: {
    bg: "#FBEEEC",
    color: "#B03D33",
    icon: XCircle,
    label: "Critical",
  },
};

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

export const savedDiagnosticsKey = (clientId: string) => `aio.savedDiagnostics.${clientId}`;

export function loadSavedDiagnostics(clientId: string): SavedDiagnostic[] {
  try {
    const raw = localStorage.getItem(savedDiagnosticsKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedDiagnostics(clientId: string, list: SavedDiagnostic[]): boolean {
  try {
    localStorage.setItem(savedDiagnosticsKey(clientId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export type SavedScored = { id: string; savedAt: string; score: number };

export const contentGeoKey = (clientId: string) => `aio.savedContentGeo.${clientId}`;
export const techGeoKey = (clientId: string) => `aio.savedTechGeo.${clientId}`;

export function loadSavedScored(storageKey: string): SavedScored[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedScored(storageKey: string, list: SavedScored[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

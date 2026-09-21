import { useState, useEffect, useRef } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, Database,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";
import { getSession as getLocalSession } from "../lib/auth";
import { CategoryPickerModal } from "./shared";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { getProjectMediaCategories } from "../IntakeForm";
import { escapeHtml } from "../lib/contentAi";
import MediaDiscoveryReview from "./MediaDiscoveryReview";
import MediaDiscoveryInstructions from "./MediaDiscoveryInstructions";
// ---------------------------------------------------------------------------
// Searchable outlet combobox for the contact modal
// ---------------------------------------------------------------------------
export function SearchableOutletPicker({
  outlets, value, onChange,
}: {
  outlets: { id: number; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = outlets.find((o) => String(o.id) === value);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = outlets.filter((o) => !search || o.name.toLowerCase().includes(search.toLowerCase())).slice(0, 50);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center w-full px-3 py-2 rounded-lg border text-[13px] cursor-pointer gap-2"
        style={{ borderColor: open ? vars.accent : vars.g200 }}
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span style={{ color: selected ? vars.navy : vars.g400 }} className="flex-1 truncate">
          {selected ? selected.name : "No outlet linked"}
        </span>
        {selected && (
          <button className="text-[16px] leading-none" style={{ color: vars.g400 }} onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}>&times;</button>
        )}
        <ChevronRight size={13} color={vars.g400} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: vars.g200 }}>
          <div className="p-2 border-b" style={{ borderColor: vars.g100 }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search outlets..."
              className="w-full px-2 py-1.5 rounded-lg border text-[12px]"
              style={{ borderColor: vars.g200 }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-[12px] hover:bg-gray-50"
              style={{ color: vars.g500 }}
              onClick={() => { onChange(""); setOpen(false); }}
            >
              No outlet linked
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] hover:bg-gray-50"
                style={{ color: vars.navy, background: String(o.id) === value ? "rgba(31,116,143,0.08)" : undefined }}
                onClick={() => { onChange(String(o.id)); setOpen(false); setSearch(""); }}
              >
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-[12px] px-3 py-2" style={{ color: vars.g400 }}>No outlets match</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media Database page - outlets, contacts and custom categories
// ---------------------------------------------------------------------------
import { isSendableContactEmail, type Contact } from "./JournalistComponents";
import { RecommendationCard } from "./JournalistComponents";

type CollectionScope = "shared" | "workspace";
type CollectionOwnedItem = { accountId: string | null; collectionScope?: CollectionScope; owner?: string | null };
type Outlet = { id: number; name: string; category: string; website: string; description: string; country: string; reachBand: string } & CollectionOwnedItem;
type UnifiedResult =
  | { type: "contact"; id: number; contact: Contact; matchedFields: string[]; matchedPhrases: string[]; reasons: string[]; authority: number }
  | { type: "outlet"; id: number; outlet: Outlet; matchedFields: string[]; matchedPhrases: string[]; reasons: string[]; authority: number };

type CorrectionReport = {
  id: number;
  fields: string[];
  details: string;
  status: "pending" | "accepted" | "rejected" | "resolved";
  createdAt: string;
  workspace: string;
  reporter: { id: string; name: string | null; email: string | null };
  contact: Pick<Contact, "id" | "firstName" | "lastName" | "role" | "email" | "phone" | "mobile" | "outletId" | "linkedinUrl" | "twitterHandle" | "sourceUrl" | "accountId"> & { outletName: string | null };
  sourceCheck: {
    id: number;
    sourceUrl: string;
    outcome: string;
    checkedAt: string;
    observedEvidence?: { excerpt?: string };
    differences?: Array<{ field: string; storedValue: string; observedValue: string; supported: boolean }>;
  } | null;
};

export type ImportPreview = {
  validRows: number;
  importableRows: number;
  publicationRows?: number;
  matchedExisting?: number;
  duplicateRows: number;
  invalidRows: number;
  new?: number;
  refreshed?: number;
  unchanged?: number;
  duplicate?: number;
  invalid?: number;
  conflicted?: number;
  conflicts?: number;
  outletCount: number;
  /** The server-resolved destination for this preview. */
  collectionScope?: CollectionScope;
  /** The server-resolved owner of the destination collection. */
  owner?: string | null;
  errors: Array<{ row: number; message: string; sheetName?: string }>;
  sample: Array<{ sourceRow: number; sheetName?: string; firstName: string; lastName: string; role: string; outletName: string; email: string }>;
  /** Reconciliation worker contract: one non-PII outcome per source row. */
  rowOutcomes?: ImportRowOutcome[];
  /** Opaque server review token bound to the uploaded payload and target. */
  reviewToken?: string;
  sourceHash?: string;
  sourceByteLength?: number;
  recordTypeCounts?: Record<string, number>;
  sectorCounts?: Record<string, number>;
  sectorCountsByRecordType?: Record<string, Record<string, number>>;
  /** Counts the reviewer should see before acknowledging the destination. */
  scopeInventory?: Record<string, ImportInventoryValue>;
};

export type ImportRowOutcome = {
  sourceRow: number;
  sheetName?: string;
  outcome?: string;
  status?: string;
  reason?: string;
  fields?: string[];
};

type ImportResult = {
  outletsCreated: number;
  contactsCreated: number;
  duplicatesSkipped: number;
  publicationsProcessed?: number;
  refreshed?: number;
  unchanged?: number;
  rowOutcomes?: ImportRowOutcome[];
};

type ImportJob = {
  id: string;
  status: "parsing" | "reconciliation" | "committing" | "completed" | "failed";
  sourceFilename?: string;
  sourceHash?: string;
  summary?: Partial<ImportResult>;
  error?: string;
};

type ImportInventoryValue = string | number | boolean | null | { [key: string]: ImportInventoryValue };

export function importOutcomesWithErrors(
  outcomes: ImportRowOutcome[] | undefined,
  errors: Array<{ row: number; message: string; sheetName?: string }> | undefined,
): ImportRowOutcome[] {
  const rows = [...(outcomes || [])];
  const representedRows = new Set(rows.map((outcome) => `${outcome.sheetName || ""}\u0000${outcome.sourceRow}`));
  for (const error of errors || []) {
    const key = `${error.sheetName || ""}\u0000${error.row}`;
    if (!representedRows.has(key)) rows.push({ sourceRow: error.row, sheetName: error.sheetName, outcome: "invalid", reason: error.message, fields: [] });
  }
  return rows.sort((a, b) => (a.sheetName || "").localeCompare(b.sheetName || "") || a.sourceRow - b.sourceRow);
}

export function importPlanHasWork(preview: ImportPreview | null): boolean {
  if (!preview) return false;
  return Number(preview.importableRows || 0) > 0
    || Number(preview.publicationRows || 0) > 0
    || Number(preview.matchedExisting || 0) > 0
    || Number(preview.refreshed || 0) > 0
    || Number(preview.unchanged || 0) > 0;
}

export const CONTACT_EXPORT_COLUMNS = [
  "First Name", "Last Name", "Role", "Email", "Email Status", "Phone", "Mobile",
  "Outlet", "Category", "Country", "Publication Reach", "Beats", "Sectors",
  "Geography", "Language", "Seniority", "Editorial Status", "LinkedIn URL",
  "Source URL", "Source Reference", "Publication Authority", "Journalist Authority",
  "Confidence", "Last Verified", "Source Status", "Lifecycle Status", "Notes", "Review Notes",
] as const;

/**
 * Prefix values that spreadsheet applications may evaluate as formulas.  The
 * apostrophe is intentionally part of the exported cell text and keeps
 * phone numbers such as +44... safe as well as explicit formula strings.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  const text = String(value ?? "");
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  return `"${sanitizeSpreadsheetCell(value).replace(/"/g, '""')}"`;
}

function contactEmailStatus(contact: Contact): string {
  if (!contact.email) return "";
  return isSendableContactEmail(contact.email) ? "Sendable format" : "Review - not sendable";
}

function exportDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
}

export function contactExportRow(contact: Contact): string[] {
  return [
    contact.firstName,
    contact.lastName,
    contact.role,
    contact.email,
    contactEmailStatus(contact),
    contact.phone,
    contact.mobile,
    contact.outletName,
    contact.outletCategory,
    contact.outletCountry,
    contact.publicationReach || contact.outletReachBand,
    (contact.beats || []).join("; "),
    (contact.sectors || []).join("; "),
    contact.geography,
    contact.language,
    contact.seniority,
    contact.editorialStatus,
    contact.linkedinUrl,
    contact.sourceUrl,
    contact.sourceRef,
    contact.publicationAuthority,
    contact.journalistAuthority,
    contact.confidence || contact.confidenceLevel,
    exportDate(contact.lastVerifiedAt),
    contact.sourceStatus,
    contact.lifecycleStatus,
    contact.notes,
    contact.reviewNotes,
  ].map((value) => String(value ?? ""));
}

export function isUploadedMediaContact(contact: Contact): boolean {
  const provenance = contact.provenance;
  if (!provenance || typeof provenance !== "object") return false;
  return Boolean(provenance.sourceHash || provenance.importFilename || provenance.sourceType || provenance.sourceRow);
}

export function contactCompletenessPercent(contact: Contact): number {
  const checks = [
    Boolean(contact.firstName.trim() && contact.lastName.trim()),
    Boolean(contact.role.trim()),
    Boolean(contact.outletId || contact.outletName?.trim()),
    Boolean(contact.email.trim() || contact.phone.trim() || contact.mobile?.trim()),
    Boolean(contact.beats?.length || contact.sectors?.length),
    Boolean(contact.geography?.trim() || contact.outletCountry?.trim()),
    Boolean(contact.sourceRef?.trim() || contact.sourceUrl?.trim()),
    Boolean(contact.confidence?.trim() || contact.confidenceLevel?.trim()),
    Boolean(contact.seniority?.trim() || contact.editorialStatus?.trim() || contact.language?.trim()),
    Boolean(contact.notes.trim() || contact.reviewNotes?.trim() || contact.linkedinUrl?.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function isSharedCollection(item: CollectionOwnedItem): boolean {
  // Older API responses identify the centrally managed collection with a null
  // accountId. Prefer the explicit scope when the newer response is present.
  return item.collectionScope === "shared" || (item.collectionScope === undefined && item.accountId === null);
}

function canManageCollectionItem(item: CollectionOwnedItem, isMaster: boolean, canWrite: boolean, username?: string | null): boolean {
  if (!canWrite) return false;
  if (isSharedCollection(item)) return isMaster;
  // Master can browse every workspace collection, but private records remain
  // writable only from their owning workspace (including a Master-created
  // private collection).
  return Boolean(username && item.accountId && item.accountId.toLowerCase() === username.toLowerCase());
}

function MediaDatabasePage() {
  const session = getLocalSession();
  // Match the server's canonical Master boundary: an admin-role session for
  // the bootstrap "admin" workspace. Other admin-role workspaces are still
  // customer workspaces and may only write their own private records.
  const isMaster = session?.role === "admin" && session.username.trim().toLowerCase() === "admin";
  // memberProjectGate permits writes for owner/admin/content (and legacy
  // sessions without a membership role), but blocks viewers and billing
  // members. Keep every mutating control behind the same decision.
  const canWriteMediaDatabase = Boolean(session && session.membershipRole !== "viewer" && session.membershipRole !== "billing");
  // Every authenticated Media Database member can open the discovery queue.
  // The queue asks the server whether this session can approve/reject, so
  // non-Master members remain safely read-only. Instructions are the separate
  // Master-owner-only surface.
  const canSeeDiscoveries = Boolean(session);
  const canEditDiscoveryInstructions = isMaster && (!session?.membershipRole || session.membershipRole === "owner");
  const [activeTab, setActiveTab] = useState<"outlets" | "contacts" | "discoveries" | "corrections" | "instructions">("contacts");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const loadRequestSequence = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const [resultMode, setResultMode] = useState<"none" | "browse" | "search">("none");
  const [resultMessage, setResultMessage] = useState("");
  const [resultRefreshToken, setResultRefreshToken] = useState(0);
  const [outletSearch, setOutletSearch] = useState("");
  const [outletCatFilter, setOutletCatFilter] = useState("");
  const [outletPage, setOutletPage] = useState(1);
  const [outletTotal, setOutletTotal] = useState(0);
  const [contactSearch, setContactSearch] = useState("");
  const [contactOutletFilter, setContactOutletFilter] = useState("");
  const [contactCategoryFilter, setContactCategoryFilter] = useState("");
  const [contactCountryFilter, setContactCountryFilter] = useState("");
  const [contactSort, setContactSort] = useState("lastName");
  const [contactDirection, setContactDirection] = useState<"asc" | "desc">("asc");
  const [contactPage, setContactPage] = useState(1);
  const [contactTotal, setContactTotal] = useState(0);
  const [searchPhrase, setSearchPhrase] = useState("");
  const [searchTopic, setSearchTopic] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchAuthority, setSearchAuthority] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchCounts, setSearchCounts] = useState({ contacts: 0, outlets: 0 });
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [correctionContact, setCorrectionContact] = useState<Contact | null>(null);
  const [correctionFields, setCorrectionFields] = useState<string[]>([]);
  const [correctionDetails, setCorrectionDetails] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionReports, setCorrectionReports] = useState<CorrectionReport[]>([]);
  const [correctionQueueLoading, setCorrectionQueueLoading] = useState(false);
  const [correctionQueueError, setCorrectionQueueError] = useState("");
  const [correctionResolutionNotes, setCorrectionResolutionNotes] = useState<Record<number, string>>({});
  const [correctionResolvingId, setCorrectionResolvingId] = useState<number | null>(null);

  const [showOutletModal, setShowOutletModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [outletForm, setOutletForm] = useState({ name: "", category: "", website: "", description: "", country: "", reachBand: "" });
  const [outletSaving, setOutletSaving] = useState(false);
  const [deletingOutletId, setDeletingOutletId] = useState<number | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);
  const [showContactProfile, setShowContactProfile] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({
    outletId: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "",
    mobile: "", linkedinUrl: "", twitterHandle: "", beats: "", sectors: "", geography: "",
    language: "", seniority: "", editorialStatus: "", sourceUrl: "", sourceRef: "",
    publicationReach: "", publicationAuthority: "", journalistAuthority: "", confidence: "",
    lastVerifiedAt: ""
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [sourceCheckingId, setSourceCheckingId] = useState<number | null>(null);
  const [sourceActionError, setSourceActionError] = useState("");

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPayload, setImportPayload] = useState<{ csv?: string; xlsxBase64?: string } | null>(null);
  const [importIdempotencyKey, setImportIdempotencyKey] = useState("");
  const [importCategory, setImportCategory] = useState("");
  const [importCollectionScope, setImportCollectionScope] = useState<CollectionScope>(() => isMaster && canWriteMediaDatabase ? "shared" : "workspace");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [importTargetAcknowledged, setImportTargetAcknowledged] = useState(false);
  const [importConflictsAcknowledged, setImportConflictsAcknowledged] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const importPreviewSequence = useRef(0);
  const importJobStorageKey = `aio.media-import-job:${session?.username || "anonymous"}`;
  const projectCategories = getProjectMediaCategories();
  const profileProvenance = showContactProfile?.provenance && typeof showContactProfile.provenance === "object"
    ? showContactProfile.provenance
    : null;
  const profileImportFilename = profileProvenance && typeof profileProvenance.importFilename === "string" ? profileProvenance.importFilename : "";
  const profileImportSheet = profileProvenance && typeof profileProvenance.sheet === "string" ? profileProvenance.sheet : "";
  const profileImportRow = profileProvenance && (typeof profileProvenance.sourceRow === "number" || typeof profileProvenance.sourceRow === "string")
    ? String(profileProvenance.sourceRow)
    : "";

  const loadData = async (requestedMode = resultMode, requestedTab = activeTab) => {
    const sequence = ++loadRequestSequence.current;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoadError("");
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const requests: Promise<Response>[] = [
        fetch(`${apiBase()}/api/store/media-categories`, { credentials: "include", signal: controller.signal }),
      ];
      if (requestedMode === "browse" && requestedTab === "outlets") {
        const params = new URLSearchParams({ page: String(outletPage), pageSize: "50" });
        if (outletSearch.trim()) params.set("q", outletSearch.trim());
        if (outletCatFilter) params.set("category", outletCatFilter);
        requests.push(fetch(`${apiBase()}/api/store/media-db/outlets?${params}`, { credentials: "include", signal: controller.signal }));
      }
      if (requestedMode === "browse" && requestedTab === "contacts") {
        const params = new URLSearchParams({ page: String(contactPage), pageSize: "50", sort: contactSort, direction: contactDirection });
        if (contactSearch.trim()) params.set("q", contactSearch.trim());
        if (contactCategoryFilter) params.set("category", contactCategoryFilter);
        if (contactCountryFilter) params.set("country", contactCountryFilter);
        if (contactOutletFilter) params.set("outletId", contactOutletFilter);
        requests.push(fetch(`${apiBase()}/api/store/media-db/contacts?${params}`, { credentials: "include", signal: controller.signal }));
      }
      const [catR, optionalR] = await Promise.all(requests);
      const outR = requestedTab === "outlets" && requestedMode === "browse" ? (optionalR ?? null) : null;
      const conR = requestedTab === "contacts" && requestedMode === "browse" ? (optionalR ?? null) : null;
      const failed = [
        ...(outR ? [["publications", outR] as const] : []),
        ...(conR ? [["contacts", conR] as const] : []),
      ].find(([, response]) => !(response as Response).ok);
      if (failed) {
        throw new Error(`The ${failed[0]} request returned ${(failed[1] as Response).status}.`);
      }
      const categoryData = catR.ok ? await catR.json() : null;
      const outletData = outR ? await outR.json() : null;
      const contactData = conR ? await conR.json() : null;
      if (sequence !== loadRequestSequence.current) return;
      if (outletData) {
        setOutlets(outletData.outlets ?? []);
        setOutletTotal(outletData.total ?? outletData.outlets?.length ?? 0);
      }
      if (contactData) {
        setContacts(contactData.contacts ?? []);
        setContactTotal(contactData.total ?? contactData.contacts?.length ?? 0);
      }
      if (catR.ok && categoryData) {
        const custom: string[] = (categoryData.custom ?? []).map((c: { name: string }) => c.name);
        const merged = Array.from(new Set([...(categoryData.standard ?? TRADE_MEDIA_CATEGORIES), ...custom])).sort((a, b) => a.localeCompare(b));
        setAllCategories(merged);
      } else if (sequence === loadRequestSequence.current) {
        setLoadError("Filters are temporarily unavailable. You can still search or browse.");
      }
      if (requestedMode === "search") setResultRefreshToken((value) => value + 1);
    } catch (error) {
      controller.abort();
      if (sequence !== loadRequestSequence.current) return;
      setAllCategories([...TRADE_MEDIA_CATEGORIES]);
      setLoadError(
        error instanceof DOMException && error.name === "AbortError"
          ? "The Media Database took too long to respond."
          : "The Media Database could not be loaded.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (sequence === loadRequestSequence.current) {
        loadControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    void loadData();
    return () => {
      loadRequestSequence.current += 1;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const savedJobId = localStorage.getItem(importJobStorageKey);
    if (!savedJobId) return;
    setImportJob({ id: savedJobId, status: "parsing" });
    setShowImportModal(true);
  }, [importJobStorageKey]);

  useEffect(() => {
    if (!importJob || importJob.status === "completed" || importJob.status === "failed") return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`${apiBase()}/api/store/media-db/import-jobs/${encodeURIComponent(importJob.id)}`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the import status.");
        if (cancelled) return;
        const job = data.job as ImportJob;
        setImportJob(job);
        setImportFileName(job.sourceFilename || "");
        if (job.status === "completed") {
          const summary = job.summary ?? {};
          setImportResult({
            outletsCreated: Number(summary.outletsCreated ?? 0),
            contactsCreated: Number(summary.contactsCreated ?? 0),
            duplicatesSkipped: Number(summary.duplicatesSkipped ?? 0),
            publicationsProcessed: Number(summary.publicationsProcessed ?? 0),
            refreshed: Number(summary.refreshed ?? 0),
            unchanged: Number(summary.unchanged ?? 0),
            rowOutcomes: Array.isArray(summary.rowOutcomes) ? summary.rowOutcomes : undefined,
          });
          setImportBusy(false);
          await loadData();
          return;
        }
        if (job.status === "failed") {
          setImportError(job.error || "The import failed.");
          setImportBusy(false);
          return;
        }
        timer = window.setTimeout(poll, 1500);
      } catch (error) {
        if (!cancelled) timer = window.setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [importJob?.id, importJob?.status]);

  const loadCorrectionQueue = async () => {
    if (!isMaster || !canWriteMediaDatabase) return;
    setCorrectionQueueLoading(true);
    setCorrectionQueueError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/corrections?status=pending`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load correction reports.");
      setCorrectionReports(Array.isArray(data.corrections) ? data.corrections : []);
    } catch (error) {
      setCorrectionQueueError(error instanceof Error ? error.message : "Could not load correction reports.");
    } finally {
      setCorrectionQueueLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "corrections") void loadCorrectionQueue();
  }, [activeTab]);

  const searchActive = resultMode === "search";
  const runSearch = () => {
    setResultMode("search");
    setSearchPage(1);
    setResultMessage("");
    setResultRefreshToken((value) => value + 1);
  };
  useEffect(() => {
    if (!searchActive) return;
    const sequence = ++loadRequestSequence.current;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    const params = new URLSearchParams({ page: String(searchPage), pageSize: "25" });
    if (searchPhrase.trim()) params.set("phrase", searchPhrase.trim());
    if (searchTopic.trim()) params.set("topic", searchTopic.trim());
    if (searchLocation.trim()) params.set("location", searchLocation.trim());
    if (searchCategory) params.set("category", searchCategory);
    if (searchAuthority) params.set("authority", searchAuthority);
    setSearchLoading(true);
    setResultMessage("");
    fetch(`${apiBase()}/api/store/media-db/search?${params}`, { credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not search the media database.")))
      .then((data) => {
        if (sequence !== loadRequestSequence.current) return;
        setSearchResults(data.results ?? []); setSearchTotal(data.total ?? 0);
        setSearchCounts(data.counts ?? { contacts: 0, outlets: 0 });
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          if (timedOut && sequence === loadRequestSequence.current) setResultMessage("Search timed out. Try again.");
          return;
        }
        if (sequence === loadRequestSequence.current) setResultMessage(error instanceof Error ? error.message : "Search failed. Try again.");
      })
      .finally(() => { window.clearTimeout(timeout); if (sequence === loadRequestSequence.current) setSearchLoading(false); });
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [searchActive, searchPage, resultRefreshToken]);

  const browseResults = (tab: "outlets" | "contacts" = activeTab === "outlets" ? "outlets" : "contacts") => {
    setResultMode("browse");
    setResultMessage("");
    if (tab === "outlets") {
      setOutletPage(1);
      void loadData("browse", "outlets");
    }
  };
  useEffect(() => {
    if (resultMode !== "browse") return;
    if (activeTab === "contacts") void loadData("browse", "contacts");
    if (activeTab === "outlets") void loadData("browse", "outlets");
  }, [resultMode, activeTab, contactPage, contactSort, contactDirection, contactSearch, contactCategoryFilter, contactCountryFilter, contactOutletFilter, outletPage]);

  const resetImport = () => {
    importPreviewSequence.current += 1;
    setImportFileName("");
    setImportPayload(null);
    setImportIdempotencyKey("");
    setImportCategory("");
    setImportCollectionScope(isMaster && canWriteMediaDatabase ? "shared" : "workspace");
    setImportPreview(null);
    setImportError("");
    setImportResult(null);
    setImportJob(null);
    localStorage.removeItem(importJobStorageKey);
    setImportTargetAcknowledged(false);
    setImportConflictsAcknowledged(false);
  };

  const openImport = () => {
    if (!canWriteMediaDatabase) return;
    resetImport();
    setShowImportModal(true);
  };

  const previewImport = async (
    payload: { csv?: string; xlsxBase64?: string },
    fileName: string,
    requestedScope: CollectionScope = importCollectionScope,
    requestedCategory = importCategory,
  ) => {
    if (!canWriteMediaDatabase) return;
    // A non-Master session can never request a shared import, even if stale
    // browser state or a crafted event attempts to select it.
    const collectionScope: CollectionScope = isMaster && canWriteMediaDatabase && requestedScope === "shared" ? "shared" : "workspace";
    const previewRequestId = ++importPreviewSequence.current;
    setImportBusy(true);
    setImportError("");
    setImportPreview(null);
    setImportResult(null);
    setImportTargetAcknowledged(false);
    setImportConflictsAcknowledged(false);
    try {
      const resp = await fetch(`${apiBase()}/api/store/media-db/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, category: requestedCategory, filename: fileName, collectionScope, commit: false }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not read this CSV.");
      if (previewRequestId !== importPreviewSequence.current) return;
      setImportPayload(payload);
      setImportFileName(fileName);
      setImportIdempotencyKey(`media-import:${fileName}:${crypto.randomUUID()}`);
      const preview: ImportPreview = data.preview;
      const resolvedScope: CollectionScope = preview?.collectionScope === "shared"
        ? (isMaster && canWriteMediaDatabase ? "shared" : "workspace")
        : preview?.collectionScope === "workspace"
          ? "workspace"
          : collectionScope;
      setImportCollectionScope(resolvedScope);
      setImportPreview({ ...preview, collectionScope: resolvedScope });
    } catch (error) {
      if (previewRequestId === importPreviewSequence.current) {
        setImportError(error instanceof Error ? error.message : "Could not read this CSV.");
      }
    }
    if (previewRequestId === importPreviewSequence.current) setImportBusy(false);
  };

  const importContacts = async () => {
    if (!canWriteMediaDatabase || !importPayload || importBusy || !importPlanHasWork(importPreview)) return;
    const requiresReviewerAcknowledgement = Boolean(importPreview?.reviewToken);
    const conflictCount = Number(importPreview?.conflicted ?? importPreview?.conflicts ?? 0);
    if (requiresReviewerAcknowledgement && (!importTargetAcknowledged || (conflictCount > 0 && !importConflictsAcknowledged))) {
      setImportError("Acknowledge the owning collection and review conflicts before importing.");
      return;
    }
    setImportBusy(true);
    setImportError("");
    try {
      const collectionScope: CollectionScope = isMaster && canWriteMediaDatabase && (importPreview?.collectionScope ?? importCollectionScope) === "shared"
        ? "shared"
        : "workspace";
      const resp = await fetch(`${apiBase()}/api/store/media-db/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...importPayload,
          category: importCategory,
          filename: importFileName,
          idempotencyKey: importIdempotencyKey,
          collectionScope,
          commit: true,
          sourceHash: importPreview?.sourceHash || undefined,
          // The token is opaque and only meaningful to the reconciliation
          // worker. Do not derive or log its contents in the browser.
          reviewToken: importPreview?.reviewToken || undefined,
          acknowledgeTarget: requiresReviewerAcknowledgement ? importTargetAcknowledged : undefined,
          acknowledgeConflicts: requiresReviewerAcknowledgement ? importConflictsAcknowledged : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not import these contacts.");
      if (!data.jobId) throw new Error("The import did not return a job identifier.");
      const job: ImportJob = { id: data.jobId, status: data.status || "parsing", sourceFilename: importFileName };
      localStorage.setItem(importJobStorageKey, job.id);
      setImportJob(job);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import these contacts.");
      setImportBusy(false);
    }
  };

  const downloadRowOutcomes = (outcomes: ImportRowOutcome[] | undefined) => {
    if (!outcomes?.length) return;
    // Deliberately export only source row and reconciliation outcome. Worker
    // contracts may carry identifying values for internal reconciliation, but
    // they must never leak into this reviewer-facing download or browser logs.
    const rows = [
      ["Sheet", "Source row", "Outcome", "Reason", "Fields"],
      ...outcomes.map((outcome) => [
        outcome.sheetName || "",
        outcome.sourceRow,
         outcome.outcome || outcome.status || "",
        outcome.reason || "",
        (outcome.fields || []).join("; "),
      ]),
    ];
    const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Media import row outcomes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Outlets
  const filteredOutlets = outlets;

  const openAddOutlet = () => {
    if (!canWriteMediaDatabase) return;
    setEditingOutlet(null);
    setOutletForm({ name: "", category: "", website: "", description: "", country: "", reachBand: "" });
    setShowOutletModal(true);
  };
  const openEditOutlet = (o: Outlet) => {
    if (!canManageCollectionItem(o, isMaster, canWriteMediaDatabase, session?.username)) return;
    setEditingOutlet(o);
    setOutletForm({ name: o.name, category: o.category, website: o.website, description: o.description, country: o.country, reachBand: o.reachBand });
    setShowOutletModal(true);
  };
  const saveOutlet = async () => {
    if (!canWriteMediaDatabase || (editingOutlet && !canManageCollectionItem(editingOutlet, isMaster, canWriteMediaDatabase, session?.username)) || !outletForm.name.trim() || outletSaving) return;
    setOutletSaving(true);
    try {
      const resp = editingOutlet
        ? await fetch(`${apiBase()}/api/store/media-db/outlets/${editingOutlet.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outletForm) })
        : await fetch(`${apiBase()}/api/store/media-db/outlets`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outletForm) });
      if (resp.ok) { setShowOutletModal(false); await loadData(); }
    } catch {}
    setOutletSaving(false);
  };
  const deleteOutlet = async (id: number) => {
    const outlet = outlets.find((item) => item.id === id);
    if (!outlet || !canManageCollectionItem(outlet, isMaster, canWriteMediaDatabase, session?.username)) return;
    setDeletingOutletId(id);
    try {
      await fetch(`${apiBase()}/api/store/media-db/outlets/${id}`, { method: "DELETE", credentials: "include" });
      await loadData();
    } catch {}
    setDeletingOutletId(null);
  };

  // Contacts
  const filteredContacts = contacts.filter((c) => {
    if (contactOutletFilter && String(c.outletId) !== contactOutletFilter) return false;
    return true;
  });

  const openAddContact = () => {
    if (!canWriteMediaDatabase) return;
    if (!outlets.length) {
      void fetch(`${apiBase()}/api/store/media-db/outlets?page=1&pageSize=50`, { credentials: "include" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load publications.")))
        .then((data) => setOutlets(data.outlets ?? []))
        .catch(() => setResultMessage("Publications could not be loaded. You can still save the contact without a linked publication."));
    }
    setEditingContact(null);
    setContactForm({
      outletId: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "",
      mobile: "", linkedinUrl: "", twitterHandle: "", beats: "", sectors: "", geography: "",
      language: "", seniority: "", editorialStatus: "", sourceUrl: "", sourceRef: "",
      publicationReach: "", publicationAuthority: "", journalistAuthority: "", confidence: "",
      lastVerifiedAt: ""
    });
    setShowContactModal(true);
  };
  const openEditContact = (c: Contact) => {
    if (!canManageCollectionItem(c, isMaster, canWriteMediaDatabase, session?.username)) return;
    setEditingContact(c);
    setContactForm({
      outletId: c.outletId ? String(c.outletId) : "",
      firstName: c.firstName || "", lastName: c.lastName || "", role: c.role || "",
      email: c.email || "", phone: c.phone || "", notes: c.notes || "",
      mobile: c.mobile || "", linkedinUrl: c.linkedinUrl || "", twitterHandle: c.twitterHandle || "",
      beats: (c.beats || []).join(", "), sectors: (c.sectors || []).join(", "),
      geography: c.geography || "", language: c.language || "", seniority: c.seniority || "",
      editorialStatus: c.editorialStatus || "", sourceUrl: c.sourceUrl || "", sourceRef: c.sourceRef || "",
      publicationReach: c.publicationReach || "",
      publicationAuthority: c.publicationAuthority !== undefined ? String(c.publicationAuthority) : "",
      journalistAuthority: c.journalistAuthority !== undefined ? String(c.journalistAuthority) : "",
      confidence: c.confidence || "",
      lastVerifiedAt: c.lastVerifiedAt ? new Date(c.lastVerifiedAt).toISOString().split("T")[0] : ""
    });
    setShowContactModal(true);
  };
  const saveContact = async () => {
    if (!canWriteMediaDatabase || (editingContact && !canManageCollectionItem(editingContact, isMaster, canWriteMediaDatabase, session?.username)) || (!contactForm.firstName.trim() && !contactForm.lastName.trim()) || contactSaving) return;
    setContactSaving(true);
    try {
      const payload = {
        ...contactForm,
        beats: contactForm.beats.split(",").map(s => s.trim()).filter(Boolean),
        sectors: contactForm.sectors.split(",").map(s => s.trim()).filter(Boolean),
        publicationAuthority: contactForm.publicationAuthority || undefined,
        journalistAuthority: contactForm.journalistAuthority || undefined,
      };
      const resp = editingContact
        ? await fetch(`${apiBase()}/api/store/media-db/contacts/${editingContact.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`${apiBase()}/api/store/media-db/contacts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (resp.ok) { setShowContactModal(false); await loadData(); }
    } catch {}
    setContactSaving(false);
  };
  const deleteContact = async (id: number) => {
    const contact = contacts.find((item) => item.id === id);
    if (!contact || !canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username)) return;
    setDeletingContactId(id);
    try {
      await fetch(`${apiBase()}/api/store/media-db/contacts/${id}`, { method: "DELETE", credentials: "include" });
      await loadData();
    } catch {}
    setDeletingContactId(null);
  };
  const recheckSource = async (contact: Contact) => {
    if (!canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username)) return;
    setSourceCheckingId(contact.id); setSourceActionError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts/${contact.id}/source-check`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check this source.");
      await loadData();
      setShowContactProfile((current) => current?.id === contact.id ? { ...current, sourceCheck: data.sourceCheck, sourceStatus: data.sourceCheck.outcome } : current);
    } catch (error) { setSourceActionError(error instanceof Error ? error.message : "Could not check this source."); }
    setSourceCheckingId(null);
  };
  const approveSourceUpdates = async (contact: Contact) => {
    if (!canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username) || !contact.sourceCheck) return;
    const fields = contact.sourceCheck.differences.filter((difference) => difference.supported && difference.observedValue).map((difference) => difference.field);
    if (!fields.length) return;
    setSourceCheckingId(contact.id); setSourceActionError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts/${contact.id}/source-checks/${contact.sourceCheck.id}/approve`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not apply these updates.");
      setShowContactProfile(null);
      await loadData();
    } catch (error) { setSourceActionError(error instanceof Error ? error.message : "Could not apply these updates."); }
    setSourceCheckingId(null);
  };

  const setContactStatus = async (contact: Contact, status: "active" | "departed") => {
    if (!canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username)) return;
    setStatusBusyId(contact.id);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts/${contact.id}/status`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Could not update contact status.");
      setSearchResults((current) => current.map((result) => result.type === "contact" && result.id === contact.id
        ? { ...result, contact: { ...result.contact, lifecycleStatus: status } } : result));
      await loadData();
    } finally { setStatusBusyId(null); }
  };

  const submitCorrection = async () => {
    if (!correctionContact || !canManageCollectionItem(correctionContact, isMaster, canWriteMediaDatabase, session?.username) || !correctionFields.length || !correctionDetails.trim()) return;
    setCorrectionBusy(true);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts/${correctionContact.id}/corrections`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: correctionFields, details: correctionDetails }),
      });
      if (!response.ok) throw new Error("Could not submit this report.");
      setSearchResults((current) => current.map((result) => result.type === "contact" && result.id === correctionContact.id
        ? { ...result, contact: { ...result.contact, hasPendingCorrection: true } } : result));
      setCorrectionContact(null); setCorrectionFields([]); setCorrectionDetails("");
    } finally { setCorrectionBusy(false); }
  };

  const resolveCorrection = async (report: CorrectionReport, outcome: "accepted" | "rejected" | "resolved") => {
    const note = correctionResolutionNotes[report.id]?.trim() ?? "";
    if (!note) return;
    setCorrectionResolvingId(report.id);
    setCorrectionQueueError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/corrections/${report.id}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note, ...(outcome === "accepted" && report.sourceCheck ? { sourceCheckId: report.sourceCheck.id } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not resolve this correction.");
      setCorrectionReports((current) => current.filter((item) => item.id !== report.id));
      setCorrectionResolutionNotes((current) => { const next = { ...current }; delete next[report.id]; return next; });
      await loadData();
    } catch (error) {
      setCorrectionQueueError(error instanceof Error ? error.message : "Could not resolve this correction.");
    } finally {
      setCorrectionResolvingId(null);
    }
  };

  const checkCorrectionSource = async (report: CorrectionReport) => {
    setCorrectionResolvingId(report.id);
    setCorrectionQueueError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/corrections/${report.id}/source-check`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check this source.");
      await loadCorrectionQueue();
    } catch (error) {
      setCorrectionQueueError(error instanceof Error ? error.message : "Could not check this source.");
    } finally {
      setCorrectionResolvingId(null);
    }
  };

  const sourceBadge = (contact: Contact) => {
    const labels = { current: "Current", due: "Due for review", unavailable: "Unavailable", changed: "Changed", unverified: "Unverified" };
    const colors = {
      current: { color: "#166534", background: "#DCFCE7" }, due: { color: "#92400E", background: "#FEF3C7" },
      unavailable: { color: "#991B1B", background: "#FEE2E2" }, changed: { color: "#9D174D", background: "#FCE7F3" },
      unverified: { color: "#475569", background: "#F1F5F9" },
    };
    const status = contact.sourceStatus ?? (contact.sourceUrl ? "due" : "unverified");
    return <div className="mt-1">
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold" style={colors[status]}>
        {contact.sourceCheckQueued ? "Check queued" : labels[status]}
      </span>
      {contact.sourceUrl && contact.sourceReviewDueAt && (
        <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>
          {new Date(contact.sourceReviewDueAt).getTime() <= Date.now() ? "Review overdue" : `Next review ${new Date(contact.sourceReviewDueAt).toLocaleDateString()}`}
        </p>
      )}
    </div>;
  };

  const recordVerificationBadge = (contact: Contact, includeSourceStatus = true) => {
    if (!isUploadedMediaContact(contact)) return sourceBadge(contact);
    const completeness = contactCompletenessPercent(contact);
    return <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ color: "#166534", background: "#DCFCE7" }}
        title="Verified as a record supplied through an approved Media Database upload."
      >
        Verified upload
      </span>
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={completeness >= 80
          ? { color: "#166534", background: "#ECFDF5" }
          : { color: "#92400E", background: "#FEF3C7" }}
      >
        {completeness >= 80 ? `Complete (${completeness}%)` : `${completeness}% complete`}
      </span>
      {includeSourceStatus && sourceBadge(contact)}
    </div>;
  };

  const fetchAllContactsForExport = async (): Promise<Contact[]> => {
    const pageSize = 200;
    const all: Contact[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (all.length < total && page <= 500) {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: contactSort,
        direction: contactDirection,
      });
      if (contactSearch.trim()) params.set("q", contactSearch.trim());
      if (contactCategoryFilter) params.set("category", contactCategoryFilter);
      if (contactCountryFilter) params.set("country", contactCountryFilter);
      if (contactOutletFilter) params.set("outletId", contactOutletFilter);
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not prepare the contact export.");
      const data = await response.json() as { contacts?: Contact[]; total?: number };
      const pageRows = Array.isArray(data.contacts) ? data.contacts : [];
      all.push(...pageRows);
      total = Number.isFinite(Number(data.total)) ? Number(data.total) : all.length;
      if (pageRows.length === 0) break;
      page += 1;
    }
    // Outlet filtering is retained locally as a compatibility guard while
    // older API deployments add the outletId query contract.
    return contactOutletFilter
      ? all.filter((contact) => String(contact.outletId ?? "") === contactOutletFilter)
      : all;
  };

  const fetchAllSearchContactsForExport = async (): Promise<Contact[]> => {
    const pageSize = 100;
    const all: Contact[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (all.length < total && page <= 1000) {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchPhrase.trim()) params.set("phrase", searchPhrase.trim());
      if (searchTopic.trim()) params.set("topic", searchTopic.trim());
      if (searchLocation.trim()) params.set("location", searchLocation.trim());
      if (searchCategory) params.set("category", searchCategory);
      if (searchAuthority) params.set("authority", searchAuthority);
      const response = await fetch(`${apiBase()}/api/store/media-db/search?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not prepare the search export.");
      const data = await response.json() as { results?: UnifiedResult[]; total?: number };
      const pageRows = (Array.isArray(data.results) ? data.results : [])
        .flatMap((result) => result.type === "contact" ? [result.contact] : []);
      all.push(...pageRows);
      total = Number.isFinite(Number(data.total)) ? Number(data.total) : all.length;
      if (pageRows.length === 0) break;
      page += 1;
    }
    return all;
  };

  // Export contacts. Filtered exports deliberately fetch every matching API
  // page instead of exporting only the currently visible page.
  const exportContacts = async (format: "xlsx" | "word", selectedRows?: Contact[]) => {
    setExportBusy(true);
    setExportError("");
    try {
      const rows = selectedRows ?? await fetchAllContactsForExport();
      if (format === "xlsx") {
        const csvContent = [CONTACT_EXPORT_COLUMNS, ...rows.map(contactExportRow)]
          .map((row) => row.map(csvCell).join(",")).join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "Media Contacts.csv";
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = CONTACT_EXPORT_COLUMNS.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
        const body = rows.map((contact) => {
          const values = contactExportRow(contact);
          return `<tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
        }).join("");
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Media Contacts</title><style>body{font-family:Arial,sans-serif;font-size:12px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top;}th{background:#102B36;color:#fff;}</style></head><body><h2 style="font-family:Georgia,serif;color:#102B36;">Media Contacts</h2><table><tr>${headers}</tr>${body}</table></body></html>`;
        const blob = new Blob([html], { type: "application/msword" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "Media Contacts.doc";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not prepare the contact export.");
    } finally {
      setExportBusy(false);
    }
  };

  const exportSearchContacts = async (format: "xlsx" | "word") => {
    setExportBusy(true);
    setExportError("");
    try {
      const rows = await fetchAllSearchContactsForExport();
      // Search exports use the same rich schema and sanitisation as database
      // exports while retaining the exact filtered result set.
      if (format === "xlsx") {
        const csvContent = [CONTACT_EXPORT_COLUMNS, ...rows.map(contactExportRow)]
          .map((row) => row.map(csvCell).join(",")).join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "Media Search results.csv";
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = CONTACT_EXPORT_COLUMNS.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
        const body = rows.map((contact) => `<tr>${contactExportRow(contact).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Media Search results</title></head><body><h2>Media Search results</h2><table border="1"><tr>${headers}</tr>${body}</table></body></html>`;
        const blob = new Blob([html], { type: "application/msword" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "Media Search results.doc";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not prepare the search export.");
    } finally {
      setExportBusy(false);
    }
  };

  const outletOptions = outlets.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name));
  const showCollectionTools = activeTab === "outlets" || activeTab === "contacts";

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Database size={24} color="#ffffff" />
          <h1 className="text-[28px] font-semibold mb-1" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Media Database</h1>
        </div>
         <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>Search publications and journalists from the shared Master collection or your private workspace collection.</p>
      </div>
      {loadError && <div role="alert" className="mb-4 rounded-xl border bg-white px-4 py-3 text-[13px]" style={{ borderColor: "#FECACA", color: vars.red }}>
        {loadError} <button onClick={() => void loadData()} className="ml-2 font-semibold underline">Try again</button>
      </div>}

      {showCollectionTools && <section className="mb-5 rounded-2xl border bg-white shadow-sm" style={{ borderColor: vars.g200 }}>
        <div className="p-4 sm:p-5">
          <label htmlFor="media-primary-search" className="block text-[12px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: vars.navy }}>Search contacts and publications</label>
          <div className="flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: vars.g200 }}>
            <Search size={18} color={vars.g400} />
            <input id="media-primary-search" value={searchPhrase} onChange={(event) => { setSearchPhrase(event.target.value); setSearchPage(1); }} placeholder="Enter an exact LLM phrase, journalist or publication" className="w-full py-3 text-[14px] outline-none" />
            {searchPhrase && <button aria-label="Clear search phrase" onClick={() => setSearchPhrase("")}><X size={16} color={vars.g400} /></button>}
            <button onClick={runSearch} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Search</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>
              <Tag size={13} /> Refine interpretation <ChevronDown size={13} className={showFilters ? "rotate-180" : ""} />
            </button>
            {[searchTopic && `Topic: ${searchTopic}`, searchLocation && `Location: ${searchLocation}`, searchCategory && `Category: ${searchCategory}`, searchAuthority && `Authority: ${searchAuthority}+`].filter(Boolean).map((label) => <span key={label as string} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: vars.g100, color: vars.navy }}>{label}</span>)}
            {searchActive && <button onClick={() => { setSearchPhrase(""); setSearchTopic(""); setSearchLocation(""); setSearchCategory(""); setSearchAuthority(""); setSearchPage(1); }} className="text-[12px] font-semibold underline" style={{ color: vars.g500 }}>Clear all</button>}
          </div>
          {showFilters && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl p-3" style={{ background: vars.g50 }}>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Topic<input value={searchTopic} onChange={(e) => { setSearchTopic(e.target.value); setSearchPage(1); }} placeholder="e.g. fintech" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }} /></label>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Location<input value={searchLocation} onChange={(e) => { setSearchLocation(e.target.value); setSearchPage(1); }} placeholder="e.g. London or UK" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }} /></label>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Category<select value={searchCategory} onChange={(e) => { setSearchCategory(e.target.value); setSearchPage(1); }} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }}><option value="">Any category</option>{allCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Minimum authority<input type="number" min="0" max="100" value={searchAuthority} onChange={(e) => { setSearchAuthority(e.target.value); setSearchPage(1); }} placeholder="0-100" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }} /></label>
          </div>}
        </div>
        <div className="border-t px-4 py-3 flex flex-wrap gap-2 justify-between" style={{ borderColor: vars.g100, background: vars.g50 }}>
          <span className="text-[11px]" style={{ color: vars.g500 }}>Database management</span>
          <div className="flex flex-wrap gap-2">
            {canWriteMediaDatabase && <>
              <button onClick={openAddContact} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white" style={{ background: vars.accent }}><Plus size={13} /> Add contact</button>
              <button onClick={openAddOutlet} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}><Building2 size={13} /> Add publication</button>
              <button onClick={openImport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}><Upload size={13} /> Import</button>
            </>}
          </div>
        </div>
      </section>}

      {showCollectionTools && searchActive && <section className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[13px]" style={{ color: vars.g500 }}>{searchLoading ? "Searching..." : resultMessage || `${searchTotal} results: ${searchCounts.contacts} contacts and ${searchCounts.outlets} publications`}</p>
           {searchResults.some((result) => result.type === "contact") && <button disabled={exportBusy} onClick={() => void exportSearchContacts("xlsx")} className="inline-flex items-center gap-1.5 text-[12px] font-semibold disabled:opacity-50" style={{ color: vars.navy }}><Download size={13} /> Export all matches</button>}
         </div>
         {exportError && <p className="mb-3 rounded-lg bg-white px-3 py-2 text-[12px]" style={{ color: vars.red }}>{exportError}</p>}
         {resultMessage && !searchLoading && <button onClick={runSearch} className="mb-3 text-[12px] font-semibold underline" style={{ color: vars.accent }}>Retry search</button>}
         <div className="space-y-3" aria-live="polite">
          {searchResults.map((result) => {
            const isContact = result.type === "contact";
            const contact = isContact ? result.contact : null;
            const outlet = !isContact ? result.outlet : null;
            return <article key={`${result.type}-${result.id}`} className="rounded-2xl border bg-white p-4 sm:p-5" style={{ borderColor: contact?.lifecycleStatus === "departed" ? "#F59E0B" : vars.g200 }}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: isContact ? "rgba(31,116,143,0.1)" : "rgba(201,160,78,0.18)", color: isContact ? vars.accent : "#7A5E25" }}>{isContact ? "Contact" : "Publication"}</span>
                    {contact?.lifecycleStatus === "departed" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Departed</span>}
                    {contact?.hasPendingCorrection && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">Correction pending</span>}
                  </div>
                  <h2 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{contact ? `${contact.firstName} ${contact.lastName}`.trim() : outlet?.name}</h2>
                  <p className="mt-1 text-[13px]" style={{ color: vars.g600 }}>{contact ? [contact.role || "Editorial contact", contact.outletName].filter(Boolean).join(" at ") : [outlet?.category, outlet?.country].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {result.authority > 0 && <span className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold" style={{ borderColor: vars.g200, color: vars.navy }}>Authority {result.authority}</span>}
                   {contact && recordVerificationBadge(contact)}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{result.matchedFields.map((field) => <span key={field} className="rounded-md bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">Matched {field}</span>)}{result.matchedPhrases.map((phrase) => <span key={phrase} className="rounded-md bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-900">Exact phrase: “{phrase}”</span>)}</div>
              <ul className="mt-3 space-y-1 text-[12px]" style={{ color: vars.g600 }}>{result.reasons.map((reason) => <li key={reason} className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0" color={vars.accent} />{reason}</li>)}</ul>
              <div className="mt-4 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: vars.g100 }}>
                {contact && <><button onClick={() => setShowContactProfile(contact)} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>View profile</button>
                  {canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username) && <>
                    <button disabled={statusBusyId === contact.id} onClick={() => void setContactStatus(contact, contact.lifecycleStatus === "departed" ? "active" : "departed")} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.g600 }}>{contact.lifecycleStatus === "departed" ? "Mark active" : "Mark as departed"}</button>
                    <button onClick={() => { setCorrectionContact(contact); setCorrectionFields([]); setCorrectionDetails(""); }} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.g600 }}>Flag incorrect details</button>
                  </>}
                </>}
                {outlet?.website && <a href={outlet.website.startsWith("http") ? outlet.website : `https://${outlet.website}`} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Visit publication</a>}
              </div>
            </article>;
          })}
          {!searchLoading && !resultMessage && searchResults.length === 0 && <div className="rounded-2xl border bg-white py-12 text-center" style={{ borderColor: vars.g200 }}><Search size={28} className="mx-auto mb-2" color={vars.g300} /><p className="font-semibold" style={{ color: vars.navy }}>No matching contacts or publications</p><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Clear a filter or broaden the topic.</p></div>}
        </div>
        {searchTotal > 25 && <div className="flex justify-end items-center gap-3 mt-3 text-[12px]" style={{ color: vars.navy }}><button disabled={searchPage === 1} onClick={() => setSearchPage((page) => page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button><span>Page {searchPage} of {Math.ceil(searchTotal / 25)}</span><button disabled={searchPage * 25 >= searchTotal} onClick={() => setSearchPage((page) => page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button></div>}
      </section>}

      {(!searchActive || !showCollectionTools) && <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: vars.g100 }}>
        {([
          { id: "outlets" as const, label: `Outlets (${outlets.length})` },
          { id: "contacts" as const, label: `Contacts (${contacts.length})` },
          ...(canSeeDiscoveries ? [{ id: "discoveries" as const, label: "Discoveries" }] : []),
          ...(isMaster && canWriteMediaDatabase ? [{ id: "corrections" as const, label: `Corrections (${correctionReports.length})` }] : []),
          ...(canEditDiscoveryInstructions ? [{ id: "instructions" as const, label: "Research instructions" }] : []),
        ]).map(({ id: t, label }) => (
          <button key={t} onClick={() => setActiveTab(t)} className="px-5 py-2 rounded-lg text-[13px] font-bold transition-all capitalize" style={{ background: activeTab === t ? "rgba(201,160,78,0.18)" : "transparent", color: activeTab === t ? "#7A5E25" : vars.g500, boxShadow: activeTab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none", border: activeTab === t ? `1px solid ${vars.gold}` : "1px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "discoveries" && canSeeDiscoveries && <MediaDiscoveryReview onApproved={() => void loadData()} />}
      {activeTab === "corrections" && isMaster && canWriteMediaDatabase && (
        <section>
          <div className="mb-4">
            <h2 className="text-[20px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Contact correction queue</h2>
            <p className="mt-1 text-[12px]" style={{ color: vars.g500 }}>Compare each report with saved source evidence. Accepted changes only apply fields supported by that evidence.</p>
          </div>
          {correctionQueueError && <p className="mb-3 rounded-lg border bg-red-50 px-3 py-2 text-[12px] text-red-700" style={{ borderColor: "#FECACA" }}>{correctionQueueError}</p>}
          {correctionQueueLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin" color={vars.accent} /></div>
          ) : correctionReports.length === 0 ? (
            <div className="rounded-2xl border bg-white py-12 text-center" style={{ borderColor: vars.g200 }}><CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-600" /><p className="font-semibold" style={{ color: vars.navy }}>No pending corrections</p></div>
          ) : (
            <div className="space-y-4">
              {correctionReports.map((report) => {
                const supportedFields = new Set((report.sourceCheck?.differences ?? []).filter((difference) => difference.supported && difference.observedValue).map((difference) => difference.field));
                const canAccept = report.fields.some((field) => supportedFields.has(field));
                const busy = correctionResolvingId === report.id;
                return <article key={report.id} className="rounded-2xl border bg-white p-5" style={{ borderColor: vars.g200 }}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold" style={{ color: vars.navy }}>{`${report.contact.firstName} ${report.contact.lastName}`.trim() || "Unnamed contact"}</h3>
                      <p className="text-[12px]" style={{ color: vars.g500 }}>{[report.contact.role, report.contact.outletName].filter(Boolean).join(" at ") || "No role or publication recorded"}</p>
                    </div>
                    <time className="text-[11px]" style={{ color: vars.g500 }}>{new Date(report.createdAt).toLocaleString()}</time>
                  </div>
                  <dl className="mt-4 grid gap-3 rounded-xl p-4 sm:grid-cols-2" style={{ background: vars.g50 }}>
                    <div><dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Workspace</dt><dd className="mt-1 text-[12px]" style={{ color: vars.navy }}>{report.workspace}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Reporter</dt><dd className="mt-1 text-[12px]" style={{ color: vars.navy }}>{report.reporter.name || report.reporter.email || report.reporter.id}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Fields</dt><dd className="mt-1 flex flex-wrap gap-1">{report.fields.map((field) => <span key={field} className="rounded bg-white px-2 py-1 text-[11px]" style={{ color: vars.navy }}>{field}</span>)}</dd></div>
                    <div><dt className="text-[10px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Current values</dt><dd className="mt-1 text-[11px]" style={{ color: vars.g600 }}>{report.fields.map((field) => `${field}: ${String(report.contact[field as keyof typeof report.contact] ?? "Not set")}`).join(" · ")}</dd></div>
                  </dl>
                  <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Report details</p><p className="mt-1 whitespace-pre-wrap text-[13px]" style={{ color: vars.g600 }}>{report.details}</p></div>
                  <div className="mt-4 rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold" style={{ color: vars.navy }}>Source evidence</p>
                      {report.contact.sourceUrl && <button disabled={busy} onClick={() => void checkCorrectionSource(report)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}><RefreshCw size={12} /> {report.sourceCheck ? "Check again" : "Run source check"}</button>}
                    </div>
                    {!report.contact.sourceUrl ? <p className="mt-2 text-[12px] text-amber-700">No public source is recorded. The report can be rejected or resolved without changing trusted data.</p>
                      : !report.sourceCheck ? <p className="mt-2 text-[12px]" style={{ color: vars.g500 }}>No saved source check yet.</p>
                        : <><p className="mt-2 text-[11px]" style={{ color: vars.g500 }}>{report.sourceCheck.outcome} · checked {new Date(report.sourceCheck.checkedAt).toLocaleString()}</p>
                          {report.sourceCheck.observedEvidence?.excerpt && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-[11px]" style={{ color: vars.g600 }}>{report.sourceCheck.observedEvidence.excerpt}</p>}
                          {(report.sourceCheck.differences ?? []).map((difference) => <div key={difference.field} className="mt-2 text-[11px]" style={{ color: vars.g600 }}><strong>{difference.field}:</strong> {difference.storedValue || "Not set"} → {difference.observedValue || "Not found"} {difference.supported ? <span className="text-emerald-700">(supported)</span> : <span className="text-amber-700">(not supported)</span>}</div>)}</>}
                  </div>
                  <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Audit note<textarea rows={3} value={correctionResolutionNotes[report.id] ?? ""} onChange={(event) => setCorrectionResolutionNotes((current) => ({ ...current, [report.id]: event.target.value }))} className="mt-1 w-full rounded-lg border p-3 text-[13px] font-normal normal-case" style={{ borderColor: vars.g200 }} placeholder="Record what you checked and why you chose this outcome." /></label>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button disabled={busy || !correctionResolutionNotes[report.id]?.trim()} onClick={() => void resolveCorrection(report, "rejected")} className="rounded-lg border px-3 py-2 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.red }}>Reject</button>
                    <button disabled={busy || !correctionResolutionNotes[report.id]?.trim()} onClick={() => void resolveCorrection(report, "resolved")} className="rounded-lg border px-3 py-2 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}>Resolve without change</button>
                    <button disabled={busy || !correctionResolutionNotes[report.id]?.trim() || !canAccept} onClick={() => void resolveCorrection(report, "accepted")} title={canAccept ? "Apply source-supported reported fields" : "Run a source check that supports a reported field before accepting"} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: vars.accent }}>Accept supported update</button>
                  </div>
                </article>;
              })}
            </div>
          )}
        </section>
      )}
      {activeTab === "instructions" && canEditDiscoveryInstructions && <MediaDiscoveryInstructions />}

      {/* Outlets tab */}
      {activeTab === "outlets" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border bg-white" style={{ borderColor: vars.g200 }}>
            <div className="flex-1 min-w-[250px] flex items-center gap-2 mb-1">
               <Search size={16} className="text-slate-400" />
               <input value={outletSearch} onChange={(e) => { setOutletSearch(e.target.value); setOutletPage(1); }} placeholder="Search outlets by name or category..." className="px-3 py-2 rounded-lg border text-[13px] w-full outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
            </div>
            <select value={outletCatFilter} onChange={(e) => { setOutletCatFilter(e.target.value); setOutletPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] outline-none bg-white" style={{ borderColor: vars.g200, color: outletCatFilter ? vars.navy : "inherit" }}>
              <option value="">All categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => { setActiveTab("outlets"); browseResults("outlets"); }} className="rounded-lg border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.accent, color: vars.accent }}>Browse publications</button>
             {canWriteMediaDatabase && <button onClick={openAddOutlet} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors" style={{ background: vars.accent }}>
               <Plus size={14} /> Add outlet
             </button>}
          </div>
          {outletTotal > 50 && <div className="flex justify-end items-center gap-3 mb-3 text-[12px]" style={{ color: vars.navy }}>
            <button disabled={outletPage === 1} onClick={() => setOutletPage((page) => page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button>
            <span>Page {outletPage} of {Math.ceil(outletTotal / 50)}</span>
            <button disabled={outletPage * 50 >= outletTotal} onClick={() => setOutletPage((page) => page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>}

          {filteredOutlets.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Building2 size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No outlets yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add publications to build your media database.</p>
               {canWriteMediaDatabase && <button onClick={openAddOutlet} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>Add your first outlet</button>}
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Publication</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Category</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Country</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Reach</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Website</th>
                    <th className="px-4 py-3" style={{ color: vars.navy }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutlets.map((o) => (
                    <tr key={o.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: vars.navy }}>{o.name}</p>
                        {o.description && <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>{o.description.slice(0, 80)}{o.description.length > 80 ? "…" : ""}</p>}
                        {isSharedCollection(o) && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(31,116,143,0.1)", color: vars.accent }}>Shared collection</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: vars.g600 }}>{o.category}</td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: vars.g600 }}>{o.country}</td>
                      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: vars.g600 }}>{o.reachBand}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {o.website && <a href={o.website.startsWith("http") ? o.website : `https://${o.website}`} target="_blank" rel="noopener noreferrer" className="text-[11px] underline" style={{ color: vars.accent }}>{o.website.replace(/^https?:\/\//, "").slice(0, 30)}</a>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                           {canManageCollectionItem(o, isMaster, canWriteMediaDatabase, session?.username) && <>
                            <button onClick={() => openEditOutlet(o)} className="p-1.5 rounded-lg hover:bg-gray-50" title="Edit"><PenLine size={13} color={vars.g400} /></button>
                            <button onClick={() => { if (window.confirm(`Delete "${o.name}"?`)) void deleteOutlet(o.id); }} disabled={deletingOutletId === o.id} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={13} color={deletingOutletId === o.id ? vars.g300 : vars.red} /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contacts tab */}
      {activeTab === "contacts" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border bg-white" style={{ borderColor: vars.g200 }}>
            <div className="w-full flex items-center gap-2 mb-1">
               <Search size={16} className="text-slate-400" />
               <input value={contactSearch} onChange={(e) => { setContactSearch(e.target.value); setContactPage(1); }} placeholder="Natural language search (e.g. 'tech reporters in London')" className="px-3 py-2 rounded-lg border text-[13px] flex-1 min-w-[250px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
               <button onClick={() => { setActiveTab("contacts"); browseResults("contacts"); }} className="rounded-lg border px-3 py-2 text-[12px] font-semibold whitespace-nowrap" style={{ borderColor: vars.accent, color: vars.accent }}>Browse contacts</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full">
              <select value={contactCategoryFilter} onChange={(e) => { setContactCategoryFilter(e.target.value); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="">All categories</option>{allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={contactCountryFilter} onChange={(e) => { setContactCountryFilter(e.target.value); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="">All locations</option>
                <option value="UK">United Kingdom</option>
                <option value="US">United States</option>
                <option value="EU">Europe</option>
                <option value="Global">Global</option>
              </select>
              <select value={contactOutletFilter} onChange={(e) => setContactOutletFilter(e.target.value)} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200, color: contactOutletFilter ? vars.navy : "inherit" }}>
                <option value="">All outlets</option>
                {outletOptions.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </select>
              <select value={`${contactSort}:${contactDirection}`} onChange={(e) => { const [sort, direction] = e.target.value.split(":"); setContactSort(sort); setContactDirection(direction as "asc" | "desc"); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="lastName:asc">Name A-Z</option><option value="lastName:desc">Name Z-A</option><option value="outletName:asc">Outlet A-Z</option><option value="createdAt:desc">Newest</option>
              </select>
              {(contactSearch || contactCategoryFilter || contactCountryFilter || contactOutletFilter) && <button onClick={() => { setContactSearch(""); setContactCategoryFilter(""); setContactCountryFilter(""); setContactOutletFilter(""); setContactPage(1); }} className="px-3 py-2 rounded-lg text-[12px] font-medium text-slate-500 hover:text-slate-700 transition-colors">Clear filters</button>}
              <div className="flex-1"></div>
               {canWriteMediaDatabase && <>
                 <button onClick={openAddContact} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors" style={{ background: vars.accent }}>
                   <Plus size={14} /> Add contact
                 </button>
                 <button onClick={openImport} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold border bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.gold, color: vars.navy }}>
                   <Upload size={14} className="text-amber-600" /> Import CSV
                 </button>
               </>}
               {contactTotal > 0 && (
                <div className="flex items-center gap-1 border-l pl-2 ml-1" style={{ borderColor: vars.g200 }}>
                  <button disabled={exportBusy} onClick={() => void exportContacts("xlsx")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} className="text-slate-400" /> Excel</button>
                  <button disabled={exportBusy} onClick={() => void exportContacts("word")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}><FileText size={13} className="text-slate-400" /> Word</button>
                </div>
              )}
            </div>
          </div>

          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Users size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No contacts yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add journalists and PR contacts to your database.</p>
               {canWriteMediaDatabase && <button onClick={openAddContact} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>Add your first contact</button>}
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <div className="px-4 py-2 text-[12px]" style={{ color: vars.g500, background: vars.g50 }}>Showing {filteredContacts.length} of {contactTotal} contacts</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Role</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Outlet</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Email</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Phone</th>
                    <th className="text-left px-4 py-3 font-semibold hidden xl:table-cell" style={{ color: vars.navy }}>Notes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: vars.navy }}>{`${c.firstName} ${c.lastName}`.trim()}</p>
                         {c.outletCategory && <p className="text-[11px] font-light" style={{ color: vars.g500 }}>{c.outletCategory}</p>}
                         {isSharedCollection(c) && <span className="inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "rgba(31,116,143,0.1)", color: vars.accent }}>Shared collection</span>}
                         {recordVerificationBadge(c)}
                         {(c.beats?.length || c.sectors?.length || c.seniority || c.editorialStatus) && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>{[c.beats?.length ? `Beats: ${c.beats.join(", ")}` : "", c.sectors?.length ? `Sectors: ${c.sectors.join(", ")}` : "", c.seniority, c.editorialStatus].filter(Boolean).join(" · ")}</p>}
                         {(c.reach || c.reachBand || c.authority !== undefined || c.authorityScore !== undefined || c.confidence || c.confidenceLevel) && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>{[c.reach || c.reachBand ? `Reach: ${c.reach || c.reachBand}` : "", c.authority ?? c.authorityScore !== undefined ? `Authority: ${c.authority ?? c.authorityScore}` : "", c.confidence || c.confidenceLevel ? `Confidence: ${c.confidence || c.confidenceLevel}` : ""].filter(Boolean).join(" · ")}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: vars.g600 }}>{c.role}</td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: vars.g600 }}>{c.outletName}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {c.email && (isSendableContactEmail(c.email)
                          ? <a href={`mailto:${c.email}`} className="underline" style={{ color: vars.accent }}>{c.email}</a>
                          : <span title="Review required before sending">{c.email} <span className="text-[10px] text-amber-700">Review - not sendable</span></span>)}
                         {c.mobile && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>Mobile: {c.mobile}</p>}
                         {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="block text-[10px] underline mt-1" style={{ color: vars.accent }}>LinkedIn</a>}
                         {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="block text-[10px] underline mt-1" style={{ color: vars.accent }}>Source</a>}
                         {c.lastVerifiedAt && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>Verified {new Date(c.lastVerifiedAt).toLocaleDateString()}</p>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: vars.g600 }}>{c.phone}</td>
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[180px]">
                        {c.notes && <p className="text-[11px] font-light truncate" style={{ color: vars.g500 }} title={c.notes}>{c.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setShowContactProfile(c)} className="px-2 py-1 text-[11px] font-medium rounded border hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>View Profile</button>
                            {canManageCollectionItem(c, isMaster, canWriteMediaDatabase, session?.username) && <>
                             <button onClick={() => openEditContact(c)} className="p-1.5 rounded-lg hover:bg-gray-50" title="Edit"><PenLine size={13} color={vars.g400} /></button>
                             <button onClick={() => { if (window.confirm(`Delete ${c.firstName} ${c.lastName}?`)) void deleteContact(c.id); }} disabled={deletingContactId === c.id} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={13} color={deletingContactId === c.id ? vars.g300 : vars.red} /></button>
                           </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
           {exportError && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px]" style={{ color: vars.red }}>{exportError}</p>}
           {contactTotal > 50 && <div className="flex justify-end items-center gap-3 mt-3 text-[12px]" style={{ color: vars.navy }}><button disabled={contactPage === 1} onClick={() => setContactPage((page) => page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button><span>Page {contactPage} of {Math.ceil(contactTotal / 50)}</span><button disabled={contactPage * 50 >= contactTotal} onClick={() => setContactPage((page) => page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button></div>}
        </div>
      )}
      </>}

      {showCollectionTools && correctionContact && <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setCorrectionContact(null)} onKeyDown={(event) => { if (event.key === "Escape") setCorrectionContact(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="correction-title" className="bg-white rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3"><h2 id="correction-title" className="text-[17px] font-semibold" style={{ color: vars.navy }}>Flag incorrect contact details</h2><button aria-label="Close correction report" onClick={() => setCorrectionContact(null)} className="p-1"><X size={18} color={vars.g400} /></button></div>
          <p className="text-[12px] mt-1 mb-4" style={{ color: vars.g500 }}>This sends a review request. It does not overwrite the trusted record.</p>
          <fieldset><legend className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: vars.g500 }}>Fields to review</legend><div className="grid grid-cols-2 gap-2">{[["firstName", "first name"], ["lastName", "last name"], ["role", "role"], ["email", "email"], ["phone", "phone"], ["outletId", "publication"], ["linkedinUrl", "LinkedIn"], ["sourceUrl", "source"]].map(([field, label]) => <label key={field} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={correctionFields.includes(field)} onChange={(event) => setCorrectionFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />{label}</label>)}</div></fieldset>
          <label className="block mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>What is incorrect?<textarea autoFocus rows={4} value={correctionDetails} onChange={(event) => setCorrectionDetails(event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-[13px] font-normal normal-case" style={{ borderColor: vars.g200 }} /></label>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setCorrectionContact(null)} className="px-4 py-2 rounded-lg border text-[13px] font-semibold" style={{ borderColor: vars.g200 }}>Cancel</button><button disabled={correctionBusy || !correctionFields.length || !correctionDetails.trim()} onClick={() => void submitCorrection()} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50" style={{ background: vars.accent }}>Submit for review</button></div>
        </div>
      </div>}

      {showCollectionTools && showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <div>
                <h2 className="text-[17px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Import media contacts</h2>
                <p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Review the CSV or XLSX before anything is added. Existing contacts are not overwritten.</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 space-y-5">
              {!importResult && !importJob && (
                <>
                  <label className="block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer" style={{ borderColor: vars.g200, background: vars.g50 }}>
                    <Upload size={24} className="mx-auto mb-2" color={vars.accent} />
                    <span className="block text-[13px] font-semibold" style={{ color: vars.navy }}>{importFileName || "Choose a CSV or XLSX file"}</span>
                    <span className="block text-[11px] mt-1" style={{ color: vars.g500 }}>CSV up to 2 MB. XLSX up to 12 MB and 50,000 rows.</span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
                        const maximumSize = isXlsx ? 12 * 1024 * 1024 : 2 * 1024 * 1024;
                        if (file.size > maximumSize) {
                          setImportError(isXlsx ? "XLSX files must be 12 MB or smaller." : "CSV files must be 2 MB or smaller.");
                          return;
                        }
                        if (isXlsx) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = reader.result;
                            if (typeof result !== "string") { setImportError("Could not read this XLSX file."); return; }
                            const base64 = result.includes(",") ? result.split(",")[1] : result;
                            void previewImport({ xlsxBase64: base64 }, file.name);
                          };
                          reader.onerror = () => setImportError("Could not read this XLSX file.");
                          reader.readAsDataURL(file);
                        } else void file.text().then((csv) => previewImport({ csv }, file.name));
                      }}
                    />
                  </label>
                  <fieldset className="rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
                    <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>Collection target</legend>
                    <p className="text-[12px] mb-3" style={{ color: vars.g500 }}>
                      {isMaster && canWriteMediaDatabase
                        ? "Choose whether this import is centrally managed for every account or private to the active workspace."
                        : "Imports from this account are private to the active workspace."}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Collection target">
                       {isMaster && canWriteMediaDatabase && (
                        <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer" style={{ borderColor: importCollectionScope === "shared" ? vars.accent : vars.g200, background: importCollectionScope === "shared" ? "rgba(31,116,143,0.06)" : "white" }}>
                          <input
                            type="radio"
                            name="media-import-collection-scope"
                            value="shared"
                            aria-label="Shared collection"
                            checked={importCollectionScope === "shared"}
                            onChange={() => {
                              setImportCollectionScope("shared");
                               if (importPayload && importFileName) void previewImport(importPayload, importFileName, "shared", importCategory);
                            }}
                          />
                          <span>
                            <span className="block text-[13px] font-semibold" style={{ color: vars.navy }}>Shared collection</span>
                            <span className="block text-[11px] mt-0.5" style={{ color: vars.g500 }}>Master-managed and available to every account's search and recommendations.</span>
                          </span>
                        </label>
                      )}
                      <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer" style={{ borderColor: importCollectionScope === "workspace" ? vars.accent : vars.g200, background: importCollectionScope === "workspace" ? "rgba(31,116,143,0.06)" : "white" }}>
                        <input
                          type="radio"
                          name="media-import-collection-scope"
                          value="workspace"
                          aria-label="Workspace private collection"
                          checked={importCollectionScope === "workspace"}
                          onChange={() => {
                            setImportCollectionScope("workspace");
                             if (importPayload && importFileName) void previewImport(importPayload, importFileName, "workspace", importCategory);
                          }}
                        />
                        <span>
                          <span className="block text-[13px] font-semibold" style={{ color: vars.navy }}>Workspace private</span>
                          <span className="block text-[11px] mt-0.5" style={{ color: vars.g500 }}>Only available to this workspace and its permitted members.</span>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Category for imported outlets</label>
                     <select value={importCategory} onChange={(e) => {
                       const category = e.target.value;
                       setImportCategory(category);
                       // Category affects outlet reconciliation and therefore
                       // invalidates the previous review token/outcomes.
                       if (importPayload && importFileName) void previewImport(importPayload, importFileName, importCollectionScope, category);
                     }} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }}>
                      <option value="">No category</option>
                      {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>This is only applied to newly created outlets.</p>
                  </div>
                </>
              )}

              {importBusy && !importJob && <div className="flex items-center gap-2 text-[13px]" style={{ color: vars.g500 }}><Loader2 size={16} className="animate-spin" /> {importPreview ? "Starting the import job..." : "Parsing workbook..."}</div>}
              {importError && <div className="rounded-lg px-4 py-3 text-[12px] flex gap-2" style={{ background: "rgba(180,50,50,0.08)", color: vars.red }}><AlertTriangle size={15} className="shrink-0" />{importError}</div>}

              {importJob && !importResult && importJob.status !== "failed" && (
                <div className="rounded-xl border p-5" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <div className="flex items-center gap-3">
                    <Loader2 size={20} className="animate-spin" color={vars.accent} />
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: vars.navy }}>
                        {importJob.status === "parsing" ? "Parsing workbook"
                          : importJob.status === "reconciliation" ? "Reconciling contacts and publications"
                            : "Committing import"}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>You can close this window or reload the page. This import will continue and its saved result will appear here.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Import progress">
                    {(["parsing", "reconciliation", "committing"] as const).map((stage, index) => {
                      const currentIndex = ["parsing", "reconciliation", "committing"].indexOf(importJob.status);
                      return <div key={stage} className="rounded-lg px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide" style={{ background: index <= currentIndex ? "rgba(31,116,143,0.12)" : "white", color: index <= currentIndex ? vars.accent : vars.g400 }}>{stage}</div>;
                    })}
                  </div>
                </div>
              )}

              {importJob?.status === "failed" && (
                <button onClick={resetImport} className="rounded-lg border px-4 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Start a new import</button>
              )}

              {importPreview && !importResult && !importJob && (
                <div className="space-y-4">
                   <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: vars.accent }}><CheckCircle2 size={15} /> Reconciliation complete</div>
                   <div className="rounded-xl border px-4 py-3" style={{ borderColor: importPreview.collectionScope === "shared" ? vars.accent : vars.g200, background: importPreview.collectionScope === "shared" ? "rgba(31,116,143,0.06)" : vars.g50 }}>
                     <div className="flex items-start gap-2">
                       <ShieldCheck size={16} className="mt-0.5 shrink-0" color={vars.accent} />
                       <div>
                         <p className="text-[12px] font-bold" style={{ color: vars.navy }}>Import target: {importPreview.collectionScope === "shared" ? "Shared collection" : "Workspace private"}</p>
                         <p className="text-[11px] mt-0.5" style={{ color: vars.g500 }}>
                           Owner: {importPreview.owner || (importPreview.collectionScope === "shared" ? "Master" : session?.companyName || session?.username || "Current workspace")}
                         </p>
                         <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>
                           {importPreview.collectionScope === "shared" ? "This collection will be available to all accounts for search and recommendations." : "This collection will remain private to the active workspace."}
                         </p>
                       </div>
                     </div>
                     {importPreview.scopeInventory && Object.keys(importPreview.scopeInventory).length > 0 && (
                       <div className="rounded-xl border px-4 py-3" style={{ borderColor: vars.g200 }}>
                         <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Current target inventory</p>
                         <div className="mt-2 flex flex-wrap gap-2">
                           {Object.entries(importPreview.scopeInventory).map(([key, value]) => (
                             typeof value === "object" && value !== null
                               ? <span key={key} className="rounded-md bg-slate-50 px-2 py-1 text-[11px]" style={{ color: vars.g600 }}>{key}: {Object.entries(value).map(([nestedKey, nestedValue]) => `${nestedKey} ${nestedValue}`).join(", ")}</span>
                               : <span key={key} className="rounded-md bg-slate-50 px-2 py-1 text-[11px]" style={{ color: vars.g600 }}>{key}: {String(value ?? "")}</span>
                           ))}
                         </div>
                       </div>
                     )}
                     {(importPreview.recordTypeCounts || importPreview.sectorCounts) && (
                       <div className="rounded-xl border px-4 py-3" style={{ borderColor: vars.g200 }}>
                         <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.g500 }}>Workbook dimensions</p>
                         <div className="mt-2 grid sm:grid-cols-2 gap-3 text-[11px]" style={{ color: vars.g600 }}>
                           {importPreview.recordTypeCounts && <div><span className="font-semibold">Record types:</span> {Object.entries(importPreview.recordTypeCounts).map(([key, value]) => `${key} ${value}`).join(", ")}</div>}
                           {importPreview.sectorCounts && <div><span className="font-semibold">Sectors:</span> {Object.entries(importPreview.sectorCounts).map(([key, value]) => `${key} ${value}`).join(", ")}</div>}
                         </div>
                       </div>
                     )}
                     {importPreview.reviewToken && (
                       <fieldset className="rounded-xl border p-4" style={{ borderColor: vars.gold, background: "rgba(201,160,78,0.06)" }}>
                         <legend className="px-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: vars.navy }}>Reviewer acknowledgement</legend>
                         <label className="flex items-start gap-2 text-[12px]" style={{ color: vars.g600 }}>
                           <input type="checkbox" aria-label="Acknowledge import target ownership" checked={importTargetAcknowledged} onChange={(event) => setImportTargetAcknowledged(event.target.checked)} />
                           <span>I confirm that I own or am authorised to import into the server-resolved {importPreview.collectionScope === "shared" ? "shared Master" : "private workspace"} collection shown above.</span>
                         </label>
                         {Number(importPreview.conflicted ?? importPreview.conflicts ?? 0) > 0 && (
                           <label className="flex items-start gap-2 mt-3 text-[12px]" style={{ color: vars.g600 }}>
                             <input type="checkbox" aria-label="Acknowledge import conflicts" checked={importConflictsAcknowledged} onChange={(event) => setImportConflictsAcknowledged(event.target.checked)} />
                             <span>I have reviewed the {importPreview.conflicted ?? importPreview.conflicts} conflicted row{(importPreview.conflicted ?? importPreview.conflicts) === 1 ? "" : "s"} and accept the reconciliation outcomes.</span>
                           </label>
                         )}
                       </fieldset>
                     )}
                   </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ["New", importPreview.new ?? importPreview.importableRows],
                      ["Refreshed", importPreview.refreshed ?? 0],
                      ["Unchanged", importPreview.unchanged ?? importPreview.duplicateRows],
                      ["Duplicate", importPreview.duplicate ?? importPreview.duplicateRows],
                       ["Publications", importPreview.publicationRows ?? 0],
                       ["Matched", importPreview.matchedExisting ?? 0],
                      ["Invalid", importPreview.invalid ?? importPreview.invalidRows],
                      ["Conflicted", importPreview.conflicted ?? importPreview.conflicts ?? 0],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border p-3" style={{ borderColor: vars.g200 }}>
                        <p className="text-[20px] font-semibold" style={{ color: vars.navy }}>{value}</p>
                        <p className="text-[11px]" style={{ color: vars.g500 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  {importPreview.sample.length > 0 && (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
                      <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ background: vars.g50, color: vars.g500 }}>Preview</div>
                      {importPreview.sample.map((row) => (
                         <div key={`${row.sheetName || ""}-${row.sourceRow}`} className="px-4 py-2 border-t grid grid-cols-[1fr_1fr] gap-3 text-[12px]" style={{ borderColor: vars.g100 }}>
                          <span style={{ color: vars.navy }}>{`${row.firstName} ${row.lastName}`.trim() || row.email}</span>
                          <span style={{ color: vars.g500 }}>{row.outletName}{row.role ? ` · ${row.role}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {importPreview.errors.length > 0 && (
                    <details className="rounded-xl border px-4 py-3" style={{ borderColor: vars.g200 }}>
                      <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: vars.navy }}>Review skipped rows</summary>
                      <div className="mt-2 space-y-1">
                         {importPreview.errors.map((error) => <p key={`${error.sheetName || ""}-${error.row}-${error.message}`} className="text-[11px]" style={{ color: vars.g500 }}>{error.sheetName ? `${error.sheetName} · ` : ""}Row {error.row}: {error.message}</p>)}
                      </div>
                    </details>
                  )}
                   {importOutcomesWithErrors(importPreview.rowOutcomes, importPreview.errors).length ? (
                     <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: vars.g200 }}>
                       <p className="text-[11px]" style={{ color: vars.g500 }}>The reconciliation worker returned {importOutcomesWithErrors(importPreview.rowOutcomes, importPreview.errors).length} row outcomes. The download contains source row and status only, not contact details.</p>
                       <button onClick={() => downloadRowOutcomes(importOutcomesWithErrors(importPreview.rowOutcomes, importPreview.errors))} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Download outcomes</button>
                     </div>
                   ) : null}
                </div>
              )}

              {importResult && (
                <div className="rounded-xl p-5 text-center" style={{ background: "rgba(31,116,143,0.08)" }}>
                  <CheckCircle2 size={30} className="mx-auto mb-2" color={vars.accent} />
                  <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>Import complete</p>
                  <p className="text-[12px] mt-2" style={{ color: vars.g500 }}>
                     Added {importResult.contactsCreated} contacts and {importResult.outletsCreated} outlets. Processed {importResult.publicationsProcessed ?? 0} publications. Refreshed {importResult.refreshed ?? 0}; unchanged {importResult.unchanged ?? 0}; skipped {importResult.duplicatesSkipped} duplicates.
                  </p>
                   {importResult.rowOutcomes?.length ? <button onClick={() => downloadRowOutcomes(importResult.rowOutcomes)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Download row outcomes</button> : null}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g500 }}>{importResult || importJob ? "Close" : "Cancel"}</button>
              {importPreview && !importResult && !importJob && (
                  <button onClick={() => void importContacts()} disabled={importBusy || !importPlanHasWork(importPreview) || Boolean(importPreview.reviewToken && (!importTargetAcknowledged || (Number(importPreview.conflicted ?? importPreview.conflicts ?? 0) > 0 && !importConflictsAcknowledged)))} className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent, opacity: importBusy || !importPlanHasWork(importPreview) || Boolean(importPreview.reviewToken && (!importTargetAcknowledged || (Number(importPreview.conflicted ?? importPreview.conflicts ?? 0) > 0 && !importConflictsAcknowledged))) ? 0.5 : 1 }}>
                   {importBusy ? "Importing..." : importPreview.importableRows > 0 ? `Import ${importPreview.importableRows} contacts` : importPreview.publicationRows ? `Import ${importPreview.publicationRows} publications` : "Apply refresh plan"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Outlet modal */}
      {showCollectionTools && showOutletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowOutletModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{editingOutlet ? "Edit outlet" : "Add outlet"}</h2>
              <button onClick={() => setShowOutletModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {[
                { label: "Publication name *", key: "name", placeholder: "e.g. PR Week" },
                { label: "Website", key: "website", placeholder: "e.g. prweek.com" },
                { label: "Country", key: "country", placeholder: "e.g. United Kingdom" },
                { label: "Reach / audience size", key: "reachBand", placeholder: "e.g. 50k–100k, National, Niche" },
                { label: "Description", key: "description", placeholder: "Brief description of the publication" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                  {key === "description" ? (
                    <textarea rows={2} value={outletForm[key as keyof typeof outletForm]} onChange={(e) => setOutletForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] resize-none" style={{ borderColor: vars.g200 }} />
                  ) : (
                    <input value={outletForm[key as keyof typeof outletForm]} onChange={(e) => setOutletForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Category</label>
                <div className="flex gap-2">
                  <select value={outletForm.category} onChange={(e) => setOutletForm((f) => ({ ...f, category: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }}>
                    <option value="">Choose a category...</option>
                    {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowOutletModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button onClick={() => void saveOutlet()} disabled={!outletForm.name.trim() || outletSaving} className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent, opacity: !outletForm.name.trim() || outletSaving ? 0.5 : 1 }}>
                {outletSaving ? "Saving..." : editingOutlet ? "Save changes" : "Add outlet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {showCollectionTools && showContactProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowContactProfile(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: vars.g200, background: vars.g50 }}>
              <div className="flex items-center gap-2">
                <User size={18} color={vars.accent} />
                <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Journalist Profile</h2>
              </div>
              <button onClick={() => setShowContactProfile(null)} className="text-[20px] leading-none px-2 text-slate-400 hover:text-slate-700 transition-colors">&times;</button>
            </div>
            <div className="overflow-y-auto">
              <div className="px-5 pt-4">
                <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                         <div className="flex flex-wrap items-center gap-2">
                           <span className="text-[12px] font-bold" style={{ color: vars.navy }}>Database record</span>
                           {recordVerificationBadge(showContactProfile, false)}
                         </div>
                         <div className="flex items-center gap-2 mt-3"><span className="text-[12px] font-bold" style={{ color: vars.navy }}>Public source health</span><span className="text-[10px] uppercase tracking-wide" style={{ color: vars.g500 }}>Page verification</span>{sourceBadge(showContactProfile)}</div>
                      <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>
                        {!showContactProfile.sourceUrl ? "No public source is attached to this contact."
                          : showContactProfile.sourceCheck ? `Last checked ${new Date(showContactProfile.sourceCheck.checkedAt).toLocaleString()}`
                            : "This source has not been checked yet."}
                      </p>
                         {showContactProfile.sourceUrl && <p className="text-[11px] mt-1 break-all" style={{ color: vars.g600 }}>
                           Source URL: <a href={showContactProfile.sourceUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>{showContactProfile.sourceUrl}</a>
                         </p>}
                    </div>
                    {canManageCollectionItem(showContactProfile, isMaster, canWriteMediaDatabase, session?.username) && showContactProfile.sourceUrl && <button onClick={() => void recheckSource(showContactProfile)} disabled={sourceCheckingId === showContactProfile.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><RefreshCw size={13} className={sourceCheckingId === showContactProfile.id ? "animate-spin" : ""} />Check source now</button>}
                  </div>
                  {sourceActionError && <p className="text-[11px] mt-3" style={{ color: vars.red }}>{sourceActionError}</p>}
                  {showContactProfile.sourceCheck?.outcome === "unavailable" && <p className="text-[12px] mt-3 text-red-700">{showContactProfile.sourceCheck.errorCode === "page_missing" ? "The saved page could not be found." : "The saved page could not be reached."} Your contact details have not been changed.</p>}
                  {!!showContactProfile.sourceCheck?.differences.length && (
                    <div className="mt-3 space-y-2">
                      {showContactProfile.sourceCheck.differences.map((difference) => <div key={difference.field} className="text-[12px] rounded-lg bg-white border px-3 py-2" style={{ borderColor: vars.g200 }}>
                        <span className="font-semibold capitalize">{difference.field}: </span>
                        {difference.kind === "removed" && !difference.observedValue ? `The saved ${difference.field} is no longer shown on the source.`
                          : <>{difference.storedValue || "(blank)"} → {difference.observedValue}</>}
                      </div>)}
                      {canManageCollectionItem(showContactProfile, isMaster, canWriteMediaDatabase, session?.username) && !showContactProfile.sourceCheck.reviewedAt && showContactProfile.sourceCheck.differences.some((difference) => difference.supported && difference.observedValue) && <button onClick={() => void approveSourceUpdates(showContactProfile)} disabled={sourceCheckingId === showContactProfile.id} className="px-3 py-2 rounded-lg text-white text-[12px] font-semibold" style={{ background: vars.accent }}>Accept supported updates</button>}
                    </div>
                  )}
                </div>
              </div>
              {(showContactProfile.sourceRef || profileImportFilename || profileImportSheet || profileImportRow) && (
                <div className="px-5 pt-3">
                  <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "#FFFBEB" }}>
                    <p className="text-[12px] font-bold" style={{ color: vars.navy }}>Workbook assertion</p>
                    <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>Imported workbook values are recorded separately from later page verification. They are not evidence that the linked page currently shows the same details.</p>
                    <dl className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-2 text-[12px]" style={{ color: vars.g600 }}>
                      {showContactProfile.sourceRef && <div><dt className="font-semibold">Source reference</dt><dd>{showContactProfile.sourceRef}</dd></div>}
                      {profileImportFilename && <div><dt className="font-semibold">Workbook</dt><dd>{profileImportFilename}</dd></div>}
                      {profileImportSheet && <div><dt className="font-semibold">Sheet</dt><dd>{profileImportSheet}</dd></div>}
                      {profileImportRow && <div><dt className="font-semibold">Workbook row</dt><dd>{profileImportRow}</dd></div>}
                    </dl>
                  </div>
                </div>
              )}
              {showContactProfile.sourceCheck && (
                <div className="px-5 pt-3">
                  <div className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: "#F8FAFC" }}>
                    <p className="text-[12px] font-bold" style={{ color: vars.navy }}>Page check evidence</p>
                    <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>Observed values below come from the cited page check at {new Date(showContactProfile.sourceCheck.checkedAt).toLocaleString()}; they do not rewrite workbook assertions without review.</p>
                    {showContactProfile.sourceCheck.observedEvidence.excerpt && <p className="mt-2 text-[12px]" style={{ color: vars.g600 }}>{showContactProfile.sourceCheck.observedEvidence.excerpt}</p>}
                    {showContactProfile.sourceCheck.observedEvidence.observedRole && <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Observed role: {showContactProfile.sourceCheck.observedEvidence.observedRole}</p>}
                    {showContactProfile.sourceCheck.observedEvidence.observedEmails.length > 0 && <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Observed email values: {showContactProfile.sourceCheck.observedEvidence.observedEmails.join(", ")}</p>}
                  </div>
                </div>
              )}
              <RecommendationCard
                item={{
                  rank: 0,
                  score: 100, // Or whatever placeholder score since it's just a profile view
                  reasons: [],
                  contact: showContactProfile,
                }}
                isShortlist={true}
                 onEdit={canManageCollectionItem(showContactProfile, isMaster, canWriteMediaDatabase, session?.username) ? () => {
                   setShowContactProfile(null);
                   openEditContact(showContactProfile);
                 } : undefined}
                showMatchScore={false}
              />
            </div>
            <div className="px-6 py-4 border-t flex justify-end bg-slate-50" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowContactProfile(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-white border shadow-sm hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showCollectionTools && showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowContactModal(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{editingContact ? "Edit contact" : "Add contact"}</h2>
              <button onClick={() => setShowContactModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Basic Details */}
              <section>
                <h3 className="text-[14px] font-semibold text-slate-800 border-b pb-2 mb-4" style={{ borderColor: vars.g100 }}>Basic Details</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: "First name", key: "firstName", placeholder: "Jane" },
                    { label: "Last name", key: "lastName", placeholder: "Smith" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                      <input value={contactForm[key as keyof typeof contactForm] as string} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Publication / outlet</label>
                  <SearchableOutletPicker
                    outlets={outletOptions}
                    value={contactForm.outletId}
                    onChange={(id) => setContactForm((f) => ({ ...f, outletId: id }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Role / title", key: "role", placeholder: "e.g. Senior Reporter" },
                    { label: "Seniority", key: "seniority", placeholder: "e.g. Director" },
                    { label: "Editorial Status", key: "editorialStatus", placeholder: "e.g. Active" },
                    { label: "Geography / Location", key: "geography", placeholder: "e.g. London" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                      <input value={contactForm[key as keyof typeof contactForm] as string} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                    </div>
                  ))}
                </div>
              </section>

              {/* Contact & Social */}
              <section>
                <h3 className="text-[14px] font-semibold text-slate-800 border-b pb-2 mb-4" style={{ borderColor: vars.g100 }}>Contact & Social</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Email", key: "email", placeholder: "jane@publication.com" },
                    { label: "Phone", key: "phone", placeholder: "+44 7700 000000" },
                    { label: "Mobile", key: "mobile", placeholder: "+44 7700 000001" },
                    { label: "Language", key: "language", placeholder: "e.g. English" },
                    { label: "LinkedIn URL", key: "linkedinUrl", placeholder: "https://linkedin.com/in/..." },
                    { label: "Twitter Handle", key: "twitterHandle", placeholder: "@handle" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                      <input value={contactForm[key as keyof typeof contactForm] as string} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                    </div>
                  ))}
                </div>
              </section>

              {/* Coverage Areas */}
              <section>
                <h3 className="text-[14px] font-semibold text-slate-800 border-b pb-2 mb-4" style={{ borderColor: vars.g100 }}>Coverage Areas</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Beats (comma separated)</label>
                    <input value={contactForm.beats} onChange={(e) => setContactForm((f) => ({ ...f, beats: e.target.value }))} placeholder="e.g. Technology, AI, Startups" className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Sectors (comma separated)</label>
                    <input value={contactForm.sectors} onChange={(e) => setContactForm((f) => ({ ...f, sectors: e.target.value }))} placeholder="e.g. FinTech, B2B SaaS" className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                  </div>
                </div>
              </section>

              {/* Advanced & Intel */}
              <section>
                <h3 className="text-[14px] font-semibold text-slate-800 border-b pb-2 mb-4" style={{ borderColor: vars.g100 }}>Advanced & Intelligence</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: "Journalist Authority", key: "journalistAuthority", placeholder: "0 - 100", type: "number" },
                    { label: "Publication Authority", key: "publicationAuthority", placeholder: "0 - 100", type: "number" },
                    { label: "Publication Reach", key: "publicationReach", placeholder: "e.g. 1M - 5M" },
                    { label: "Confidence", key: "confidence", placeholder: "High, Medium, Low" },
                    { label: "Source URL", key: "sourceUrl", placeholder: "https://..." },
                    { label: "Source Reference", key: "sourceRef", placeholder: "e.g. MuckRack, Live Discovery" },
                  ].map(({ label, key, placeholder, type }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                      <input type={type || "text"} value={contactForm[key as keyof typeof contactForm] as string} onChange={(e) => setContactForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Last Verified Date</label>
                    <input type="date" value={contactForm.lastVerifiedAt} onChange={(e) => setContactForm((f) => ({ ...f, lastVerifiedAt: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Notes / Review Info</label>
                  <textarea rows={3} value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any useful context, relationship history, or media opportunity details..." className="w-full px-3 py-2 rounded-lg border text-[13px] resize-none outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
                </div>
              </section>
            </div>

            <div className="px-6 py-4 border-t flex gap-2 justify-end bg-slate-50" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setShowContactModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>Cancel</button>
              <button onClick={() => void saveContact()} disabled={(!contactForm.firstName.trim() && !contactForm.lastName.trim()) || contactSaving} className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-50" style={{ background: vars.accent }}>
                {contactSaving ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div> Saving...</> : editingContact ? "Save changes" : "Save contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category picker for outlet form */}
      {showCollectionTools && showCatPicker && (
        <CategoryPickerModal
          all={TRADE_MEDIA_CATEGORIES}
          selected={outletForm.category ? [outletForm.category] : []}
          projectSet={projectCategories}
          onClose={() => setShowCatPicker(false)}
          onSave={(next) => { setOutletForm((f) => ({ ...f, category: next[next.length - 1] ?? "" })); setShowCatPicker(false); }}
        />
      )}
    </div>
  );
}

export { MediaDatabasePage };
export type { Outlet };

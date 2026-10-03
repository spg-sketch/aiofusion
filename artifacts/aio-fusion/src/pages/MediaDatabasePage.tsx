import { useState, useEffect, useRef } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, User,
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
import MediaDiscoveryReview from "./MediaDiscoveryReview";
import MediaDiscoveryInstructions from "./MediaDiscoveryInstructions";
import { MediaExportDownload, type MediaExportFormat } from "./MediaExportDownload";
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
type Outlet = { id: number; name: string; category: string; website: string; description: string; country: string; reachBand: string; linkedinUrl?: string | null; verifiedAuthority?: string | number | null; journalists?: Contact[]; linkedJournalists?: Contact[] } & CollectionOwnedItem;
type UnifiedResult =
  | { type: "contact"; id: number; contact: Contact; matchedFields: string[]; matchedPhrases: string[]; reasons: string[]; authority: number }
  | { type: "outlet"; id: number; outlet: Outlet; matchedFields: string[]; matchedPhrases: string[]; reasons: string[]; authority: number };

type MediaSearchCriteria = {
  phrase: string;
  topic: string;
  location: string;
  category: string;
  authority: string;
  type: "contacts" | "publications";
  scope: "all" | "added" | "saved";
};

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

const MEDIA_BOOKMARK_PAGE_SIZE = 100;
const MEDIA_BOOKMARK_MAX_PAGES = 100;
const MEDIA_BOOKMARK_MAX_COUNT = MEDIA_BOOKMARK_PAGE_SIZE * MEDIA_BOOKMARK_MAX_PAGES;

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

export const PUBLICATION_EXPORT_COLUMNS = [
  "Publication", "Sector", "Region", "Description", "Website", "LinkedIn URL",
  "Source reach value", "Verified authority", "Linked journalist names", "Linked journalist emails",
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

export function publicationExportRow(outlet: Outlet): string[] {
  const journalists = (outlet.linkedJournalists ?? outlet.journalists ?? [])
    .filter((journalist) => journalist.lifecycleStatus !== "departed");
  return [
    outlet.name,
    outlet.category,
    outlet.country,
    outlet.description,
    publicationWebsiteHref(outlet.website) || "",
    outlet.linkedinUrl || "",
    outlet.reachBand ? `Source reach value: ${outlet.reachBand}` : "",
    outlet.verifiedAuthority ?? "",
    journalists.map((journalist) => `${journalist.firstName} ${journalist.lastName}`.trim()).filter(Boolean).join("; "),
    journalists.map((journalist) => journalist.email).filter((email) => email && isSendableContactEmail(email)).join("; "),
  ].map((value) => String(value ?? ""));
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

export function publicationWebsiteHref(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || /^\d+(?:[.,]\d+)?$/.test(candidate)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (!/^https?:$/.test(url.protocol) || !/[a-z]/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function contactDisplayName(contact: Pick<Contact, "firstName" | "lastName">): string {
  const name = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
  return name && !/^\d+(?:[.,]\d+)?$/.test(name) ? name : "Name not available";
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

function isCurrentWorkspaceItem(item: CollectionOwnedItem, username?: string | null): boolean {
  return Boolean(username && item.accountId && item.accountId.toLowerCase() === username.toLowerCase());
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
  const [activeTab, setActiveTab] = useState<"outlets" | "contacts" | "identityReview" | "discoveries" | "corrections" | "instructions">("contacts");
  const [internalToolsOpen, setInternalToolsOpen] = useState(false);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [identityReviewContacts, setIdentityReviewContacts] = useState<Contact[]>([]);
  const [identityReviewTotal, setIdentityReviewTotal] = useState(0);
  const [identityReviewPage, setIdentityReviewPage] = useState(1);
  const [identityReviewLoading, setIdentityReviewLoading] = useState(false);
  const [identityReviewError, setIdentityReviewError] = useState("");
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const loadRequestSequence = useRef(0);
  const searchRequestSequence = useRef(0);
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
  const [searchType, setSearchType] = useState<"contacts" | "publications">("contacts");
  const [searchScope, setSearchScope] = useState<"all" | "added" | "saved">("all");
  const [completedSearch, setCompletedSearch] = useState<MediaSearchCriteria | null>(null);
  const [savedMedia, setSavedMedia] = useState<Set<string>>(new Set());
  const [bookmarkError, setBookmarkError] = useState("");
  const [bookmarkBusy, setBookmarkBusy] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [correctionContact, setCorrectionContact] = useState<Contact | null>(null);
  const [correctionFields, setCorrectionFields] = useState<string[]>([]);
  const [correctionDetails, setCorrectionDetails] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionConfirmation, setCorrectionConfirmation] = useState("");
  const [correctionReports, setCorrectionReports] = useState<CorrectionReport[]>([]);
  const [correctionQueueLoading, setCorrectionQueueLoading] = useState(false);
  const [correctionQueueError, setCorrectionQueueError] = useState("");
  const [correctionResolutionNotes, setCorrectionResolutionNotes] = useState<Record<number, string>>({});
  const [correctionResolvingId, setCorrectionResolvingId] = useState<number | null>(null);

  const [showOutletModal, setShowOutletModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  // Reach is temporarily hidden, but retained in form state for unrelated edits.
  const [outletForm, setOutletForm] = useState({ name: "", category: "", website: "", description: "", country: "", reachBand: "", linkedinUrl: "" });
  const [outletSaving, setOutletSaving] = useState(false);
  const [deletingOutletId, setDeletingOutletId] = useState<number | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);
  const [showContactProfile, setShowContactProfile] = useState<Contact | null>(null);
  const [sourceReviewContact, setSourceReviewContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState({
    outletId: "", outletName: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "",
    mobile: "", linkedinUrl: "", twitterHandle: "", beats: "", sectors: "", geography: "",
    language: "", seniority: "", editorialStatus: "", sourceUrl: "", sourceRef: "",
    publicationReach: "", publicationAuthority: "", journalistAuthority: "", confidence: "",
    lastVerifiedAt: ""
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaveError, setContactSaveError] = useState("");
  const [contactSaveConfirmation, setContactSaveConfirmation] = useState("");
  const [savedContact, setSavedContact] = useState<Contact | null>(null);
  const mountedRef = useRef(true);
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
  const [exportFormat, setExportFormat] = useState<MediaExportFormat>("xlsx");
  const [exportError, setExportError] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [showManagement, setShowManagement] = useState(false);
  const importPreviewSequence = useRef(0);
  const importJobStorageKey = `aio.media-import-job:${session?.username || "anonymous"}`;
  const projectCategories = getProjectMediaCategories();
  const loadData = async (requestedMode = resultMode, requestedTab = activeTab) => {
    const workspace = session?.username;
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
        requests.push(fetch(`${apiBase()}/api/store/media-db/outlets?page=1&pageSize=1`, { credentials: "include", signal: controller.signal }));
      }
      const [catR, optionalR, outletCountR] = await Promise.all(requests);
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
      const outletCountData = outletCountR?.ok ? await outletCountR.json() : null;
      if (!mountedRef.current || getLocalSession()?.username !== workspace || sequence !== loadRequestSequence.current) return;
      // Custom categories are workspace-scoped too; only the current request
      // may hydrate either metadata or contact results.
      if (catR.ok && categoryData) {
        const custom: string[] = (categoryData.custom ?? []).map((c: { name: string }) => c.name);
        const merged = Array.from(new Set([...(categoryData.standard ?? TRADE_MEDIA_CATEGORIES), ...custom])).sort((a, b) => a.localeCompare(b));
        setAllCategories(merged);
      }
      if (outletData) {
        setOutlets(outletData.outlets ?? []);
        setOutletTotal(outletData.total ?? outletData.outlets?.length ?? 0);
      }
      if (contactData) {
        setContacts(contactData.contacts ?? []);
        setContactTotal(contactData.total ?? contactData.contacts?.length ?? 0);
      }
      if (outletCountData) setOutletTotal(outletCountData.total ?? 0);
      if (!catR.ok || !categoryData) {
        setLoadError("Filters are temporarily unavailable. You can still search or browse.");
      }
      if (requestedMode === "search") setResultRefreshToken((value) => value + 1);
    } catch (error) {
      controller.abort();
      if (!mountedRef.current || getLocalSession()?.username !== workspace || sequence !== loadRequestSequence.current) return;
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
    mountedRef.current = true;
    setContacts([]);
    setContactTotal(0);
    setOutlets([]);
    setOutletTotal(0);
    setAllCategories([]);
    setSavedContact(null);
    setShowContactProfile(null);
    setContactSaveConfirmation("");
    setShowContactModal(false);
    setContactSaving(false);
    setContactSaveError("");
    void loadData();
    return () => {
      mountedRef.current = false;
      loadRequestSequence.current += 1;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
    };
  }, [session?.username]);

  useEffect(() => {
    if (searchLocation && searchLocation !== "UK" && searchLocation !== "US") setSearchLocation("");
    if (contactCountryFilter && contactCountryFilter !== "UK" && contactCountryFilter !== "US") setContactCountryFilter("");
  }, [searchLocation, contactCountryFilter]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSavedMedia(new Set());
    setBookmarkError("");
    void (async () => {
      try {
        const saved = new Set<string>();
        let total: number | null = null;
        let loaded = 0;
        for (let page = 1; page <= MEDIA_BOOKMARK_MAX_PAGES; page += 1) {
          const params = new URLSearchParams({ page: String(page), pageSize: String(MEDIA_BOOKMARK_PAGE_SIZE) });
          const response = await fetch(`${apiBase()}/api/store/media-db/bookmarks?${params}`, {
            credentials: "include",
            signal: controller.signal,
          });
          let data: unknown;
          try {
            data = await response.json();
          } catch {
            throw new Error("The saved media response could not be read.");
          }
          if (!response.ok) {
            const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
              ? data.error
              : "Could not load saved media.";
            throw new Error(message);
          }
          if (cancelled) return;
          const envelope = !Array.isArray(data) && typeof data === "object" && data !== null
            ? data as Record<string, unknown>
            : null;
          const bookmarks = Array.isArray(data)
            ? data
            : Array.isArray(envelope?.bookmarks)
              ? envelope.bookmarks
              : Array.isArray(envelope?.items)
                ? envelope.items
                : null;
          if (!bookmarks) throw new Error("The saved media response was not recognized.");
          if (envelope && Object.prototype.hasOwnProperty.call(envelope, "total")) {
            const pageTotal = envelope.total;
            if (!Number.isSafeInteger(pageTotal) || Number(pageTotal) < 0) {
              throw new Error("The saved media response contained an invalid total.");
            }
            if (total !== null && total !== pageTotal) {
              throw new Error("The saved media list changed while it was loading. Try again.");
            }
            total = Number(pageTotal);
            if (total > MEDIA_BOOKMARK_MAX_COUNT) {
              throw new Error(`Your saved media exceeds the safe loading limit of ${MEDIA_BOOKMARK_MAX_COUNT.toLocaleString()} items. Narrow your saved collection and try again.`);
            }
          }
          if (bookmarks.length > MEDIA_BOOKMARK_PAGE_SIZE) {
            throw new Error("The saved media response exceeded the requested page size.");
          }
          for (const row of bookmarks) {
            if (typeof row !== "object" || row === null) {
              throw new Error("The saved media response contained an invalid bookmark.");
            }
            const bookmark = row as Record<string, unknown>;
            if (bookmark.type !== "contact" && bookmark.type !== "publication") {
              throw new Error("The saved media response contained an unsupported record type.");
            }
            const rawId = bookmark.targetId ?? bookmark.id;
            const id = typeof rawId === "number"
              ? rawId
              : typeof rawId === "string" && /^\d+$/.test(rawId)
                ? Number(rawId)
                : Number.NaN;
            if (!Number.isSafeInteger(id) || id < 1) {
              throw new Error("The saved media response contained an invalid target ID.");
            }
            saved.add(`${bookmark.type}:${id}`);
          }
          loaded += bookmarks.length;
          if (total !== null) {
            if (loaded > total) throw new Error("The saved media response contained more items than its total.");
            if (loaded === total) break;
            if (bookmarks.length === 0) throw new Error("The saved media response ended before all items were loaded.");
          } else if (bookmarks.length < MEDIA_BOOKMARK_PAGE_SIZE) {
            break;
          }
          if (page === MEDIA_BOOKMARK_MAX_PAGES) {
            throw new Error(`The saved media list may exceed the safe loading limit of ${MEDIA_BOOKMARK_MAX_COUNT.toLocaleString()} items. Narrow your saved collection and try again.`);
          }
        }
        if (cancelled) return;
        setSavedMedia(saved);
        setBookmarkError("");
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setBookmarkError(error instanceof Error ? error.message : "Saved media could not be loaded. Try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session?.username]);

  useEffect(() => {
    setSelectedMedia(new Set());
    setExportError("");
  }, [session?.username, session?.role, session?.membershipRole]);

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

  const loadIdentityReview = async (page = identityReviewPage) => {
    if (!isMaster || !canWriteMediaDatabase) return;
    setIdentityReviewLoading(true);
    setIdentityReviewError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50", q: "" });
      const response = await fetch(`${apiBase()}/api/store/media-db/identity-review?${params}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load identity review records.");
      setIdentityReviewContacts(Array.isArray(data.contacts) ? data.contacts : []);
      setIdentityReviewTotal(Number(data.total) || 0);
    } catch (error) {
      setIdentityReviewError(error instanceof Error ? error.message : "Could not load identity review records.");
    } finally {
      setIdentityReviewLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "corrections") void loadCorrectionQueue();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "identityReview" && isMaster && canWriteMediaDatabase) void loadIdentityReview(identityReviewPage);
  }, [activeTab, identityReviewPage, isMaster, canWriteMediaDatabase]);

  const searchActive = resultMode === "search";
  const runSearch = () => {
    searchRequestSequence.current += 1;
    setCompletedSearch(null);
    setSearchLoading(true);
    setShowManagement(false);
    setSelectedMedia(new Set());
    setResultMode("search");
    setSearchPage(1);
    setResultMessage("");
    setResultRefreshToken((value) => value + 1);
  };
  useEffect(() => {
    if (!searchActive) return;
    const sequence = ++searchRequestSequence.current;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    const criteria: MediaSearchCriteria = {
      phrase: searchPhrase, topic: searchTopic, location: searchLocation,
      category: searchCategory, authority: searchAuthority, type: searchType, scope: searchScope,
    };
    const params = new URLSearchParams({ page: String(searchPage), pageSize: "25" });
    if (searchPhrase.trim()) params.set("phrase", searchPhrase.trim());
    params.set("type", searchType);
    params.set("scope", searchScope);
    if (searchTopic.trim()) params.set("topic", searchTopic.trim());
    if (searchLocation.trim()) params.set("location", searchLocation.trim());
    if (searchCategory) params.set("category", searchCategory);
    if (searchAuthority) params.set("authority", searchAuthority);
    setSearchLoading(true);
    setCompletedSearch(null);
    setResultMessage("");
    fetch(`${apiBase()}/api/store/media-db/search?${params}`, { credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not search the media database.")))
      .then((data) => {
        if (sequence !== searchRequestSequence.current) return;
        setSearchResults(data.results ?? []); setSearchTotal(data.total ?? 0);
        setSearchCounts(data.counts ?? { contacts: 0, outlets: 0 });
        setCompletedSearch(criteria);
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          if (timedOut && sequence === searchRequestSequence.current) setResultMessage("Search timed out. Try again.");
          return;
        }
        if (sequence === searchRequestSequence.current) setResultMessage(error instanceof Error ? error.message : "Search failed. Try again.");
      })
      .finally(() => { window.clearTimeout(timeout); if (sequence === searchRequestSequence.current) setSearchLoading(false); });
    return () => {
      // Invalidate even if a late response ignores the aborted signal.
      if (sequence === searchRequestSequence.current) searchRequestSequence.current += 1;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchActive, searchPage, resultRefreshToken, searchType, searchScope]);

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
  }, [resultMode, activeTab, contactPage, contactSort, contactDirection, contactSearch, contactCategoryFilter, contactCountryFilter, contactOutletFilter, outletPage, resultRefreshToken]);

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
    setOutletForm({ name: "", category: "", website: "", description: "", country: "", reachBand: "", linkedinUrl: "" });
    setShowOutletModal(true);
  };
  const openEditOutlet = (o: Outlet) => {
    if (!canManageCollectionItem(o, isMaster, canWriteMediaDatabase, session?.username)) return;
    setEditingOutlet(o);
    setOutletForm({ name: o.name, category: o.category, website: o.website, description: o.description, country: o.country, reachBand: o.reachBand, linkedinUrl: o.linkedinUrl || "" });
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
  const deleteOutlet = async (id: number, savedOutlet?: Outlet) => {
    const outlet = savedOutlet ?? outlets.find((item) => item.id === id);
    if (!outlet || !canManageCollectionItem(outlet, isMaster, canWriteMediaDatabase, session?.username)) return;
    setDeletingOutletId(id);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/outlets/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not delete this publication.");
      setSearchResults((current) => current.filter((result) => result.type !== "outlet" || result.id !== id));
      setSavedMedia((current) => { const next = new Set(current); next.delete(`publication:${id}`); return next; });
      if (searchActive) setResultRefreshToken((value) => value + 1);
      await loadData();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not delete this publication.");
    }
    setDeletingOutletId(null);
  };

  // Contacts
  const filteredContacts = contacts.filter((c) => {
    if (contactOutletFilter && String(c.outletId) !== contactOutletFilter) return false;
    return true;
  });

  const openAddContact = () => {
    if (!canWriteMediaDatabase) return;
    setEditingContact(null);
    setContactSaveError("");
    setContactSaveConfirmation("");
    setSavedContact(null);
    setContactForm({
      outletId: "", outletName: "", firstName: "", lastName: "", role: "", email: "", phone: "", notes: "",
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
    setContactSaveError("");
    setContactSaveConfirmation("");
    setSavedContact(null);
    setContactForm({
      outletId: c.outletId ? String(c.outletId) : "",
      outletName: c.outletName || outlets.find((outlet) => outlet.id === c.outletId)?.name || "",
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
    setContactSaveError("");
    const workspace = session?.username;
    try {
      const payload = {
        ...contactForm,
        outletId: contactForm.outletId || null,
        outletName: contactForm.outletId ? undefined : contactForm.outletName.trim(),
        beats: contactForm.beats.split(",").map(s => s.trim()).filter(Boolean),
        sectors: contactForm.sectors.split(",").map(s => s.trim()).filter(Boolean),
        publicationAuthority: contactForm.publicationAuthority || undefined,
        journalistAuthority: contactForm.journalistAuthority || undefined,
      };
      const resp = editingContact
        ? await fetch(`${apiBase()}/api/store/media-db/contacts/${editingContact.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`${apiBase()}/api/store/media-db/contacts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error || "Could not save this contact.");
      }
      const data = await resp.json().catch(() => null);
      if (!mountedRef.current || getLocalSession()?.username !== workspace) return;
      setShowContactModal(false);
      setContactSaveConfirmation(editingContact ? "Contact saved." : "Contact added. Showing newest contacts first; previous contact filters have been cleared.");
      if (data?.contact?.id) {
        setSavedContact({ ...data.contact, outletName: contactForm.outletName.trim() });
      } else {
        setSavedContact(null);
      }
      if (!editingContact) {
        // Let the browse effect fetch with the committed state, never the
        // pre-save filters/page captured by this async handler.
        searchRequestSequence.current += 1;
        setSearchLoading(false);
        setContactSearch("");
        setContactCategoryFilter("");
        setContactCountryFilter("");
        setContactOutletFilter("");
        setContactSort("createdAt");
        setContactDirection("desc");
        setContactPage(1);
        setSelectedMedia(new Set());
        setShowManagement(true);
        setActiveTab("contacts");
        setResultMode("browse");
        setResultRefreshToken((value) => value + 1);
      } else {
        await loadData();
        if (activeTab === "identityReview") await loadIdentityReview(identityReviewPage);
      }
    } catch (error) {
      if (!mountedRef.current || getLocalSession()?.username !== workspace) return;
      setContactSaveError(error instanceof Error ? error.message : "Could not save this contact.");
    } finally {
      if (mountedRef.current && getLocalSession()?.username === workspace) setContactSaving(false);
    }
  };
  const deleteContact = async (id: number, savedContact?: Contact) => {
    const contact = savedContact ?? contacts.find((item) => item.id === id);
    if (!contact || !canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username)) return;
    setDeletingContactId(id);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/contacts/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not delete this contact.");
      setSearchResults((current) => current.filter((result) => result.type !== "contact" || result.id !== id));
      setSavedMedia((current) => { const next = new Set(current); next.delete(`contact:${id}`); return next; });
      if (searchActive) setResultRefreshToken((value) => value + 1);
      await loadData();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not delete this contact.");
    }
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
      setSourceReviewContact((current) => current?.id === contact.id ? { ...current, sourceCheck: data.sourceCheck, sourceStatus: data.sourceCheck.outcome } : current);
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
      setSourceReviewContact(null);
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

  const toggleBookmark = async (type: "contact" | "publication", id: number) => {
    const key = `${type}:${id}`;
    if (bookmarkBusy === key) return;
    setBookmarkBusy(key);
    setBookmarkError("");
    const isSaved = savedMedia.has(key);
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/bookmarks/${type}/${id}`, {
        method: isSaved ? "DELETE" : "PUT",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not update your saved media.");
      setSavedMedia((current) => {
        const next = new Set(current);
        if (isSaved) next.delete(key);
        else next.add(key);
        return next;
      });
      if (isSaved && searchScope === "saved") setResultRefreshToken((value) => value + 1);
    } catch (error) {
      setBookmarkError(error instanceof Error ? error.message : "Could not update your saved media.");
    } finally {
      setBookmarkBusy(null);
    }
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
      setCorrectionConfirmation("Your report was submitted and is pending internal review. It does not change the saved contact details.");
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
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={colors[status]}
        title={status === "due" ? "A saved public source is due for a human review. This is not evidence that the stored details have changed." : undefined}
      >
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
        title="Completeness counts how many of ten useful information groups are filled in. It does not measure correctness or verification."
      >
        {completeness >= 80 ? `Complete (${completeness}%)` : `${completeness}% complete`}
      </span>
      {includeSourceStatus && sourceBadge(contact)}
    </div>;
  };

  const exportMediaCsv = async (scope: "full" | "saved" | "selected", type: "contacts" | "publications", ids?: number[], format: MediaExportFormat = scope === "full" ? "csv" : "xlsx") => {
    if (scope === "full" && !isMaster) return;
    if (scope === "selected" && (!ids?.length || ids.length > 25)) {
      setExportError(ids?.length ? "Select no more than 25 records at a time." : "Select at least one visible record to export.");
      return;
    }
    setExportBusy(true);
    setExportFormat(format);
    setExportError("");
    try {
      const response = await fetch(`${apiBase()}/api/store/media-db/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, type, ...(scope === "full" ? {} : { format }), ...(scope === "selected" ? { ids } : {}) }),
      });
      if (!response.ok) {
        let message = `${format === "xlsx" ? "Excel" : "CSV"} export failed with status ${response.status}.`;
        try {
          const data = await response.json() as { error?: string };
          if (typeof data.error === "string") message = data.error;
        } catch { /* Keep the explicit HTTP error when no JSON body is available. */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("Content-Disposition") || "";
      const serverFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      link.download = serverFilename || `Media ${type} ${scope}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not download the spreadsheet export.");
    } finally {
      setExportBusy(false);
    }
  };

  const toggleMediaSelection = (type: "contact" | "publication", id: number) => {
    const key = `${type}:${id}`;
    setSelectedMedia((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size < 25) next.add(key);
      return next;
    });
  };
  const selectedIdsFor = (type: "contacts" | "publications") =>
    Array.from(selectedMedia).filter((key) => key.startsWith(`${type === "contacts" ? "contact" : "publication"}:`))
      .map((key) => Number(key.split(":")[1]));
  const toggleVisibleResultSelection = (type: "contacts" | "publications") => {
    const recordType = type === "contacts" ? "contact" : "publication";
    const visibleKeys = visibleSearchResults.map((result) => `${recordType}:${result.id}`);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedMedia.has(key));
    setSelectedMedia((current) => {
      const next = new Set(current);
      if (allSelected) visibleKeys.forEach((key) => next.delete(key));
      else visibleKeys.forEach((key) => { if (next.size < 25) next.add(key); });
      return next;
    });
  };

  const outletOptions = outlets.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name));
  const showCollectionTools = activeTab === "outlets" || activeTab === "contacts" || activeTab === "identityReview";
  const showInternalTools = showManagement && internalToolsOpen;
  const activeNavigation = showManagement ? "manage" : searchActive && searchScope === "saved" ? "saved" : "search";
  const navigationButtonStyle = (section: typeof activeNavigation) => ({
    background: activeNavigation === section ? vars.accent : undefined,
    borderColor: activeNavigation === section ? vars.accent : "rgba(255,255,255,0.45)",
    color: "#ffffff",
  });
  const navigationButtonClass = "media-database-nav-button rounded-lg border px-3 py-2 text-[12px] font-semibold";
  const openSearchMedia = () => {
    setShowManagement(false);
    setActiveTab("contacts");
    setSearchScope("all");
    setSearchType("contacts");
    setSearchPage(1);
    setSelectedMedia(new Set());
    setResultMode("none");
    setResultMessage("");
    setSearchResults([]);
    setSearchTotal(0);
    setSearchCounts({ contacts: 0, outlets: 0 });
  };
  const visibleSearchResults = searchResults.filter((result) => searchType === "contacts"
    ? result.type === "contact"
    : result.type === "outlet");
  const canBroadenSearch = searchActive && !searchLoading && !resultMessage
    && searchTotal === 0 && visibleSearchResults.length === 0
    && Boolean(completedSearch?.category)
    && completedSearch?.type === searchType && completedSearch?.scope === searchScope;
  const broadenSearch = () => {
    if (!canBroadenSearch || !completedSearch) return;
    // Restore the completed search, not any unsubmitted edits in the form.
    setSearchPhrase(completedSearch.phrase);
    setSearchTopic(completedSearch.topic);
    setSearchLocation(completedSearch.location);
    setSearchAuthority(completedSearch.authority);
    setSearchType(completedSearch.type);
    setSearchScope(completedSearch.scope);
    setSearchCategory("");
    runSearch();
  };
  const emptySearchState = <div className="rounded-2xl border bg-white px-4 py-12 text-center" style={{ borderColor: vars.g200 }} aria-live="polite">
    <Search size={28} className="mx-auto mb-2" color={vars.g300} />
    <p className="font-semibold" style={{ color: vars.navy }}>No matching {searchType}</p>
    <p className="text-[12px] mt-1" style={{ color: vars.g500 }}>{canBroadenSearch
      ? `No matches in ${completedSearch?.category}. Remove only the sector filter and keep the rest of this search.`
      : "Clear a filter or broaden the search."}</p>
    {canBroadenSearch && <button type="button" data-testid="button-search-all-sectors" onClick={broadenSearch} className="mt-4 rounded-lg px-4 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Search across all sectors</button>}
  </div>;
  const savedSectorGroups = Array.from(visibleSearchResults.reduce((groups, result) => {
    const sector = result.type === "contact"
      ? result.contact.sectors?.[0] || result.contact.outletCategory || "Unspecified"
      : result.outlet.category || "Unspecified";
    const group = groups.get(sector) ?? [];
    group.push(result);
    groups.set(sector, group);
    return groups;
  }, new Map<string, UnifiedResult[]>()).entries()).sort(([a], [b]) => a.localeCompare(b));
  const openSavedMedia = (type: "contacts" | "publications") => {
    setShowManagement(false);
    setActiveTab("contacts");
    setSearchResults([]);
    setSearchTotal(0);
    setSearchCounts({ contacts: 0, outlets: 0 });
    setSearchPhrase("");
    setSearchTopic("");
    setSearchLocation("");
    setSearchCategory("");
    setSearchAuthority("");
    setSearchType(type);
    setSearchScope("saved");
    setSearchPage(1);
    setResultMode("search");
    setResultMessage("");
    setResultRefreshToken((value) => value + 1);
  };

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Database size={24} color="#ffffff" />
          <h1 className="text-[28px] font-semibold mb-1" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Media Database</h1>
        </div>
         <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>Find media contacts and publications, then save the records your team wants to follow.</p>
         <nav aria-label="Media Database sections" className="mt-3 flex flex-wrap gap-2">
           <button onClick={openSearchMedia} aria-current={activeNavigation === "search" ? "page" : undefined} className={navigationButtonClass} style={navigationButtonStyle("search")}>Search Media Database</button>
           <button onClick={() => openSavedMedia("contacts")} aria-current={activeNavigation === "saved" ? "page" : undefined} className={navigationButtonClass} style={navigationButtonStyle("saved")}>My Media Database</button>
           <button onClick={() => { setShowManagement(true); setResultMode("browse"); setActiveTab("contacts"); setInternalToolsOpen(false); setResultRefreshToken((value) => value + 1); }} aria-current={activeNavigation === "manage" ? "page" : undefined} className={navigationButtonClass} style={navigationButtonStyle("manage")}>Manage my records</button>
         </nav>
      </div>
      {loadError && <div role="alert" className="mb-4 rounded-xl border bg-white px-4 py-3 text-[13px]" style={{ borderColor: "#FECACA", color: vars.red }}>
        {loadError} <button onClick={() => void loadData()} className="ml-2 font-semibold underline">Try again</button>
      </div>}
      {correctionConfirmation && <p role="status" className="mb-4 rounded-xl border bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{correctionConfirmation}</p>}

      {showCollectionTools && <section className="mb-5 rounded-2xl border bg-white shadow-sm" style={{ borderColor: vars.g200 }}>
        <div className="p-4 sm:p-5">
          <label htmlFor="media-primary-search" className="block text-[12px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: vars.navy }}>{searchScope === "saved" ? "SEARCH MY MEDIA DATABASE" : "Search the media database"}</label>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Search
              <select data-testid="select-search-record-type" aria-label="Search record type" value={searchType} onChange={(event) => { setSelectedMedia(new Set()); setSearchType(event.target.value as "contacts" | "publications"); setSearchPage(1); }} className="ml-2 rounded-lg border bg-white px-3 py-2 text-[12px]" style={{ borderColor: vars.g200 }}>
                <option value="contacts">Contacts</option><option value="publications">Publications</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Collection
              <select data-testid="select-media-collection-scope" aria-label="Media collection scope" value={searchScope} onChange={(event) => { const scope = event.target.value as "all" | "added" | "saved"; if (scope === "saved") { setSearchResults([]); setSearchTotal(0); setSearchCounts({ contacts: 0, outlets: 0 }); } setSearchScope(scope); setSearchPage(1); }} className="ml-2 rounded-lg border bg-white px-3 py-2 text-[12px]" style={{ borderColor: vars.g200 }}>
                <option value="all">All</option><option value="added">Added</option><option value="saved">Saved</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: vars.g500 }}>All searches shared and workspace records. Added shows this account's private records. Saved shows this account's bookmarks.</p>
          <div className="flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: vars.g200 }}>
            <Search size={18} color={vars.g400} />
            <input data-testid="input-media-search" id="media-primary-search" value={searchPhrase} onChange={(event) => { setSearchPhrase(event.target.value); setSearchPage(1); }} onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }} placeholder={searchType === "contacts" ? "Search people, roles, publications or topics" : "Search publication names or topics"} className="w-full py-3 text-[14px] outline-none" />
            <button data-testid="button-search-media" onClick={runSearch} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Search</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Sector
              <select data-testid="select-media-sector" aria-label="Sector filter" value={searchCategory} onChange={(event) => { setSearchCategory(event.target.value); setSearchPage(1); }} className="ml-2 rounded-lg border bg-white px-3 py-2 text-[12px]" style={{ borderColor: vars.g200 }}>
                <option value="">All sectors</option>{allCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Region
              <select data-testid="select-media-region" aria-label="Region filter" value={searchLocation} onChange={(event) => { setSearchLocation(event.target.value); setSearchPage(1); }} className="ml-2 rounded-lg border bg-white px-3 py-2 text-[12px]" style={{ borderColor: vars.g200 }}>
                <option value="">All regions</option><option value="UK">UK</option><option value="US">US</option>
              </select>
            </label>
            <button data-testid="button-clear-media-search" onClick={() => { setSearchPhrase(""); setSearchTopic(""); setSearchLocation(""); setSearchCategory(""); setSearchAuthority(""); setSearchType("contacts"); setSearchScope("all"); setSearchPage(1); setResultMessage(""); setSelectedMedia(new Set()); setResultMode("none"); setSearchResults([]); setSearchTotal(0); setSearchCounts({ contacts: 0, outlets: 0 }); }} className="rounded-lg border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Clear</button>
            {bookmarkError && <span role="alert" className="text-[11px]" style={{ color: vars.red }}>{bookmarkError}</span>}
          </div>
           <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
             <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Topic<input value={searchTopic} onChange={(event) => { setSearchTopic(event.target.value); setSearchPage(1); }} placeholder="e.g. fintech" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }} /></label>
             <label className="text-[11px] font-semibold" style={{ color: vars.g600 }}>Minimum authority<input type="number" min="0" max="100" value={searchAuthority} onChange={(event) => { setSearchAuthority(event.target.value); setSearchPage(1); }} placeholder="0-100" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-normal" style={{ borderColor: vars.g200 }} /></label>
           </div>
            <div className="mt-4 flex justify-end">
              <button data-testid="button-search-media-bottom" onClick={runSearch} className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Search</button>
            </div>
        </div>
      </section>}

      {showCollectionTools && searchActive && <section className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[13px]" style={{ color: "#ffffff" }}>{searchLoading ? "Searching..." : resultMessage || `${searchType === "contacts" ? searchCounts.contacts : searchCounts.outlets} ${searchType} found`}</p>
           <div className="flex flex-wrap items-center justify-end gap-2">
             <MediaExportDownload scope="saved" disabled={exportBusy || !Array.from(savedMedia).some((key) => key.startsWith(`${searchType === "contacts" ? "contact" : "publication"}:`))} onDownload={(format) => void exportMediaCsv("saved", searchType, undefined, format)} />
             {selectedIdsFor(searchType).length > 0 && <MediaExportDownload scope="selected" count={selectedIdsFor(searchType).length} disabled={exportBusy} onDownload={(format) => void exportMediaCsv("selected", searchType, selectedIdsFor(searchType), format)} />}
             {isMaster && <button disabled={exportBusy} onClick={() => void exportMediaCsv("full", searchType)} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Export full CSV</button>}
           </div>
         </div>
           {exportError && <p role="alert" className="mb-3 rounded-lg bg-white px-3 py-2 text-[12px]" style={{ color: vars.red }}>{exportError}</p>}
           {exportBusy && <p role="status" className="mb-3 text-[12px]" style={{ color: "#ffffff" }}>Preparing {exportFormat === "xlsx" ? "Excel" : "CSV"} download…</p>}
            {searchType === "publications" && <p className="mb-3 text-[11px]" style={{ color: "#ffffff" }}>Publication CSVs include linked journalist names only for contacts you have also saved.</p>}
          {!searchLoading && searchActive && searchCounts[searchType === "contacts" ? "contacts" : "outlets"] > 0 && !Array.from(savedMedia).some((key) => key.startsWith(`${searchType === "contacts" ? "contact" : "publication"}:`)) && <p className="mb-3 text-[11px]" style={{ color: "#ffffff" }}>No saved {searchType} are available to export for this account.</p>}
          {visibleSearchResults.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "#ffffff" }}>
            <button onClick={() => toggleVisibleResultSelection(searchType)} className="underline">{visibleSearchResults.every((result) => selectedMedia.has(`${result.type === "contact" ? "contact" : "publication"}:${result.id}`)) ? "Clear visible selection" : "Select visible results"}</button>
            <span>{selectedMedia.size}/25 selected</span>
          </div>}
         {resultMessage && !searchLoading && <button onClick={runSearch} className="mb-3 text-[12px] font-semibold underline" style={{ color: vars.accent }}>Retry search</button>}
          {searchScope === "saved" ? (
            <div className="space-y-4" aria-live="polite">
              {savedSectorGroups.map(([sector, records]) => <section key={sector} className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: vars.g200 }}>
                <h2 className="border-b px-4 py-3 text-[13px] font-semibold" style={{ borderColor: vars.g100, color: vars.navy }}>{sector}</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead style={{ background: vars.g50, color: vars.g600 }}>
                      {searchType === "contacts" ? <tr>{["First name", "Last name", "Job title", "Outlet", "Email", "LinkedIn", "Outlet website", "Outlet description", "Country", "Actions"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>)}</tr>
                        : <tr>{["Publication", "Website", "Description", "Country", "Linked journalists", "Actions"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>)}</tr>}
                    </thead>
                    <tbody>
                      {records.map((result) => {
                        const key = `${result.type === "contact" ? "contact" : "publication"}:${result.id}`;
                        return result.type === "contact" ? <tr key={key} className="border-t align-top" style={{ borderColor: vars.g100 }}>
                          <td className="whitespace-nowrap px-3 py-3">{result.contact.firstName && !/^\d+(?:[.,]\d+)?$/.test(result.contact.firstName.trim()) ? result.contact.firstName : "Name not available"}</td>
                          <td className="whitespace-nowrap px-3 py-3">{result.contact.lastName && !/^\d+(?:[.,]\d+)?$/.test(result.contact.lastName.trim()) ? result.contact.lastName : ""}</td>
                          <td className="px-3 py-3">{result.contact.role || "Not available"}</td>
                          <td className="px-3 py-3">{result.contact.outletName || "Not available"}</td>
                          <td className="px-3 py-3">{result.contact.email && isSendableContactEmail(result.contact.email) ? <a href={`mailto:${result.contact.email}`} className="underline" style={{ color: vars.accent }}>{result.contact.email}</a> : "Not available"}</td>
                          <td className="px-3 py-3">{result.contact.linkedinUrl ? <a href={result.contact.linkedinUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>LinkedIn</a> : "Not available"}</td>
                          <td className="px-3 py-3">{publicationWebsiteHref(result.contact.outletWebsite) ? <a href={publicationWebsiteHref(result.contact.outletWebsite)!} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>Visit</a> : "Not available"}</td>
                          <td className="max-w-[220px] px-3 py-3">{(result.contact as Contact & { outletDescription?: string }).outletDescription || "Not available"}</td>
                          <td className="px-3 py-3">{result.contact.outletCountry || result.contact.geography || "Not available"}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {canWriteMediaDatabase && isCurrentWorkspaceItem(result.contact, session?.username) && <>
                              <button onClick={() => openEditContact(result.contact)} className="mr-3 underline" style={{ color: vars.accent }}>Edit</button>
                              <button disabled={deletingContactId === result.id} onClick={() => { if (window.confirm(`Delete ${contactDisplayName(result.contact)}?`)) void deleteContact(result.id, result.contact); }} className="mr-3 underline" style={{ color: vars.red }}>Delete</button>
                            </>}
                            <button disabled={bookmarkBusy === key} onClick={() => void toggleBookmark("contact", result.id)} className="underline" style={{ color: vars.accent }}>Remove from My Media Database</button>
                          </td>
                        </tr> : <tr key={key} className="border-t align-top" style={{ borderColor: vars.g100 }}>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold">{result.outlet.name}</td>
                          <td className="px-3 py-3">{publicationWebsiteHref(result.outlet.website) ? <a href={publicationWebsiteHref(result.outlet.website)!} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>Visit</a> : "Not available"}</td>
                          <td className="max-w-[240px] px-3 py-3">{result.outlet.description || "Not available"}</td>
                          <td className="px-3 py-3">{result.outlet.country || "Not available"}</td>
                          <td className="min-w-[200px] px-3 py-3">{(result.outlet.linkedJournalists ?? result.outlet.journalists ?? []).filter((person) => person.lifecycleStatus !== "departed").map(contactDisplayName).join(", ") || "Not available"}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {canWriteMediaDatabase && isCurrentWorkspaceItem(result.outlet, session?.username) && <>
                              <button onClick={() => openEditOutlet(result.outlet)} className="mr-3 underline" style={{ color: vars.accent }}>Edit</button>
                              <button disabled={deletingOutletId === result.id} onClick={() => { if (window.confirm(`Delete "${result.outlet.name}"?`)) void deleteOutlet(result.id, result.outlet); }} className="mr-3 underline" style={{ color: vars.red }}>Delete</button>
                            </>}
                            <button disabled={bookmarkBusy === key} onClick={() => void toggleBookmark("publication", result.id)} className="underline" style={{ color: vars.accent }}>Remove from My Media Database</button>
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>)}
              {!searchLoading && !resultMessage && visibleSearchResults.length === 0 && (canBroadenSearch ? emptySearchState : <div className="rounded-2xl border bg-white py-12 text-center" style={{ borderColor: vars.g200 }}><p className="font-semibold" style={{ color: vars.navy }}>Your My Media Database is empty</p><p className="text-[12px] mt-1" style={{ color: vars.g500 }}>Save contacts or publications from search results to see them here.</p></div>)}
            </div>
          ) : <div className="space-y-3" aria-live="polite">
           {visibleSearchResults.map((result) => {
            const isContact = result.type === "contact";
            const contact = isContact ? result.contact : null;
            const outlet = !isContact ? result.outlet : null;
             const linkedJournalists = (outlet?.linkedJournalists ?? outlet?.journalists ?? []).filter((journalist) => journalist.lifecycleStatus !== "departed");
             const bookmarkType = isContact ? "contact" : "publication";
             const bookmarkKey = `${bookmarkType}:${result.id}`;
             const isSaved = savedMedia.has(bookmarkKey);
             const outletWebsite = publicationWebsiteHref(outlet?.website || contact?.outletWebsite);
             return <article data-testid={`card-media-${bookmarkType}-${result.id}`} key={`${result.type}-${result.id}`} className="rounded-2xl border bg-white p-4 sm:p-5" style={{ borderColor: contact?.lifecycleStatus === "departed" ? "#F59E0B" : vars.g200 }}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                 <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                     <label className="inline-flex items-center gap-1 text-[11px] font-medium">
                       <input type="checkbox" aria-label={`Select ${bookmarkType} ${result.id}`} checked={selectedMedia.has(bookmarkKey)} disabled={!selectedMedia.has(bookmarkKey) && selectedMedia.size >= 25} onChange={() => toggleMediaSelection(bookmarkType, result.id)} />
                       Select
                     </label>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: isContact ? "rgba(31,116,143,0.1)" : "rgba(201,160,78,0.18)", color: isContact ? vars.accent : "#7A5E25" }}>{isContact ? "Contact" : "Publication"}</span>
                    {contact?.lifecycleStatus === "departed" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Departed</span>}
                    {contact?.hasPendingCorrection && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">Correction pending</span>}
                  </div>
                   <h2 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{contact ? contactDisplayName(contact) : outlet?.name}</h2>
                   <p className="mt-1 text-[13px]" style={{ color: vars.g600 }}>{contact ? [contact.role || "Role not available", contact.outletName || "Publication not available"].join(" · ") : [outlet?.category || "Sector not available", outlet?.country || "Region not available"].join(" · ")}</p>
                   {contact && <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: vars.g500 }}>
                     {contact.email && isSendableContactEmail(contact.email) ? <a href={`mailto:${contact.email}`} className="underline" style={{ color: vars.accent }}>{contact.email}</a> : <span>Valid email not available</span>}
                     {contact.outletName && (outletWebsite
                       ? <a href={outletWebsite} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>Publication website</a>
                       : <span>{contact.outletWebsite ? "Publication website value needs review" : "Publication website not available"}</span>)}
                   </div>}
                   {contact?.linkedinUrl && <a className="mt-1 inline-block text-[12px] underline" href={contact.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: vars.accent }}>LinkedIn profile</a>}
                   {outlet && <div className="mt-1 flex flex-wrap gap-3 text-[12px]" style={{ color: vars.g500 }}>
                     {outletWebsite ? <a href={outletWebsite} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>Visit publication website</a> : <span>{outlet.website ? "Stored website value needs review" : "Website not available"}</span>}
                      {outlet.verifiedAuthority != null && outlet.verifiedAuthority !== "" && <span>Recorded authority: {outlet.verifiedAuthority}</span>}
                     {outlet.linkedinUrl && <a href={outlet.linkedinUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>LinkedIn</a>}
                   </div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                   {contact && result.authority > 0 && <span className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold" style={{ borderColor: vars.g200, color: vars.navy }}>Recorded authority score {result.authority}</span>}
                   {contact && recordVerificationBadge(contact)}
                </div>
              </div>
               {result.matchedFields.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{result.matchedFields.map((field) => <span key={field} className="rounded-md bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900">Matched {field}</span>)}{result.matchedPhrases.map((phrase) => <span key={phrase} className="rounded-md bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-900">Exact phrase: “{phrase}”</span>)}</div>}
              <ul className="mt-3 space-y-1 text-[12px]" style={{ color: vars.g600 }}>{result.reasons.map((reason) => <li key={reason} className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0" color={vars.accent} />{reason}</li>)}</ul>
               {outlet && <section className="mt-3 rounded-xl border p-3" style={{ borderColor: vars.g100 }}>
                 <h3 className="text-[12px] font-semibold" style={{ color: vars.navy }}>Currently linked journalists ({linkedJournalists.length})</h3>
                 {linkedJournalists.length > 0
                   ? <ul className="mt-2 space-y-2">{linkedJournalists.map((journalist) => <li key={journalist.id} className="text-[12px]" style={{ color: vars.g600 }}>
                      <span className="font-semibold" style={{ color: vars.navy }}>{contactDisplayName(journalist)}</span>
                     {journalist.role && ` · ${journalist.role}`}
                     {journalist.email && isSendableContactEmail(journalist.email) ? <> · <a href={`mailto:${journalist.email}`} className="underline" style={{ color: vars.accent }}>{journalist.email}</a></> : " · Valid email not available"}
                     {journalist.linkedinUrl && <> · <a href={journalist.linkedinUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>LinkedIn</a></>}
                   </li>)}</ul>
                   : <p className="mt-1 text-[11px]" style={{ color: vars.g500 }}>No eligible linked journalists are available in this search result.</p>}
               </section>}
              <div className="mt-4 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: vars.g100 }}>
                {contact && <><button onClick={() => setShowContactProfile(contact)} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>View profile</button>
                  {canManageCollectionItem(contact, isMaster, canWriteMediaDatabase, session?.username) && <>
                    <button disabled={statusBusyId === contact.id} onClick={() => void setContactStatus(contact, contact.lifecycleStatus === "departed" ? "active" : "departed")} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.g600 }}>{contact.lifecycleStatus === "departed" ? "Mark active" : "Mark as departed"}</button>
                     <button onClick={() => { setCorrectionConfirmation(""); setCorrectionContact(contact); setCorrectionFields([]); setCorrectionDetails(""); }} className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.g600 }}>Flag incorrect details</button>
                  </>}
                </>}
                  {outlet && (outletWebsite ? <a href={outletWebsite} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Visit</a> : <span className="px-3 py-2 text-[12px]" style={{ color: vars.g500 }}>Website not available</span>)}
                  <button data-testid={`button-save-media-${bookmarkType}-${result.id}`} disabled={bookmarkBusy === bookmarkKey} onClick={() => void toggleBookmark(bookmarkType, result.id)} className="px-3 py-2 rounded-lg border text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}>{bookmarkBusy === bookmarkKey ? "Saving…" : isSaved ? "Remove from My Media Database" : "Save to My Media Database"}</button>
              </div>
            </article>;
          })}
          {!searchLoading && !resultMessage && visibleSearchResults.length === 0 && emptySearchState}
         </div>}
        {searchTotal > 25 && <div className="flex justify-end items-center gap-3 mt-3 text-[12px]" style={{ color: "#ffffff" }}><button disabled={searchPage === 1} onClick={() => { setSelectedMedia(new Set()); setSearchPage((page) => page - 1); }} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button><span>Page {searchPage} of {Math.ceil(searchTotal / 25)}</span><button disabled={searchPage * 25 >= searchTotal} onClick={() => { setSelectedMedia(new Set()); setSearchPage((page) => page + 1); }} className="px-3 py-1 border rounded disabled:opacity-40">Next</button></div>}
      </section>}

      {showManagement && <section className="mb-5 rounded-2xl border bg-white p-4" style={{ borderColor: vars.g200 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Manage my records</h2>
        </div>
      <div className="mt-4">
       {contactSaveConfirmation && <div role="status" className="mb-4 text-[13px]" style={{ color: vars.navy }}>
         <p>{contactSaveConfirmation}</p>
         {savedContact && <button onClick={() => setShowContactProfile(savedContact)} className="mt-1 underline font-semibold">View saved contact: {contactDisplayName(savedContact)}</button>}
         {loadError && <p>The contact was saved, but the list could not be refreshed. Use Try again to reload the list. Do not add it again.</p>}
       </div>}
       {canWriteMediaDatabase && <div className="mb-4 flex flex-wrap gap-2">
         <button onClick={openAddContact} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}><Plus size={13} /> Add contact</button>
         <button onClick={openAddOutlet} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><Building2 size={13} /> Add publication</button>
       </div>}
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: vars.g100 }}>
        {([
          { id: "outlets" as const, label: `Publications (${outletTotal})` },
          { id: "contacts" as const, label: `Contacts (${contactTotal})` },
        ]).map(({ id: t, label }) => (
          <button key={t} onClick={() => setActiveTab(t)} className="px-5 py-2 rounded-lg text-[13px] font-bold transition-all capitalize" style={{ background: activeTab === t ? "rgba(201,160,78,0.18)" : "transparent", color: activeTab === t ? "#7A5E25" : vars.g500, boxShadow: activeTab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none", border: activeTab === t ? `1px solid ${vars.gold}` : "1px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {(canWriteMediaDatabase || canSeeDiscoveries || canEditDiscoveryInstructions) && <details className="mb-5 rounded-xl border bg-slate-50 p-3" style={{ borderColor: vars.g200 }} open={internalToolsOpen} onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setInternalToolsOpen(isOpen);
        if (!isOpen && !["outlets", "contacts"].includes(activeTab)) setActiveTab("contacts");
      }}>
        <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: vars.g600 }}>Internal tools</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {canWriteMediaDatabase && <button onClick={() => { setActiveTab("contacts"); openImport(); }} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><Upload size={13} /> Import CSV</button>}
          {canSeeDiscoveries && <button onClick={() => setActiveTab("discoveries")} className="rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Discoveries</button>}
          {isMaster && canWriteMediaDatabase && <button onClick={() => setActiveTab("corrections")} className="rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Corrections ({correctionReports.length})</button>}
          {isMaster && canWriteMediaDatabase && <button data-testid="button-open-identity-review" onClick={() => { setIdentityReviewPage(1); setActiveTab("identityReview"); }} className="rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Identity review</button>}
          {canEditDiscoveryInstructions && <button onClick={() => setActiveTab("instructions")} className="rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}>Research instructions</button>}
        </div>
      </details>}

      {showInternalTools && activeTab === "discoveries" && canSeeDiscoveries && <MediaDiscoveryReview onApproved={() => void loadData()} />}
      {showInternalTools && activeTab === "identityReview" && isMaster && canWriteMediaDatabase && (
        <section aria-labelledby="identity-review-heading" className="mb-5 rounded-2xl border bg-white p-4" style={{ borderColor: vars.g200 }}>
          <div className="mb-4">
            <h2 id="identity-review-heading" className="text-[20px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Identity review</h2>
            <p className="mt-1 text-[12px]" style={{ color: vars.g500 }}>Legacy name values that are numeric identifiers are kept out of normal journalist results until a verified name is supplied. Review these records manually. Nothing is automatically deleted, and no names are guessed.</p>
            <p data-testid="text-identity-review-total" className="mt-2 text-[12px] font-semibold" style={{ color: vars.navy }}>{identityReviewTotal} records need identity review</p>
          </div>
          {identityReviewError && <div role="alert" className="mb-3 rounded-lg border bg-red-50 px-3 py-2 text-[12px] text-red-700" style={{ borderColor: "#FECACA" }}>
            <p>{identityReviewError}</p>
            <button data-testid="button-retry-identity-review" onClick={() => void loadIdentityReview(identityReviewPage)} className="mt-1 font-semibold underline">Try again</button>
          </div>}
          {identityReviewLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-[12px]" style={{ color: vars.g500 }}><Loader2 size={18} className="animate-spin" />Loading identity review records</div>
          ) : identityReviewError ? null : identityReviewContacts.length === 0 ? (
            <div data-testid="empty-identity-review" className="rounded-xl border bg-slate-50 py-8 text-center" style={{ borderColor: vars.g100 }}>
              <p className="font-semibold" style={{ color: vars.navy }}>No records need identity review</p>
            </div>
          ) : (
            <div className="space-y-3">
              {identityReviewContacts.map((contact) => {
                const sourceHref = publicationWebsiteHref(contact.sourceUrl);
                return <article data-testid={`row-identity-review-${contact.id}`} key={contact.id} className="rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: vars.navy }}>Name needs review</p>
                      <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Record reference: #{contact.id}</p>
                      <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Publication: {contact.outletName || "Not recorded"}</p>
                      <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Role: {contact.role || "Not recorded"}</p>
                      <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Source reference: {contact.sourceRef || "Not recorded"}</p>
                      {contact.sourceUrl && <p className="mt-1 text-[12px]" style={{ color: vars.g600 }}>Source: {sourceHref
                        ? <a href={sourceHref} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>View recorded source</a>
                        : "Recorded source link is not a valid web address"}</p>}
                    </div>
                    <button data-testid={`button-review-identity-${contact.id}`} onClick={() => openEditContact(contact)} className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Review/Edit</button>
                  </div>
                </article>;
              })}
              {identityReviewTotal > 50 && <div className="flex items-center justify-end gap-3 pt-2 text-[12px]" style={{ color: vars.g600 }}>
                <button data-testid="button-identity-review-previous" disabled={identityReviewPage <= 1 || identityReviewLoading} onClick={() => setIdentityReviewPage((page) => Math.max(1, page - 1))} className="rounded border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: vars.g200 }}>Previous</button>
                <span data-testid="text-identity-review-page">Page {identityReviewPage} of {Math.ceil(identityReviewTotal / 50)}</span>
                <button data-testid="button-identity-review-next" disabled={identityReviewPage * 50 >= identityReviewTotal || identityReviewLoading} onClick={() => setIdentityReviewPage((page) => page + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: vars.g200 }}>Next</button>
              </div>}
            </div>
          )}
        </section>
      )}
      {showInternalTools && activeTab === "corrections" && isMaster && canWriteMediaDatabase && (
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
      {showInternalTools && activeTab === "instructions" && canEditDiscoveryInstructions && <MediaDiscoveryInstructions />}

      {/* Outlets tab */}
      {activeTab === "outlets" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border bg-white" style={{ borderColor: vars.g200 }}>
            <div className="flex-1 min-w-[250px] flex items-center gap-2 mb-1">
               <Search size={16} className="text-slate-400" />
               <input value={outletSearch} onChange={(e) => { setOutletSearch(e.target.value); setOutletPage(1); }} placeholder="Search outlets by name or category..." className="px-3 py-2 rounded-lg border text-[13px] w-full outline-none focus:border-slate-400" style={{ borderColor: vars.g200 }} />
            </div>
            <select aria-label="Publication sector filter" value={outletCatFilter} onChange={(e) => { setOutletCatFilter(e.target.value); setOutletPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] outline-none bg-white" style={{ borderColor: vars.g200, color: outletCatFilter ? vars.navy : "inherit" }}>
              <option value="">All categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => { setActiveTab("outlets"); browseResults("outlets"); }} className="rounded-lg border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: vars.accent, color: vars.accent }}>Browse publications</button>
              <MediaExportDownload scope="saved" disabled={exportBusy || !Array.from(savedMedia).some((key) => key.startsWith("publication:"))} onDownload={(format) => void exportMediaCsv("saved", "publications", undefined, format)} />
              {selectedIdsFor("publications").length > 0 && <MediaExportDownload scope="selected" count={selectedIdsFor("publications").length} disabled={exportBusy} onDownload={(format) => void exportMediaCsv("selected", "publications", selectedIdsFor("publications"), format)} />}
              {isMaster && <button disabled={exportBusy} onClick={() => void exportMediaCsv("full", "publications")} className="rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}>Export full CSV</button>}
          </div>
          {outletTotal > 50 && <div className="flex justify-end items-center gap-3 mb-3 text-[12px]" style={{ color: vars.navy }}>
            <button disabled={outletPage === 1} onClick={() => setOutletPage((page) => page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button>
            <span>Page {outletPage} of {Math.ceil(outletTotal / 50)}</span>
            <button disabled={outletPage * 50 >= outletTotal} onClick={() => setOutletPage((page) => page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>}
          {exportBusy && <p role="status" className="mb-2 text-[12px]" style={{ color: vars.g500 }}>Preparing {exportFormat === "xlsx" ? "Excel" : "CSV"} download…</p>}
          {exportError && <p role="alert" className="mb-2 rounded-lg bg-white px-3 py-2 text-[12px]" style={{ color: vars.red }}>{exportError}</p>}
           {!Array.from(savedMedia).some((key) => key.startsWith("publication:")) && <p className="mb-2 text-[11px]" style={{ color: vars.g500 }}>No saved publications are available to export for this account.</p>}
           <p className="mb-2 text-[11px]" style={{ color: vars.g500 }}>Publication CSVs include linked journalist names only for contacts you have also saved.</p>

          {filteredOutlets.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Building2 size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No outlets yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add publications to build your media database.</p>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                     <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Publication</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Sector</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Region</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Website</th>
                    <th className="px-4 py-3" style={{ color: vars.navy }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutlets.map((o) => (
                    <tr key={o.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <input type="checkbox" aria-label={`Select publication ${o.id}`} checked={selectedMedia.has(`publication:${o.id}`)} disabled={!selectedMedia.has(`publication:${o.id}`) && selectedMedia.size >= 25} onChange={() => toggleMediaSelection("publication", o.id)} />
                          <div><p className="font-semibold" style={{ color: vars.navy }}>{o.name}</p>
                        {o.description && <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>{o.description.slice(0, 80)}{o.description.length > 80 ? "…" : ""}</p>}
                        {Array.isArray(o.linkedJournalists) || Array.isArray(o.journalists)
                          ? <div className="mt-2 text-[10px]" style={{ color: vars.g500 }}>
                            <p className="font-semibold">Currently linked journalists ({(o.linkedJournalists ?? o.journalists ?? []).filter((journalist) => journalist.lifecycleStatus !== "departed").length})</p>
                            <ul className="mt-1 space-y-1">{(o.linkedJournalists ?? o.journalists ?? []).filter((journalist) => journalist.lifecycleStatus !== "departed").map((journalist) => <li key={journalist.id}>
                              {`${journalist.firstName} ${journalist.lastName}`.trim() || "Name not available"}{journalist.role ? ` · ${journalist.role}` : ""}
                              {journalist.email && isSendableContactEmail(journalist.email) ? ` · ${journalist.email}` : ""}
                              {journalist.linkedinUrl && <> · <a href={journalist.linkedinUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>LinkedIn</a></>}
                             </li>)}</ul>
                          </div>
                          : <p className="mt-2 text-[10px]" style={{ color: vars.g500 }}>Linked journalist details are not available in this publication list.</p>}
                          </div></div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell" style={{ color: vars.g600 }}>{o.category || "Not available"}</td>
                      <td className="px-4 py-3 hidden md:table-cell" style={{ color: vars.g600 }}>{o.country || "Not available"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {publicationWebsiteHref(o.website) ? <a href={publicationWebsiteHref(o.website)!} target="_blank" rel="noopener noreferrer" className="text-[11px] underline" style={{ color: vars.accent }}>{o.website.replace(/^https?:\/\//, "").slice(0, 30)}</a> : o.website ? <span title="Stored value is retained for review but is not a valid website link.">Website value needs review</span> : "Not available"}
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
                <button onClick={() => { setSelectedMedia(new Set()); setActiveTab("contacts"); browseResults("contacts"); }} className="rounded-lg border px-3 py-2 text-[12px] font-semibold whitespace-nowrap" style={{ borderColor: vars.accent, color: vars.accent }}>Browse contacts</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full">
              <select aria-label="Contact sector filter" value={contactCategoryFilter} onChange={(e) => { setContactCategoryFilter(e.target.value); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="">All categories</option>{allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select aria-label="Contact region filter" value={contactCountryFilter} onChange={(e) => { setContactCountryFilter(e.target.value); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="">All locations</option>
                <option value="UK">United Kingdom</option>
                <option value="US">United States</option>
              </select>
              <select aria-label="Contact publication filter" value={contactOutletFilter} onChange={(e) => setContactOutletFilter(e.target.value)} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200, color: contactOutletFilter ? vars.navy : "inherit" }}>
                <option value="">All outlets</option>
                {outletOptions.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
              </select>
              <select aria-label="Contact sort order" value={`${contactSort}:${contactDirection}`} onChange={(e) => { const [sort, direction] = e.target.value.split(":"); setContactSort(sort); setContactDirection(direction as "asc" | "desc"); setContactPage(1); }} className="px-3 py-2 rounded-lg border text-[13px] bg-white outline-none" style={{ borderColor: vars.g200 }}>
                <option value="lastName:asc">Name A-Z</option><option value="lastName:desc">Name Z-A</option><option value="outletName:asc">Outlet A-Z</option><option value="createdAt:desc">Newest</option>
              </select>
              {(contactSearch || contactCategoryFilter || contactCountryFilter || contactOutletFilter) && <button onClick={() => { setContactSearch(""); setContactCategoryFilter(""); setContactCountryFilter(""); setContactOutletFilter(""); setContactPage(1); }} className="px-3 py-2 rounded-lg text-[12px] font-medium text-slate-500 hover:text-slate-700 transition-colors">Clear filters</button>}
              <div className="flex-1"></div>
                <MediaExportDownload scope="saved" disabled={exportBusy || !Array.from(savedMedia).some((key) => key.startsWith("contact:"))} onDownload={(format) => void exportMediaCsv("saved", "contacts", undefined, format)} />
                {selectedIdsFor("contacts").length > 0 && <MediaExportDownload scope="selected" count={selectedIdsFor("contacts").length} disabled={exportBusy} onDownload={(format) => void exportMediaCsv("selected", "contacts", selectedIdsFor("contacts"), format)} />}
                {isMaster && <button disabled={exportBusy} onClick={() => void exportMediaCsv("full", "contacts")} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: vars.g200, color: vars.navy }}><Download size={13} /> Export full CSV</button>}
            </div>
          </div>

          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: vars.g200, background: "white" }}>
              <Users size={32} className="mx-auto mb-3" color={vars.g300} />
              <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>No contacts yet</p>
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g400 }}>Add journalists and PR contacts to your database.</p>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
              <div className="px-4 py-2 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: vars.g500, background: vars.g50 }}>
                <span>Showing {filteredContacts.length} of {contactTotal} contacts</span>
                <button onClick={() => {
                  const keys = filteredContacts.map((contact) => `contact:${contact.id}`);
                  const allSelected = keys.length > 0 && keys.every((key) => selectedMedia.has(key));
                  setSelectedMedia((current) => {
                    const next = new Set(current);
                    if (allSelected) keys.forEach((key) => next.delete(key));
                    else keys.forEach((key) => { if (next.size < 25) next.add(key); });
                    return next;
                  });
                }} className="underline">Select visible contacts</button>
                <span>{selectedIdsFor("contacts").length}/25 selected</span>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: vars.navy }}>Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: vars.navy }}>Role</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell" style={{ color: vars.navy }}>Outlet</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Email</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell" style={{ color: vars.navy }}>Phone</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${vars.g100}` }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" aria-label={`Select contact ${c.id}`} checked={selectedMedia.has(`contact:${c.id}`)} disabled={!selectedMedia.has(`contact:${c.id}`) && selectedMedia.size >= 25} onChange={() => toggleMediaSelection("contact", c.id)} />
                          <p className="font-semibold" style={{ color: vars.navy }}>{contactDisplayName(c)}</p>
                        </div>
                         {c.outletCategory && <p className="text-[11px] font-light" style={{ color: vars.g500 }}>{c.outletCategory}</p>}
                         {recordVerificationBadge(c)}
                         {(c.beats?.length || c.sectors?.length || c.seniority || c.editorialStatus) && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>{[c.beats?.length ? `Beats: ${c.beats.join(", ")}` : "", c.sectors?.length ? `Sectors: ${c.sectors.join(", ")}` : "", c.seniority, c.editorialStatus].filter(Boolean).join(" · ")}</p>}
                          {(c.authority !== undefined || c.authorityScore !== undefined || c.confidence || c.confidenceLevel) && <p className="text-[10px] mt-1" style={{ color: vars.g500 }}>{[c.authority ?? c.authorityScore !== undefined ? `Recorded authority score: ${c.authority ?? c.authorityScore}` : "", c.confidence || c.confidenceLevel ? `Confidence: ${c.confidence || c.confidenceLevel}` : ""].filter(Boolean).join(" · ")}</p>}
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setShowContactProfile(c)} className="px-2 py-1 text-[11px] font-medium rounded border hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>View Profile</button>
                            {canManageCollectionItem(c, isMaster, canWriteMediaDatabase, session?.username) && <>
                             <button onClick={() => { setSourceActionError(""); setSourceReviewContact(c); }} className="px-2 py-1 text-[11px] font-medium rounded border hover:bg-slate-50 transition-colors whitespace-nowrap" style={{ borderColor: vars.g200, color: vars.navy }}>Review public source</button>
                             <button onClick={() => openEditContact(c)} className="p-1.5 rounded-lg hover:bg-gray-50" title="Edit"><PenLine size={13} color={vars.g400} /></button>
                             <button onClick={() => { if (window.confirm(`Delete ${contactDisplayName(c)}?`)) void deleteContact(c.id); }} disabled={deletingContactId === c.id} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={13} color={deletingContactId === c.id ? vars.g300 : vars.red} /></button>
                           </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
           {exportBusy && <p role="status" className="mt-3 text-[12px]" style={{ color: vars.g500 }}>Preparing {exportFormat === "xlsx" ? "Excel" : "CSV"} download…</p>}
           {!Array.from(savedMedia).some((key) => key.startsWith("contact:")) && <p className="mt-2 text-[11px]" style={{ color: vars.g500 }}>No saved contacts are available to export for this account.</p>}
           {exportError && <p role="alert" className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px]" style={{ color: vars.red }}>{exportError}</p>}
           {contactTotal > 50 && <div className="flex justify-end items-center gap-3 mt-3 text-[12px]" style={{ color: vars.navy }}><button disabled={contactPage === 1} onClick={() => setContactPage((page) => page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button><span>Page {contactPage} of {Math.ceil(contactTotal / 50)}</span><button disabled={contactPage * 50 >= contactTotal} onClick={() => setContactPage((page) => page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button></div>}
        </div>
      )}
      </div>
      </section>}

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
                { label: "LinkedIn URL (optional)", key: "linkedinUrl", placeholder: "Enter a manually verified publication LinkedIn URL" },
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
        <div role="dialog" aria-modal="true" aria-label="Journalist Profile" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowContactProfile(null)}>
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
                         </div>
                    </div>
                  </div>
                </div>
              </div>
              <RecommendationCard
                item={{
                  rank: 0,
                  score: 100, // Or whatever placeholder score since it's just a profile view
                  reasons: [],
                  contact: contactDisplayName(showContactProfile) === "Name not available"
                    ? { ...showContactProfile, firstName: "Name not available", lastName: "", sourceUrl: "", sourceRef: "", sourceStatus: undefined, sourceCheck: undefined, lastVerifiedAt: undefined }
                    : { ...showContactProfile, sourceUrl: "", sourceRef: "", sourceStatus: undefined, sourceCheck: undefined, lastVerifiedAt: undefined },
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

      {showCollectionTools && sourceReviewContact && canManageCollectionItem(sourceReviewContact, isMaster, canWriteMediaDatabase, session?.username) && (
        <div role="dialog" aria-modal="true" aria-label="Review public source" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setSourceReviewContact(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: vars.g200, background: vars.g50 }}>
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Review public source</h2>
                <p className="mt-1 text-[12px]" style={{ color: vars.g500 }}>{contactDisplayName(sourceReviewContact)}</p>
              </div>
              <button aria-label="Close public source review" onClick={() => setSourceReviewContact(null)} className="text-[20px] leading-none px-2 text-slate-400 hover:text-slate-700 transition-colors">&times;</button>
            </div>
            <div className="overflow-y-auto p-5">
              <section className="rounded-xl border p-4" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-bold" style={{ color: vars.navy }}>Public source health</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: vars.g500 }}>Page verification</span>
                      {sourceBadge(sourceReviewContact)}
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: vars.g500 }}>
                      {!sourceReviewContact.sourceUrl ? "No public source is attached to this contact."
                        : sourceReviewContact.sourceCheck ? `Last checked ${new Date(sourceReviewContact.sourceCheck.checkedAt).toLocaleString()}`
                          : "This source has not been checked yet."}
                    </p>
                    {sourceReviewContact.sourceUrl && <p className="text-[11px] mt-1 break-all" style={{ color: vars.g600 }}>
                      Source URL: <a href={sourceReviewContact.sourceUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: vars.accent }}>{sourceReviewContact.sourceUrl}</a>
                    </p>}
                  </div>
                  {sourceReviewContact.sourceUrl && <button onClick={() => void recheckSource(sourceReviewContact)} disabled={sourceCheckingId === sourceReviewContact.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-[12px] font-semibold" style={{ borderColor: vars.g200, color: vars.navy }}><RefreshCw size={13} className={sourceCheckingId === sourceReviewContact.id ? "animate-spin" : ""} />Check source now</button>}
                </div>
                {sourceActionError && <p role="alert" className="text-[11px] mt-3" style={{ color: vars.red }}>{sourceActionError}</p>}
                {sourceReviewContact.sourceCheck?.outcome === "unavailable" && <p className="text-[12px] mt-3 text-red-700">{sourceReviewContact.sourceCheck.errorCode === "page_missing" ? "The saved page could not be found." : "The saved page could not be reached."} Your contact details have not been changed.</p>}
                {sourceReviewContact.sourceCheck?.observedEvidence?.excerpt && <p className="mt-3 rounded-lg bg-white border px-3 py-2 text-[11px]" style={{ borderColor: vars.g200, color: vars.g600 }}>Page check evidence: {sourceReviewContact.sourceCheck.observedEvidence.excerpt}</p>}
                {!!sourceReviewContact.sourceCheck?.differences.length && (
                  <div className="mt-3 space-y-2">
                    {sourceReviewContact.sourceCheck.differences.map((difference) => <div key={difference.field} className="text-[12px] rounded-lg bg-white border px-3 py-2" style={{ borderColor: vars.g200 }}>
                      <span className="font-semibold capitalize">{difference.field}: </span>
                      {difference.kind === "removed" && !difference.observedValue ? `The saved ${difference.field} is no longer shown on the source.`
                        : <>{difference.storedValue || "(blank)"} → {difference.observedValue}</>}
                    </div>)}
                    {!sourceReviewContact.sourceCheck.reviewedAt && sourceReviewContact.sourceCheck.differences.some((difference) => difference.supported && difference.observedValue) && <button onClick={() => void approveSourceUpdates(sourceReviewContact)} disabled={sourceCheckingId === sourceReviewContact.id} className="px-3 py-2 rounded-lg text-white text-[12px] font-semibold" style={{ background: vars.accent }}>Accept supported updates</button>}
                  </div>
                )}
              </section>
            </div>
            <div className="px-6 py-4 border-t flex justify-end bg-slate-50" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setSourceReviewContact(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-white border shadow-sm hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>Close</button>
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
                  <label htmlFor="contact-publication-name" className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Publication / outlet</label>
                  <input
                    id="contact-publication-name"
                    value={contactForm.outletName}
                    onChange={(event) => setContactForm((form) => ({ ...form, outletId: "", outletName: event.target.value }))}
                    placeholder="Type the publication name"
                    className="w-full px-3 py-2 rounded-lg border text-[13px] outline-none focus:border-slate-400"
                    style={{ borderColor: vars.g200 }}
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

            {contactSaveError && <p role="alert" className="px-6 pb-3 text-[13px]" style={{ color: vars.red }}>{contactSaveError}</p>}
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

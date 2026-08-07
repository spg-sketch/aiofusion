import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { type Session as LocalSession, type User as LocalUser, type Role, getSubAccounts as getLocalSubAccounts, serverAddUser, serverDeleteUser, serverChangePassword, serverAssignOwner, serverSetDisplayName, serverArchiveUser, serverSetSeatCap, refreshAccountsCache, serverImpersonate, serverSwitchToMaster, serverChangeAccountType, canCreateSubAccounts } from "../lib/auth";
import { apiBase } from "../lib/apiHelpers";
import { accountLabel } from "../lib/accountLabels";
import { loadStoredProjects } from "../lib/projectStore";
import { pushProjectMeta } from "../lib/projectSync";
import type { Client } from "../lib/projectTypes";
import { TeamSection } from "./TeamSection";
import { AccountSecurityCard } from "../components/AccountSecurityCard";
function SubAccountsPage({
  session,
  onBack,
  onAssignProjectOwner,
  onRoleChanged,
  onWorkspacesChanged,
  onSignOut,
}: {
  session: LocalSession;
  onBack: () => void;
  onAssignProjectOwner: (id: string, owner: string) => void;
  onRoleChanged?: (newRole: Role) => void;
  /** Called after the user accepts a cross-workspace invite so the parent can refresh the workspace list. */
  onWorkspacesChanged?: () => void;
  /** Signs the user out (used after account deletion and by the sign-out button). */
  onSignOut?: () => void;
}) {
  const paper = "#f8fafc";
  const ink = "#0a1628";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // Re-read on every refresh tick so adds, deletes and assignments show at once.
  const allSubAccounts = useMemo(() => getLocalSubAccounts(session.username), [session.username, tick]);
  const subAccounts = useMemo(() => allSubAccounts.filter((u) => !u.archived), [allSubAccounts]);
  const archivedSubAccounts = useMemo(() => allSubAccounts.filter((u) => u.archived), [allSubAccounts]);
  const subUsernames = useMemo(() => new Set(allSubAccounts.map((u) => u.username.toLowerCase())), [allSubAccounts]);
  const manageable = useMemo(() => {
    const me = session.username.toLowerCase();
    return loadStoredProjects().filter((p) => {
      const owner = (p.owner || "").toLowerCase();
      return owner === me || subUsernames.has(owner);
    });
  }, [session.username, subUsernames, tick]);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLogoDataUrl, setNewLogoDataUrl] = useState<string | null>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  // Guards against a slow earlier image load overwriting a later selection.
  const logoRequestRef = useRef(0);

  /** Downscale the chosen client logo to a data URL for the create form. */
  const handleNewClientLogo = (file: File) => {
    setAddError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAddError("The logo must be a PNG, JPEG or WebP image.");
      return;
    }
    const requestId = ++logoRequestRef.current;
    setLogoProcessing(true);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== logoRequestRef.current) return; // a newer file was chosen
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { setLogoProcessing(false); setAddError("Could not process the logo image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setNewLogoDataUrl(file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png"));
      setLogoProcessing(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== logoRequestRef.current) return;
      setLogoProcessing(false);
      setAddError("Could not read that logo file.");
    };
    img.src = objectUrl;
  };
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  // Account Type section state
  const isOwner = session.membershipRole == null || session.membershipRole === "owner";
  const isAgencyOrClient = session.role === "agency" || session.role === "client";
  const [selectedType, setSelectedType] = useState<"agency" | "client" | null>(null);
  const [typeChanging, setTypeChanging] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typeSuccess, setTypeSuccess] = useState<string | null>(null);

  const handleChangeAccountType = () => {
    if (!selectedType || typeChanging) return;
    if (selectedType === session.role) {
      setSelectedType(null);
      return;
    }
    setTypeChanging(true);
    setTypeError(null);
    setTypeSuccess(null);
    void (async () => {
      const result = await serverChangeAccountType(selectedType);
      setTypeChanging(false);
      if (!result.ok) {
        setTypeError(result.error);
        return;
      }
      setTypeSuccess(`Account type updated to ${selectedType === "agency" ? "Agency / Partner" : "Client"}.`);
      setSelectedType(null);
      if (onRoleChanged) onRoleChanged(result.role);
    })();
  };

  const [enteringUsername, setEnteringUsername] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [microsoftLinked, setMicrosoftLinked] = useState<boolean | null>(null);
  const [accountWebsite, setAccountWebsite] = useState<string | null>(null);
  // Profile images - value is a cache-busted URL when an image exists, null when none.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<"avatar" | "logo" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const profileImageUrl = (kind: "avatar" | "logo") =>
    `${apiBase()}/api/platform/profile/image/${kind}?t=${Date.now()}`;

  useEffect(() => {
    // Probe for existing images; 404 simply means none uploaded yet.
    (["avatar", "logo"] as const).forEach((kind) => {
      fetch(`${apiBase()}/api/platform/profile/image/${kind}`, { credentials: "include" })
        .then((r) => {
          if (r.ok) (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
        })
        .catch(() => { /* non-fatal */ });
    });
  }, []);

  // Logo sizing dialog state: source image + zoom/pan the user chooses.
  const [logoAdjust, setLogoAdjust] = useState<{ src: string; imgW: number; imgH: number; zoom: number; offX: number; offY: number } | null>(null);
  const logoDragRef = useRef<{ startX: number; startY: number; baseOffX: number; baseOffY: number } | null>(null);
  const LOGO_PREVIEW = 240; // px, square preview in the dialog

  /** Uploads a prepared data URL to the profile-image endpoint. */
  const uploadImageDataUrl = (kind: "avatar" | "logo", dataUrl: string) => {
    setUploadingImage(kind);
    fetch(`${apiBase()}/api/platform/profile/image`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, dataUrl }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null) as { error?: string } | null;
          setImageError(body?.error ?? "Failed to save the image.");
          return;
        }
        (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
      })
      .catch(() => setImageError("Failed to save the image."))
      .finally(() => setUploadingImage(null));
  };

  /** Opens the sizing dialog for a chosen logo file. */
  const handleLogoFileChosen = (file: File) => {
    setImageError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setImageError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Keep a reasonably sized working copy so the dialog stays snappy.
      const workScale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * workScale));
      canvas.height = Math.max(1, Math.round(img.height * workScale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(objectUrl); setImageError("Could not process the image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      setLogoAdjust({ src: canvas.toDataURL("image/png"), imgW: canvas.width, imgH: canvas.height, zoom: 1, offX: 0, offY: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImageError("Could not read that image file.");
    };
    img.src = objectUrl;
  };

  /** Renders the adjusted logo to a square 512px PNG and saves it. */
  const handleLogoAdjustSave = () => {
    if (!logoAdjust) return;
    const { src, imgW, imgH, zoom, offX, offY } = logoAdjust;
    const img = new Image();
    img.onload = () => {
      const OUT = 512;
      const f = OUT / LOGO_PREVIEW;
      const s0 = Math.min(LOGO_PREVIEW / imgW, LOGO_PREVIEW / imgH);
      const drawW = imgW * s0 * zoom;
      const drawH = imgH * s0 * zoom;
      const x = LOGO_PREVIEW / 2 + offX - drawW / 2;
      const y = LOGO_PREVIEW / 2 + offY - drawH / 2;
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setImageError("Could not process the image."); return; }
      ctx.drawImage(img, x * f, y * f, drawW * f, drawH * f);
      setLogoAdjust(null);
      uploadImageDataUrl("logo", canvas.toDataURL("image/png"));
    };
    img.src = src;
  };

  /** Downscales the chosen file on a canvas, then saves it server-side. */
  const handleImageUpload = (kind: "avatar" | "logo", file: File) => {
    setImageError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setImageError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    setUploadingImage(kind);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSide = kind === "avatar" ? 256 : 512;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { setUploadingImage(null); setImageError("Could not process the image."); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // PNG keeps logo transparency; JPEG keeps photos small.
      const dataUrl = file.type === "image/jpeg"
        ? canvas.toDataURL("image/jpeg", 0.85)
        : canvas.toDataURL("image/png");
      fetch(`${apiBase()}/api/platform/profile/image`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, dataUrl }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null) as { error?: string } | null;
            setImageError(body?.error ?? "Failed to save the image.");
            return;
          }
          (kind === "avatar" ? setAvatarUrl : setLogoUrl)(profileImageUrl(kind));
        })
        .catch(() => setImageError("Failed to save the image."))
        .finally(() => setUploadingImage(null));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploadingImage(null);
      setImageError("Could not read that image file.");
    };
    img.src = objectUrl;
  };

  const handleImageRemove = (kind: "avatar" | "logo") => {
    setImageError(null);
    fetch(`${apiBase()}/api/platform/profile/image/${kind}`, { method: "DELETE", credentials: "include" })
      .then((r) => {
        if (r.ok) (kind === "avatar" ? setAvatarUrl : setLogoUrl)(null);
      })
      .catch(() => { /* non-fatal */ });
  };
  const [isMasterOwner, setIsMasterOwner] = useState<boolean>(false);
  const [switchingToMaster, setSwitchingToMaster] = useState(false);
  const [switchToMasterError, setSwitchToMasterError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${apiBase()}/api/platform/me`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { account?: { googleLinked?: boolean; microsoftLinked?: boolean } | null; masterOwner?: boolean; accountProfile?: { website?: string | null } | null } | null) => {
        if (data?.accountProfile?.website) setAccountWebsite(data.accountProfile.website);
        if (data?.account) {
          setGoogleLinked(data.account.googleLinked ?? false);
          setMicrosoftLinked(data.account.microsoftLinked ?? false);
        }
        setIsMasterOwner(data?.masterOwner === true);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  const handleSwitchToMaster = () => {
    setSwitchToMasterError(null);
    setSwitchingToMaster(true);
    void serverSwitchToMaster()
      .then((result) => {
        if (!result.ok) {
          setSwitchToMasterError(result.error);
          setSwitchingToMaster(false);
          return;
        }
        // Use a query param so App.tsx shows platform-home after the reload
        // instead of the marketing landing page.
        window.location.replace("/?aio_switched_master=1");
      })
      .catch(() => {
        setSwitchToMasterError("Failed to switch to master account.");
        setSwitchingToMaster(false);
      });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    const companyName = newCompanyName.trim();
    if (!companyName) { setAddError("Enter the client's company name."); return; }
    let website = newWebsite.trim();
    if (!website) { setAddError("Enter the client's company website."); return; }
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    const contactEmail = newContactEmail.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setAddError("The key contact email address doesn't look valid.");
      return;
    }
    // Suggest a username from the company name; the server makes it unique.
    const usernameSuggestion = companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_.-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 28)
      .replace(/^[-.]+|[-.]+$/g, "") || "client";
    setAddingClient(true);
    void (async () => {
      const result = await serverAddUser(usernameSuggestion, newPassword, "client", companyName, {
        website,
        contactName: newContactName.trim(),
        contactEmail,
        autoUsername: true,
        ...(newLogoDataUrl ? { logoDataUrl: newLogoDataUrl } : {}),
      });
      setAddingClient(false);
      if (result.ok) {
        setAddSuccess(
          `Created client account '${result.username}' for ${companyName}.` +
          (contactEmail ? ` We've emailed ${contactEmail} to let them know.` : ""),
        );
        setNewCompanyName("");
        setNewWebsite("");
        setNewContactName("");
        setNewContactEmail("");
        setNewPassword("");
        setNewLogoDataUrl(null);
        refresh();
      } else {
        setAddError(result.error);
      }
    })();
  };

  const handleEnterAccount = (username: string) => {
    setEnterError(null);
    setEnteringUsername(username);
    void serverImpersonate(username)
      .then((result) => {
        if (!result.ok) {
          setEnterError(result.error);
          setEnteringUsername(null);
          return;
        }
        window.location.reload();
      })
      .catch(() => {
        setEnterError("Failed to enter this account.");
        setEnteringUsername(null);
      });
  };

  const handleArchive = (username: string, archive: boolean) => {
    const msg = archive
      ? `Archive client account '${username}'? They will not be able to sign in until restored. Their projects remain visible to you.`
      : `Restore client account '${username}'? They will be able to sign in again.`;
    if (!confirm(msg)) return;
    void (async () => {
      const result = await serverArchiveUser(username, archive);
      if (!result.ok) { alert(result.error); return; }
      refresh();
    })();
  };

  const handleDelete = (username: string) => {
    if (!confirm(`Delete client account '${username}'? They will no longer be able to sign in. Their projects are kept and stay visible to you.`)) return;
    // Reassign the deleted account's projects to the parent first, so they
    // remain visible after the account (and its place in the user graph) is
    // gone. Visibility is derived from current ownership, so an orphaned owner
    // would otherwise disappear from the parent's view.
    const target = username.toLowerCase();
    loadStoredProjects().forEach((p) => {
      if ((p.owner || "").toLowerCase() === target) {
        onAssignProjectOwner(p.id, session.username);
      }
    });
    void (async () => {
      const result = await serverDeleteUser(username);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      refresh();
    })();
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!pwUser) return;
    void (async () => {
      const result = await serverChangePassword(pwUser, pwValue);
      if (!result.ok) {
        setPwError(result.error);
        return;
      }
      setPwUser(null);
      setPwValue("");
      refresh();
    })();
  };

  const ownerLabel = (owner: string | undefined) => {
    const o = (owner || "").toLowerCase();
    if (o === session.username.toLowerCase()) return "You";
    const match = subAccounts.find((u) => u.username.toLowerCase() === o);
    return match ? match.username : owner || "Unassigned";
  };

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: paper, borderBottom: `1px solid ${vars.g200}` }}>
        <button onClick={onBack} className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80"
          style={{ background: ink, color: paper }}
        >
          <ArrowLeft size={16} /> Back to platform
        </button>
      </header>

      <div className="px-4 sm:px-10 py-10 sm:py-14 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
            {canCreateSubAccounts(session.role) ? <Users size={12} color={accent} /> : <User size={12} color={accent} />}
            <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              {canCreateSubAccounts(session.role) ? "Client accounts" : "Account settings"}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
            {canCreateSubAccounts(session.role) ? "Manage your client accounts" : "Account settings"}
          </h1>
          <p className="text-[14px] font-light mt-3 max-w-2xl leading-[1.7]" style={{ color: vars.g600 }}>
            {canCreateSubAccounts(session.role)
              ? "Give a client their own login so they can sign in and work on their own projects. They only ever see their own projects, while you still see everything across all of your clients."
              : "Manage your account settings, team members, and security options."}
          </p>
        </div>

        {/* ACCOUNT TYPE */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Account type</h2>
          <p className="text-[13px] font-light mb-5 leading-[1.7]" style={{ color: vars.g600 }}>
            Controls how your dashboard is set up - whether you manage multiple clients or one brand.
          </p>
          {!isAgencyOrClient ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="text-[12px] leading-[1.6]" style={{ color: "#7A5500" }}>
                Your account type was set up by an administrator. Contact support to change it.
              </p>
            </div>
          ) : !isOwner ? (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#FEF9EC", border: "1px solid #F5D57A" }}>
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#A0720A" }} />
              <p className="text-[12px] leading-[1.6]" style={{ color: "#7A5500" }}>
                Only the account owner can change the account type.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Agency / Partner option */}
                <button
                  type="button"
                  onClick={() => { setSelectedType("agency"); setTypeError(null); setTypeSuccess(null); }}
                  className="text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: (selectedType ?? session.role) === "agency" ? accent : vars.g200,
                    background: (selectedType ?? session.role) === "agency" ? "#FDF0F5" : "white",
                    boxShadow: (selectedType ?? session.role) === "agency" ? `0 0 0 1px ${accent}` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "agency" ? accent : vars.g100 }}>
                      <Building2 size={16} color={(selectedType ?? session.role) === "agency" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>Agency / Partner</p>
                      {session.role === "agency" && !selectedType && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.6]" style={{ color: vars.g600 }}>
                    Manage PR for multiple clients. Create client accounts and view all dashboards from one place.
                  </p>
                </button>

                {/* Client option */}
                <button
                  type="button"
                  onClick={() => { setSelectedType("client"); setTypeError(null); setTypeSuccess(null); }}
                  className="text-left p-5 rounded-xl border-2 transition-all hover:-translate-y-0.5"
                  style={{
                    borderColor: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g200,
                    background: (selectedType ?? session.role) === "client" ? "#EDF6F9" : "white",
                    boxShadow: (selectedType ?? session.role) === "client" ? `0 0 0 1px #1A647B` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (selectedType ?? session.role) === "client" ? "#1A647B" : vars.g100 }}>
                      <User size={16} color={(selectedType ?? session.role) === "client" ? "white" : vars.g500} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>Client</p>
                      {session.role === "client" && !selectedType && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A647B" }}>Current</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.6]" style={{ color: vars.g600 }}>
                    Manage PR for your own brand. One focused workspace for all your projects.
                  </p>
                </button>
              </div>

              {typeError && (
                <div className="flex items-start gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
                  <XCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "rgb(185,28,28)" }} />
                  <p className="text-[12px] font-semibold" style={{ color: "rgb(185,28,28)" }}>{typeError}</p>
                </div>
              )}
              {typeSuccess && (
                <div className="flex items-center gap-2 mb-3 px-4 py-3 rounded-xl" style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.25)" }}>
                  <CheckCircle2 size={14} style={{ color: "rgb(21,128,61)" }} />
                  <p className="text-[12px] font-semibold" style={{ color: "rgb(21,128,61)" }}>{typeSuccess}</p>
                </div>
              )}

              {selectedType && selectedType !== session.role && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleChangeAccountType}
                    disabled={typeChanging}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-60"
                    style={{ background: accent }}
                  >
                    {typeChanging ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {typeChanging ? "Saving..." : `Switch to ${selectedType === "agency" ? "Agency / Partner" : "Client"}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedType(null); setTypeError(null); }}
                    className="px-4 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                    style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* MY ACCOUNT */}
        <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>My account</h2>
          {(googleLinked === false || microsoftLinked === false) && (
            <p className="text-[13.5px] leading-[1.65] mb-4" style={{ color: vars.g600 }}>
              Linking is optional - if you would like to link your account to an existing Google or Microsoft account, please select below.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <label
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden group relative"
                style={{ background: accentSoft, color: accent }}
                title={avatarUrl ? "Change your photo" : "Add your photo"}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your photo" className="w-full h-full object-cover" />
                ) : uploadingImage === "avatar" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <User size={16} />
                )}
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-center leading-[1.2] px-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: "rgba(10,22,40,0.55)" }}>
                  {avatarUrl ? "Change" : "Add photo"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingImage !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleImageUpload("avatar", f);
                  }}
                />
              </label>
              <div>
                <p className="text-[14px] font-bold" style={{ color: ink }}>{session.username}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>{session.role}</span>
                  {accountWebsite && (
                    <a
                      href={accountWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
                      style={{ color: vars.g500 }}
                    >
                      <Globe size={11} /> {accountWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                </div>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => handleImageRemove("avatar")}
                    className="mt-1 text-[11px] font-medium hover:underline"
                    style={{ color: vars.g400 }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {googleLinked === true ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: "#E6F4EA", color: "#1B7A3E" }}>
                  <CheckCircle2 size={13} /> Google linked
                </span>
              ) : googleLinked === false ? (
                <a
                  href={`${apiBase()}/api/platform/auth/google/link`}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] border transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <LinkIcon size={13} /> Link Google account
                </a>
              ) : null}
              {microsoftLinked === true ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: "#E6F4EA", color: "#1B7A3E" }}>
                  <CheckCircle2 size={13} /> Microsoft linked
                </span>
              ) : microsoftLinked === false ? (
                <a
                  href={`${apiBase()}/api/platform/auth/microsoft?action=link`}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] border transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  <LinkIcon size={13} /> Link Microsoft account
                </a>
              ) : null}
              {isMasterOwner && (
                <button
                  onClick={handleSwitchToMaster}
                  disabled={switchingToMaster}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: ink, color: "#fff" }}
                >
                  {switchingToMaster ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                  {switchingToMaster ? "Switching..." : "Switch to Master"}
                </button>
              )}
            </div>
          </div>
          {switchToMasterError && (
            <p className="mt-3 text-[12px] font-semibold" style={{ color: accent }}>{switchToMasterError}</p>
          )}

          {/* BRAND / AGENCY LOGO */}
          <div className="mt-5 pt-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderTop: `1px solid ${vars.g200}` }}>
            <div className="flex items-center gap-3 flex-1">
              <label
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer group relative"
                style={{ background: vars.g50, border: `1px solid ${vars.g200}` }}
                title={logoUrl ? "Change your logo" : "Add your logo"}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Brand logo" className="w-full h-full object-contain p-1" />
                ) : uploadingImage === "logo" ? (
                  <Loader2 size={16} className="animate-spin" style={{ color: vars.g400 }} />
                ) : (
                  <ImageIcon size={16} style={{ color: vars.g400 }} />
                )}
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-center leading-[1.2] px-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: "rgba(10,22,40,0.55)" }}>
                  {logoUrl ? "Change" : "Add logo"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingImage !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleLogoFileChosen(f);
                  }}
                />
              </label>
              <div>
                <p className="text-[13px] font-bold" style={{ color: ink }}>Brand / agency logo</p>
                <p className="text-[12px] font-light" style={{ color: vars.g500 }}>
                  {logoUrl ? "Click the logo to change or resize it." : "Click the box to upload your company or brand logo (PNG, JPEG or WebP)."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => handleImageRemove("logo")}
                  className="text-[12px] font-medium hover:underline"
                  style={{ color: vars.g400 }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {imageError && (
            <p className="mt-3 text-[12px] font-semibold" style={{ color: accent }}>{imageError}</p>
          )}
        </div>

        {/* LOGO SIZING DIALOG - zoom and drag the logo into the square frame */}
        {logoAdjust && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: "rgba(10,22,40,0.55)" }} onClick={() => setLogoAdjust(null)}>
            <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: "white", boxShadow: "0 24px 64px -16px rgba(16,43,54,0.4)" }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Size your logo</h3>
              <p className="text-[12.5px] font-light mb-4" style={{ color: vars.g500 }}>Drag to position and use the slider to zoom until your logo sits nicely in the square.</p>
              <div className="mx-auto mb-4 relative overflow-hidden rounded-xl touch-none select-none" style={{ width: LOGO_PREVIEW, height: LOGO_PREVIEW, border: `1px solid ${vars.g200}`, background: "repeating-conic-gradient(#f1f5f9 0% 25%, white 0% 50%) 50% / 20px 20px", cursor: "grab" }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  logoDragRef.current = { startX: e.clientX, startY: e.clientY, baseOffX: logoAdjust.offX, baseOffY: logoAdjust.offY };
                }}
                onPointerMove={(e) => {
                  const d = logoDragRef.current;
                  if (!d) return;
                  setLogoAdjust((prev) => prev ? { ...prev, offX: d.baseOffX + (e.clientX - d.startX), offY: d.baseOffY + (e.clientY - d.startY) } : prev);
                }}
                onPointerUp={() => { logoDragRef.current = null; }}
                onPointerCancel={() => { logoDragRef.current = null; }}
              >
                {(() => {
                  const s0 = Math.min(LOGO_PREVIEW / logoAdjust.imgW, LOGO_PREVIEW / logoAdjust.imgH);
                  const w = logoAdjust.imgW * s0 * logoAdjust.zoom;
                  const hh = logoAdjust.imgH * s0 * logoAdjust.zoom;
                  return (
                    <img
                      src={logoAdjust.src}
                      alt="Logo preview"
                      draggable={false}
                      className="absolute pointer-events-none"
                      style={{ width: w, height: hh, left: LOGO_PREVIEW / 2 + logoAdjust.offX - w / 2, top: LOGO_PREVIEW / 2 + logoAdjust.offY - hh / 2, maxWidth: "none" }}
                    />
                  );
                })()}
              </div>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>Zoom</span>
                <input
                  type="range"
                  min={0.4}
                  max={3}
                  step={0.01}
                  value={logoAdjust.zoom}
                  onChange={(e) => setLogoAdjust((prev) => prev ? { ...prev, zoom: Number(e.target.value) } : prev)}
                  className="flex-1"
                  style={{ accentColor: accent }}
                />
                <button
                  type="button"
                  onClick={() => setLogoAdjust((prev) => prev ? { ...prev, zoom: 1, offX: 0, offY: 0 } : prev)}
                  className="text-[11px] font-semibold underline"
                  style={{ color: vars.g500 }}
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setLogoAdjust(null)}
                  className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] border transition-all hover:bg-gray-50"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogoAdjustSave}
                  className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:opacity-90"
                  style={{ background: accent }}
                >
                  Save logo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SIGN-IN & SECURITY (sessions, 2FA, password, deletion) */}
        {onSignOut && <AccountSecurityCard session={session} onSignOut={onSignOut} />}

        {/* TEAM MEMBERS (invite colleagues with roles + project access) */}
        {(session.membershipRole == null || session.membershipRole === "owner" || session.membershipRole === "admin") && (
          <TeamSection onWorkspacesChanged={onWorkspacesChanged} />
        )}

        {/* ADD CLIENT ACCOUNT - agency/admin only */}
        {canCreateSubAccounts(session.role) && <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-4" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Create a client account</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company name</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="e.g. Acme Ltd"
                required
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Company website</label>
              <input
                type="text"
                inputMode="url"
                value={newWebsite}
                onChange={(e) => setNewWebsite(e.target.value)}
                placeholder="e.g. https://www.acme.com"
                required
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Key contact full name <span className="font-medium normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Key contact email <span className="font-medium normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <input
                type="text"
                inputMode="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                placeholder="e.g. jane@acme.com"
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Client logo <span className="font-medium normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
              <div className="flex items-center gap-3">
                {newLogoDataUrl && (
                  <img src={newLogoDataUrl} alt="Client logo preview" className="h-10 w-10 rounded-lg object-contain" style={{ border: `1px solid ${vars.g200}`, background: "white" }} />
                )}
                <label
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px] font-semibold cursor-pointer transition-all hover:opacity-80"
                  style={{ borderColor: vars.g200, color: ink }}
                >
                  {logoProcessing ? "Processing..." : newLogoDataUrl ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleNewClientLogo(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {newLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setNewLogoDataUrl(null)}
                    className="text-[12px] font-semibold underline"
                    style={{ color: vars.g500 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="min 8 characters"
                required
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              />
            </div>
            <div className="md:col-span-6 flex items-end">
              <button
                type="submit"
                disabled={addingClient || logoProcessing}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: accent }}
              >
                {addingClient ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add client
              </button>
            </div>
            <p className="md:col-span-12 text-[12px] font-light" style={{ color: vars.g500 }}>
              If you add a key contact email, we'll let them know their account has been created. You share the password with them directly.
            </p>
            {addError && <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: accent }}>{addError}</p>}
            {addSuccess && <p className="md:col-span-12 text-[12px] font-semibold" style={{ color: vars.green }}>{addSuccess}</p>}
          </form>
        </div>}

        {canCreateSubAccounts(session.role) && (<>
        {/* CLIENT ACCOUNTS LIST */}
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Your client accounts ({subAccounts.length}{archivedSubAccounts.length > 0 ? ` + ${archivedSubAccounts.length} archived` : ""})</h2>
          </div>
          {subAccounts.length === 0 ? (
            <p className="px-6 py-6 text-[13px] font-light italic" style={{ color: vars.g500 }}>No client accounts yet. Create one above to give a client their own login.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {subAccounts.map((u) => {
                const editingPw = pwUser === u.username;
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                return (
                  <li key={u.username} className="px-6 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold" style={{ color: ink }}>{u.username}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: accentSoft, color: accent }}>Client</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleEnterAccount(u.username)}
                          disabled={enteringUsername === u.username}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all text-white"
                          style={{ background: accent, opacity: enteringUsername === u.username ? 0.7 : 1 }}
                        >
                          {enteringUsername === u.username ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />} Login as client
                        </button>
                        <button
                          onClick={() => { setPwUser(editingPw ? null : u.username); setPwValue(""); setPwError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <KeyRound size={12} /> {editingPw ? "Cancel" : "Change password"}
                        </button>
                        <button
                          onClick={() => handleArchive(u.username, true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}
                        >
                          <Archive size={12} /> Archive
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: accent, border: `1.5px solid ${accent}40` }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {enterError && enteringUsername === null && (
                      <p className="mt-2 text-[12px] font-semibold sm:pl-[52px]" style={{ color: accent }}>{enterError}</p>
                    )}
                    <div className="mt-3 sm:pl-[52px]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: vars.g500 }}>Their projects ({owned.length})</p>
                      {owned.length === 0 ? (
                        <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No projects yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: accentSoft, color: accent }}>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {editingPw && (
                      <form onSubmit={handleSavePassword} className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[52px]">
                        <input
                          type="text"
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="New password (min 8 chars)"
                          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2"
                          style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                        />
                        <button type="submit" className="px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ background: accent }}>Save</button>
                        {pwError && <span className="text-[12px] font-semibold w-full" style={{ color: accent }}>{pwError}</span>}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ARCHIVED ACCOUNTS */}
        {archivedSubAccounts.length > 0 && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-bold" style={{ color: vars.g400, fontFamily: "'Alice', Georgia, serif" }}>Archived clients ({archivedSubAccounts.length})</h2>
              <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g400 }}>These accounts cannot sign in. Their projects remain visible to you.</p>
            </div>
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {archivedSubAccounts.map((u) => {
                const owned = manageable.filter((p) => (p.owner || "").toLowerCase() === u.username.toLowerCase());
                return (
                  <li key={u.username} className="px-6 py-4" style={{ background: vars.g100 + "40" }}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3 opacity-60">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: vars.g200, color: vars.g400 }}>
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold" style={{ color: vars.g500 }}>{u.username}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ background: vars.g200, color: vars.g400 }}>Archived</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleArchive(u.username, false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: ink, border: `1.5px solid ${vars.g200}` }}
                        >
                          <ArchiveRestore size={12} /> Restore
                        </button>
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-black/5"
                          style={{ color: accent, border: `1.5px solid ${accent}40` }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    {owned.length > 0 && (
                      <div className="mt-3 sm:pl-[52px]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: vars.g400 }}>Their projects ({owned.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {owned.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full opacity-60" style={{ background: vars.g200, color: vars.g500 }}>
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* PROJECT ASSIGNMENT */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
            <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Assign projects</h2>
            <p className="text-[12px] font-light mt-1" style={{ color: vars.g500 }}>Hand a project to a client so it shows up in their own account. You keep access either way.</p>
          </div>
          {manageable.length === 0 ? (
            <p className="px-6 py-6 text-[13px] font-light italic" style={{ color: vars.g500 }}>No projects to assign yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: vars.g200 }}>
              {manageable.map((p) => (
                <li key={p.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold text-white" style={{ background: p.color }}>{p.initials}</span>
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: ink }}>{p.name}</p>
                      <p className="text-[11px] font-light" style={{ color: vars.g500 }}>Currently with: {ownerLabel(p.owner)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>Owner</label>
                    <select
                      value={(p.owner || "").toLowerCase() === session.username.toLowerCase() ? "__me__" : (p.owner || "")}
                      onChange={(e) => {
                        const val = e.target.value === "__me__" ? session.username : e.target.value;
                        onAssignProjectOwner(p.id, val);
                        refresh();
                      }}
                      className="px-3 py-2 rounded-lg border text-[13px] focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
                    >
                      <option value="__me__">You ({session.username})</option>
                      {subAccounts.map((u) => (
                        <option key={u.username} value={u.username}>{u.username}</option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}

export { SubAccountsPage };

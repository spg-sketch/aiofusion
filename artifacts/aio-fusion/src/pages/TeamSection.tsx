import { useEffect, useState } from "react";
import { Loader2, Mail, Users, Trash2, X, CheckCircle2, RefreshCw, Clock, Building2 } from "lucide-react";
import { vars } from "../marketing/vars";
import {
  type MembershipRole,
  type TeamOverview,
  type PendingMyInvite,
  serverGetTeam,
  serverInviteTeamMember,
  serverRevokeTeamInvite,
  serverResendTeamInvite,
  serverUpdateTeamMember,
  serverRemoveTeamMember,
  serverGetMyInvites,
  serverAcceptMyInvite,
  serverSwitchWorkspace,
} from "../lib/auth";
import { loadStoredProjects } from "../lib/projectStore";
import { apiBase } from "../lib/apiHelpers";

const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";

const ROLE_OPTIONS: { value: MembershipRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access, can manage team and billing" },
  { value: "content", label: "Content Team Member", hint: "Works on assigned projects only" },
  { value: "billing", label: "Billing", hint: "Invoices and billing only - no project access" },
  { value: "viewer", label: "Viewer", hint: "Read-only access" },
];

const roleLabel = (r: MembershipRole) =>
  ROLE_OPTIONS.find((o) => o.value === r)?.label ?? (r === "owner" ? "Owner" : r);

// Team management card: invite colleagues by email with a role and
// (optionally) restricted project access. Rendered inside SubAccountsPage for
// Agency/Partner owners and admins.
export function TeamSection({ onWorkspacesChanged }: { onWorkspacesChanged?: () => void } = {}) {
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState<MembershipRole>("content");
  const [restrict, setRestrict] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Invites addressed to the current user's own email (they are the invitee).
  const [myInvites, setMyInvites] = useState<PendingMyInvite[]>([]);
  const [myInvitesBusy, setMyInvitesBusy] = useState<string | null>(null);
  const [myInvitesAccepted, setMyInvitesAccepted] = useState<Record<string, { companyName: string; companyId: string }>>({});
  const [myInviteError, setMyInviteError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // Project chips must come from the SERVER (which only returns projects this
  // workspace owns), not the browser's cached list - the cache can hold stale
  // projects from a previously used workspace on the same device. Fall back to
  // the cache only while loading / if the request fails.
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(() => loadStoredProjects());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/store/projects`, { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { projects?: { id: string; name?: string }[] };
        if (cancelled || !Array.isArray(json.projects)) return;
        setProjects(json.projects.map((p) => ({ id: p.id, name: p.name ?? "" })));
      } catch {
        /* keep the cached fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Which team model this workspace runs (see TeamOverview.teamMode):
  //  - "agency": two pools - account seats (any role) + 3 content seats/project.
  //  - "client": a single pool of colleagues, always content members.
  //  - "standard": the original single-pool model.
  const mode = team?.teamMode ?? "standard";
  const isAgency = mode === "agency";
  const isClient = mode === "client";
  const projectSeatLimit = team?.projectSeatLimit ?? 3;
  const projectSeatsUsed = (id: string) => team?.projectSeats?.[id] ?? 0;

  // In agency mode, ticking "Assign to specific projects" switches the invite
  // to a per-project seat, which is always a content member.
  const effectiveRole: MembershipRole = isClient || (isAgency && restrict) ? "content" : role;
  const projectScoped = isClient ? false : isAgency ? true : effectiveRole === "content" || effectiveRole === "viewer";

  const reload = () => {
    void serverGetTeam().then((r) => {
      setLoading(false);
      if (r.ok && r.team) { setTeam(r.team); setLoadError(null); }
      else setLoadError(r.error ?? "Failed to load team.");
    });
  };
  useEffect(reload, []);

  // Load invites addressed to the current user's own email.
  const reloadMyInvites = () => {
    void serverGetMyInvites().then((r) => {
      if (r.ok && r.invites) setMyInvites(r.invites);
    });
  };
  useEffect(reloadMyInvites, []);

  const handleAcceptMyInvite = async (token: string) => {
    setMyInviteError(null);
    setMyInvitesBusy(token);
    const result = await serverAcceptMyInvite(token);
    setMyInvitesBusy(null);
    if (result.ok && result.companyId) {
      setMyInvitesAccepted((prev) => ({
        ...prev,
        [token]: { companyName: result.companyName ?? result.companySlug ?? "", companyId: result.companyId! },
      }));
      reloadMyInvites();
      // Notify parent so the workspace switcher updates immediately.
      onWorkspacesChanged?.();
    } else {
      setMyInviteError(result.error ?? "Failed to accept invitation.");
    }
  };

  const handleSwitchWorkspace = async (companyId: string) => {
    setSwitchingId(companyId);
    await serverSwitchWorkspace(companyId);
    // serverSwitchWorkspace reloads on success; setSwitchingId(null) only reached on error.
    setSwitchingId(null);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (isAgency && restrict && projectIds.length === 0) {
      setInviteError("Choose at least one project for a project team member.");
      return;
    }
    setSending(true);
    void serverInviteTeamMember({
      email: email.trim(),
      role: effectiveRole,
      projectIds: projectScoped && restrict ? projectIds : null,
      fullName: fullName.trim() || undefined,
      position: position.trim() || undefined,
    }).then((r) => {
      setSending(false);
      if (r.ok) {
        setInviteSuccess(`Invitation sent to ${email.trim()}.`);
        setEmail("");
        setFullName("");
        setPosition("");
        setRestrict(false);
        setProjectIds([]);
        reload();
      } else {
        setInviteError(r.error ?? "Failed to send invitation.");
      }
    });
  };

  const handleRevoke = (token: string) => {
    setBusy(token);
    void serverRevokeTeamInvite(token).then(() => { setBusy(null); reload(); });
  };

  const handleResend = (token: string) => {
    setBusy(token);
    void serverResendTeamInvite(token).then((r) => {
      setBusy(null);
      if (!r.ok) alert(r.error ?? "Failed to resend invitation.");
      else reload();
    });
  };

  const handleRemove = (userId: string, label: string) => {
    if (!window.confirm(`Remove ${label} from your team? They will lose access immediately.`)) return;
    setBusy(userId);
    void serverRemoveTeamMember(userId).then((r) => {
      setBusy(null);
      if (!r.ok) alert(r.error ?? "Failed to remove team member.");
      reload();
    });
  };

  // Per-member project-access editor ("Manage access"). Only meaningful for
  // project-scoped roles (content/viewer); null access = all projects.
  const [accessEditor, setAccessEditor] = useState<{ userId: string; restrict: boolean; projectIds: string[] } | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const openAccessEditor = (userId: string, current: string[] | null) => {
    setAccessError(null);
    setAccessEditor({ userId, restrict: current !== null, projectIds: current ?? [] });
  };

  const handleSaveAccess = () => {
    if (!accessEditor) return;
    setAccessSaving(true);
    setAccessError(null);
    void serverUpdateTeamMember(accessEditor.userId, {
      projectIds: accessEditor.restrict ? accessEditor.projectIds : null,
    }).then((r) => {
      setAccessSaving(false);
      if (r.ok) { setAccessEditor(null); reload(); }
      else setAccessError(r.error ?? "Failed to update project access.");
    });
  };

  const handleRoleChange = (userId: string, newRole: MembershipRole) => {
    setBusy(userId);
    void serverUpdateTeamMember(userId, { role: newRole }).then((r) => {
      setBusy(null);
      if (!r.ok) alert(r.error ?? "Failed to update role.");
      reload();
    });
  };

  // Workspace invitations - shown regardless of team-load state so users always
  // see pending cross-workspace invites even when the team members API fails.
  const invitationsBlock = (myInvites.length > 0 || Object.keys(myInvitesAccepted).length > 0) ? (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={13} color={accent} />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: vars.g600 }}>
          My workspace invitations
        </h3>
      </div>
      <p className="text-[12px] font-light mb-3 leading-relaxed" style={{ color: vars.g600 }}>
        You've been invited to join these workspaces.
      </p>
      {myInviteError && (
        <p className="mb-3 text-[12px] font-semibold" style={{ color: accent }}>{myInviteError}</p>
      )}
      <div className="space-y-2">
        {myInvites.filter((i) => !myInvitesAccepted[i.token]).map((i) => (
          <div
            key={i.token}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
          >
            <Building2 size={13} color="#92400E" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: ink }}>{i.companyName}</p>
              <p className="text-[11px]" style={{ color: vars.g600 }}>
                {roleLabel(i.role)} · expires {new Date(i.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => void handleAcceptMyInvite(i.token)}
              disabled={myInvitesBusy === i.token}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: ink, color: "#fff" }}
            >
              {myInvitesBusy === i.token ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {myInvitesBusy === i.token ? "Accepting…" : "Accept"}
            </button>
          </div>
        ))}
        {Object.entries(myInvitesAccepted).map(([token, info]) => (
          <div
            key={token}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
          >
            <CheckCircle2 size={13} color="#166534" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: "#166534" }}>Joined {info.companyName}!</p>
            </div>
            <button
              onClick={() => void handleSwitchWorkspace(info.companyId)}
              disabled={switchingId === info.companyId}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#166534", color: "#F0FDF4" }}
            >
              {switchingId === info.companyId ? <Loader2 size={12} className="animate-spin" /> : null}
              {switchingId === info.companyId ? "Switching…" : "Switch to workspace"}
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <>
        <div className="rounded-2xl p-6 sm:p-8 mb-6 flex items-center gap-3" style={{ background: "white", border: `1px solid ${vars.g200}` }}>
          <Loader2 size={16} className="animate-spin" color={accent} />
          <span className="text-[13px]" style={{ color: vars.g600 }}>Loading team…</span>
        </div>
        {invitationsBlock}
      </>
    );
  }
  // Team management not available (e.g. client account) - hide the team card but
  // still show pending cross-workspace invitations.
  if (!team) {
    const errorCard = loadError && !loadError.toLowerCase().includes("not available")
      ? (
        <div className="rounded-2xl p-6 mb-6 text-[13px]" style={{ background: "white", border: `1px solid ${vars.g200}`, color: accent }}>
          {loadError}
        </div>
      )
      : null;
    if (!errorCard && !invitationsBlock) return null;
    return <>{errorCard}{invitationsBlock}</>;
  }

  const seatsFull = team.seatsUsed >= team.seatLimit;
  // In agency mode a full account pool only blocks account-seat invites -
  // project seats have their own per-project pools.
  const submitBlocked = seatsFull && !(isAgency && restrict);
  const pendingInvites = team.invites.filter((i) => !i.expired);
  const expiredInvites = team.invites.filter((i) => i.expired);

  return (
    <>
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Team members</h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full" style={{ background: seatsFull ? "#FDECEC" : accentSoft, color: seatsFull ? "#B3261E" : accent }}>
          {team.seatsUsed} / {team.seatLimit} {isAgency ? "account seats" : "seats"}
        </span>
      </div>
      <p className="text-[13px] font-light mb-5 leading-[1.6]" style={{ color: vars.g600 }}>
        {isClient
          ? `Invite up to ${team.seatLimit} colleagues to work on your content. Each person gets their own login as a Content Team Member.`
          : isAgency
            ? `Invite your own staff. Account seats (up to ${team.seatLimit}) are for people managing this account - for example billing. Or assign a team member to specific projects: each project has ${projectSeatLimit} seats of its own, and project members work on those projects only.`
            : "Invite colleagues to work in this account. Each person gets their own login with the role and project access you choose."}
      </p>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
          <div className="md:col-span-6">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Smith"
              maxLength={128}
              className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
            />
          </div>
          <div className="md:col-span-6">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Position</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Head of Content"
              maxLength={128}
              className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-end">
          <div className="md:col-span-5">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@youragency.com"
              required
              className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
            />
          </div>
          <div className="md:col-span-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Role</label>
            {isClient || (isAgency && restrict) ? (
              <div className="w-full px-3 py-2.5 rounded-lg border text-[14px]" style={{ borderColor: vars.g200, background: "#f8fafc", color: ink }}>
                Content Team Member
              </div>
            ) : (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as MembershipRole)}
                className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 bg-white"
                style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} - {o.hint}</option>
                ))}
              </select>
            )}
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={sending || submitBlocked}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: ink, color: "#fff" }}
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {sending ? "Sending…" : "Send invite"}
            </button>
          </div>
        </div>

        {projectScoped && (
          <div className="mt-3">
            <label className="flex items-center gap-2 text-[13px]" style={{ color: ink }}>
              <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} style={{ accentColor: accent }} />
              {isAgency ? "Assign to specific projects (project seat - Content Team Member)" : "Limit to specific projects"}
            </label>
            {restrict && (
              <div className="mt-2 flex flex-wrap gap-2">
                {projects.length === 0 && (
                  <span className="text-[12px]" style={{ color: vars.g600 }}>No projects yet - the member will see projects you assign later.</span>
                )}
                {projects.map((p) => {
                  const checked = projectIds.includes(p.id);
                  const used = projectSeatsUsed(p.id);
                  const full = isAgency && !checked && used >= projectSeatLimit;
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border"
                      style={{
                        borderColor: checked ? accent : vars.g300,
                        background: checked ? accentSoft : "white",
                        color: full ? (vars.g400 ?? "#94a3b8") : checked ? accent : ink,
                        cursor: full ? "not-allowed" : "pointer",
                        opacity: full ? 0.7 : 1,
                      }}
                      title={full ? `This project's ${projectSeatLimit} seats are taken.` : undefined}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        disabled={full}
                        onChange={() =>
                          setProjectIds((ids) => (checked ? ids.filter((i) => i !== p.id) : [...ids, p.id]))
                        }
                      />
                      {p.name || p.id}
                      {isAgency && <span style={{ fontWeight: 400 }}>({used}/{projectSeatLimit})</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {submitBlocked && (
          <p className="mt-3 text-[12px] font-semibold" style={{ color: "#B3261E" }}>
            {isAgency
              ? `You've reached your account seat limit (${team.seatLimit}). You can still assign team members to specific projects, or contact info@aiofusion.ai to add more account seats.`
              : `You've reached your seat limit (${team.seatLimit}). Contact info@aiofusion.ai to add more seats.`}
          </p>
        )}
        {inviteError && <p className="mt-3 text-[12px] font-semibold" style={{ color: accent }}>{inviteError}</p>}
        {inviteSuccess && (
          <p className="mt-3 text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "#1B7A3E" }}>
            <CheckCircle2 size={13} /> {inviteSuccess}
          </p>
        )}
      </form>

      {/* Members list */}
      <div className="space-y-2">
        {team.members.map((m) => (
          <div key={m.userId} className="px-4 py-3 rounded-xl" style={{ background: "#f8fafc", border: `1px solid ${vars.g200}` }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: accentSoft, color: accent }}>
                <Users size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: ink }}>
                  {m.name || m.email || m.userId}{m.isSelf ? " (you)" : ""}
                </p>
                {(m.email && m.name) || m.position ? (
                  <p className="text-[11px] truncate" style={{ color: vars.g600 }}>
                    {[m.position, m.email && m.name ? m.email : null].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {m.projectAccess && (
                  <p className="text-[11px]" style={{ color: vars.g600 }}>
                    {m.projectAccess.length} assigned project{m.projectAccess.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {m.role === "owner" || m.isSelf ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]" style={{ background: accentSoft, color: accent }}>
                  {roleLabel(m.role)}
                </span>
              ) : (
                <>
                  {(isClient || (isAgency && m.projectAccess)) && m.role === "content" ? (
                    // Client colleagues and agency project-seat members are
                    // always content members - no role to choose. Legacy
                    // members with another role keep the dropdown so their
                    // role can be corrected.
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]" style={{ background: accentSoft, color: accent }}>
                      {roleLabel("content")}
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      disabled={busy === m.userId}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value as MembershipRole)}
                      className="px-2 py-1.5 rounded-lg border text-[12px] bg-white"
                      style={{ borderColor: vars.g200 }}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  {(m.role === "content" || m.role === "viewer") && (
                    <button
                      onClick={() =>
                        accessEditor?.userId === m.userId
                          ? setAccessEditor(null)
                          : openAccessEditor(m.userId, m.projectAccess ?? null)
                      }
                      className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border transition-all hover:bg-white"
                      style={{ borderColor: accessEditor?.userId === m.userId ? accent : vars.g300, color: accessEditor?.userId === m.userId ? accent : ink }}
                    >
                      Manage access
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(m.userId, m.name || m.email || "this member")}
                    disabled={busy === m.userId}
                    className="p-2 rounded-lg transition-colors hover:bg-red-50"
                    title="Remove from team"
                    style={{ color: "#B3261E" }}
                  >
                    {busy === m.userId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </>
              )}
            </div>
          </div>
          {accessEditor?.userId === m.userId && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${vars.g200}` }}>
              <label className="flex items-center gap-2 text-[13px]" style={{ color: ink }}>
                <input
                  type="checkbox"
                  checked={accessEditor.restrict}
                  onChange={(e) => setAccessEditor((prev) => prev && { ...prev, restrict: e.target.checked })}
                  style={{ accentColor: accent }}
                />
                Limit to specific projects
              </label>
              {!accessEditor.restrict && (
                <p className="mt-1.5 text-[12px]" style={{ color: vars.g600 }}>
                  This member can see all of this workspace's projects.
                </p>
              )}
              {accessEditor.restrict && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {projects.length === 0 && (
                    <span className="text-[12px]" style={{ color: vars.g600 }}>No projects yet.</span>
                  )}
                  {projects.map((p) => {
                    const checked = accessEditor.projectIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border"
                        style={{ borderColor: checked ? accent : vars.g300, background: checked ? accentSoft : "white", color: checked ? accent : ink }}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() =>
                            setAccessEditor((prev) =>
                              prev && {
                                ...prev,
                                projectIds: checked
                                  ? prev.projectIds.filter((i) => i !== p.id)
                                  : [...prev.projectIds, p.id],
                              },
                            )
                          }
                        />
                        {p.name || p.id}
                      </label>
                    );
                  })}
                </div>
              )}
              {accessError && <p className="mt-2 text-[12px] font-semibold" style={{ color: accent }}>{accessError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleSaveAccess}
                  disabled={accessSaving}
                  className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: ink, color: "#fff" }}
                >
                  {accessSaving && <Loader2 size={12} className="animate-spin" />}
                  Save access
                </button>
                <button
                  onClick={() => setAccessEditor(null)}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] border transition-all hover:bg-white"
                  style={{ borderColor: vars.g300, color: ink }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: vars.g600 }}>Pending invitations</h3>
          <div className="space-y-2">
            {pendingInvites.map((i) => (
              <div key={i.token} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <Mail size={13} color="#92400E" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: ink }}>
                    {i.name ? `${i.name} · ${i.email}` : i.email}
                  </p>
                  <p className="text-[11px]" style={{ color: vars.g600 }}>
                    {[roleLabel(i.role), i.position, `expires ${new Date(i.expiresAt).toLocaleDateString()}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleResend(i.token)}
                    disabled={busy === i.token}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border transition-all hover:bg-white"
                    style={{ borderColor: "#92400E", color: "#92400E" }}
                    title="Resend invitation"
                  >
                    {busy === i.token ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Resend
                  </button>
                  <button
                    onClick={() => handleRevoke(i.token)}
                    disabled={busy === i.token}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border transition-all hover:bg-white"
                    style={{ borderColor: vars.g300, color: ink }}
                  >
                    {busy === i.token ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired invitations */}
      {expiredInvites.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: vars.g600 }}>Expired invitations</h3>
          <div className="space-y-2">
            {expiredInvites.map((i) => (
              <div key={i.token} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "#f8fafc", border: `1px solid ${vars.g200}`, opacity: 0.85 }}>
                <Clock size={13} color={vars.g400 ?? "#94a3b8"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: vars.g600 }}>{i.email}</p>
                    <span
                      className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ background: "#F1F5F9", color: vars.g600 ?? "#64748b" }}
                    >
                      Expired
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: vars.g400 ?? "#94a3b8" }}>
                    {roleLabel(i.role)} · expired {new Date(i.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleResend(i.token)}
                    disabled={busy === i.token}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border transition-all hover:bg-white"
                    style={{ borderColor: accent, color: accent }}
                    title="Resend with a fresh link"
                  >
                    {busy === i.token ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Resend
                  </button>
                  <button
                    onClick={() => handleRevoke(i.token)}
                    disabled={busy === i.token}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border transition-all hover:bg-white"
                    style={{ borderColor: vars.g200, color: vars.g600 ?? "#64748b" }}
                    title="Remove this expired invitation"
                  >
                    {busy === i.token ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
    {invitationsBlock}
    </>
  );
}


export default TeamSection;

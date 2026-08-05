import { useEffect, useMemo, useState } from "react";
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

const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";

const ROLE_OPTIONS: { value: MembershipRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access, can manage the team" },
  { value: "content", label: "Content staff", hint: "Works on assigned projects only" },
  { value: "billing", label: "Billing", hint: "Invoices and billing only — no project access" },
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

  const projects = useMemo(() => loadStoredProjects(), []);
  const projectScoped = role === "content" || role === "viewer";

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
    setSending(true);
    void serverInviteTeamMember({
      email: email.trim(),
      role,
      projectIds: projectScoped && restrict ? projectIds : null,
    }).then((r) => {
      setSending(false);
      if (r.ok) {
        setInviteSuccess(`Invitation sent to ${email.trim()}.`);
        setEmail("");
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

  const handleRoleChange = (userId: string, newRole: MembershipRole) => {
    setBusy(userId);
    void serverUpdateTeamMember(userId, { role: newRole }).then((r) => {
      setBusy(null);
      if (!r.ok) alert(r.error ?? "Failed to update role.");
      reload();
    });
  };

  // Workspace invitations — shown regardless of team-load state so users always
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
  // Team management not available (e.g. client account) — hide the team card but
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
  const pendingInvites = team.invites.filter((i) => !i.expired);
  const expiredInvites = team.invites.filter((i) => i.expired);

  return (
    <>
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Team members</h2>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full" style={{ background: seatsFull ? "#FDECEC" : accentSoft, color: seatsFull ? "#B3261E" : accent }}>
          {team.seatsUsed} / {team.seatLimit} seats
        </span>
      </div>
      <p className="text-[13px] font-light mb-5 leading-[1.6]" style={{ color: vars.g600 }}>
        Invite colleagues to work in this account. Each person gets their own login with the role and project access you choose.
      </p>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-6">
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
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 bg-white"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={sending || seatsFull}
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
              Limit to specific projects
            </label>
            {restrict && (
              <div className="mt-2 flex flex-wrap gap-2">
                {projects.length === 0 && (
                  <span className="text-[12px]" style={{ color: vars.g600 }}>No projects yet — the member will see projects you assign later.</span>
                )}
                {projects.map((p) => {
                  const checked = projectIds.includes(p.id);
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
                          setProjectIds((ids) => (checked ? ids.filter((i) => i !== p.id) : [...ids, p.id]))
                        }
                      />
                      {p.name || p.id}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {seatsFull && (
          <p className="mt-3 text-[12px] font-semibold" style={{ color: "#B3261E" }}>
            You've reached your seat limit ({team.seatLimit}). Contact info@aiofusion.ai to add more seats.
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
          <div key={m.userId} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 rounded-xl" style={{ background: "#f8fafc", border: `1px solid ${vars.g200}` }}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: accentSoft, color: accent }}>
                <Users size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: ink }}>
                  {m.name || m.email || m.userId}{m.isSelf ? " (you)" : ""}
                </p>
                {m.email && m.name && <p className="text-[11px] truncate" style={{ color: vars.g600 }}>{m.email}</p>}
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
                  <p className="text-[13px] font-semibold truncate" style={{ color: ink }}>{i.email}</p>
                  <p className="text-[11px]" style={{ color: vars.g600 }}>
                    {roleLabel(i.role)} · expires {new Date(i.expiresAt).toLocaleDateString()}
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

import { useState, useMemo } from "react";
import {
  ArrowLeft, Users, Plus, User, KeyRound, Archive, ArchiveRestore, Trash2, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { vars } from "../marketing/vars";
import {
  type Session as LocalSession,
  type User as LocalUser,
  serverAddUser,
  serverDeleteUser,
  serverChangePassword,
  serverArchiveUser,
  serverAssignOwner,
  getUsers as getLocalUsers,
  refreshAccountsCache,
} from "../lib/auth";
import { loadStoredProjects } from "../lib/projects";

export function SubAccountsPage({
  onBack,
  session,
  onAssignProjectOwner,
}: {
  onBack: () => void;
  session: LocalSession;
  onAssignProjectOwner: (id: string, owner: string) => void;
}) {
  const ink = "#102B36";
  const accent = "#C8497A";
  const accentSoft = "#FBE3ED";
  const teal = "#1f748f";

  const [users, setUsers] = useState<LocalUser[]>(() => getLocalUsers());
  const refresh = () => {
    void refreshAccountsCache().then(() => setUsers(getLocalUsers()));
  };

  const subAccounts = useMemo(
    () => users.filter((u) => u.username.toLowerCase() !== session.username.toLowerCase() && !u.archivedAt),
    [users, session.username]
  );
  const archivedAccounts = useMemo(
    () => users.filter((u) => u.username.toLowerCase() !== session.username.toLowerCase() && u.archivedAt),
    [users, session.username]
  );
  const projects = useMemo(() => loadStoredProjects(), []);

  const [addingUser, setAddingUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState<string | null>(null);
  const [changePwOk, setChangePwOk] = useState<string | null>(null);
  const [archivingUser, setArchivingUser] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const manageable = projects.filter((p) => !p.deletedAt);

  const ownerLabel = (owner?: string | null) => {
    if (!owner) return "Unassigned";
    if (owner.toLowerCase() === session.username.toLowerCase()) return `You (${session.username})`;
    return users.find((u) => u.username.toLowerCase() === owner.toLowerCase())?.displayName || owner;
  };

  const handleAssignOwner = (projectId: string, owner: string) => {
    void serverAssignOwner(projectId, owner).then((r) => {
      if (r.ok) { onAssignProjectOwner(projectId, owner); refresh(); }
    });
  };

  const handleAdd = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setAddLoading(true); setAddError(null);
    const r = await serverAddUser(newUsername.trim(), newPassword, "client", newDisplayName.trim() || undefined);
    if (r.ok) {
      setNewUsername(""); setNewPassword(""); setNewDisplayName(""); setAddingUser(false);
      refresh();
    } else {
      setAddError(r.error);
    }
    setAddLoading(false);
  };

  const handleDelete = async (username: string) => {
    setDeleteLoading(true);
    const r = await serverDeleteUser(username);
    if (r.ok) { setDeleteConfirm(null); refresh(); }
    setDeleteLoading(false);
  };

  const handleChangePw = async () => {
    if (!changePwUser || !changePwValue.trim()) return;
    setChangePwLoading(true); setChangePwError(null); setChangePwOk(null);
    const r = await serverChangePassword(changePwUser, changePwValue.trim());
    if (r.ok) { setChangePwOk(changePwUser); setChangePwValue(""); setChangePwUser(null); }
    else { setChangePwError(r.error); }
    setChangePwLoading(false);
  };

  const handleArchive = async (username: string, archived: boolean) => {
    setArchivingUser(username);
    const r = await serverArchiveUser(username, archived);
    if (r.ok) refresh();
    setArchivingUser(null);
  };

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between sticky top-0 z-10" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] hover:opacity-70 transition-opacity" style={{ color: vars.g500 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="h-5 w-px" style={{ background: vars.g200 }} />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accentSoft, color: accent }}>
              <Users size={15} />
            </div>
            <div>
              <h1 className="text-[16px] font-bold leading-none" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Client accounts</h1>
              <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>Manage client logins and project access</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { setAddingUser(true); setAddError(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90"
          style={{ background: teal }}
        >
          <Plus size={13} /> Add client
        </button>
      </header>

      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto space-y-6">

        {/* ADD CLIENT */}
        {addingUser && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#F0F4FF" }}>
                <Plus size={16} color={teal} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>New client account</h2>
                <p className="text-[13px] font-light mt-0.5" style={{ color: vars.g600 }}>The client will log in with these credentials and see only the projects you assign to them.</p>
              </div>
              <button onClick={() => setAddingUser(false)} className="text-[20px] leading-none px-2 mt-0.5" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {([
                { key: "username", label: "Username", placeholder: "e.g. acme-client", value: newUsername, onChange: setNewUsername },
                { key: "displayName", label: "Display name (optional)", placeholder: "e.g. Acme Ltd", value: newDisplayName, onChange: setNewDisplayName },
              ] as const).map(({ key, label, placeholder, value, onChange }) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{label}</label>
                  <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Choose a secure password" className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            {addError && (
              <div className="flex items-center gap-2 mt-4 p-3 rounded-lg text-[12px]" style={{ background: "rgba(176,61,51,0.08)", color: "#B03D33" }}>
                <AlertTriangle size={13} /> {addError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setAddingUser(false)} className="px-4 py-2 rounded-full text-[12px] font-bold border uppercase tracking-[0.12em]" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button onClick={() => void handleAdd()} disabled={!newUsername.trim() || !newPassword.trim() || addLoading} className="flex items-center gap-2 px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-40" style={{ background: teal }}>
                {addLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create client
              </button>
            </div>
          </div>
        )}

        {/* CLIENT LIST */}
        {(subAccounts.length > 0 || archivedAccounts.length > 0) && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Client accounts ({subAccounts.length})</h2>
            </div>
            {subAccounts.length === 0 ? (
              <p className="px-6 py-6 text-[13px] font-light italic" style={{ color: vars.g500 }}>No client accounts yet. Add a client above.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: vars.g100 }}>
                {subAccounts.map((u) => {
                  const owned = projects.filter((p) => !p.deletedAt && p.owner?.toLowerCase() === u.username.toLowerCase());
                  return (
                    <li key={u.username} className="px-6 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F0F4FF", color: teal }}>
                            <User size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[14px] font-bold truncate" style={{ color: ink }}>{u.displayName?.trim() || u.username}</p>
                              {u.displayName && <p className="text-[11px] font-light" style={{ color: vars.g400 }}>@{u.username}</p>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Change password */}
                          {changePwUser === u.username ? (
                            <div className="flex items-center gap-1.5">
                              <input type="password" value={changePwValue} onChange={(e) => setChangePwValue(e.target.value)} placeholder="New password..." className="px-2 py-1.5 rounded-lg border text-[12px] w-36" style={{ borderColor: vars.g200 }} autoFocus />
                              <button onClick={() => void handleChangePw()} disabled={!changePwValue.trim() || changePwLoading} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: teal, opacity: !changePwValue.trim() || changePwLoading ? 0.5 : 1 }}>
                                {changePwLoading ? <Loader2 size={10} className="animate-spin" /> : "Set"}
                              </button>
                              <button onClick={() => { setChangePwUser(null); setChangePwValue(""); setChangePwError(null); }} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => { setChangePwUser(u.username); setChangePwValue(""); setChangePwError(null); setChangePwOk(null); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5" style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}>
                              <KeyRound size={11} /> Password
                            </button>
                          )}

                          {/* Archive */}
                          <button onClick={() => void handleArchive(u.username, true)} disabled={archivingUser === u.username} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5 disabled:opacity-40" style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}>
                            {archivingUser === u.username ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />} Archive
                          </button>

                          {/* Delete */}
                          {deleteConfirm === u.username ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold" style={{ color: "#B03D33" }}>Sure?</span>
                              <button onClick={() => void handleDelete(u.username)} disabled={deleteLoading} className="px-2.5 py-1.5 rounded-full text-[10px] font-bold text-white uppercase tracking-[0.12em]" style={{ background: "#B03D33", opacity: deleteLoading ? 0.5 : 1 }}>
                                {deleteLoading ? <Loader2 size={10} className="animate-spin" /> : "Delete"}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ color: vars.g400 }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(u.username)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-red-50" style={{ color: "#B03D33", border: `1.5px solid rgba(176,61,51,0.3)` }}>
                              <Trash2 size={11} /> Delete
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Feedback */}
                      {changePwOk === u.username && (
                        <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#3D9B6B" }}>
                          <CheckCircle2 size={13} /> Password changed successfully.
                        </div>
                      )}
                      {changePwError && changePwUser === u.username && (
                        <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "#B03D33" }}>
                          <AlertTriangle size={13} /> {changePwError}
                        </div>
                      )}

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
            )}

            {/* Archived section */}
            {archivedAccounts.length > 0 && (
              <div className="border-t" style={{ borderColor: vars.g200 }}>
                <div className="px-6 py-3 flex items-center gap-2" style={{ background: vars.g50 }}>
                  <Archive size={13} color={vars.g400} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g400 }}>Archived ({archivedAccounts.length})</p>
                </div>
                <ul className="divide-y" style={{ borderColor: vars.g100 }}>
                  {archivedAccounts.map((u) => (
                    <li key={u.username} className="px-6 py-3 flex items-center gap-3 opacity-60">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: vars.g100, color: vars.g400 }}>
                          <User size={14} />
                        </div>
                        <p className="text-[13px] font-light" style={{ color: ink }}>{u.displayName?.trim() || u.username}</p>
                      </div>
                      <button onClick={() => void handleArchive(u.username, false)} disabled={archivingUser === u.username} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:bg-black/5 disabled:opacity-40" style={{ color: vars.g500, border: `1.5px solid ${vars.g200}` }}>
                        {archivingUser === u.username ? <Loader2 size={10} className="animate-spin" /> : <ArchiveRestore size={10} />} Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                        handleAssignOwner(p.id, val);
                      }}
                      className="px-3 py-2 rounded-lg border text-[13px] focus:outline-none bg-white"
                      style={{ borderColor: vars.g200 }}
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

      </div>
    </div>
  );
}

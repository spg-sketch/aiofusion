import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { type WorkspaceInfo, serverSwitchWorkspace } from "../lib/auth";

interface Props {
  workspaces: WorkspaceInfo[];
  /** Extra CSS classes for positioning/layout in the parent. */
  className?: string;
}

/**
 * Compact workspace selector shown when the signed-in user belongs to more than
 * one workspace. Selecting a different workspace calls POST /platform/switch-workspace
 * (which re-issues the session cookie) then reloads the page. A full reload is the
 * safest option: workspace-scoped localStorage keys (archive/planner, saved audits)
 * and all in-memory React state reset cleanly against the new workspace's data.
 */
export function WorkspaceSwitcher({ workspaces, className = "" }: Props) {
  const [switching, setSwitching] = useState(false);

  if (workspaces.length <= 1) return null;

  const active = workspaces.find((w) => w.isActive) ?? workspaces[0];

  const handleChange = async (companyId: string) => {
    if (companyId === active?.companyId) return;
    setSwitching(true);
    await serverSwitchWorkspace(companyId);
    // serverSwitchWorkspace reloads on success; only reached on error.
    setSwitching(false);
  };

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      title="Switch workspace"
    >
      <Building2 size={13} color="#1F748F" />
      {switching ? (
        <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "#1F748F" }}>
          <Loader2 size={12} className="animate-spin" /> Switching…
        </span>
      ) : (
        <select
          value={active?.companyId ?? ""}
          onChange={(e) => void handleChange(e.target.value)}
          className="text-[12px] font-semibold bg-transparent border-none outline-none cursor-pointer pr-1"
          style={{ color: "#1F748F" }}
          aria-label="Switch workspace"
        >
          {workspaces.map((w) => (
            <option key={w.companyId} value={w.companyId}>
              {w.companyName}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;

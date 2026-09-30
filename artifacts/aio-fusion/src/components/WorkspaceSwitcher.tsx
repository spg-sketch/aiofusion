import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { type WorkspaceInfo, serverSwitchWorkspace } from "../lib/auth";

interface Props {
  workspaces: WorkspaceInfo[];
  /** Extra CSS classes for positioning/layout in the parent. */
  className?: string;
  requestAction?: (run: () => void) => boolean;
}

/**
 * Compact workspace selector shown when the signed-in user belongs to more than
 * one workspace. Selecting a different workspace calls POST /platform/switch-workspace
 * (which re-issues the session cookie) then reloads the page. A full reload is the
 * safest option: workspace-scoped localStorage keys (archive/planner, saved audits)
 * and all in-memory React state reset cleanly against the new workspace's data.
 */
export function WorkspaceSwitcher({ workspaces, className = "", requestAction }: Props) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (workspaces.length <= 1) return null;

  const active = workspaces.find((w) => w.isActive) ?? workspaces[0];

  const handleChange = (companyId: string) => {
    if (companyId === active?.companyId) return;
    const switchWorkspace = () => {
      setSwitching(true);
      setError(null);
      void serverSwitchWorkspace(companyId).then((result) => {
        // serverSwitchWorkspace reloads on success; only reached on error.
        setSwitching(false);
        if (!result.ok) setError(result.error ?? "Could not switch workspace.");
      });
    };
    if (requestAction) requestAction(switchWorkspace);
    else switchWorkspace();
  };

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#C8497A] ${className}`}
      title="Switch workspace"
      aria-live="polite"
    >
      <Building2 size={15} color="#0a1628" aria-hidden="true" className="shrink-0" />
      {switching ? (
        <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "#0a1628" }}>
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Switching…
        </span>
      ) : (
        <select
          value={active?.companyId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          className="min-w-0 max-w-[120px] cursor-pointer border-none bg-white pr-1 text-[12px] font-semibold outline-none sm:max-w-[200px]"
          style={{ color: "#0a1628" }}
          aria-label="Switch workspace"
          aria-describedby={error ? "workspace-switch-error" : undefined}
        >
          {workspaces.map((w) => (
            <option key={w.companyId} value={w.companyId}>
              {w.companyName}
            </option>
          ))}
        </select>
      )}
      {error && <span id="workspace-switch-error" role="alert" className="sr-only">{error}</span>}
    </div>
  );
}

export default WorkspaceSwitcher;

import { ReactNode, useState } from "react";
import {
  LayoutDashboard,
  Search,
  FileEdit,
  BarChart3,
  Archive,
  Send,
  LineChart,
  ChevronRight,
  Lock,
  Zap,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard", active: true },
  { icon: Search, label: "GEO Diagnostic", id: "diagnostic", active: true },
  { icon: FileEdit, label: "Content Optimiser", id: "optimiser", active: true },
  { icon: BarChart3, label: "Authority Planner", id: "planner", active: true },
  { icon: Archive, label: "Archive", id: "archive", locked: true },
  { icon: Send, label: "Release Gateway", id: "gateway", locked: true },
  { icon: LineChart, label: "Measure & Report", id: "measure", locked: true },
];

interface AppLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate?: (page: string) => void;
}

export function AppLayout({ children, currentPage, onNavigate }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full" style={{ background: "var(--aio-navy)" }}>
      <aside
        className="flex flex-col border-r transition-all duration-300"
        style={{
          width: collapsed ? 72 : 240,
          borderColor: "var(--aio-border)",
          background: "var(--aio-navy)",
        }}
      >
        <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: "var(--aio-border)" }}>
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, var(--aio-accent), #7c5cff)",
            }}
          >
            <Zap size={18} color="white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-white">AIO Fusion</span>
              <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--aio-gray-400)" }}>
                GEO Platform
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const isLocked = item.locked;
            return (
              <button
                key={item.id}
                onClick={() => !isLocked && onNavigate?.(item.id)}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative group"
                style={{
                  background: isActive ? "rgba(79, 143, 255, 0.12)" : "transparent",
                  color: isActive ? "var(--aio-accent)" : isLocked ? "var(--aio-gray-500)" : "var(--aio-gray-300)",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.6 : 1,
                }}
              >
                <item.icon size={18} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isLocked && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(255,255,255,0.06)", color: "var(--aio-gray-500)" }}>
                        <Lock size={10} /> V2
                      </span>
                    )}
                    {isActive && <ChevronRight size={14} />}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: "var(--aio-border)" }}>
          {!collapsed && (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #4f8fff, #7c5cff)" }}>
                SP
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-white">Simpatico PR</span>
                <span className="text-[10px]" style={{ color: "var(--aio-gray-500)" }}>Intelligence Tier</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto" style={{ background: "var(--aio-gray-50)" }}>
        {children}
      </main>
    </div>
  );
}

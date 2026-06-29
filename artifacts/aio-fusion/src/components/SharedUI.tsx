import { vars } from "../marketing/vars";
import { Check } from "lucide-react";
import type { Role as LocalRole } from "../lib/auth";

export function countWords(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export const CONTENT_TYPES = [
  "Press release", "Article", "Article Media Pitch", "Case study", "Whitepaper", "Blog post",
  "Social post", "Event copy", "Speaker submission", "Award submission", "Directory entry",
];

export function Labelled({ label, hint, children, action }: { label: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <label className="block text-[12px] font-semibold" style={{ color: vars.navy }}>
          {label}
          {hint && <span className="text-[11px] font-light ml-2" style={{ color: vars.g400 }}>· {hint}</span>}
        </label>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: vars.g400 }}>{label}</span>
      <span className="text-[13px]" style={{ color: vars.navy }}>{value}</span>
    </div>
  );
}

export function ScorePill({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="text-center px-2 py-1 rounded-md" style={{ background: `${color}15` }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
      <div className="text-[14px] font-bold leading-tight" style={{ color }}>{score.toFixed(1)}</div>
    </div>
  );
}

export function PlaceholderPage({
  title,
  intro,
  features,
  badge,
  badgeColor,
  icon: Icon,
}: {
  title: string;
  intro: string;
  features: { heading: string; copy: string }[];
  badge?: string;
  badgeColor?: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}) {
  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl mb-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{title}</h1>
          <p className="text-[14px] font-light max-w-3xl" style={{ color: vars.g500 }}>{intro}</p>
        </div>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-full" style={{ background: `${badgeColor || vars.accent}15`, color: badgeColor || vars.accent }}>
            {badge}
          </span>
        )}
      </div>
      <div className="bg-white border rounded-2xl p-6 sm:p-8" style={{ borderColor: vars.g200 }}>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${badgeColor || vars.accent}10` }}>
            <Icon size={20} color={badgeColor || vars.accent} />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold mb-1" style={{ color: vars.navy }}>What this page will do</h2>
            <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Designed in the wireframe doc; build scheduled in this iteration.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div key={f.heading} className="p-4 rounded-xl border" style={{ background: vars.g50, borderColor: vars.g200 }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Check size={14} color={badgeColor || vars.accent} />
                <span className="text-[13px] font-semibold" style={{ color: vars.navy }}>{f.heading}</span>
              </div>
              <p className="text-[12px] font-light leading-relaxed" style={{ color: vars.g500 }}>{f.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function roleLabel(role: LocalRole): string {
  if (role === "admin") return "Admin";
  if (role === "agency") return "Agency";
  if (role === "client") return "Client";
  return "User";
}

export function accountLabel(u: { username: string; displayName?: string | null }): string {
  return u.displayName?.trim() || u.username;
}

import { Check } from "lucide-react";
import { vars } from "../marketing/vars";
function PlaceholderPage({
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
  icon: any;
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

export { PlaceholderPage };

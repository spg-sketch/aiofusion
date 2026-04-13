import './_group.css';
import { FileText, FileEdit, BarChart3 } from 'lucide-react';

const vars = {
  navy: '#1A1A2E',
  accent: '#E8472A',
  teal: '#2B8C8C',
  slate: '#4A6FA5',
  g200: '#E9ECEF',
  g500: '#6C757D',
};

const tools = [
  { title: "GEO Diagnostic", desc: "Analyse how well your content is structured for AI visibility. Get a scored report across 6 signal categories with specific actions.", color: vars.accent, gradient: "linear-gradient(135deg, #E8472A, #C93A20)", icon: FileText },
  { title: "Content Optimiser", desc: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance and approval workflow.", color: vars.teal, gradient: "linear-gradient(135deg, #2B8C8C, #237474)", icon: FileEdit },
  { title: "Authority Planner", desc: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity across 8 categories.", color: vars.slate, gradient: "linear-gradient(135deg, #4A6FA5, #3D5D8C)", icon: BarChart3 },
];

export function Current() {
  return (
    <div className="min-h-screen flex items-center justify-center p-12" style={{ background: vars.navy }}>
      <div className="max-w-5xl w-full">
        <div className="text-center mb-16">
          <h2 className="text-4xl mb-4" style={{ color: '#fff', fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Three tools, one AI authority strategy
          </h2>
          <p className="text-lg font-light leading-relaxed max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.5)' }}>
            AIO Fusion provides a complete GEO workflow — from diagnosing how AI sees your brand, to optimising content and planning authority-building activity.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-10">
          {tools.map((tool) => (
            <div key={tool.title} className="bg-white rounded-2xl overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderColor: vars.g200 }}>
              <div className="h-1.5" style={{ background: tool.gradient }} />
              <div className="p-10">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6" style={{ background: `${tool.color}0A` }}>
                  <tool.icon size={26} color={tool.color} />
                </div>
                <h3 className="text-2xl mb-4" style={{ color: vars.navy, fontFamily: "'DM Serif Display', Georgia, serif" }}>{tool.title}</h3>
                <p className="text-[15px] leading-[1.75] font-light" style={{ color: vars.g500 }}>{tool.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

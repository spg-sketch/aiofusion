import './_group.css';
import { FileText, FileEdit, BarChart3 } from 'lucide-react';

const vars = {
  navy: '#1A1A2E',
  accent: '#E8472A',
  teal: '#2B8C8C',
  slate: '#4A6FA5',
};

const tools = [
  {
    title: "GEO Diagnostic",
    desc: "Analyse how well your content is structured for AI visibility. Get a scored report across 6 signal categories with specific actions.",
    color: vars.accent,
    icon: FileText,
    glow: "rgba(232, 71, 42, 0.4)",
    gradient: "linear-gradient(135deg, rgba(232, 71, 42, 0.8), rgba(232, 71, 42, 0.2))"
  },
  {
    title: "Content Optimiser",
    desc: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance and approval workflow.",
    color: vars.teal,
    icon: FileEdit,
    glow: "rgba(43, 140, 140, 0.4)",
    gradient: "linear-gradient(135deg, rgba(43, 140, 140, 0.8), rgba(43, 140, 140, 0.2))"
  },
  {
    title: "Authority Planner",
    desc: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity across 8 categories.",
    color: vars.slate,
    icon: BarChart3,
    glow: "rgba(74, 111, 165, 0.4)",
    gradient: "linear-gradient(135deg, rgba(74, 111, 165, 0.8), rgba(74, 111, 165, 0.2))"
  },
];

export function Immersive() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-12 relative overflow-hidden" style={{ background: vars.navy }}>
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full mix-blend-screen filter blur-[120px] opacity-20 pointer-events-none" style={{ background: vars.accent }}></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full mix-blend-screen filter blur-[120px] opacity-20 pointer-events-none" style={{ background: vars.teal }}></div>

      <div className="max-w-6xl w-full relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-5xl md:text-6xl mb-6 tracking-tight" style={{ color: '#ffffff', fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Three tools, one AI authority strategy
          </h2>
          <p className="text-xl font-light leading-relaxed max-w-3xl mx-auto text-white/70">
            AIO Fusion provides a complete GEO workflow — from diagnosing how AI sees your brand, to optimising content and planning authority-building activity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {tools.map((tool, index) => (
            <div 
              key={tool.title} 
              className={`relative rounded-3xl overflow-hidden backdrop-blur-xl border border-white/10 transition-all duration-500 hover:scale-[1.02] group ${index === 1 ? 'md:translate-y-8' : ''}`}
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%), ${tool.gradient}`,
                boxShadow: `0 20px 40px -20px ${tool.glow}, inset 0 1px 0 rgba(255,255,255,0.2)`
              }}
            >
              {/* Overlay gradient for hover state */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
                style={{ background: `radial-gradient(circle at top right, rgba(255,255,255,0.2), transparent 70%)` }}
              />
              
              <div className="p-8 lg:p-10 h-full flex flex-col relative z-10">
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md border border-white/20 shadow-xl"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                >
                  <tool.icon size={32} className="text-white drop-shadow-md" />
                </div>
                
                <h3 className="text-3xl mb-4 text-white leading-tight" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                  {tool.title}
                </h3>
                
                <p className="text-lg leading-[1.6] font-light text-white/80 mt-auto">
                  {tool.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

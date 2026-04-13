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
  { 
    id: "01",
    title: "GEO Diagnostic", 
    desc: "Analyse how well your content is structured for AI visibility. Get a scored report across 6 signal categories with specific actions.", 
    color: vars.accent, 
    icon: FileText 
  },
  { 
    id: "02",
    title: "Content Optimiser", 
    desc: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance and approval workflow.", 
    color: vars.teal, 
    icon: FileEdit 
  },
  { 
    id: "03",
    title: "Authority Planner", 
    desc: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity across 8 categories.", 
    color: vars.slate, 
    icon: BarChart3 
  },
];

export function Editorial() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 md:p-16 lg:p-24" style={{ background: vars.navy, color: '#F8F9FA' }}>
      <div className="max-w-7xl w-full">
        
        <div className="mb-24 md:mb-32">
          <p className="text-sm tracking-widest uppercase mb-4 opacity-60 font-light">AIO Fusion Platform</p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl max-w-3xl leading-tight" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Three tools, one AI authority strategy
          </h2>
          <div className="h-px w-24 bg-white/20 mt-12"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12 lg:gap-20 relative">
          
          <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-white/10" style={{ zIndex: 0 }}></div>

          {tools.map((tool) => (
            <div key={tool.id} className="relative z-10 flex flex-col group">
              
              {/* Number and Icon Header */}
              <div className="flex items-end justify-between mb-8 border-b border-white/10 pb-6 transition-colors duration-500" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="text-6xl md:text-7xl opacity-40 transition-opacity duration-500 group-hover:opacity-100" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: tool.color }}>
                  {tool.id}
                </span>
                <div className="opacity-50 transition-opacity duration-500 group-hover:opacity-100">
                  <tool.icon size={32} color={tool.color} strokeWidth={1.5} />
                </div>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-2xl md:text-3xl mb-4" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                  {tool.title}
                </h3>
                <p className="text-[15px] md:text-base leading-relaxed font-light text-white/60">
                  {tool.desc}
                </p>
              </div>
              
              {/* Subtle hover indicator */}
              <div className="mt-8 h-1 w-0 transition-all duration-500 group-hover:w-12" style={{ background: tool.color }}></div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

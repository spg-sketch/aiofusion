import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const features = [
  { label: "LLM Visibility Checks", icon: "🔍" },
  { label: "Competitor Analysis", icon: "📊" },
  { label: "Authority Scoring", icon: "⭐" },
  { label: "Content Optimization", icon: "✨" }
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Dark background with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0f1d35] to-[rgb(var(--color-navy))]" />

      {/* Central headline */}
      <div className="relative z-10 text-center mb-[8vh]">
        <motion.h2
          className="font-display text-[5.5vw] leading-[1.05] text-white mb-[4vh]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          Everything you need to
          <br />
          <span className="gradient-text">dominate AI search</span>
        </motion.h2>

        {/* Feature grid */}
        <motion.div
          className="grid grid-cols-2 gap-[2vw] max-w-[70vw] mx-auto mt-[6vh]"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="relative bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl p-[2vw] text-left overflow-hidden group"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.95 }}
              transition={{
                duration: 0.6,
                ease: [0.34, 1.56, 0.64, 1],
                delay: i * 0.12
              }}
            >
              {/* Accent gradient on hover effect (always subtle) */}
              <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--color-coral))]/10 via-transparent to-[rgb(var(--color-teal))]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              {/* Icon background glow */}
              <div className="absolute top-[1vw] right-[1vw] w-[4vw] h-[4vw] bg-[rgb(var(--color-teal))]/20 rounded-full blur-2xl" />
              
              <div className="relative z-10">
                <div className="text-[2.5vw] mb-[1vh]">{feature.icon}</div>
                <h3 className="text-[1.7vw] font-body font-semibold text-white/95">
                  {feature.label}
                </h3>
              </div>

              {/* Border glow */}
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: `linear-gradient(135deg, rgba(var(--color-coral), 0.3), rgba(var(--color-teal), 0.3))`,
                  padding: '1px',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }}
                animate={{
                  opacity: [0.2, 0.5, 0.2]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut"
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Background geometric accents */}
      <motion.div
        className="absolute top-[15%] left-[10%] w-[20vw] h-[20vw] border border-[rgb(var(--color-coral))]/20 rounded-full"
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute bottom-[10%] right-[8%] w-[25vw] h-[25vw] border border-[rgb(var(--color-teal))]/15 rounded-full"
        initial={{ scale: 0, rotate: 45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />
    </div>
  );
}

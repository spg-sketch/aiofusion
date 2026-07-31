import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[rgb(var(--color-navy))] via-[#0d1524] to-[#0a1628]" />

      {/* Authority visualization image - prominent */}
      <motion.div
        className="absolute right-[10vw] top-[15vh] w-[45vw]"
        initial={{ opacity: 0, x: 100, scale: 0.85 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 100, scale: 0.85 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/authority-viz.png`}
          alt="Authority"
          className="w-full h-auto drop-shadow-2xl"
        />
        {/* Animated glow */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--color-gold))]/20 via-[rgb(var(--color-coral))]/10 to-transparent blur-3xl"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.05, 1]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.div>

      {/* Left content */}
      <div className="absolute left-[8vw] top-[18vh] max-w-[40vw]">
        {/* Label */}
        <motion.div
          className="inline-block px-[1.5vw] py-[0.6vh] bg-[rgb(var(--color-gold))]/20 border border-[rgb(var(--color-gold))]/50 rounded-full mb-[2.5vh]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <span className="text-[1.2vw] font-body font-bold tracking-wider uppercase text-[rgb(var(--color-gold))]">
            Measure Impact
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="font-display text-[5.2vw] leading-[1.1] mb-[3.5vh] text-white"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Build your
          <br />
          <span className="text-[rgb(var(--color-gold))]">AI authority</span>
        </motion.h2>

        {/* Stats */}
        <motion.div
          className="space-y-[2.5vh]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {[
            { metric: "Real-time", label: "visibility tracking" },
            { metric: "Actionable", label: "optimization insights" },
            { metric: "Competitive", label: "intelligence reports" }
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="flex items-baseline gap-[1vw]"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: i * 0.12
              }}
            >
              <span className="text-[2.8vw] font-display font-bold text-[rgb(var(--color-gold))]">
                {stat.metric}
              </span>
              <span className="text-[1.6vw] font-body font-light text-white/80">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Floating data particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-[rgb(var(--color-gold))]"
          style={{
            left: `${20 + i * 10}%`,
            top: `${30 + (i % 4) * 15}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.8, 0.3],
            scale: [1, 1.5, 1]
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

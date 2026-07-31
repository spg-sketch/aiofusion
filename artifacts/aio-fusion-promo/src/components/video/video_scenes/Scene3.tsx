import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Radial gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgb(var(--color-teal))/15_0%,_rgb(var(--color-navy))_70%)]" />

      {/* Search analysis image - left side */}
      <motion.div
        className="absolute left-[10vw] top-[18vh] w-[38vw]"
        initial={{ opacity: 0, x: -80, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -80, scale: 0.9 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/search-analysis.png`}
          alt="Analysis"
          className="w-full h-auto drop-shadow-2xl"
        />
        {/* Glow effect */}
        <div className="absolute inset-0 bg-[rgb(var(--color-teal))]/10 blur-3xl" />
      </motion.div>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-end pr-[8vw]">
        <div className="max-w-[45vw] text-left">
          {/* Badge */}
          <motion.div
            className="inline-block px-[1.5vw] py-[0.6vh] bg-gradient-to-r from-[rgb(var(--color-teal))]/20 to-[rgb(var(--color-coral))]/20 border border-[rgb(var(--color-teal))]/50 rounded-full mb-[2.5vh]"
            initial={{ opacity: 0, y: -20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <span className="text-[1.2vw] font-body font-bold tracking-wider uppercase gradient-text">
              The Solution
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h2
            className="font-display text-[5vw] leading-[1.1] mb-[3vh]"
            initial={{ opacity: 0, y: 40 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <span className="text-white">Audit your</span>
            <br />
            <span className="gradient-text">AI visibility</span>
          </motion.h2>

          {/* Feature list */}
          <motion.div
            className="space-y-[2vh]"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {[
              "Track mentions in ChatGPT & Claude",
              "Analyze earned-media authority",
              "Optimize for AI visibility"
            ].map((text, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-[1vw]"
                initial={{ opacity: 0, x: 20 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ 
                  duration: 0.5, 
                  ease: [0.16, 1, 0.3, 1],
                  delay: i * 0.15
                }}
              >
                <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-gradient-to-br from-[rgb(var(--color-teal))] to-[rgb(var(--color-coral))] mt-[0.5vh] flex-shrink-0" />
                <p className="text-[1.9vw] font-body font-light text-white/90 leading-snug">
                  {text}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Animated accent circle */}
      <motion.div
        className="absolute top-[10vh] right-[5vw] w-[25vw] h-[25vw] rounded-full border-2 border-[rgb(var(--color-teal))]/30"
        initial={{ scale: 0, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute top-[10vh] right-[5vw] w-[25vw] h-[25vw] rounded-full bg-[rgb(var(--color-teal))]/5"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.15, 0.3]
        }}
        transition={{ 
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    </div>
  );
}

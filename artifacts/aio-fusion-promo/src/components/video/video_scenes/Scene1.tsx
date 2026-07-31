import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Dark gradient background */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--color-navy))] via-[#050a14] to-[rgb(var(--color-navy))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(rgba(var(--color-teal), 0.3) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(var(--color-teal), 0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-[80vw] text-center">
        {/* Question mark icon */}
        <motion.div
          className="mb-[3vh] flex justify-center"
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.5, rotate: -20 }}
          transition={{ 
            duration: 0.7, 
            ease: [0.34, 1.56, 0.64, 1]
          }}
        >
          <div className="w-[8vw] h-[8vw] rounded-full border-4 border-[rgb(var(--color-coral))] flex items-center justify-center">
            <span className="text-[5vw] font-display text-[rgb(var(--color-coral))]">?</span>
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="font-display text-[5.5vw] leading-[1.1] mb-[2vh] text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          Where is your brand
          <br />
          <span className="gradient-text">in AI conversations?</span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          className="text-[2vw] font-body font-light text-white/70 max-w-[60vw] mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          ChatGPT and Claude are answering millions of questions about your industry.
          <br />
          Are you even mentioned?
        </motion.p>
      </div>

      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-[rgb(var(--color-coral))]"
          style={{
            left: `${15 + i * 12}%`,
            top: `${20 + (i % 3) * 20}%`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 0.6, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

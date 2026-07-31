import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#0a1628] via-[#0d1a2e] to-[rgb(var(--color-navy))]" />

      {/* AI chat interface image */}
      <motion.div
        className="absolute left-[8vw] top-[20vh] w-[40vw]"
        initial={{ opacity: 0, x: -100, rotateY: -15 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: -100, rotateY: -15 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/ai-chat.png`}
          alt="AI assistants"
          className="w-full h-auto drop-shadow-2xl"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgb(var(--color-teal))]/10 to-transparent"
          style={{ animation: 'gradient-shift 3s ease infinite', backgroundSize: '200% 100%' }}
        />
      </motion.div>

      {/* Right content */}
      <div className="absolute right-[8vw] top-[15vh] max-w-[42vw] text-left">
        <motion.div
          className="inline-block px-[1.5vw] py-[0.6vh] bg-[rgb(var(--color-coral))]/20 border border-[rgb(var(--color-coral))]/40 rounded-full mb-[2vh]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <span className="text-[1.2vw] font-body font-semibold tracking-wide uppercase text-[rgb(var(--color-coral))]">
            The Challenge
          </span>
        </motion.div>

        <motion.h2
          className="font-display text-[4.5vw] leading-[1.15] mb-[3vh] text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        >
          ChatGPT & Claude
          <br />
          <span className="text-[rgb(var(--color-teal))]">answer without you</span>
        </motion.h2>

        <motion.p
          className="text-[1.8vw] font-body font-light leading-relaxed text-white/80"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          Your competitors appear in AI answers.
          <br />
          Your brand is invisible.
        </motion.p>
      </div>

      {/* Decorative scan lines */}
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[rgb(var(--color-teal))] to-transparent"
        style={{ top: '35%' }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={phase >= 2 ? { opacity: 0.6, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[rgb(var(--color-coral))] to-transparent"
        style={{ top: '65%' }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={phase >= 2 ? { opacity: 0.4, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />
    </div>
  );
}

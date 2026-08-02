import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 1 — The problem: brand invisible to AI (centred layout)
export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#06101e] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Centred content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-[8vw] text-center">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-coral))] mb-[2.5vh]"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The problem
        </motion.p>

        <motion.h1
          className="font-display leading-[1.08] text-white mb-[3.5vh] max-w-[70vw]"
          style={{ fontSize: "clamp(2.4rem, 5.5vw, 7rem)" }}
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Where is your brand
          <br />
          <em className="not-italic" style={{
            background: "linear-gradient(120deg, rgb(var(--color-coral)), rgb(var(--color-teal)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            in AI conversations?
          </em>
        </motion.h1>

        <motion.p
          className="font-body font-light leading-[1.6] text-white/65 max-w-[55vw]"
          style={{ fontSize: "clamp(1rem, 1.8vw, 2.2rem)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          ChatGPT and Claude answer millions of questions
          about your industry every day.
        </motion.p>

        <motion.p
          className="font-body font-semibold text-white/90 mt-[2.5vh]"
          style={{ fontSize: "clamp(0.9rem, 1.6vw, 2rem)" }}
          initial={{ opacity: 0, y: 12 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          Are you even mentioned?
        </motion.p>
      </div>
    </div>
  );
}

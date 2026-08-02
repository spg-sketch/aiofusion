import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 6 — CTA: centred layout
export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 850),
      setTimeout(() => setPhase(3), 1450),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#060e1c] via-[#0a1628] to-[rgb(var(--color-navy))]" />

      {/* Glow blobs */}
      <motion.div
        className="absolute top-[-5%] right-[10%] w-[40vw] h-[40vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(140px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[-5%] left-[10%] w-[35vw] h-[35vw] rounded-full bg-[rgb(var(--color-gold))]"
        style={{ filter: "blur(140px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 1.5, delay: 0.3 }}
      />

      {/* Centred content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-[8vw] text-center">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-coral))] mb-[2.5vh]"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Get started today
        </motion.p>

        <motion.h2
          className="font-display leading-[1.05] text-white mb-[4vh] max-w-[65vw]"
          style={{ fontSize: "clamp(2.4rem, 5.5vw, 7rem)" }}
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Your brand belongs
          <br />
          <em className="not-italic" style={{
            background: "linear-gradient(120deg, rgb(var(--color-coral)), rgb(var(--color-gold)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            in the conversation.
          </em>
        </motion.h2>

        <motion.p
          className="font-body font-light text-white/60 mb-[5vh] max-w-[50vw]"
          style={{ fontSize: "clamp(0.9rem, 1.8vw, 2.2rem)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          Join the brands winning AI visibility.
        </motion.p>

        {/* URL pill */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-block bg-white/[0.06] border border-white/[0.14] rounded-xl px-[3vw] py-[1.4vh]">
            <span
              className="font-body font-semibold tracking-wide text-white"
              style={{ fontSize: "clamp(1.1rem, 2.2vw, 2.8rem)" }}
            >
              aiofusion.ai
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

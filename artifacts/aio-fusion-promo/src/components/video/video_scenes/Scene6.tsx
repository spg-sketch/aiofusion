import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 6 — Final CTA: bold left-aligned close
export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#060e1a] via-[#09152a] to-[rgb(var(--color-navy))]" />

      {/* Warm glow behind CTA */}
      <motion.div
        className="absolute top-[20%] left-[30%] w-[55vw] h-[55vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(180px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 2 }}
      />
      <motion.div
        className="absolute bottom-[10%] right-[10%] w-[35vw] h-[35vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(150px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 2, delay: 0.4 }}
      />

      {/* Left-aligned CTA block */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] max-w-[68vw]">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-coral))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Get started today
        </motion.p>

        <motion.h2
          className="font-display text-[6vw] leading-[1.05] text-white mb-[4vh]"
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
          className="font-body text-[1.9vw] font-light text-white/60 mb-[5vh]"
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
          <div className="inline-block bg-white/[0.06] border border-white/[0.14] rounded-xl px-[2.5vw] py-[1.4vh]">
            <span className="font-body text-[2.2vw] font-semibold tracking-wide text-white">
              aiofusion.ai
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

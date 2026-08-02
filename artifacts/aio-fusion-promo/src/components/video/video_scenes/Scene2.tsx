import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 2 — AI is the new search: ChatGPT & Claude are where buyers go (centred layout)
const assistants = [
  { name: "ChatGPT", colour: "rgb(var(--color-teal))" },
  { name: "Claude", colour: "rgb(var(--color-coral))" },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1350),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#071422] via-[#0a1628] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute top-[-5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.8 }}
      />

      {/* Centred content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-[8vw] text-center">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The new search
        </motion.p>

        <motion.h2
          className="font-display leading-[1.1] text-white mb-[4vh] max-w-[70vw]"
          style={{ fontSize: "clamp(2.2rem, 5vw, 6.5rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          AI assistants are
          <br />
          <em className="not-italic" style={{
            background: "linear-gradient(120deg, rgb(var(--color-teal)), rgb(var(--color-coral)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            where buyers go now
          </em>
        </motion.h2>

        {/* Pill badges for ChatGPT and Claude */}
        <motion.div
          className="flex items-center justify-center gap-[2.5vw] mb-[4vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {assistants.map((a) => (
            <div
              key={a.name}
              className="bg-white/[0.05] border border-white/[0.1] rounded-full px-[2.2vw] py-[0.9vh]"
              style={{ borderColor: `${a.colour}40` }}
            >
              <span
                className="font-body font-semibold"
                style={{ fontSize: "clamp(0.9rem, 1.6vw, 2rem)", color: a.colour }}
              >
                {a.name}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.p
          className="font-body font-light leading-[1.6] text-white/65 max-w-[52vw]"
          style={{ fontSize: "clamp(0.9rem, 1.65vw, 2rem)" }}
          initial={{ opacity: 0, y: 14 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          Buyers ask AI for recommendations before they ever visit your website.
          If you're not in the answer — you don't exist.
        </motion.p>
      </div>
    </div>
  );
}

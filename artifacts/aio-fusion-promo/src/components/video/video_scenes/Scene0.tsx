import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 0 — Brand opener: logo + tagline, centred (intentional, only this scene)
export function Scene0() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Video background */}
      <motion.video
        src={`${import.meta.env.BASE_URL}videos/data-network.mp4`}
        autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 0.35, scale: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[rgb(var(--color-navy))]/50 via-[rgb(var(--color-navy))]/70 to-[rgb(var(--color-navy))]" />

      {/* Glow blobs */}
      <motion.div
        className="absolute top-[20%] left-[20%] w-[30vw] h-[30vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(120px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 2 }}
      />
      <motion.div
        className="absolute bottom-[15%] right-[15%] w-[28vw] h-[28vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(120px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 2, delay: 0.4 }}
      />

      {/* Centred content — only scene that is centred */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center gap-[3vh]">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/logo-color.png`}
          alt="AIO Fusion"
          className="w-[28vw] h-auto"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 14 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-body text-[1.8vw] font-light tracking-[0.15em] text-white/80 uppercase">
            AI Visibility Intelligence
          </p>
        </motion.div>
      </div>
    </div>
  );
}

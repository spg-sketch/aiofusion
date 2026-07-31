import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene0() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Video background */}
      <motion.video
        src={`${import.meta.env.BASE_URL}videos/data-network.mp4`}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[rgb(var(--color-navy))]/60 via-[rgb(var(--color-navy))]/80 to-[rgb(var(--color-navy))]" />

      {/* Scan line effect */}
      <div className="scan-line" style={{ animationDelay: '0.5s' }} />

      {/* Logo entrance */}
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.img
          src={`${import.meta.env.BASE_URL}images/logo-color.png`}
          alt="AIO Fusion"
          className="w-[35vw] h-auto"
          initial={{ scale: 0.85 }}
          animate={phase >= 1 ? { scale: 1 } : { scale: 0.85 }}
          transition={{ 
            duration: 1.2, 
            ease: [0.16, 1, 0.3, 1],
            delay: 0.2
          }}
        />
      </motion.div>

      {/* Tagline */}
      <motion.div
        className="absolute bottom-[28vh] left-0 right-0 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-[2.2vw] font-body font-light tracking-wide text-white/90">
          AI Visibility Intelligence
        </p>
      </motion.div>

      {/* Subtitle pulse */}
      <motion.div
        className="absolute bottom-[22vh] left-0 right-0 text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ 
          duration: 0.5, 
          ease: [0.34, 1.56, 0.64, 1]
        }}
      >
        <p className="text-[1.3vw] font-body font-medium tracking-wider uppercase text-[rgb(var(--color-coral))]">
          Know how your brand appears in AI
        </p>
      </motion.div>

      {/* Floating accent orbs */}
      <motion.div
        className="absolute top-[20%] left-[15%] w-[15vw] h-[15vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: 'blur(80px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.15 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[15%] w-[20vw] h-[20vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: 'blur(90px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
      />
    </div>
  );
}

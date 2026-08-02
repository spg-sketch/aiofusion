import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TargetAndTransition, Transition } from "framer-motion";
import { useVideoPlayer } from "@/lib/video";
import { Scene0 } from "./video_scenes/Scene0";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";
import { Scene5 } from "./video_scenes/Scene5";
import { Scene6 } from "./video_scenes/Scene6";

export const SCENE_DURATIONS = {
  opening: 3500,
  problem: 2800,
  assistants: 3200,
  solution: 3000,
  features: 2500,
  authority: 3500,
  cta: 2800,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  opening: Scene0,
  problem: Scene1,
  assistants: Scene2,
  solution: Scene3,
  features: Scene4,
  authority: Scene5,
  cta: Scene6,
};

interface SceneMotion {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
  style?: React.CSSProperties;
}

// All scenes share simple fade in (0.5s) / instant fade out (0.18s).
// This prevents scenes from bleeding through each other during transitions.
const ENTER: TargetAndTransition = { opacity: 1 };
const ENTER_TRANSITION: Transition = { duration: 0.5, ease: [0.16, 1, 0.3, 1] };
const EXIT: TargetAndTransition = { opacity: 0 };
const EXIT_TRANSITION: Transition = { duration: 0.18, ease: "easeIn" };

const SCENE_MOTION: Record<string, SceneMotion> = {
  opening:    { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  problem:    { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  assistants: { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  solution:   { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  features:   { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  authority:  { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
  cta:        { initial: { opacity: 0 }, animate: ENTER, exit: EXIT, transition: ENTER_TRANSITION },
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, "");
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];
  const sceneMotion = SCENE_MOTION[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div className="relative w-full h-screen bg-[rgb(var(--color-navy))] overflow-hidden">
      {/* Noise texture overlay - persistent */}
      <div className="noise-overlay" />

      {/* Persistent background gradient that shifts between scenes */}
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{
          background: sceneIndex <= 1
            ? 'radial-gradient(circle at 30% 40%, rgb(var(--color-coral))/20, transparent 60%)'
            : sceneIndex <= 3
            ? 'radial-gradient(circle at 70% 50%, rgb(var(--color-teal))/25, transparent 60%)'
            : sceneIndex <= 5
            ? 'radial-gradient(circle at 50% 30%, rgb(var(--color-gold))/20, transparent 60%)'
            : 'radial-gradient(circle at 50% 50%, rgb(var(--color-coral))/15, transparent 50%)'
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Scene container with AnimatePresence */}
      <div className="relative w-full h-full">
        <AnimatePresence mode="wait">
          {SceneComponent && sceneMotion && (
            <motion.div
              key={currentSceneKey}
              initial={sceneMotion.initial}
              animate={sceneMotion.animate}
              exit={sceneMotion.exit}
              transition={sceneMotion.transition}
              className="absolute inset-0"
              style={sceneMotion.style}
            >
              <SceneComponent />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}

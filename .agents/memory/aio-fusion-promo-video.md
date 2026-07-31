---
name: AIO Fusion promo video artifact
description: Gotchas from building the video-js promo artifact (aio-fusion-promo)
---

- A design subagent built the scenes outside the registered scaffold with its own hooks.ts; the scaffold's `src/lib/video/hooks.ts` is canonical (recording pipeline) — merge scenes/assets in, keep scaffold hooks, and adapt VideoTemplate to `useVideoPlayer({ durations })`.
- **Why:** the export/recording pipeline and validate-recording.sh depend on the scaffold hook's window markers; subagent hooks hardcode durations and lack the options API.
- The freshly generated video-js scaffold tsconfig was missing `"lib": ["esnext","dom","dom.iterable"]` — typecheck fails with "Cannot find name 'window'" until added (copy from aio-fusion's tsconfig).
- The `typecheck` workflow only covers 4 workspace projects; run `pnpm --filter @workspace/aio-fusion-promo run typecheck` separately.
- Video uses DM Serif Display + Inter (loaded in index.html AND @import in index.css); brand palette via CSS vars (--color-navy/coral/teal/gold).
- Audio: single bg_music.mp3 in public/audio, wired per the video skill's audio reference (muted-by-default in iframe preview, unmuted export path).

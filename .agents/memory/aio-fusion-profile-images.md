---
name: AIO Fusion profile images
description: How user photo + brand logo uploads are stored and served
---
User photo ("avatar") and brand/agency logo are stored as base64 data URLs in `platform_meta` (key `account:image:<kind>:<username>`), not object storage.

**Why:** images are client-side downscaled (256px avatar / 512px logo canvas resize) so they're tiny; keeping them in the existing DB avoids new storage infra and they survive deploys/backups with the rest of platform_meta.

**How to apply:** endpoints are `POST/GET/DELETE /api/platform/profile/image(/:kind)` (auth required, PNG/JPEG/WebP data-URL regex + ~800K length cap). Any new authed api-server route must also be added to PUBLIC_ALLOWLIST in ai-action-guards.test.ts or that guard test fails. If images ever need to be bigger/shared publicly (e.g. in emails), move to object storage instead of raising the cap.

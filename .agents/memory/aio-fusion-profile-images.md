---
name: AIO Fusion profile images
description: How user photo + brand logo uploads are stored and served
---
Personal photos and brand/agency logos are stored as small base64 data URLs in `platform_meta`, not object storage. Personal avatars and Google-import opt-outs are scoped to the authenticated human user ID; logos remain scoped to the active workspace.

**Why:** A person can belong to several workspaces, while each workspace has its own logo. Workspace-scoped avatars let one colleague's Google photo appear as the company identity. Existing images are small, so keeping them in the DB avoids new storage infrastructure and preserves them through backups.

**How to apply:** Google photos may populate only the personal avatar, never the logo, and only if neither a personal image nor removal tombstone exists. Preserve and migrate legacy owner avatars before importing. Serialize import/upload/removal per user. If images need to be larger or public, move to object storage rather than raising the cap.

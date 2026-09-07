---
name: AIO Fusion App Storage runtime grant
description: Public object storage may be provisioned yet unavailable to a service runtime.
---

Provisioned App Storage paths and bucket-related environment variables do not by themselves prove a running process can read or write objects. The Replit sidecar can continue rejecting signed URLs after setup and republish.

**Why:** CMS uploads repeatedly failed in both development and staging even though setup reported all three storage bindings and the bucket/path values agreed. Refreshing setup and restarting did not restore signer access.

**How to apply:** Validate a real write/read through the API workflow before relying on App Storage. CMS user uploads use the database-backed media path so editorial publishing is not coupled to the signer grant; existing storage-backed media remains readable.
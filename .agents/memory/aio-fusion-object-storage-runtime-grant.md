---
name: AIO Fusion App Storage runtime grant
description: Public object storage may be provisioned yet unavailable to a service runtime.
---

Provisioned App Storage paths and bucket-related environment variables do not by themselves prove a running process can read or write objects. The Replit sidecar can reject signing requests with `no allowed resources`.

**Why:** A durable public asset route cannot serve an object or seed a missing one unless the deployment runtime has the App Storage resource grant.

**How to apply:** Validate a signed read/write through the real API workflow before switching public templates to an App Storage URL. Keep the public asset route fail-explicit and verify it returns the asset after deployment, not only through source-level tests.
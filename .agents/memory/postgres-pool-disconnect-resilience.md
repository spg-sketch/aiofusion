---
name: PostgreSQL pool disconnect resilience
description: Prevent routine PostgreSQL idle-connection recycling from terminating the deployed API.
---

The shared PostgreSQL pool must always have an error listener. An idle client can be terminated by the database during maintenance or failover; the pool removes that client and can recover, but Node terminates the process if the emitted error is unhandled.

**Why:** A database-side administrator disconnect landed during a Google OAuth callback. The session write completed, but the unhandled pool event killed the API and showed a transient Internal Server Error before autoscale restarted it.

**How to apply:** Keep pool-level error handling in place independently of route-level try/catch. Treat unexpected idle-client errors as recoverable and let subsequent requests acquire a fresh connection.
---
name: SSO destructive-action confirmation
description: Security constraints for using provider re-authentication to authorize destructive workspace actions.
---

Fresh SSO proof for a workspace-destructive action must be restricted to a currently passwordless user with an authoritative owner membership in the active workspace. Bind the proof to the user ID and linked provider subject, keep it short-lived and single-use server-side, and recheck passwordless-owner eligibility when the proof is consumed.

**Why:** A proof bound only to the signed-in human lets a non-owner team member authorize deletion of the active workspace. UI-only password checks also let password-bearing users bypass required password confirmation by calling the SSO route directly.

**How to apply:** Enforce the same eligibility before starting OAuth, when issuing proof after the callback, and immediately before the destructive mutation. Consume the proof atomically even when a later guard rejects the action.
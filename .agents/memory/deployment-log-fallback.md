---
name: Deployment log access fallback
description: Retrieving production runtime evidence when the documented deployment-log callback is unavailable.
---

If the documented deployment-log callback fails with "not a function", use RefreshAllLogs and inspect its deployment-log file instead.

**Why:** The callback was unavailable in this workspace, but RefreshAllLogs returned the actual published application's request logs.

**How to apply:** Use this fallback before asking the user to collect logs or changing deployment settings. Keep development workflow logs distinct from production runtime evidence.
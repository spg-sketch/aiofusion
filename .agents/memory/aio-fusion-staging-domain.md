---
name: Staging custom domain setup
description: Lessons from wiring staging.aiofusion.ai to the aio-fusion-staging deployment
---

- Replit custom domains need the A + TXT (replit-verify) records; the TXT must stay permanently for cert renewal. A CNAME cannot coexist with the TXT at the same hostname — never replace A+TXT with a CNAME.
- A domain verified *after* the last publish only starts serving on the next Republish; until then it shows Replit's "This app isn't live yet" 404 even with valid SSL.
- The Domains panel SSL status can stay red/stale after the cert is actually issued — verify with `curl -v https://<domain>` instead of trusting the UI.
- Staging deployment is password-protected (replshield 307 redirect is expected, not an error).
- Environments (user asked to remember, CORRECTED): **THIS repl = `aio-fusion-staging`**, a copy of the live app; publishes ONLY to https://staging.aiofusion.ai (password protected, own DB). **Production = separate repl "AIO Fusion from Simpatico"**, owns aiofusion.ai + www. Never assume this repl is production.
- User's key shared links (asked to remember): Roadmap = https://www.aiofusion.ai/roadmap.html ; Tasks/build plan = https://www.aiofusion.ai/build-plan.html (served from aio-fusion `public/`).

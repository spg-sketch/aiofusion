---
name: AIO Fusion LLM roster scope (ChatGPT + Claude only)
description: Client-confirmed product scope restricts every LLM/AI-engine mention to ChatGPT and Claude only, across all surfaces, not just app UI.
---

# LLM roster scope

The client confirmed the product only covers ChatGPT and Claude — no Perplexity, Gemini, Google AI
Overviews, Copilot, Bard, Grok, Mistral, Llama, etc. This applies to the LLM Scorecard in
`ReportPage.tsx` (dropped Rank/Sentiment columns tied to a wider roster, added `rate` field instead)
and to every other surface that names AI engines.

**Why:** the platform is scoped to blind-probe audits it actually runs against ChatGPT and Claude;
naming engines it doesn't measure is both inaccurate and inconsistent with the confirmed scope.

**How to apply:** when auditing for stray LLM mentions, sweep beyond `artifacts/*/src` —also check
`public/llms.txt`, `public/agents.md`, `public/robots.txt` (crawler allow-lists), and api-server
prompt strings (`seo-audit.ts`, `content-ai.ts`, `diagnostic.ts`). Leave test fixtures and unused
mockup-sandbox demo files alone — they're not product-facing. Grep pattern:
`Perplexity|Gemini|Google AI|CoPilot|Copilot|Bard|Grok|Mistral|Llama`.

## Referral-source exception

The public contact/demo “How did you hear about us?” choices may include Gemini,
Microsoft Copilot, Grok and other AI assistants. These describe where visitors
heard about the service, not engines the product audits.

**Why:** the user explicitly approved these as referral-source choices, without
changing the ChatGPT/Claude measurement scope.

**How to apply:** preserve the broader referral choices while keeping audit,
scorecard and product-capability claims restricted to ChatGPT and Claude.

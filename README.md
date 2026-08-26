# Onnivation Deck Copilot

A Canva side-panel application for tailoring and quality-checking editable executive presentations from one natural-language instruction box.

## What is implemented

- Reads every editable page through Canva's Design Editing API.
- Audits standard backgrounds, headers, route labels/arrows, footers, duplicate separators and likely text overflow.
- Converts instructions into a structured, reviewable change plan.
- Uses Claude with structured output when `ANTHROPIC_API_KEY` is configured, with OpenAI as an optional secondary provider.
- Falls back to a deterministic local planner when no AI key is available.
- Shows a visible, explicitly labeled slide simulation when opened outside Canva.
- Applies approved exact-text replacements, client-name replacements, official image/logo replacements, header rails, footer rails, route-arrow centering and background-token fixes.
- Can duplicate a selected canonical source page as native editable elements for a new slide.
- Re-scans the deck after every apply operation.
- Keeps layouts, text, shapes and other objects editable in Canva.
- Exports the reviewed instruction, audit and change plan as JSON.

Research-heavy people, logo, priority-icon, focus-grid, itinerary and new-layout changes are deliberately marked `Review`. Exact copy/image replacements and canonical page duplication become executable once the plan contains verified source data and a source layout; ambiguous restructuring is not silently written.

## Production endpoint

Use the public `*.vercel.app` production URL shown in the Vercel project dashboard.

## Canva activation

1. Create a team app in the Canva Developer Portal.
2. Set the app source/entry URL to the Vercel production endpoint.
3. Enable the Design Editing API capabilities needed to read and update designs.
4. Submit the team app for administrator approval, then add it to the team's Canva apps.
5. Open an editable deck in Canva and launch **Onnivation Deck Copilot** from the Apps panel.

The standalone endpoint is an intentional preview/planning mode. It now previews planned changes visually, but never claims to have modified Canva. Live scan and apply actions become available only while Canva hosts the app inside its editor.

The hosted UI is public so Canva can load it, while paid AI planning is protected by Canva user-token verification. Model keys remain server-side and are never included in the browser bundle.

## AI activation

Set these server-side environment variables on the hosted project:

```text
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5

# Optional secondary provider
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
```

Claude is the primary provider when both keys are configured. API keys remain server-side. Without either key, the deterministic planner still handles QA, rail normalization, exact replacements and common section intents.

For compatibility, the deployment also recognizes `claude_api_key`, but `ANTHROPIC_API_KEY` is the recommended long-term variable name.

## Safety model

1. Scan all pages.
2. Prepare typed operations.
3. Show pages, rationale and risk for each operation.
4. Require approval before applying; optional auto-apply is limited to low-risk operations.
5. Sync changes once and re-scan.
6. Surface research/layout tasks that still require source assets or judgment.

## Design tokens

| Role | Token |
| --- | --- |
| Standard background | `#FCF5ED` |
| Card fill | `#FFFAF9` |
| Card border | `#E1DCCC` |
| Forest | `#205047` |
| Cover navy | `#0B196B` |
| Ink | `#0F2442` |
| Gold | `#E0B44C` |

The current canonical layout registry covers the 33-slide Nike reference deck: cover, priorities, programme overview, Masterclass, VC Connects, Focus Sessions, itinerary/breakout matrices and FAQ.

## Local commands

```bash
npm run build
npm run dev
```

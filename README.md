# Onnivation Deck Copilot

A two-part presentation copilot: a hosted Next.js planning/backend service on Vercel and a bundled Canva side-panel app for reading and editing live designs.

The two runtimes are intentionally separate. Canva's Apps SDK must be shipped as one `app.js` bundle; a normal Next.js page cannot be used as the in-editor app source.

## What is implemented

- Reads every editable page through Canva's Design Editing API and resolves it to a semantic slide contract.
- Audits the real 34-slide Nike source, standard rails, canonical dot/font tokens, repeated-card geometry, footer separators, text safety, and the unfinished one-company layout.
- Converts instructions into a structured, reviewable change plan.
- Uses Claude with structured output when `ANTHROPIC_API_KEY` is configured, with OpenAI as an optional secondary provider.
- Falls back to a deterministic local planner when no AI key is available.
- Shows a visible, explicitly labeled slide simulation when opened outside Canva.
- Applies guarded exact-text/client replacements, font-family fixes, pixel moves/resizes, approved image/logo replacements, native text/shape insertions, canonical rails/dots, route-arrow centering and background-token fixes.
- Can duplicate a selected 1/2/3/4-company or other canonical source page as native editable elements for a new slide.
- Re-scans the deck after every apply operation.
- Keeps layouts, text, shapes and other objects editable in Canva.
- Exports the reviewed instruction, audit and change plan as JSON.

Every write is re-guarded against a fresh scan, preflighted for an exact affected-element range, approved in the Canva panel, applied, and re-scanned. Slides 7, 8 and 10 are locked references. Research-heavy people, logos, priorities, focus grids and itinerary work stay gated until the plan contains exact verified fields and assets; ambiguous restructuring is never silently written.

## Production endpoint

Use the public `*.vercel.app` production URL shown in the Vercel project dashboard.

## Canva activation

1. Create a team app in the Canva Developer Portal.
2. Set the app source/entry URL to the Vercel production endpoint.
3. Enable the Design Editing API capabilities needed to read and update designs.
4. Submit the team app for administrator approval, then add it to the team's Canva apps.
5. Open an editable deck in Canva and launch **Onnivation Deck Copilot** from the Apps panel.

The standalone endpoint is an intentional preview/planning mode. It previews deterministic plans visually, but never claims to have modified Canva. Paid AI planning and live scan/apply actions are unlocked only by a verified Canva user token from the bundled side-panel app.

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
| Gold | `#C9A227` |

The current canonical registry covers all 34 live Nike slides: cover, priorities, programme overview, Masterclass, VC Connects, Focus Sessions, itinerary/breakout matrices and FAQ. See [the completed template contract](docs/nike-template-contract.md).

## Local commands

```bash
npm run build
npm run dev
npm run canva:install
npm run canva:build
```

`npm run canva:build` creates `canva-app/dist/app.js`. Upload that file to **Canva Developer Portal → App source → JavaScript file**. The Canva app calls the Vercel backend at `https://onnivation-deck-copilot.vercel.app`, presents the page-level plan, applies executable operations, and re-scans the deck.

The build first syncs the shared Canva engine and deck types from `lib/` into the bundle source so the hosted UI and in-editor app cannot silently drift apart.

# Nike Deck Automation Contract

Template version: `2026-08-31.34`  
Canva design: `DAHSisEdxxE` (`US Trip - Nike`)  
Observed source length: **34 slides**

This contract completes the original handoff through the end of the live source deck. The runtime manifest in `lib/deck-contract.ts` is the machine-readable source of truth.

## Non-negotiable invariants

- Resolve slides by semantic identity (`contractKey`), never by page number alone.
- Slides 7, 8, and 10 are locked references and are excluded from automated mutations.
- Standard gold rails: `#C9A227`, left `71`, width `1778`, height `2`; header top `85`, footer top `965`.
- Canonical section dot: media ref `MAHSii6-IGc`, top `44.9`, left `45.434`, width `47`, height `45`.
- Eyebrow: font ref `YAFdJj8NdaU,1`, 24 px, bold, `#205047`, top `50.181`, left `121.229`.
- Main section heading: font ref `YACgEdeqDWI,0`, normal weight, `#205047`.
- Footer uses one separator only: `ONNIVATION | {CLIENT/TRIP}`.
- No flattened screenshots. New slides are duplicated from an approved native Canva layout.
- Every write runs against a fresh scan, exact element match, affected-element bound, user approval, and post-apply scan.

## Slide-by-slide contract

| Slide | Contract key | Family | Slots | Dynamic content |
| ---: | --- | --- | ---: | --- |
| 1 | `cover` | Boarding pass cover | — | Client header, trip title, passenger, route, dates, class, duration, gate, value line, footer trip |
| 2 | `priority-map` | Priority map | 10 | Heading + 10 label/icon pairs (21 fields total) |
| 3 | `programme-overview` | Programme overview | — | Programme heading, tailored question |
| 4 | `masterclass-divider` | Section divider | — | Leadership subtitle, footer trip |
| 5 | `masterclass-people-3a` | People grid | 3 | Subtitle + image/name/role/credential/value line per person |
| 6 | `masterclass-people-2` | People grid | 2 | Subtitle + image/name/role/credential/value line per person |
| 7 | `masterclass-people-3b` | People grid | 3 | **Locked reference** |
| 8 | `vc-divider` | Section divider | — | **Locked reference** |
| 9 | `vc-people-2` | People grid | 2 | Heading, subtitle + image/name/role/credential/value line per person |
| 10 | `vc-investors` | Investor grid | 6 | **Locked reference** |
| 11 | `focus-divider` | Section divider | — | Section heading, footer trip |
| 12 | `focus-ai-infrastructure-4` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 13 | `focus-agentic-1` | Focus grid | 1 | Stack heading + one company; source is unfinished and cannot be reused |
| 14 | `focus-dev-productivity-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 15 | `focus-dev-productivity-2` | Focus grid | 2 | Stack heading + logo/name/description/URL per company |
| 16 | `focus-zeroops-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 17 | `focus-zeroops-2` | Focus grid | 2 | Stack heading + logo/name/description/URL per company |
| 18 | `focus-cost-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 19 | `focus-cost-2` | Focus grid | 2 | Stack heading + logo/name/description/URL per company |
| 20 | `focus-observability-2` | Focus grid | 2 | Stack heading + logo/name/description/URL per company |
| 21 | `focus-security-4a` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 22 | `focus-security-4b` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 23 | `focus-supply-chain-4` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 24 | `focus-analytics-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 25 | `focus-analytics-2` | Focus grid | 2 | Stack heading + logo/name/description/URL per company |
| 26 | `focus-market-intelligence-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 27 | `focus-marketing-4` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 28 | `focus-voice-4` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 29 | `focus-hr-4` | Focus grid | 4 | Stack heading + logo/name/description/URL per company |
| 30 | `focus-legal-accounting-3` | Focus grid | 3 | Stack heading + logo/name/description/URL per company |
| 31 | `itinerary-sample` | Itinerary | 8 | Heading + time/title/detail per row, route, footer |
| 32 | `breakout-matrix-1` | Breakout matrix | 7 | Attendee/designation/company/description per row, two slots, route, footer |
| 33 | `breakout-matrix-2` | Breakout matrix | 7 | Attendee/designation/company/description per row, two slots, route, footer |
| 34 | `faq` | FAQ | 5 | Heading + five question/answer pairs, route, footer |

## Supported user workflows

### Company remap

1. Scan the copied deck and resolve all semantic contracts.
2. Compile exact text and field replacements; do not generate overlapping client operations.
3. Keep company facts, roles, logos, and use cases gated until they have an authoritative source or explicit user input.
4. Exclude locked reference slides.
5. Preflight match counts, show the plan, require approval, apply, and re-scan.

### Pixel-level adjustment

1. Resolve one page and one semantic element role, such as `priority_1_card` or `focus_2_logo`.
2. Record the exact delta or dimensions.
3. Require a `1–1` match in preflight.
4. Move in place; resize by reconstructing the same native element/group with its formatting, media, paths, and editability preserved.

### New slide or element

- New slide: select the approved family and slot count, then duplicate the corresponding native source layout after the selected Canva page.
- New text: require exact copy, page, `x/y`, width, and formatting.
- New shape: require exact page, `x/y`, width/height, fill, stroke, and corner radius.
- The unfinished one-company source on slide 13 is never offered as a reusable layout.

### Logo or image replacement

1. Resolve exactly one existing media frame.
2. Prefer a direct official HTTPS asset. The resolver can offer an Iconify/Simple Icons or Google-site favicon candidate when available.
3. Show the candidate in the Canva panel and require visual approval.
4. Import the asset, retain the existing frame geometry, replace only the selected fill, and re-scan.

## Quality gate

The apply engine stops without writing when:

- a slide does not match a semantic contract;
- a request targets slides 7, 8, or 10;
- a pixel/media/format/delete operation does not resolve exactly one element;
- the observed match count falls outside the approved bound;
- an image is missing a reviewed asset;
- a new slide lacks a valid source layout;
- a high-level research request has not been compiled into exact fields.

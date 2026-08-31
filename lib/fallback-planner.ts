import type { DeckAudit, DeckPlan, OperationType, PlanOperation, Risk } from "./deck-types";

function operation(
  type: OperationType,
  title: string,
  detail: string,
  pages: number[],
  risk: Risk,
  extra: Partial<PlanOperation> = {},
): PlanOperation {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    title,
    detail,
    pages,
    risk,
    enabled: true,
    ...extra,
  };
}

function allPages(audit?: DeckAudit) {
  return Array.from({ length: audit?.pageCount || 33 }, (_, index) => index + 1);
}

function extractClient(instruction: string) {
  const patterns = [
    /(?:tailor|customi[sz]e|adapt)(?:\s+this\s+deck)?\s+(?:to|for)\s+([A-Z][A-Za-z0-9&' -]{1,39})/i,
    /(?:client|company)\s*(?:is|=|:)\s*([A-Z][A-Za-z0-9&' -]{1,39})/i,
  ];
  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[.,;:]$/, "");
  }
  return undefined;
}

function extractReplacement(instruction: string) {
  const quoted = instruction.match(/replace\s+["“]([^"”]+)["”]\s+with\s+["“]([^"”]+)["”]/i);
  if (quoted) return { find: quoted[1], replace: quoted[2] };
  const unquoted = instruction.match(/replace\s+(.{1,60}?)\s+with\s+(.{1,80}?)(?:\.|,|;|\band\b|$)/i);
  if (unquoted) return { find: unquoted[1].trim(), replace: unquoted[2].trim() };
  const plain = instruction.match(/change\s+(.{1,60}?)\s+to\s+(.{1,80}?)(?:\.|$)/i);
  if (plain) return { find: plain[1].trim(), replace: plain[2].trim() };
  return undefined;
}

function inferSourcePage(text: string) {
  if (/faq|frequently asked/.test(text)) return 33;
  if (/breakout|matrix/.test(text)) return 31;
  if (/itinerary|schedule|agenda/.test(text)) return 30;
  if (/priority/.test(text)) return 2;
  if (/vc connect/.test(text)) return /profile|people|speaker/.test(text) ? 8 : 7;
  if (/masterclass/.test(text)) return /profile|people|speaker/.test(text) ? 5 : 4;
  if (/focus/.test(text)) {
    if (/\b(?:one|1)[ -]compan/.test(text)) return 12;
    if (/\b(?:three|3)[ -]compan/.test(text)) return 13;
    if (/\b(?:two|2)[ -]compan/.test(text)) return 14;
    return 11;
  }
  return undefined;
}

export function createFallbackPlan(instruction: string, audit?: DeckAudit): DeckPlan {
  const text = instruction.toLowerCase();
  const pages = allPages(audit);
  const operations: PlanOperation[] = [];
  const researchNotes: string[] = [];
  const replacement = extractReplacement(instruction);
  const client = extractClient(instruction);

  operations.push(
    operation("audit_deck", "Run full-deck QA", "Re-scan layout, repeated rails, backgrounds and text safety after the update.", pages, "safe"),
  );

  if (/consistent|consistency|align|margin|header|footer|qa|quality|every page|all page/.test(text)) {
    operations.push(
      operation("normalize_headers", "Normalize route headers", "Match the canonical header rail on every applicable standard slide.", pages.slice(1), "safe"),
      operation("center_route_arrows", "Center every route arrow", "Calculate the midpoint from the actual origin and destination text bounds.", pages.slice(1), "safe"),
      operation("normalize_footers", "Normalize and restore footers", "Align existing Onnivation footer marks and flag missing footers for review.", pages, "safe"),
      operation("normalize_backgrounds", "Normalize standard backgrounds", "Use the exact #FCF5ED content-page token while preserving the navy cover.", pages.slice(1), "safe"),
    );
  }

  if (replacement) {
    operations.push(
      operation("replace_text", `Replace “${replacement.find}”`, `Replace matching editable text without changing its existing formatting.`, pages, "safe", replacement),
    );
  }

  if (client && client.toLowerCase() !== audit?.inferredClient?.toLowerCase()) {
    operations.push(
      operation("update_client", `Tailor client references for ${client}`, `Replace ${audit?.inferredClient || "the current client"} references and retain each text element's styling.`, pages, "review", {
        find: audit?.inferredClient,
        replace: client,
        params: { client },
      }),
    );
  }

  if (/priority|priorities|sales|distribution|icon/.test(text)) {
    operations.push(
      operation("update_priorities", "Rebuild the priority map", "Map priority labels to solid, same-size icons and preserve the 5 × 2 grid.", [2], "review"),
    );
  }

  if (/masterclass|vc connect|speaker|master|profile|credential|linkedin/.test(text)) {
    operations.push(
      operation("update_people", "Refresh people and value statements", "Use current credentials and tailor each person's expertise to the client.", [4, 5, 6, 7, 8, 9], "review"),
    );
    researchNotes.push("Verify every person's current role from LinkedIn and an authoritative second source before applying.");
  }

  if (/focus session|compan(?:y|ies)|logo|insurtech|retail|consumer/.test(text)) {
    operations.push(
      operation("update_focus_sessions", "Rebuild focus-session layouts", "Select the canonical 1, 2, 3 or 4-company grid, tailor the value lines, and use official transparent logos.", pages.filter((page) => page >= 10 && page <= 29), "review"),
    );
    researchNotes.push("Fetch logos only from official brand assets or verified company sources; keep an upload override.");
  }

  if (/itinerary|schedule|breakout|day one|day two|day three/.test(text)) {
    operations.push(
      operation("update_itinerary", "Clean the itinerary", "Preserve the shared rails while rebuilding the agenda or breakout matrix on the canonical grid.", [30, 31, 32], "review"),
    );
  }

  if (/new page|add (?:a )?page|new slide|add (?:a )?slide/.test(text)) {
    const sourcePage = inferSourcePage(text);
    operations.push(
      operation("add_page_from_layout", "Add a page from a canonical layout", sourcePage ? `Duplicate canonical page ${sourcePage} as native editable elements after the currently selected Canva page.` : "Select the closest approved layout and insert it without flattening editable elements.", [], "review", {
        params: sourcePage ? { sourcePage } : undefined,
      }),
    );
  }

  if (operations.length === 1) {
    operations.push(
      operation("normalize_headers", "Check repeated slide rails", "Compare headers, footers, margins and route geometry before making content changes.", pages.slice(1), "safe"),
    );
  }

  return {
    summary: `${operations.length} proposed actions across ${new Set(operations.flatMap((item) => item.pages)).size || audit?.pageCount || 33} slides.`,
    confidence: 0.78,
    source: "local",
    requiresResearch: researchNotes.length > 0,
    researchNotes,
    sources: [],
    operations,
  };
}

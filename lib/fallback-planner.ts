import { canonicalSourceForFamily, NIKE_EXPECTED_SLIDES } from "./deck-contract";
import { guardPlan, mutablePages, pageForContract } from "./plan-guard";
import type {
  DeckAudit,
  DeckPlan,
  ElementRole,
  ElementSelector,
  OperationType,
  PlanOperation,
  Risk,
} from "./deck-types";

function operation(
  index: number,
  type: OperationType,
  title: string,
  detail: string,
  pages: number[],
  risk: Risk,
  extra: Partial<PlanOperation> = {},
): PlanOperation {
  return {
    id: `${String(index).padStart(2, "0")}-${type}`,
    type,
    title,
    detail,
    pages,
    risk,
    enabled: true,
    ...extra,
  };
}

function allMutablePages(audit?: DeckAudit) {
  return audit ? mutablePages(audit) : Array.from({ length: NIKE_EXPECTED_SLIDES }, (_, index) => index + 1).filter((page) => ![7, 8, 10].includes(page));
}

function extractClient(instruction: string) {
  const patterns = [
    /(?:tailor|customi[sz]e|adapt|remap)(?:\s+this\s+deck)?\s+(?:to|for)\s+([A-Z][A-Za-z0-9&.' -]{1,49}?)(?=\.|,|;|\s+and\b|$)/i,
    /(?:client|company)\s*(?:is|=|:)\s*([A-Z][A-Za-z0-9&.' -]{1,49}?)(?=\.|,|;|\s+and\b|$)/i,
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
  const plainName = instruction.match(/replace\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s+with\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})(?=\s*,|\s+and\b|\.|;|$)/i);
  if (plainName) return { find: plainName[1].trim(), replace: plainName[2].trim() };
  const plain = instruction.match(/change\s+(.{1,60}?)\s+to\s+(.{1,80}?)(?:\.|$)/i);
  if (plain) return { find: plain[1].trim(), replace: plain[2].trim() };
  return undefined;
}

function ordinal(value: string | undefined) {
  if (!value) return 1;
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  return words[value.toLowerCase()] || Number(value) || 1;
}

function roleFromPhrase(phrase: string): ElementRole | undefined {
  const text = phrase.toLowerCase();
  const slot = ordinal(text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)(?:st|nd|rd|th)?\b/)?.[1]);
  if (/priority.*card|card.*priority/.test(text)) return `priority_${slot}_card`;
  if (/priority.*icon|icon.*priority/.test(text)) return `priority_${slot}_icon`;
  if (/priority.*(?:label|name)|(?:label|name).*priority/.test(text)) return `priority_${slot}_label`;
  if (/(?:focus|company).*card|card.*(?:focus|company)/.test(text)) return `focus_${slot}_card`;
  if (/(?:focus|company).*logo|logo.*(?:focus|company)|\blogo\b/.test(text)) return `focus_${slot}_logo`;
  if (/(?:person|speaker|mentor).*image|headshot|photo/.test(text)) return `person_${slot}_image`;
  if (/(?:person|speaker|mentor).*card/.test(text)) return `person_${slot}_card`;
  if (/section.*heading|main.*heading|slide.*title|page.*title/.test(text)) return "section_heading";
  if (/eyebrow|section.*label/.test(text)) return "section_eyebrow";
  if (/footer.*line/.test(text)) return "footer_line";
  if (/header.*line/.test(text)) return "header_line";
  if (/footer/.test(text)) return "footer_text";
  if (/route.*arrow|arrow/.test(text)) return "route_arrow";
  return undefined;
}

function pageFromInstruction(instruction: string, audit?: DeckAudit, targetPhrase = "") {
  const explicit = instruction.match(/(?:slide|page)\s*(\d{1,2})/i)?.[1];
  if (explicit) return Number(explicit);
  const targetText = targetPhrase.toLowerCase();
  if (/priority/.test(targetText)) return pageForContract(audit, "priority-map");
  if (/investor/.test(targetText)) return pageForContract(audit, "vc-investors");
  if (/vc connect/.test(targetText)) return pageForContract(audit, "vc-people-2");
  if (/masterclass|speaker|mentor|person|headshot/.test(targetText)) return pageForContract(audit, "masterclass-people-3a");
  if (targetPhrase) return undefined;
  const text = instruction.toLowerCase();
  if (/priority/.test(text)) return pageForContract(audit, "priority-map");
  if (/investor/.test(text)) return pageForContract(audit, "vc-investors");
  if (/vc connect/.test(text)) return pageForContract(audit, "vc-people-2");
  if (/masterclass|speaker|mentor|person|headshot/.test(text)) return pageForContract(audit, "masterclass-people-3a");
  return undefined;
}

function selectorForPhrase(phrase: string): ElementSelector | undefined {
  const role = roleFromPhrase(phrase);
  if (role) return { role };
  const quoted = phrase.match(/["“]([^"”]+)["”]/)?.[1];
  if (quoted) return { kind: "text", exactText: quoted };
  return undefined;
}

function parseMove(instruction: string, audit?: DeckAudit) {
  const match = instruction.match(/move\s+(?:the\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s*(?:px|pixels?)\s+(left|right|up|down)(?=\s*,|\s+and\b|\.|;|$)/i);
  if (!match) return undefined;
  const [, targetPhrase, amountText, direction] = match;
  const amount = Number(amountText);
  const page = pageFromInstruction(instruction, audit, targetPhrase);
  const target = selectorForPhrase(targetPhrase);
  const horizontal = /left|right/i.test(direction);
  const sign = /left|up/i.test(direction) ? -1 : 1;
  return {
    page,
    target,
    geometry: horizontal ? { deltaX: sign * amount } : { deltaY: sign * amount },
    targetPhrase,
  };
}

function parseResize(instruction: string, audit?: DeckAudit) {
  const match = instruction.match(/resize\s+(?:the\s+)?(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)(?:\s*px)?(?=\s*,|\s+and\b|\.|;|$)/i);
  if (!match) return undefined;
  const [, targetPhrase, width, height] = match;
  return {
    page: pageFromInstruction(instruction, audit, targetPhrase),
    target: selectorForPhrase(targetPhrase),
    geometry: { width: Number(width), height: Number(height), preserveAspectRatio: false },
    targetPhrase,
  };
}

function companySlots(instruction: string) {
  const match = instruction.match(/\b(one|two|three|four|1|2|3|4)[ -]compan(?:y|ies)\b/i);
  if (!match) return undefined;
  return ({ one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[match[1].toLowerCase()] || Number(match[1]);
}

function requestedNewSlide(instruction: string) {
  if (/(?:add|create|insert)\s+(?:a\s+)?(?:new\s+)?(?:text(?:\s+box)?|box|rectangle|shape)\b/i.test(instruction)) return false;
  return /(?:add|create|insert|make)\s+(?:a\s+)?new\b[^.;]*(?:slide|page)/i.test(instruction) || /(?:add|create|insert)\s+(?:a\s+)?(?:slide|page)/i.test(instruction);
}

function logoReplacement(instruction: string, audit?: DeckAudit) {
  const match = instruction.match(/replace\s+(?:the\s+)?([^,.;]*?logo)\s+with\s+(?:the\s+)?(?:official\s+)?([A-Z][A-Za-z0-9&.' -]{1,49}?)\s+logo(?=\s*,|\s+and\b|\.|;|$)/i);
  if (!match) return undefined;
  const targetPhrase = match[1];
  const company = match[2].trim();
  const page = pageFromInstruction(instruction, audit, targetPhrase);
  return { company, page, target: selectorForPhrase(targetPhrase) };
}

function parseInsertText(instruction: string) {
  const match = instruction.match(/(?:add|insert|create)\s+(?:a\s+)?(?:new\s+)?text(?:\s+box)?\s+["“]([^"”]+)["”][^.;]*?(?:slide|page)\s*(\d{1,2})[^.;]*?(?:at\s+)?x\s*=?\s*(-?\d+(?:\.\d+)?)\s*[, ]+\s*y\s*=?\s*(-?\d+(?:\.\d+)?)[^.;]*?width\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return { text: match[1], page: Number(match[2]), top: Number(match[4]), left: Number(match[3]), width: Number(match[5]) };
}

function parseInsertShape(instruction: string) {
  const match = instruction.match(/(?:add|insert|create)\s+(?:a\s+)?(?:new\s+)?(?:rounded\s+)?(?:box|rectangle|shape)[^.;]*?(?:slide|page)\s*(\d{1,2})[^.;]*?(?:at\s+)?x\s*=?\s*(-?\d+(?:\.\d+)?)\s*[, ]+\s*y\s*=?\s*(-?\d+(?:\.\d+)?)[^.;]*?(?:size|dimensions?)\s*(?:=|to)?\s*(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return { page: Number(match[1]), left: Number(match[2]), top: Number(match[3]), width: Number(match[4]), height: Number(match[5]) };
}

export function createFallbackPlan(instruction: string, audit?: DeckAudit): DeckPlan {
  const text = instruction.toLowerCase();
  const pages = allMutablePages(audit);
  const operations: PlanOperation[] = [];
  const researchNotes: string[] = [];
  let index = 1;
  const add = (type: OperationType, title: string, detail: string, targetPages: number[], risk: Risk, extra: Partial<PlanOperation> = {}) => {
    operations.push(operation(index, type, title, detail, targetPages, risk, extra));
    index += 1;
  };
  const replacement = extractReplacement(instruction);
  const client = extractClient(instruction);

  add("audit_deck", "Verify the complete deck", "Re-scan all semantic slide contracts and compare the result after applying approved changes.", pages, "safe");

  if (/consistent|consistency|align|margin|header|footer|qa|quality|every page|every slide|all page|all slide/.test(text)) {
    const standardPages = audit
      ? audit.pages.filter((page) => !page.lockedByContract && page.family !== "cover").map((page) => page.number)
      : pages.slice(1);
    add("normalize_headers", "Verify canonical header rails", "Repair only uniquely identified header rails on the selected mutable slides.", standardPages, "safe", {
      expectedAffectedElements: { min: 0, max: standardPages.length * 4 },
    });
    add("normalize_footers", "Verify canonical footer rails", "Fix duplicate separators and uniquely identified footer rails without rewriting intentional content.", pages, "safe", {
      expectedAffectedElements: { min: 0, max: pages.length * 2 },
    });
  }

  if (replacement) {
    add("replace_text", `Replace “${replacement.find}”`, "Replace exact matching editable text while preserving each text region's formatting.", pages, "safe", {
      ...replacement,
      expectedAffectedElements: { min: 1, max: pages.length * 10 },
    });
  } else if (client && client.toLowerCase() !== audit?.inferredClient?.toLowerCase()) {
    const currentClient = audit?.inferredClient;
    add("update_client", `Tailor client references for ${client}`, `Replace exact ${currentClient || "current-client"} references only; company-specific use cases remain gated until supplied or researched.`, pages, "review", {
      find: currentClient,
      replace: client,
      params: { client },
      expectedAffectedElements: { min: 1, max: pages.length * 8 },
    });
  }

  const move = parseMove(instruction, audit);
  if (move) {
    add("move_element", `Move ${move.targetPhrase}`, "Apply the requested pixel delta to one uniquely resolved native Canva element.", move.page ? [move.page] : [], "review", {
      target: move.target,
      geometry: move.geometry,
      expectedAffectedElements: { min: 1, max: 1 },
    });
  }

  const resize = parseResize(instruction, audit);
  if (resize) {
    add("resize_element", `Resize ${resize.targetPhrase}`, "Set exact dimensions on one uniquely resolved native Canva element.", resize.page ? [resize.page] : [], "review", {
      target: resize.target,
      geometry: resize.geometry,
      expectedAffectedElements: { min: 1, max: 1 },
    });
  }

  const logo = logoReplacement(instruction, audit);
  if (logo) {
    add("replace_image", `Replace with the official ${logo.company} logo`, "Resolve an approved transparent logo, preserve the target frame, and replace only the uniquely selected media fill.", logo.page ? [logo.page] : [], "review", {
      target: logo.target,
      params: { company: logo.company },
      expectedAffectedElements: { min: 1, max: 1 },
    });
    researchNotes.push(`Verify the ${logo.company} logo against its official website or brand assets before applying.`);
  }

  const insertedText = parseInsertText(instruction);
  if (insertedText) {
    add("insert_text", `Add “${insertedText.text.slice(0, 36)}${insertedText.text.length > 36 ? "…" : ""}”`, "Insert one native editable Canva text box at the exact approved coordinates.", [insertedText.page], "review", {
      insert: insertedText,
      formatting: { fontRef: "YAFdJsnKuGg,0", fontSize: 24, fontWeight: "normal", color: "#0F2442" },
      expectedAffectedElements: { min: 1, max: 1 },
    });
  }

  const insertedShape = parseInsertShape(instruction);
  if (insertedShape) {
    add("insert_shape", "Add a native editable shape", "Insert one rounded rectangle at the exact approved coordinates and dimensions.", [insertedShape.page], "review", {
      insert: { ...insertedShape, fill: "#FFFAF9", strokeColor: "#E1DCCC", strokeWeight: 1, cornerRadius: 20 },
      expectedAffectedElements: { min: 1, max: 1 },
    });
  }

  if (requestedNewSlide(instruction)) {
    const slots = companySlots(instruction);
    const source = /focus|compan/.test(text) ? canonicalSourceForFamily("focus-grid", slots) : undefined;
    add("add_page_from_layout", `Add ${slots ? `${slots}-company ` : ""}slide from an approved layout`, source ? `Duplicate “${source.label}” as native editable Canva elements; no screenshot flattening.` : "Choose a semantic layout before applying.", [], "review", {
      sourcePageKey: source?.key,
      afterPageKey: audit?.pages.at(-1)?.contractKey,
      params: slots ? { slots } : undefined,
    });
  }

  if (/priority|priorities/.test(text) && !move && !resize) {
    add("update_priorities", "Map the 10 priority slots", "Provide ten approved label/icon pairs; the 5 × 2 geometry and 21-field contract remain fixed.", [pageForContract(audit, "priority-map") || 2], "review");
  }

  if (/masterclass|vc connect|speaker|mentor|profile|credential|linkedin/.test(text) && !move && !resize) {
    add("update_people", "Refresh people and value statements", "Provide verified current roles, profile images, and tailored value lines for the exact person slots.", [5, 6, 9], "review");
    researchNotes.push("Verify each person's current role from an authoritative source before compiling exact field operations.");
  }

  if (/focus session|use case|company|companies|retail|consumer/.test(text) && !requestedNewSlide(instruction) && !logo) {
    add("update_focus_sessions", "Tailor Focus Session fields", "Compile stack headings, company names, descriptions, links, and approved logos into exact slot operations.", audit ? audit.pages.filter((page) => page.family === "focus-grid").map((page) => page.number) : Array.from({ length: 19 }, (_, i) => i + 12), "review");
    researchNotes.push("Company descriptions and logo sources must be verified before exact field operations are enabled.");
  }

  if (/itinerary|schedule|breakout|day one|day two|day three/.test(text)) {
    add("update_itinerary", "Tailor itinerary and breakout matrices", "Compile each time, session, attendee, company, and description into the existing exact slots.", audit ? audit.pages.filter((page) => page.family === "itinerary" || page.family === "breakout-matrix").map((page) => page.number) : [31, 32, 33], "review");
  }

  return guardPlan({
    summary: "",
    confidence: 0.86,
    source: "local",
    requiresResearch: researchNotes.length > 0,
    researchNotes,
    sources: [],
    operations,
  }, audit);
}

export const fallbackInternals = {
  extractClient,
  extractReplacement,
  parseMove,
  parseResize,
  requestedNewSlide,
  roleFromPhrase,
  parseInsertText,
  parseInsertShape,
};

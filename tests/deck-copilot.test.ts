import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSourceForFamily,
  NIKE_EXPECTED_SLIDES,
  NIKE_SLIDE_CONTRACTS,
  resolveSlideContracts,
} from "../lib/deck-contract";
import { iconifyBrandSlug } from "../lib/asset-resolver";
import { corsHeaders } from "../lib/canva-auth";
import { createFallbackPlan, fallbackInternals } from "../lib/fallback-planner";
import { guardOperation } from "../lib/plan-guard";
import type { DeckAudit, DeckPageSnapshot, PlanOperation, TextNodeSnapshot } from "../lib/deck-types";

function text(value: string): TextNodeSnapshot {
  return { text: value, top: 0, left: 0, width: 100, height: 20, locked: false };
}

function page(number: number, contractKey?: string): DeckPageSnapshot {
  const contract = NIKE_SLIDE_CONTRACTS.find((item) => item.key === contractKey);
  const identity = [...(contract?.identityAll || []), ...(contract?.identityAny || [])].join("\n") || `Slide ${number}`;
  return {
    number,
    id: `page-${number}`,
    width: 1920,
    height: 1080,
    background: "#fcf5ed",
    contractKey: contract?.key,
    family: contract?.family,
    lockedByContract: contract?.locked,
    texts: [text(identity)],
    images: [],
    elements: [],
    issues: [],
  };
}

function audit(): DeckAudit {
  const pages = NIKE_SLIDE_CONTRACTS.map((contract) => page(contract.legacyPage, contract.key));
  return {
    connected: true,
    title: "US Trip - Nike",
    pageCount: pages.length,
    width: 1920,
    height: 1080,
    inferredClient: "Nike",
    templateVersion: "test",
    expectedPageCount: NIKE_EXPECTED_SLIDES,
    matchedContracts: pages.length,
    unmatchedContracts: [],
    pages,
    issues: [],
    scannedAt: new Date(0).toISOString(),
  };
}

test("the semantic manifest covers the real 34-slide source exactly", () => {
  assert.equal(NIKE_EXPECTED_SLIDES, 34);
  assert.equal(NIKE_SLIDE_CONTRACTS.length, 34);
  assert.equal(new Set(NIKE_SLIDE_CONTRACTS.map((contract) => contract.key)).size, 34);
  assert.equal(new Set(NIKE_SLIDE_CONTRACTS.map((contract) => contract.legacyPage)).size, 34);
  assert.deepEqual(
    NIKE_SLIDE_CONTRACTS.filter((contract) => contract.locked).map((contract) => contract.legacyPage),
    [7, 8, 10],
  );
  for (const contract of NIKE_SLIDE_CONTRACTS.filter((item) => item.legacyPage >= 11)) {
    assert.ok(contract.dynamicFields.length > 0, `${contract.key} needs pinpoint dynamic fields`);
  }
});

test("slide identity wins over raw page number after insertions or deletions", () => {
  const shifted = [
    { number: 2, texts: [text("Building the AI Infrastructure Stack Fireworks AI Band Vast Data Eon")] },
    { number: 12, texts: [text("PRIORITY MAPPING Mapped to Nike's priorities 10 focus areas")] },
  ];
  const resolved = resolveSlideContracts(shifted);
  assert.equal(resolved.get(2)?.key, "focus-ai-infrastructure-4");
  assert.equal(resolved.get(12)?.key, "priority-map");
});

test("the four core goals compile independently and do not disappear", () => {
  const plan = createFallbackPlan(
    "Tailor this deck for Henkel. Replace Nike with Henkel, move the first priority card 12 px right, add a new three-company focus-session slide, and replace the first company logo with the official Henkel logo.",
    audit(),
  );
  const replacement = plan.operations.filter((item) => item.type === "replace_text");
  assert.equal(replacement.length, 1, "client replacement must not be duplicated");
  assert.equal(plan.operations.some((item) => item.type === "update_client"), false);

  const move = plan.operations.find((item) => item.type === "move_element");
  assert.deepEqual(move?.pages, [2]);
  assert.equal(move?.target?.role, "priority_1_card");
  assert.equal(move?.geometry?.deltaX, 12);
  assert.equal(move?.status, "executable");

  const newPage = plan.operations.find((item) => item.type === "add_page_from_layout");
  assert.equal(newPage?.sourcePageKey, "focus-dev-productivity-3");
  assert.equal(newPage?.status, "executable");

  const logo = plan.operations.find((item) => item.type === "replace_image");
  assert.equal(logo?.target?.role, "focus_1_logo");
  assert.equal(logo?.status, "needs_input", "an ambiguous page or unverified logo must never auto-apply");
});

test("pixel, new text, and new shape instructions compile to exact native operations", () => {
  const resize = fallbackInternals.parseResize("Resize the first priority card to 310 x 278 px.", audit());
  assert.equal(resize?.target?.role, "priority_1_card");
  assert.deepEqual(resize?.geometry, { width: 310, height: 278, preserveAspectRatio: false });

  const insertedText = fallbackInternals.parseInsertText('Add text "Hello Henkel" on slide 12 at x 100, y 220 width 360.');
  assert.deepEqual(insertedText, { text: "Hello Henkel", page: 12, top: 220, left: 100, width: 360 });

  const insertedShape = fallbackInternals.parseInsertShape("Add a rounded rectangle on slide 12 at x 80, y 300 size 420 x 260.");
  assert.deepEqual(insertedShape, { page: 12, left: 80, top: 300, width: 420, height: 260 });
});

test("locked reference slides are excluded even from multi-slide operations", () => {
  const operation: PlanOperation = {
    id: "normalize",
    type: "normalize_headers",
    title: "Normalize",
    detail: "Exact selected slides",
    pages: Array.from({ length: 34 }, (_, index) => index + 1),
    risk: "safe",
    enabled: true,
  };
  const guarded = guardOperation(operation, audit());
  assert.equal(guarded.pages.includes(7), false);
  assert.equal(guarded.pages.includes(8), false);
  assert.equal(guarded.pages.includes(10), false);
  assert.equal(guarded.status, "executable");

  const lockedOnly = guardOperation({
    ...operation,
    id: "locked-only",
    type: "move_element",
    pages: [7],
    target: { role: "person_1_card" },
    geometry: { deltaX: 5 },
    expectedAffectedElements: { min: 1, max: 1 },
  }, audit());
  assert.equal(lockedOnly.status, "blocked");
  assert.match(lockedOnly.blockedReason || "", /locked reference slide 7/i);
});

test("high-level AI requests stay gated until exact fields are compiled", () => {
  const plan = createFallbackPlan("Update all focus sessions for retail and consumer AI.", audit());
  const focus = plan.operations.find((item) => item.type === "update_focus_sessions");
  assert.equal(focus?.enabled, false);
  assert.equal(focus?.status, "needs_input");
  assert.match(focus?.blockedReason || "", /compiled into exact field/i);
});

test("canonical page creation chooses the correct slot-count layout", () => {
  assert.equal(canonicalSourceForFamily("focus-grid", 1)?.key, undefined, "unfinished one-company source must not be reused");
  assert.equal(canonicalSourceForFamily("focus-grid", 2)?.slots, 2);
  assert.equal(canonicalSourceForFamily("focus-grid", 3)?.key, "focus-dev-productivity-3");
  assert.equal(canonicalSourceForFamily("focus-grid", 4)?.slots, 4);
});

test("brand logo lookup produces stable Iconify slugs", () => {
  assert.equal(iconifyBrandSlug("Henkel"), "henkel");
  assert.equal(iconifyBrandSlug("Cast.ai"), "castai");
  assert.equal(iconifyBrandSlug("Smallest AI"), "smallestdotai");
});

test("CORS accepts the exact Canva panel origin and rejects lookalikes", () => {
  const allowed = corsHeaders(new Request("https://example.test", { headers: { Origin: "https://app-aahogpzapay.canva-apps.com" } }));
  assert.equal(allowed.get("Access-Control-Allow-Origin"), "https://app-aahogpzapay.canva-apps.com");

  const lookalike = corsHeaders(new Request("https://example.test", { headers: { Origin: "https://app-aahogpzapay.canva-apps.com.attacker.example" } }));
  assert.equal(lookalike.get("Access-Control-Allow-Origin"), null);
});

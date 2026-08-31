import { contractByKey, isLockedContract } from "./deck-contract";
import type { DeckAudit, DeckPlan, PlanOperation } from "./deck-types";

const singleTargetOperations = new Set<PlanOperation["type"]>([
  "replace_image",
  "move_element",
  "resize_element",
  "format_text",
  "delete_element",
  "set_template_field",
]);

const compiledOnlyOperations = new Set<PlanOperation["type"]>([
  "update_priorities",
  "update_people",
  "update_focus_sessions",
  "update_itinerary",
]);

function unique(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function pageNumbersForKeys(audit: DeckAudit | undefined, keys: string[] | undefined) {
  if (!audit || !keys?.length) return [];
  return audit.pages.filter((page) => page.contractKey && keys.includes(page.contractKey)).map((page) => page.number);
}

function reason(operation: PlanOperation, audit?: DeckAudit) {
  if (compiledOnlyOperations.has(operation.type)) {
    return "This high-level request must be compiled into exact field, geometry, or asset operations before it can run.";
  }
  if (singleTargetOperations.has(operation.type)) {
    if (operation.pages.length !== 1) return "Pixel, format, delete, field, and image edits must target exactly one resolved slide.";
    if (!operation.target) return "A unique element selector is required.";
  }
  if (operation.type === "move_element" && !operation.geometry) return "The move distance or final coordinates are missing.";
  if (operation.type === "resize_element" && (!operation.geometry || (operation.geometry.width === undefined && operation.geometry.height === undefined))) {
    return "The target width or height is missing.";
  }
  if (operation.type === "format_text" && !operation.formatting) return "The requested text formatting is missing.";
  if (operation.type === "replace_image" && !operation.asset) return "Choose or verify an image/logo asset before applying.";
  if (operation.type === "insert_text" && (!operation.insert?.text || operation.pages.length !== 1)) {
    return "New text requires exact copy, one slide, and exact geometry.";
  }
  if (operation.type === "insert_shape" && (!operation.insert || operation.pages.length !== 1)) {
    return "A new shape requires one slide and exact geometry.";
  }
  if (operation.type === "add_page_from_layout") {
    if (!operation.sourcePageKey) return "Choose an approved canonical layout first.";
    if (!audit?.pages.some((page) => page.contractKey === operation.sourcePageKey)) {
      return `The canonical source layout “${operation.sourcePageKey}” was not found in this deck.`;
    }
  }
  if ((operation.type === "replace_text" || operation.type === "update_client") && (!operation.find || operation.replace === undefined)) {
    return "Exact find and replacement text are required.";
  }
  if (["normalize_headers", "normalize_footers", "center_route_arrows", "normalize_backgrounds"].includes(operation.type) && !operation.pages.length) {
    return "Full-deck normalization is never implicit; select the exact slides first.";
  }
  return undefined;
}

export function guardOperation(operation: PlanOperation, audit?: DeckAudit): PlanOperation {
  const keyedPages = pageNumbersForKeys(audit, operation.pageKeys);
  let pages = unique([...operation.pages, ...keyedPages]);
  const lockedPages = audit?.pages.filter((page) => pages.includes(page.number) && page.lockedByContract) || [];
  if (lockedPages.length) pages = pages.filter((page) => !lockedPages.some((locked) => locked.number === page));

  const next: PlanOperation = {
    ...operation,
    pages,
    expectedAffectedElements: operation.expectedAffectedElements || (
      singleTargetOperations.has(operation.type) ? { min: 1, max: 1 } : undefined
    ),
  };
  if (lockedPages.length && !pages.length && operation.type !== "audit_deck") {
    return {
      ...next,
      enabled: false,
      status: "blocked",
      blockedReason: `The request only matched locked reference slide${lockedPages.length === 1 ? "" : "s"} ${lockedPages.map((page) => page.number).join(", ")}.`,
    };
  }
  const blocked = reason(next, audit);
  if (blocked) {
    return { ...next, enabled: false, status: "needs_input", blockedReason: blocked };
  }
  return {
    ...next,
    enabled: operation.enabled,
    status: "executable",
    blockedReason: lockedPages.length
      ? `Locked reference slide${lockedPages.length === 1 ? "" : "s"} ${lockedPages.map((page) => page.number).join(", ")} excluded.`
      : undefined,
  };
}

function operationKey(operation: PlanOperation) {
  return JSON.stringify({
    type: operation.type,
    pages: operation.pages,
    pageKeys: operation.pageKeys,
    find: operation.find,
    replace: operation.replace,
    target: operation.target,
    geometry: operation.geometry,
    formatting: operation.formatting,
    sourcePageKey: operation.sourcePageKey,
  });
}

export function guardPlan(plan: DeckPlan, audit?: DeckAudit): DeckPlan {
  const seen = new Set<string>();
  const operations: PlanOperation[] = [];
  for (const item of plan.operations.map((operation) => guardOperation(operation, audit))) {
    const key = operationKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    operations.push(item);
  }
  const executable = operations.filter((item) => item.enabled && item.status === "executable");
  const gated = operations.length - executable.length;
  return {
    ...plan,
    summary: `${executable.length} executable action${executable.length === 1 ? "" : "s"}${gated ? ` · ${gated} gated` : ""}`,
    operations,
  };
}

export function mutablePages(audit?: DeckAudit) {
  if (!audit) return [];
  return audit.pages.filter((page) => !page.lockedByContract).map((page) => page.number);
}

export function pageForContract(audit: DeckAudit | undefined, key: string) {
  return audit?.pages.find((page) => page.contractKey === key)?.number || contractByKey(key)?.legacyPage;
}

export function operationTargetsLockedReference(operation: PlanOperation, audit?: DeckAudit) {
  return operation.pageKeys?.some(isLockedContract) || Boolean(
    audit?.pages.some((page) => operation.pages.includes(page.number) && page.contractKey && isLockedContract(page.contractKey)),
  );
}

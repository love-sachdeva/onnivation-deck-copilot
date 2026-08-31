import type { DeckPlan, PlanOperation } from "./deck-types";

const slugAliases: Record<string, string> = {
  "pointfive": "pointfive",
  "braintrust": "braintrust",
  "cast ai": "castai",
  "general catalyst": "general-catalyst",
  "smallest ai": "smallestdotai",
};

export function iconifyBrandSlug(company: string) {
  const normalized = company.toLowerCase().replace(/\.(ai|io)$/g, " $1").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  return slugAliases[normalized] || normalized.replace(/\s+/g, "");
}

async function iconifyCandidate(company: string) {
  const slug = iconifyBrandSlug(company);
  if (!slug) return undefined;
  const sourceUrl = `https://api.iconify.design/simple-icons:${encodeURIComponent(slug)}.svg`;
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(4_000), headers: { Accept: "image/svg+xml" } });
    if (!response.ok) return undefined;
    const preview = await response.text();
    if (!preview.includes("<svg")) return undefined;
    return { sourceUrl, mimeType: "image/svg+xml" as const, title: `${company} logo candidate` };
  } catch {
    return undefined;
  }
}

async function googleFaviconCandidate(company: string, website: string) {
  try {
    const domain = new URL(website).hostname;
    if (!domain) return undefined;
    const sourceUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
    return { sourceUrl, mimeType: "image/png" as const, title: `${company} website logo candidate` };
  } catch {
    return undefined;
  }
}

async function resolveOperationAsset(operation: PlanOperation) {
  if (operation.type !== "replace_image" || operation.asset) return operation;
  const company = typeof operation.params?.company === "string" ? operation.params.company : undefined;
  const website = typeof operation.params?.website === "string" ? operation.params.website : undefined;
  if (!company) return operation;
  const candidate = await iconifyCandidate(company) || (website ? await googleFaviconCandidate(company, website) : undefined);
  return candidate ? { ...operation, asset: candidate } : operation;
}

export async function resolvePlanAssets(plan: DeckPlan): Promise<DeckPlan> {
  const operations = await Promise.all(plan.operations.map(resolveOperationAsset));
  const resolved = operations.filter((operation) => operation.type === "replace_image" && operation.asset);
  if (!resolved.length) return { ...plan, operations };
  return {
    ...plan,
    requiresResearch: true,
    researchNotes: [
      ...plan.researchNotes,
      ...resolved.map((operation) => `${operation.asset!.title} is ready for visual approval; confirm it matches the company's current official brand mark.`),
    ],
    sources: [
      ...plan.sources,
      ...resolved.map((operation) => ({ title: operation.asset!.title, url: operation.asset!.sourceUrl })),
    ],
    operations,
  };
}

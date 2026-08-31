import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat as anthropicZodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { createFallbackPlan } from "../../../lib/fallback-planner";
import { resolvePlanAssets } from "../../../lib/asset-resolver";
import { corsHeaders, jsonResponse, verifyCanvaRequest } from "../../../lib/canva-auth";
import { guardPlan } from "../../../lib/plan-guard";
import type { DeckAudit, DeckPlan } from "../../../lib/deck-types";

export const runtime = "nodejs";

const operationTypes = [
  "audit_deck",
  "replace_text",
  "replace_image",
  "update_client",
  "normalize_headers",
  "normalize_footers",
  "center_route_arrows",
  "normalize_backgrounds",
  "update_priorities",
  "update_people",
  "update_focus_sessions",
  "update_itinerary",
  "add_page_from_layout",
  "move_element",
  "resize_element",
  "format_text",
  "insert_text",
  "insert_shape",
  "delete_element",
  "set_template_field",
] as const;

const SelectorSchema = z.object({
  kind: z.enum(["text", "image", "shape", "group", "embed"]).nullable(),
  role: z.string().nullable(),
  exactText: z.string().nullable(),
  containsText: z.string().nullable(),
  occurrence: z.number().int().positive().nullable(),
  near: z.object({ top: z.number(), left: z.number(), tolerance: z.number().positive().nullable() }).nullable(),
});

const GeometrySchema = z.object({
  top: z.number().nullable(),
  left: z.number().nullable(),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  deltaX: z.number().nullable(),
  deltaY: z.number().nullable(),
  preserveAspectRatio: z.boolean().nullable(),
});

const FormattingSchema = z.object({
  fontRef: z.string().nullable(),
  fontSize: z.number().positive().nullable(),
  fontWeight: z.enum(["normal", "bold"]).nullable(),
  fontStyle: z.enum(["normal", "italic"]).nullable(),
  color: z.string().nullable(),
  textAlign: z.enum(["start", "center", "end", "justify"]).nullable(),
  lineHeightEm: z.number().positive().nullable(),
});

const InsertSchema = z.object({
  text: z.string().nullable(),
  top: z.number(),
  left: z.number(),
  width: z.number().positive(),
  height: z.number().positive().nullable(),
  rotation: z.number().nullable(),
  fill: z.string().nullable(),
  strokeColor: z.string().nullable(),
  strokeWeight: z.number().nonnegative().nullable(),
  cornerRadius: z.number().nonnegative().nullable(),
});

const PlanSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  requiresResearch: z.boolean(),
  researchNotes: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  operations: z.array(
    z.object({
      id: z.string(),
      type: z.enum(operationTypes),
      title: z.string(),
      detail: z.string(),
      pages: z.array(z.number().int().positive()),
      risk: z.enum(["safe", "review"]),
      enabled: z.boolean(),
      find: z.string().nullable(),
      replace: z.string().nullable(),
      pageKeys: z.array(z.string()).nullable(),
      target: SelectorSchema.nullable(),
      geometry: GeometrySchema.nullable(),
      formatting: FormattingSchema.nullable(),
      insert: InsertSchema.nullable(),
      sourcePageKey: z.string().nullable(),
      afterPageKey: z.string().nullable(),
      asset: z.object({
        sourceUrl: z.string().url(),
        mimeType: z.enum(["image/jpeg", "image/heic", "image/png", "image/svg+xml", "image/webp", "image/tiff"]),
        title: z.string(),
      }).nullable(),
      expectedAffectedElements: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).nullable(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).nullable(),
    }),
  ),
});

const plannerSystemPrompt = `You compile user instructions into precise, guarded edits for the Onnivation Nike Canva deck. The live audit includes semantic contractKey values; target slides by pageKeys whenever possible because raw page numbers drift after insertion. Preserve native editability and the existing layout. Never flatten a slide.

Hard rules:
- Slides whose audit says lockedByContract=true are immutable. Never target them.
- Gold rails are #C9A227 at left 71, width 1778, height 2, header top 85 and footer top 965.
- Canonical heading fontRef is YACgEdeqDWI,0; eyebrow fontRef is YAFdJj8NdaU,1; forest is #205047; section dot mediaRef is MAHSii6-IGc.
- A pixel edit must be one move_element or resize_element with exactly one pageKey/page, one selector, and exact geometry. Use roles such as priority_1_card, focus_1_logo, person_2_image, section_heading, header_line or footer_text.
- A new slide must be add_page_from_layout with an existing canonical sourcePageKey matching the required family/slot count. It duplicates editable native elements.
- New copy or shapes use insert_text or insert_shape only when exact coordinates and dimensions are known.
- Official logo/image replacement must be replace_image, exactly one slide and selector, plus a direct verified HTTPS asset URL and MIME type. If no verified asset is available, leave asset null and mark research required; do not invent a URL.
- Exact client/copy replacements must preserve text formatting. Do not emit both replace_text and update_client for the same find/replace pair.
- High-level update_priorities, update_people, update_focus_sessions and update_itinerary are non-executable requests. Prefer compiling exact set_template_field, replace_image, move/resize, format, insert, and add-page operations. If exact field values are not supplied or verified, high-level operations may be returned but will stay gated.
- Multi-slide normalization must list exact mutable pages. No empty page list means “all.”
- Never guess a current role, company fact, credential, or source. Put verification gaps in researchNotes.

Use null for unavailable optional fields. expectedAffectedElements must bound the intended match count; use 1–1 for one-element edits. All IDs must be short unique kebab-case strings.`;

function compactAudit(audit?: DeckAudit) {
  if (!audit) return "No Canva audit is available; prepare a conservative plan.";
  const compact = {
    title: audit.title,
    pageCount: audit.pageCount,
    dimensions: [audit.width, audit.height],
    inferredClient: audit.inferredClient,
    templateVersion: audit.templateVersion,
    expectedPageCount: audit.expectedPageCount,
    matchedContracts: audit.matchedContracts,
    unmatchedContracts: audit.unmatchedContracts,
    issues: audit.issues.slice(0, 80),
    pages: audit.pages.map((page) => ({
      number: page.number,
      contractKey: page.contractKey,
      family: page.family,
      lockedByContract: page.lockedByContract,
      background: page.background,
      texts: page.texts.slice(0, 70).map(({ text, top, left, width, height, fontRef, fontSize, color }) => ({ text, top, left, width, height, fontRef, fontSize, color })),
      images: page.images,
      elements: page.elements.slice(0, 120),
    })),
  };
  return JSON.stringify(compact).slice(0, 72_000);
}

function removeNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(removeNulls) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, removeNulls(item)])) as T;
  }
  return value;
}

function normalizePlan(parsed: z.infer<typeof PlanSchema>, source: DeckPlan["source"]): DeckPlan {
  return {
    ...parsed,
    source,
    operations: parsed.operations.map((item) => removeNulls(item) as DeckPlan["operations"][number]),
  };
}

async function planWithClaude(instruction: string, audit?: DeckAudit) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.claude_api_key;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 8_000,
    system: plannerSystemPrompt,
    messages: [
      {
        role: "user",
        content: `Instruction:\n${instruction}\n\nCurrent deck audit:\n${compactAudit(audit)}`,
      },
    ],
    output_config: { format: anthropicZodOutputFormat(PlanSchema) },
  });

  return response.parsed_output ? normalizePlan(response.parsed_output, "claude") : null;
}

async function planWithOpenAI(instruction: string, audit?: DeckAudit) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: plannerSystemPrompt },
      {
        role: "user",
        content: `Instruction:\n${instruction}\n\nCurrent deck audit:\n${compactAudit(audit)}`,
      },
    ],
    text: { format: zodTextFormat(PlanSchema, "onnivation_deck_plan") },
  });

  return response.output_parsed ? normalizePlan(response.output_parsed, "openai") : null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { instruction?: string; audit?: DeckAudit };
  const instruction = body.instruction?.trim();
  if (!instruction) return jsonResponse(request, { error: "An instruction is required." }, { status: 400 });

  const fallback = createFallbackPlan(instruction, body.audit);
  const canvaIdentity = await verifyCanvaRequest(request);
  if (!canvaIdentity) {
    return jsonResponse(request, {
      ...fallback,
      plannerWarning: "AI planning is locked until this request is verified by the installed Canva app.",
    });
  }

  const warnings: string[] = [];
  try {
    const claudePlan = await planWithClaude(instruction, body.audit);
    if (claudePlan) return jsonResponse(request, guardPlan(await resolvePlanAssets(claudePlan), body.audit));
  } catch (error) {
    warnings.push(`Claude: ${error instanceof Error ? error.message : "planner unavailable"}`);
  }

  try {
    const openAIPlan = await planWithOpenAI(instruction, body.audit);
    if (openAIPlan) return jsonResponse(request, guardPlan(await resolvePlanAssets(openAIPlan), body.audit));
  } catch (error) {
    warnings.push(`OpenAI: ${error instanceof Error ? error.message : "planner unavailable"}`);
  }

  const resolvedFallback = guardPlan(await resolvePlanAssets(fallback), body.audit);
  return jsonResponse(request, warnings.length ? { ...resolvedFallback, plannerWarning: warnings.join(" · ") } : resolvedFallback);
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

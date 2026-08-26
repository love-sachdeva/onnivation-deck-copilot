import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat as anthropicZodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { createFallbackPlan } from "../../../lib/fallback-planner";
import { corsHeaders, jsonResponse, verifyCanvaRequest } from "../../../lib/canva-auth";
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
] as const;

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
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).nullable(),
    }),
  ),
});

const plannerSystemPrompt = `You plan precise edits for Onnivation executive Canva decks. Treat the supplied deck audit as evidence. Preserve editable elements, typography, hierarchy and the three-part header/body/footer component model. Use these exact tokens: standard background #FCF5ED, card #FFFAF9, border #E1DCCC, forest #205047, cover navy #0B196B, ink #0F2442 and gold #E0B44C. Never flatten a slide. Never guess a current job title, company fact, logo source or credential. When facts or assets need current external verification, set requiresResearch to true, describe the verification needed in researchNotes, leave sources empty unless an authoritative URL was supplied in the instruction, and mark the affected operation for review. Mark geometry-preserving text replacements and exact token corrections safe. Mark layouts, identities, externally researched facts, icons, logos and new pages review. Convert the user's request into executable operations. Prefer atomic replace_text operations for known copy. For replace_text and update_client, include exact find and replacement strings when supported by the audit. For an official logo replacement, use replace_image, one target page only, and set params sourceUrl, mimeType, title, targetLeft and targetTop using the existing image coordinates from the audit; only do this when a direct official HTTPS image URL is supplied or verified. Use null for unavailable fields. All IDs must be short unique kebab-case strings.`;

function compactAudit(audit?: DeckAudit) {
  if (!audit) return "No Canva audit is available; prepare a conservative plan.";
  const compact = {
    title: audit.title,
    pageCount: audit.pageCount,
    dimensions: [audit.width, audit.height],
    inferredClient: audit.inferredClient,
    issues: audit.issues.slice(0, 80),
    pages: audit.pages.map((page) => ({
      number: page.number,
      background: page.background,
      texts: page.texts.slice(0, 70).map(({ text, top, left, width, height }) => ({ text, top, left, width, height })),
      images: page.images,
    })),
  };
  return JSON.stringify(compact).slice(0, 48_000);
}

function normalizePlan(parsed: z.infer<typeof PlanSchema>, source: DeckPlan["source"]): DeckPlan {
  return {
    ...parsed,
    source,
    operations: parsed.operations.map((item) => ({
      ...item,
      find: item.find || undefined,
      replace: item.replace || undefined,
      params: item.params || undefined,
    })),
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
    if (claudePlan) return jsonResponse(request, claudePlan);
  } catch (error) {
    warnings.push(`Claude: ${error instanceof Error ? error.message : "planner unavailable"}`);
  }

  try {
    const openAIPlan = await planWithOpenAI(instruction, body.audit);
    if (openAIPlan) return jsonResponse(request, openAIPlan);
  } catch (error) {
    warnings.push(`OpenAI: ${error instanceof Error ? error.message : "planner unavailable"}`);
  }

  return jsonResponse(request, warnings.length ? { ...fallback, plannerWarning: warnings.join(" · ") } : fallback);
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

import { corsHeaders, jsonResponse } from "../../../lib/canva-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const claudeConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.claude_api_key);
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);
  const canvaAuthConfigured = Boolean(process.env.CANVA_APP_ID && process.env.CANVA_APP_ORIGIN);
  const planner = claudeConfigured ? "claude" : openAIConfigured ? "openai" : "local";

  return jsonResponse(request, {
    claudeConfigured,
    openAIConfigured,
    canvaAuthConfigured,
    aiReady: canvaAuthConfigured && (claudeConfigured || openAIConfigured),
    planner,
    model:
      planner === "claude"
        ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5"
        : planner === "openai"
          ? process.env.OPENAI_MODEL || "gpt-5.5"
          : "deterministic-local",
  });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

import {
  Alert,
  Button,
  Checkbox,
  FormField,
  MultilineInput,
  Rows,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { auth } from "@canva/user";
import { useEffect, useMemo, useState } from "react";

import { applyPlanToCanva, scanCanvaDeck } from "../../lib/canva-engine";
import type { ApplyResult, DeckAudit, DeckPlan } from "../../lib/deck-types";

const BACKEND = "https://onnivation-deck-copilot.vercel.app";
const DEFAULT_INSTRUCTION =
  "Run a full QA pass. Keep the design editable and preserve the canonical design system.";

type Phase = "scanning" | "ready" | "planning" | "applying" | "done" | "error";

export const App = () => {
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [audit, setAudit] = useState<DeckAudit>();
  const [plan, setPlan] = useState<DeckPlan>();
  const [result, setResult] = useState<ApplyResult>();
  const [error, setError] = useState<string>();
  const [approved, setApproved] = useState(false);

  const executableCount = useMemo(
    () => plan?.operations.filter((item) => item.enabled && item.status === "executable").length || 0,
    [plan],
  );

  const scan = async () => {
    setError(undefined);
    try {
      const nextAudit = await scanCanvaDeck();
      setAudit(nextAudit);
      setPhase("ready");
    } catch (scanError) {
      setPhase("error");
      setError(scanError instanceof Error ? scanError.message : "Could not scan this design.");
    }
  };

  useEffect(() => {
    let active = true;
    void scanCanvaDeck()
      .then((nextAudit) => {
        if (!active) return;
        setAudit(nextAudit);
        setPhase("ready");
      })
      .catch((scanError: unknown) => {
        if (!active) return;
        setPhase("error");
        setError(scanError instanceof Error ? scanError.message : "Could not scan this design.");
      });
    return () => {
      active = false;
    };
  }, []);

  const preparePlan = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || !audit) return;
    setPhase("planning");
    setError(undefined);
    setResult(undefined);
    setApproved(false);
    try {
      const token = await auth.getCanvaUserToken();
      const response = await fetch(`${BACKEND}/api/plan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ instruction: trimmed, audit }),
      });
      const payload = (await response.json()) as DeckPlan & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The plan could not be prepared.");
      setPlan(payload);
      setPhase("ready");
    } catch (planError) {
      setPhase("error");
      setError(planError instanceof Error ? planError.message : "The plan could not be prepared.");
    }
  };

  const apply = async () => {
    if (!plan || !approved || !plan.operations.some((item) => item.enabled && item.status === "executable")) return;
    setPhase("applying");
    setError(undefined);
    try {
      const nextResult = await applyPlanToCanva(plan.operations);
      setResult(nextResult);
      if (nextResult.failures.length) {
        setPhase("error");
        setError(nextResult.failures.join(" · "));
        return;
      }
      const nextAudit = await scanCanvaDeck();
      setAudit(nextAudit);
      setPhase("done");
    } catch (applyError) {
      setPhase("error");
      setError(applyError instanceof Error ? applyError.message : "Canva could not apply the plan.");
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <Rows spacing="3u">
        <Rows spacing="1u">
          <Title>Onnivation Deck Copilot</Title>
          <Text>
            {audit
              ? `${audit.title} · ${audit.pageCount} slides · ${audit.matchedContracts}/${audit.expectedPageCount} contracts · ${audit.issues.length} QA findings`
              : "Scanning the active Canva design…"}
          </Text>
        </Rows>

        {error && <Alert tone="critical">{error}</Alert>}
        {result && (
          <Alert tone="positive">
            Updated {result.changedElements} element(s) across {result.changedPages.length} slide(s).
            {result.skipped.length ? ` ${result.skipped.length} gated item(s) were not written.` : ""}
          </Alert>
        )}
        {plan?.plannerWarning && <Alert tone="warn">{plan.plannerWarning}</Alert>}

        <FormField
          label="Instruction"
          value={instruction}
          control={(props) => (
            <MultilineInput
              {...props}
              autoGrow
              maxRows={7}
              onChange={setInstruction}
              placeholder="For example: Map this Nike deck for Henkel and preserve the design system."
            />
          )}
        />

        <Button
          variant="primary"
          stretch
          loading={phase === "planning"}
          disabled={!audit || phase === "scanning" || phase === "applying"}
          onClick={preparePlan}
        >
          Prepare change plan
        </Button>

        {plan && (
          <Rows spacing="2u">
            <Rows spacing="1u">
              <Title size="small">{plan.summary}</Title>
              <Text>
                {plan.source === "claude"
                  ? "Planned with Claude"
                  : plan.source === "openai"
                    ? "Planned with OpenAI"
                    : "Planned with local safety rules"}
              </Text>
            </Rows>
            {plan.operations.map((operation) => (
              <Alert key={operation.id} tone={operation.status === "executable" ? operation.risk === "safe" ? "positive" : "info" : "warn"}>
                {operation.title} · {operation.status === "executable" ? "exact target resolved" : "needs exact input"}
                {operation.pages.length ? ` · slides ${operation.pages.join(", ")}` : ""}
                {` — ${operation.detail}`}
                {operation.blockedReason ? ` ${operation.blockedReason}` : ""}
                {operation.asset && (
                  <div style={{ marginTop: 8 }}>
                    {/* Canva's sandboxed app bundle cannot use next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={operation.asset.sourceUrl} alt={operation.asset.title} style={{ display: "block", maxWidth: 160, maxHeight: 72, objectFit: "contain", background: "white", padding: 8 }} />
                    <Text>{operation.asset.title} · review before approval</Text>
                  </div>
                )}
              </Alert>
            ))}
            <Checkbox
              checked={approved}
              onChange={(_, checked) => setApproved(checked)}
              label="I reviewed the exact slide and element targets"
              description="The app will preflight every match again before writing to Canva."
            />
            <Button
              variant="primary"
              stretch
              loading={phase === "applying"}
              disabled={!executableCount || !approved || phase === "applying"}
              onClick={apply}
            >
              Apply approved changes
            </Button>
          </Rows>
        )}

        <Button
          variant="secondary"
          stretch
          disabled={phase === "scanning" || phase === "applying"}
          onClick={() => {
            setPhase("scanning");
            void scan();
          }}
        >
          Re-scan deck
        </Button>
      </Rows>
    </div>
  );
};

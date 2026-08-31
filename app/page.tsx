"use client";

import { useEffect, useMemo, useState } from "react";

import { applyPlanToCanva, canUseCanva, scanCanvaDeck } from "../lib/canva-engine";
import type { ApplyResult, DeckAudit, DeckPlan, PlanOperation } from "../lib/deck-types";

type AppStatus = "checking" | "preview" | "scanning" | "ready" | "planning" | "applying" | "success" | "error";
type PlannerStatus = {
  claudeConfigured: boolean;
  openAIConfigured: boolean;
  canvaAuthConfigured: boolean;
  aiReady: boolean;
  planner: "claude" | "openai" | "local";
  model: string;
};

const seedInstruction =
  "Tailor this deck for Nike. Keep every header, footer, margin and background consistent. Update the focus sessions for retail and consumer AI.";

const starterChanges: PlanOperation[] = [
  { id: "starter-rails", type: "normalize_headers", pages: [], title: "Normalize headers and footers", detail: "Use the canonical grid, route lockup and Onnivation footer.", risk: "safe", enabled: true },
  { id: "starter-priorities", type: "update_priorities", pages: [2], title: "Remap priorities and icons", detail: "Keep one- and two-line headings aligned to the same baseline.", risk: "review", enabled: true },
  { id: "starter-people", type: "update_people", pages: [5, 6, 7, 8], title: "Tailor master profiles", detail: "Refresh credentials and company-specific value statements.", risk: "review", enabled: true },
  { id: "starter-focus", type: "update_focus_sessions", pages: [11, 12, 13, 14], title: "Rebuild focus-session grid", detail: "Match the correct 1, 2, 3 or 4-company layout and normalize fills.", risk: "review", enabled: true },
];

function StatusDot({ tone }: { tone: "green" | "gold" | "muted" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

function pageLabel(pages: number[], pageCount: number) {
  if (!pages.length) return "LAYOUT";
  if (pages.length === pageCount) return `01–${String(pageCount).padStart(2, "0")}`;
  if (pages.length === 1) return String(pages[0]).padStart(2, "0");
  const sorted = [...pages].sort((a, b) => a - b);
  const contiguous = sorted.every((page, index) => index === 0 || page === sorted[index - 1] + 1);
  return contiguous
    ? `${String(sorted[0]).padStart(2, "0")}–${String(sorted.at(-1)).padStart(2, "0")}`
    : sorted.slice(0, 3).map((page) => String(page).padStart(2, "0")).join(", ");
}

function statusCopy(status: AppStatus, connected: boolean) {
  if (status === "checking") return "Checking Canva";
  if (status === "scanning") return "Scanning every slide";
  if (status === "planning") return "Preparing plan";
  if (status === "applying") return "Updating Canva";
  if (status === "success") return "Canva updated";
  if (status === "error") return "Needs attention";
  return connected ? "Canva connected" : "Preview mode";
}

function plannerLabel(source?: DeckPlan["source"] | PlannerStatus["planner"]) {
  if (source === "claude") return "Claude planned";
  if (source === "openai") return "OpenAI planned";
  return "Local planning";
}

export default function Home() {
  const [instruction, setInstruction] = useState(seedInstruction);
  const [submittedInstruction, setSubmittedInstruction] = useState(seedInstruction);
  const [connected, setConnected] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [activeTab, setActiveTab] = useState<"plan" | "qa">("plan");
  const [status, setStatus] = useState<AppStatus>("checking");
  const [audit, setAudit] = useState<DeckAudit | null>(null);
  const [plan, setPlan] = useState<DeckPlan | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewApplied, setPreviewApplied] = useState(false);
  const [plannerStatus, setPlannerStatus] = useState<PlannerStatus>({
    claudeConfigured: false,
    openAIConfigured: false,
    canvaAuthConfigured: false,
    aiReady: false,
    planner: "local",
    model: "deterministic-local",
  });

  const pageCount = audit?.pageCount || 33;
  const operations = plan?.operations || starterChanges;
  const enabledOperations = operations.filter((item) => item.enabled);
  const changedSlides = useMemo(
    () => new Set(enabledOperations.flatMap((item) => item.pages)).size || pageCount,
    [enabledOperations, pageCount],
  );
  const previewClient = useMemo(() => {
    if (audit?.inferredClient) return audit.inferredClient;
    const match = submittedInstruction.match(/\bfor\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,2})/);
    return match?.[1]?.replace(/[.,;:]$/, "") || "Nike";
  }, [audit?.inferredClient, submittedInstruction]);

  async function scan() {
    setStatus("scanning");
    setNotice(null);
    try {
      const nextAudit = await scanCanvaDeck();
      setAudit(nextAudit);
      setConnected(true);
      setStatus("ready");
    } catch (error) {
      setConnected(false);
      setStatus("preview");
      setNotice(error instanceof Error ? "Open this app from the Canva editor to scan and update a live deck." : "Canva is not available in this view.");
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/status")
      .then((response) => response.ok ? response.json() as Promise<PlannerStatus> : null)
      .then((nextStatus) => {
        if (active && nextStatus) setPlannerStatus(nextStatus);
      })
      .catch(() => undefined);
    void canUseCanva().then((available) => {
      if (!active) return;
      if (available) void scan();
      else {
        setConnected(false);
        setStatus("preview");
      }
    });
    return () => { active = false; };
  }, []);

  async function preparePlan() {
    const trimmed = instruction.trim();
    if (!trimmed || status === "planning") return;
    setSubmittedInstruction(trimmed);
    setStatus("planning");
    setNotice(null);
    setResult(null);
    setPreviewApplied(false);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (connected) {
        try {
          const { auth } = await import("@canva/user");
          headers.Authorization = `Bearer ${await auth.getCanvaUserToken()}`;
        } catch {
          // The backend will safely use the local planner when Canva auth is unavailable.
        }
      }
      const response = await fetch("/api/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({ instruction: trimmed, audit }),
      });
      if (!response.ok) throw new Error("The change plan could not be prepared.");
      const nextPlan = (await response.json()) as DeckPlan;
      setPlan(nextPlan);
      if (nextPlan.plannerWarning) setNotice(nextPlan.plannerWarning);
      setActiveTab("plan");
      setStatus(connected ? "ready" : "preview");
      if (autoApply && connected) {
        const safeOperations = nextPlan.operations.map((item) => ({ ...item, enabled: item.enabled && item.risk === "safe" }));
        await apply(safeOperations);
      }
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "The plan could not be prepared.");
    }
  }

  async function apply(override?: PlanOperation[]) {
    const selected = override || plan?.operations || [];
    if (!connected) {
      if (!selected.some((item) => item.enabled)) return;
      setPreviewApplied(true);
      setStatus("preview");
      setNotice("Simulation updated. No Canva file was changed; launch this app inside Canva for a live scan and real apply.");
      return;
    }
    if (!selected.some((item) => item.enabled)) return;
    setStatus("applying");
    setNotice(null);
    try {
      const nextResult = await applyPlanToCanva(selected);
      setResult(nextResult);
      setStatus("success");
      await scan();
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Canva could not apply the plan.");
    }
  }

  function toggleOperation(id: string) {
    setPlan((current) => current ? {
      ...current,
      operations: current.operations.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item),
    } : current);
  }

  function exportPlan() {
    const payload = JSON.stringify({ instruction: submittedInstruction, audit, plan }, null, 2);
    const href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "onnivation-deck-plan.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const qaRows = audit
    ? [
        ["Grid & margins", audit.issues.filter((item) => item.code.includes("rail")).length, "Canonical rails and 1 px tolerance"],
        ["Headers & arrows", audit.issues.filter((item) => item.code.includes("header") || item.code.includes("arrow")).length, "Actual label bounds determine every midpoint"],
        ["Footers", audit.issues.filter((item) => item.code.includes("footer")).length, "Editable footer required on every applicable slide"],
        ["Backgrounds", audit.issues.filter((item) => item.code.includes("background")).length, "Exact approved tokens"],
        ["Text safety", audit.issues.filter((item) => item.code.includes("overflow") || item.code.includes("separator")).length, "No duplicate separators or likely overflow"],
      ] as const
    : [
        ["Grid & margins", 0, "0.5–1 px tolerance"],
        ["Headers & footers", 0, "Every applicable slide"],
        ["Typography", 0, "Size, spacing and hierarchy"],
        ["Colors", 0, "Exact design tokens"],
        ["Assets", 0, "Official logos · solid icons"],
      ] as const;

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Deck copilot navigation">
        <div className="brand-mark" aria-label="Onnivation">O</div>
        <nav className="rail-nav">
          <button className="rail-button is-active" aria-label="Copilot" title="Copilot">✦</button>
          <button className="rail-button" aria-label="Slide templates" title="Slide templates">▤</button>
          <button className="rail-button" aria-label="Quality rules" title="Quality rules" onClick={() => setActiveTab("qa")}>✓</button>
        </nav>
        <a className="rail-button rail-help" href="/setup" aria-label="Help" title="Open setup guidance">?</a>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Onnivation</p><h1>Deck Copilot</h1></div>
          <div className="service-status">
            <span className={`service-pill ${connected && plannerStatus.aiReady ? "is-connected" : ""}`} title={plannerStatus.claudeConfigured ? `${plannerStatus.model} is secured behind Canva user verification` : "Add ANTHROPIC_API_KEY server-side to connect Claude"}>
              <StatusDot tone={connected && plannerStatus.aiReady ? "green" : plannerStatus.claudeConfigured ? "gold" : "muted"} />
              Claude {connected && plannerStatus.aiReady ? "connected" : plannerStatus.claudeConfigured ? "ready in Canva" : "not configured"}
            </span>
            <button className={`connection-pill ${connected ? "is-connected" : ""}`} onClick={() => void scan()} title="Scan active Canva deck">
              <StatusDot tone={status === "error" ? "muted" : connected ? "green" : "gold"} />
              {statusCopy(status, connected)}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="chat-column" aria-label="Instruction chat">
            <div className="deck-card">
              <div className="deck-thumb" aria-hidden="true"><span>{audit?.inferredClient?.toUpperCase().slice(0, 12) || "NIKE"}</span><i /></div>
              <div className="deck-meta">
                <div className="deck-title-row"><strong>{audit?.title || "US Trip — Nike"}</strong><span>{pageCount} slides</span></div>
                <p>{audit ? `${audit.width} × ${audit.height}` : "1920 × 1080"} · executive presentation</p>
                <div className="scan-line">
                  <StatusDot tone={audit ? (audit.issues.length ? "gold" : "green") : "green"} />
                  {audit ? `${audit.issues.length} QA finding${audit.issues.length === 1 ? "" : "s"}` : "Design system mapped"}
                  <span>{audit ? "live scan" : "10 slide families"}</span>
                </div>
              </div>
            </div>

            <section className={`preview-stage ${previewApplied ? "is-simulated" : ""}`} aria-label="Deck preview">
              <div className="preview-toolbar">
                <div>
                  <span className="preview-kicker">{connected ? "Live Canva context" : "Standalone simulation"}</span>
                  <strong>{previewApplied ? "Planned changes shown" : "Slide preview"}</strong>
                </div>
                <span className={`preview-mode ${connected ? "is-live" : ""}`}>{connected ? "LIVE" : previewApplied ? "SIMULATED" : "PREVIEW"}</span>
              </div>
              <div className="slide-preview">
                <div className="slide-header">
                  <span>{previewApplied ? previewClient.toUpperCase() : "CLIENT"}</span>
                  <div><i /> GURUGRAM <b>→</b> SAN FRANCISCO</div>
                </div>
                <div className="slide-body">
                  <p>PRIORITY MAPPING</p>
                  <h3>{previewApplied ? `How can AI reshape the way ${previewClient} serves, sells and operates?` : "How can AI reshape the way your business serves, sells and operates?"}</h3>
                  <div className="preview-cards" aria-hidden="true">
                    <span><i>●</i> SALES &amp;<br />DISTRIBUTION</span>
                    <span><i>●</i> CUSTOMER<br />EXPERIENCE</span>
                    <span><i>●</i> OPERATING<br />MODEL</span>
                  </div>
                </div>
                <div className="slide-footer"><span>ONNIVATION</span><b>02</b></div>
                {previewApplied && <div className="preview-change-note">Margins · header · client copy · footer aligned</div>}
              </div>
              <div className="preview-thumbnails" aria-label="Representative slide families">
                {["01", "02", "05", "11"].map((slide, index) => (
                  <button className={index === 1 ? "is-active" : ""} key={slide} type="button"><span>{slide}</span><i /></button>
                ))}
                <small>+{Math.max(pageCount - 4, 0)} more</small>
              </div>
            </section>

            <div className="conversation" aria-live="polite">
              <article className="message message--assistant">
                <div className="avatar">O</div>
                <div>
                  <strong>{connected ? "The complete deck is connected." : "Ready to tailor the full deck."}</strong>
                  <p>{connected ? `I scanned ${pageCount} editable slides and will re-run QA after every approved update.` : "Prepare a plan, then preview its effect here. Real editable changes become available when this panel is launched inside Canva."}</p>
                </div>
              </article>
              <article className="message message--user"><p>{submittedInstruction}</p></article>
              <article className="message message--assistant message--compact">
                <div className="avatar">O</div>
                <div>
                  <strong>{status === "planning" ? "Preparing the change plan…" : plan ? "Plan prepared" : "Example plan ready"}</strong>
                  <p>{plan ? `${enabledOperations.length} actions · ${changedSlides} slides · ${plannerLabel(plan.source)}` : `All sections are covered by the design-system registry · ${plannerLabel(connected ? plannerStatus.planner : "local")}`}</p>
                </div>
              </article>
              {previewApplied && !connected && (
                <article className="message message--assistant result-message">
                  <div className="avatar">✓</div>
                  <div><strong>Preview refreshed</strong><p>{enabledOperations.length} approved actions are visualized across {changedSlides} planned slides. This is a simulation; your Canva deck is untouched.</p></div>
                </article>
              )}
              {result && (
                <article className="message message--assistant result-message">
                  <div className="avatar">✓</div>
                  <div><strong>Update complete</strong><p>{result.changedElements} edits across {result.changedPages.length} slides. {result.skipped.length ? `${result.skipped.length} asset/layout tasks remain in review.` : "The deck was rescanned."}</p></div>
                </article>
              )}
              {notice && <div className="notice">{notice}</div>}
            </div>

            <div className="composer-wrap">
              <textarea
                aria-label="Instruction for the deck"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void preparePlan();
                }}
                placeholder="Tell me what to change across this deck…"
              />
              <div className="composer-actions">
                <div className="prompt-chips" aria-label="Example instructions">
                  <button onClick={() => setInstruction("Run the full design consistency audit across every page.")}>Run QA</button>
                  <button onClick={() => setInstruction("Update every client reference and value line for Nike.")}>Tailor client</button>
                </div>
                <button className="send-button" aria-label="Prepare change plan" title="Prepare change plan" onClick={() => void preparePlan()} disabled={status === "planning"}>→</button>
              </div>
            </div>
            <p className="composer-note">⌘/Ctrl + Enter to prepare · Nothing is written to Canva until you approve the plan.</p>
          </section>

          <aside className="plan-panel" aria-label="Change plan">
            <div className="panel-head">
              <div><p className="eyebrow">Proposed update</p><h2>Review changes</h2></div>
              <span className="change-count">{changedSlides}</span>
            </div>

            <div className="tabs" role="tablist" aria-label="Plan and quality assurance">
              <button className={activeTab === "plan" ? "is-active" : ""} onClick={() => setActiveTab("plan")} role="tab" aria-selected={activeTab === "plan"}>Change plan</button>
              <button className={activeTab === "qa" ? "is-active" : ""} onClick={() => setActiveTab("qa")} role="tab" aria-selected={activeTab === "qa"}>QA {audit?.issues.length ? `(${audit.issues.length})` : "rules"}</button>
            </div>

            {activeTab === "plan" ? (
              <div className="change-list">
                {operations.map((change) => (
                  <article className={`change-card ${!change.enabled ? "is-disabled" : ""}`} key={change.id}>
                    <div className="page-tag">{pageLabel(change.pages, pageCount)}</div>
                    <div>
                      <div className="change-title">
                        <strong>{change.title}</strong>
                        <span className={change.risk === "safe" ? "risk-safe" : "risk-review"}>{change.risk}</span>
                      </div>
                      <p>{change.detail}</p>
                      {plan && (
                        <label className="include-row">
                          <input type="checkbox" checked={change.enabled} onChange={() => toggleOperation(change.id)} /> Include in update
                        </label>
                      )}
                    </div>
                  </article>
                ))}
                {plan?.requiresResearch && (
                  <article className="research-card">
                    <strong>Research gate</strong>
                    {plan.researchNotes.map((note) => <p key={note}>{note}</p>)}
                    {plan.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title} ↗</a>)}
                  </article>
                )}
              </div>
            ) : (
              <div className="qa-list">
                {qaRows.map(([label, count, detail]) => (
                  <div className="qa-row" key={label}>
                    <span className={`qa-check ${count ? "has-issue" : ""}`}>{count || "✓"}</span>
                    <div><strong>{label}</strong><p>{count ? `${count} finding${count === 1 ? "" : "s"} · ${detail}` : detail}</p></div>
                  </div>
                ))}
                {audit?.issues.slice(0, 12).map((issue) => (
                  <div className="issue-detail" key={`${issue.page}-${issue.code}`}><b>{String(issue.page).padStart(2, "0")}</b><span>{issue.message}</span></div>
                ))}
              </div>
            )}

            <div className="approval-box">
              <label className="toggle-row">
                <span><strong>Auto-apply low-risk fixes</strong><small>Exact text and token corrections only; review items stay gated</small></span>
                <input type="checkbox" checked={autoApply} onChange={(event) => setAutoApply(event.target.checked)} />
              </label>
              <button className="apply-button" onClick={() => void apply()} disabled={!plan || status === "applying" || status === "planning"}>
                {status === "applying" ? "Applying and rechecking…" : connected ? `Apply ${changedSlides} slide updates` : previewApplied ? "Refresh simulated preview" : `Preview ${changedSlides} planned slide updates`}
              </button>
              <button className="secondary-button" onClick={exportPlan} disabled={!plan}>Export reviewed plan</button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

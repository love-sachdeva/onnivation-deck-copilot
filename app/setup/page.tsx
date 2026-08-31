import Link from "next/link";

export const metadata = {
  title: "Activate Deck Copilot",
  description: "Connect Onnivation Deck Copilot to Canva and enable AI planning.",
};

export default function SetupPage() {
  return (
    <main className="setup-shell">
      <Link className="back-link" href="/">← Back to Deck Copilot</Link>
      <section className="setup-intro">
        <p className="eyebrow">Activation guide</p>
        <h1>Connect the copilot to Canva</h1>
        <p>The standalone site now supports planning and a labeled simulation. Live editable previews require Canva to load the same app URL inside its editor.</p>
      </section>

      <section className="setup-grid">
        <article className="setup-card">
          <span className="step-number">01</span>
          <h2>Use a Canva-reachable URL</h2>
          <p>Copy the public production URL from the Vercel project dashboard and use it as the app source in Canva:</p>
          <code>https://your-project.vercel.app</code>
        </article>
        <article className="setup-card">
          <span className="step-number">02</span>
          <h2>Create the Canva team app</h2>
          <p>Create an app in the Canva Developer Portal, set the reachable URL as its app source, and install it for the team.</p>
        </article>
        <article className="setup-card">
          <span className="step-number">03</span>
          <h2>Enable design editing</h2>
          <p>Allow the app to read and update the active design, then submit the team app for administrator approval.</p>
        </article>
        <article className="setup-card">
          <span className="step-number">04</span>
          <h2>Connect Claude securely</h2>
          <p>Add <code>ANTHROPIC_API_KEY</code> as a server-side environment variable. Optionally set <code>ANTHROPIC_MODEL</code> to <code>claude-sonnet-5</code>. Never place the key in browser code or Canva.</p>
        </article>
        <article className="setup-card">
          <span className="step-number">05</span>
          <h2>Open any deck and instruct</h2>
          <p>Launch Deck Copilot from Canva Apps, enter one instruction, review the page-level plan, then apply and re-scan.</p>
        </article>
        <article className="setup-card">
          <span className="step-number">06</span>
          <h2>Verify the two green indicators</h2>
          <p>The header must show <strong>Claude connected</strong> and <strong>Canva connected</strong>. Standalone mode is always labeled as a simulation and never claims to modify the deck.</p>
        </article>
      </section>

      <section className="capability-table">
        <div><strong>Exact operations</strong><span>Text/client replacements, pixel moves and resizes, font fixes, verified media, native text/shapes, canonical page duplication and full-deck QA.</span></div>
        <div><strong>Hard approval gate</strong><span>Every write is matched to a semantic slide and element, preflighted, shown for review and re-scanned. Slides 7, 8 and 10 stay locked.</span></div>
        <div><strong>Always editable</strong><span>Changes remain native Canva objects; no page is flattened into a screenshot.</span></div>
      </section>
    </main>
  );
}

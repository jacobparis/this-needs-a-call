import { CopyableCommand } from "@/app/components/CopyableCommand";

const repositoryUrl =
  process.env.NEXT_PUBLIC_TEMPLATE_REPOSITORY_URL ??
  "https://github.com/jacobparis/this-needs-a-call";

const cloneAndLinkCommand = `git clone ${repositoryUrl}
cd this-needs-a-call
npm install
vercel link
export MCP_SHARED_SECRET="$(openssl rand -hex 32)"
vercel env add MCP_SHARED_SECRET development --value "$MCP_SHARED_SECRET" --yes --force
vercel env add MCP_SHARED_SECRET production --value "$MCP_SHARED_SECRET" --yes --force`;

const localDevCommand = `vercel env pull
vercel env run -- npm run dev:vercel`;

const localCodexInstallCommand = `vercel env run -- npm run install:codex-plugin -- \\
  --app-url http://localhost:3000`;

const hostedDeployCommand = `vercel integration add upstash/upstash-kv
DEPLOYMENT_URL="$(vercel deploy --prod --yes)"
vercel env run -e production -- npm run install:codex-plugin -- \\
  --app-url "$DEPLOYMENT_URL"`;

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-[7px] border border-[var(--line)] bg-[var(--panel)] px-3.5 text-[13px] font-bold text-[var(--ink)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

export default function Page() {
  return <LandingPage />;
}

function LandingPage() {
  const waveformBars = Array.from({ length: 20 }, (_, index) => (
    <span
      className="block h-[18px] w-0.5 justify-self-center rounded-full bg-[var(--ink)] [animation:demoWaveform_1.15s_ease-in-out_infinite] motion-reduce:[animation:none]"
      key={index}
      style={{ animationDelay: `${(index % 5) * 0.11}s` }}
    />
  ));

  const demo = (
    <div
      className="relative grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-3 pt-3.5 max-[700px]:grid-cols-1"
      aria-hidden="true"
    >
      <div className="absolute left-[49%] top-1/2 z-0 h-px w-[2%] bg-[var(--line)] max-[700px]:hidden" />
      <div className="relative z-10 grid min-h-60 min-w-0 content-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[0_16px_36px_var(--shadow)]">
        <div className="flex items-center gap-2.5 text-xs font-bold text-[var(--muted)]">
          <span>Codex thread</span>
        </div>
        <div className="grid gap-[9px]">
          <div
            className="justify-self-end rounded-lg border border-[var(--line)] bg-[var(--ink)] px-2.5 py-2.5 [font-family:var(--font-geist-mono)] text-[13px] leading-[1.35] text-[var(--bg)]"
          >
            /this-needs-a-call
          </div>
          <div className="max-w-[82%] justify-self-start rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2.5 text-[13px] leading-[1.35] text-[var(--ink)]">
            Session started. I’ll keep this thread synced from the call.
          </div>
          <div className="max-w-[82%] justify-self-start rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2.5 text-[13px] leading-[1.35] text-[var(--ink)]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-normal text-[var(--muted)]">
              scheduled
            </span>
            Poll read the transcript and found the first implementation note:
            add explicit session sharing with a browser-scoped claim.
          </div>
          <div className="max-w-[82%] justify-self-start rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2.5 text-[13px] leading-[1.35] text-[var(--ink)]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-normal text-[var(--muted)]">
              scheduled
            </span>
            Second takeaway: route completion updates back into the active voice
            call so phone sessions hear when Codex finishes work.
          </div>
          <div className="max-w-[82%] justify-self-start rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2.5 text-[13px] leading-[1.35] text-[var(--ink)]">
            I’m implementing the share flow first: signed link, QR handoff,
            HttpOnly session claim, and a visible active-device state.
          </div>
        </div>
      </div>

      <div className="relative z-10 grid min-h-60 min-w-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[0_16px_36px_var(--shadow)] [animation:demoPulse_7.8s_ease_infinite] motion-reduce:[animation:none]">
        <div className="flex items-center justify-between gap-2.5 text-xs font-bold text-[var(--muted)]">
          <span>Voice session</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16a34a] [animation:demoLive_1.6s_ease-out_infinite] motion-reduce:[animation:none]" />
            live transcript
          </span>
        </div>
        <div className="grid h-[46px] grid-cols-[repeat(20,minmax(0,1fr))] items-center gap-1 px-0.5">
          {waveformBars}
        </div>
        <div
          className="grid min-h-[118px] gap-2 border-t border-[var(--line)] pt-2.5 [font-family:var(--font-geist-mono)] text-[12px] leading-[1.45] text-[var(--ink)]"
        >
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              user
            </span>
            I want to start the call in Codex, then move it to my phone before I
            leave my desk.
          </p>
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              voice
            </span>
            Should the first browser claim the session, then expose an explicit
            share link and QR code for the phone?
          </p>
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              user
            </span>
            Yes. A random browser with the app URL should see nothing. Only the
            magic link should join this call.
          </p>
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              voice
            </span>
            Then Codex should store session grants in an HttpOnly cookie and
            keep each claimed session tabbed inside the app.
          </p>
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              user
            </span>
            Exactly. Also, when Codex finishes a change, I want to hear a short
            update in the call while I’m away from the keyboard.
          </p>
          <p className="grid grid-cols-[46px_minmax(0,1fr)] gap-2.5">
            <span className="text-[11px] font-bold uppercase text-[var(--muted)]">
              voice
            </span>
            So the feature is two-way: transcript to Codex, and concise status
            from Codex back into the active voice call.
          </p>
        </div>
      </div>
    </div>
  );

  const steps = [
    {
      label: "Clone and Link",
      detail:
        "Start from a local clone, link it to Vercel, then generate and register the MCP shared secret for development and production.",
      action: (
        <div className="grid w-full max-w-[760px] gap-3">
          <CopyableCommand command={cloneAndLinkCommand} />
        </div>
      ),
    },
    {
      label: "Run Locally",
      detail:
        "Pull the Vercel dev environment, run the app through Vercel, then install the Codex plugin with localhost as the MCP server.",
      action: (
        <div className="grid w-full max-w-[760px] gap-3">
          <CopyableCommand command={localDevCommand} />
          <CopyableCommand command={localCodexInstallCommand} />
        </div>
      ),
    },
    {
      label: "Deploy and Install",
      detail:
        "Provision Upstash Redis, deploy, capture the production URL from Vercel, and install the Codex plugin against that MCP server.",
      action: (
        <CopyableCommand
          className="w-full max-w-[760px]"
          command={hostedDeployCommand}
        />
      ),
    },
    {
      label: "Start a Call, Then Let Codex Act",
      detail:
        "Run /this-needs-a-call in a Codex thread. The scheduled poll reads settled transcript updates and lets the thread act on the conversation.",
      action: demo,
      wide: true,
    },
  ];

  return (
    <main className="grid min-h-screen gap-[46px] bg-[var(--bg)] px-[18px] text-[var(--ink)] max-[860px]:gap-[34px]">
      <nav
        className="mx-auto flex min-h-[38px] w-full max-w-[1120px] items-center justify-between text-[13px] text-[var(--muted)]"
        aria-label="Primary"
      >
        <strong className="text-[13px] text-[var(--ink)]">
          This Needs A Call
        </strong>
        <a
          className="no-underline hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          href={repositoryUrl}
        >
          Source
        </a>
      </nav>

      <section className="mx-auto grid min-h-[min(560px,calc(100vh-250px))] w-full max-w-[1120px] content-end gap-[18px] pt-[72px] max-[860px]:min-h-0 max-[860px]:pt-[52px]">
        <h1 className="m-0 max-w-[820px] text-[clamp(46px,8vw,106px)] leading-[0.94] tracking-normal max-[860px]:text-[52px] max-[860px]:leading-[0.98]">
          A voice call for your coding agent.
        </h1>
        <p className="m-0 max-w-[620px] text-lg leading-[1.55] text-[var(--muted)] max-[860px]:text-base">
          Start a call from any coding session. Talk from your desk or phone
          while the agent reads the transcript and acts in the background.
        </p>
        <div className="flex flex-wrap gap-2 pt-1.5">
          <a className={buttonClass} href="#flow">
            See the flow
          </a>
        </div>
      </section>

      <section
        className="relative mx-auto grid w-full max-w-[1120px] gap-10 max-[860px]:gap-8"
        id="flow"
        aria-label="Flow overview"
      >
        {steps.map(({ label, detail, action, wide }, index) => (
          <article
            className={`grid min-h-0 gap-3 ${
              wide ? "max-w-[1120px]" : "max-w-[760px]"
            }`}
            key={label}
          >
            <span className="text-[12px] font-bold text-[var(--muted)] tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] leading-none tracking-normal">
              {label}
            </h2>
            <div className="flex min-w-0 flex-col items-start gap-3.5">
              <p className="m-0 max-w-[620px] text-[17px] leading-normal text-[var(--muted)] max-[860px]:max-w-none max-[860px]:text-[15px]">
                {detail}
              </p>
              {action}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

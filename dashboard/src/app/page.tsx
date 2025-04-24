import Link from "next/link";

export default async function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-tui-black font-mono overflow-x-auto px-4">
      <pre
        className="tui-ascii-panel tui-cyan text-center mb-6 hidden sm:block max-w-full overflow-x-auto whitespace-pre"
        aria-hidden
      >{`
┌────────────────────────────────────────────────────────────┐
│                  NPTELPrep API Dashboard                   │
│        The ultimate API for NPTEL data. Fast. Open.        │
└────────────────────────────────────────────────────────────┘
`}</pre>

      <div className="tui-cyan text-center mb-6 block sm:hidden space-y-1">
        <h1 className="text-xl font-bold">NPTELPrep API Dashboard</h1>
        <p className="text-sm">The ultimate API for NPTEL data. Fast. Open.</p>
      </div>

      <header className="
        w-full max-w-2xl mx-auto tui-ascii-panel tui-blue
        flex flex-col sm:flex-row
        items-center justify-center sm:justify-between
        text-base mb-8 border-tui-blue border tui-border
        p-4 space-y-2 sm:space-y-0
      ">
        <span className="tui-section-title tui-cyan">
          NPTELPrep API
        </span>
        <nav className="flex gap-2">
          <Link href="/auth/login" className="tui-badge tui-blue">
            [ Sign In ]
          </Link>
          <Link href="/auth/register" className="tui-badge tui-green">
            [ Sign Up ]
          </Link>
        </nav>
      </header>
    </div>
  );
}

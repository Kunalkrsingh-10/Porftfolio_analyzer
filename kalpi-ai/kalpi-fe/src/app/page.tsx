import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="container mx-auto flex flex-col items-center justify-center gap-8 px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.35em] text-emerald-400">Kalpi AI</p>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
          Portfolio intelligence for modern investors.
        </h1>
        <p className="max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
          Analyze your holdings with deterministic risk and return metrics, then ask the AI analyst for actionable insight in natural language.
        </p>

        <Link
          href="/portfolio"
          className="inline-flex rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Open Portfolio AI
        </Link>

        {/* </div> */}
      </div>
    </main >
  );
}

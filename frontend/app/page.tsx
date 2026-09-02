// ─── Icons ───────────────────────────────────────────────────────────────────

function IconGitHub({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function IconLinkedIn({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function IconUpload({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function IconSparkles({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function IconBolt({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconCheckCircle({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconQuestion({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  );
}

function IconBug({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A23.956 23.956 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.15 2.1.718 4.11 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.921-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 01.4-2.253M12 8.25a2.25 2.25 0 00-2.248 2.146M12 8.25a2.25 2.25 0 012.248 2.146M8.683 5a6.032 6.032 0 01-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0115.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 00-.575-1.752M4.921 6a24.048 24.048 0 00-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 01-5.223 1.082" />
    </svg>
  );
}

function IconShield({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconSearch({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconShieldCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconLock({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function IconDocDown({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconActivity({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconBank({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  );
}

function IconRocket({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function IconHeart({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function IconTerminal({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 9l3 3-3 3m5 0h3M4 19h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1z" />
    </svg>
  );
}

function IconSettings({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ─── Landing Nav ─────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-1">
          <span className="text-base font-bold text-violet-400">RAG</span>
          <span className="text-base font-bold text-white">Eval</span>
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#how-it-works" className="text-sm text-neutral-400 transition-colors hover:text-white">
            How it works
          </a>
          <a href="#features" className="text-sm text-neutral-400 transition-colors hover:text-white">
            Features
          </a>
          <a href="#self-host" className="text-sm text-neutral-400 transition-colors hover:text-white">
            Self-host
          </a>
          <div className="h-4 w-px bg-white/10" />
          <a
            href="https://github.com/ritikakaushik-18/RAG_EVAL_APP"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            <IconGitHub className="h-4 w-4" />
            View on GitHub
          </a>
          <a
            href="https://github.com/ritikakaushik-18/RAG_EVAL_APP/stargazers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:border-white/40 hover:text-white"
          >
            ⭐ Star on GitHub
          </a>
        </nav>
        <a
          href="https://github.com/ritikakaushik-18/RAG_EVAL_APP"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 md:hidden"
        >
          <IconGitHub className="h-3.5 w-3.5" />
          GitHub
        </a>
      </div>
    </header>
  );
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-32 text-center">
      {/* Glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[160px]" />
        <div className="absolute right-1/4 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-emerald-600/5 blur-[120px]" />
      </div>

      {/* Badge */}
      <div className="relative mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/8 px-4 py-1.5 text-xs font-medium text-violet-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Open source RAG evaluation framework
      </div>

      {/* Headline */}
      <h1 className="relative mb-6 max-w-4xl text-5xl font-bold leading-[1.08] tracking-tight text-white md:text-7xl">
        Stop guessing which RAG
        <br />
        <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">
          strategy actually works.
        </span>
      </h1>

      {/* Subheadline */}
      <p className="relative mb-10 max-w-xl text-lg leading-relaxed text-neutral-400">
        Upload your documents. Run 5 retrieval strategies in parallel.
        Get an AI-scored leaderboard in under 10 minutes.
        Open source and self-hostable.
      </p>

      {/* CTAs */}
      <div className="relative mb-14 flex flex-col items-center gap-3 sm:flex-row">
        <a
          href="https://github.com/ritikakaushik-18/RAG_EVAL_APP"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-colors hover:bg-violet-500"
        >
          <IconGitHub className="h-4 w-4" />
          View on GitHub →
        </a>
        <a
          href="https://github.com/ritikakaushik-18/RAG_EVAL_APP/stargazers"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-white/10 px-7 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
        >
          ⭐ Star this project
        </a>
      </div>

      {/* Trust signals */}
      <div className="relative flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">⚡ 9 seconds per evaluation</span>
        <span className="hidden h-3 w-px bg-white/10 sm:block" />
        <span className="flex items-center gap-1.5">💰 $0.002 average cost</span>
        <span className="hidden h-3 w-px bg-white/10 sm:block" />
        <span className="flex items-center gap-1.5">🔒 PII scrubbing built in</span>
        <span className="hidden h-3 w-px bg-white/10 sm:block" />
        <span className="flex items-center gap-1.5">⭐ Open source on GitHub</span>
      </div>
    </section>
  );
}

// ─── Section 2: Problem ──────────────────────────────────────────────────────

function Problem() {
  const cards = [
    {
      icon: <IconQuestion className="h-5 w-5" />,
      iconBg: "bg-violet-500/12 text-violet-400",
      title: "Which strategy should I use?",
      body: "Naive RAG? Hybrid search? Reranking? HyDE? Every team guesses and hopes. Nobody measures.",
    },
    {
      icon: <IconBug className="h-5 w-5" />,
      iconBg: "bg-amber-500/12 text-amber-400",
      title: "Why is my RAG failing?",
      body: "Your system scores 68% but you have no idea if it's the chunking, the embeddings, or the model. Debugging takes weeks.",
    },
    {
      icon: <IconShield className="h-5 w-5" />,
      iconBg: "bg-emerald-500/12 text-emerald-400",
      title: "How do I prove it works?",
      body: "Regulators and stakeholders want evidence. You have vibes. That gap costs contracts.",
    },
  ];

  return (
    <section className="px-6 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/8 bg-[#12121a] p-7 transition-colors hover:border-white/12"
            >
              <div className={`mb-5 inline-flex rounded-xl p-2.5 ${c.iconBg}`}>
                {c.icon}
              </div>
              <h3 className="mb-2.5 text-base font-semibold text-white">{c.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 3: How It Works ─────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      icon: <IconUpload className="h-5 w-5" />,
      title: "Upload your documents",
      body: "PDF or any text document. Stored securely. Chunked and embedded automatically.",
    },
    {
      icon: <IconSparkles className="h-5 w-5" />,
      title: "Auto-generate test questions",
      body: "AI reads your documents and creates realistic Q&A pairs automatically. PII scrubbed before storage.",
    },
    {
      icon: <IconBolt className="h-5 w-5" />,
      title: "5 strategies run in parallel",
      body: "LangGraph agents benchmark Naive RAG, Hybrid BM25, Cohere Rerank, HyDE, and Parent-Child simultaneously.",
    },
    {
      icon: <IconCheckCircle className="h-5 w-5" />,
      title: "Know exactly what to deploy",
      body: "AI judge scores each strategy. Failure attribution tells you why the others lost.",
    },
  ];

  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
            How it works
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            From document to decision in 4 steps
          </h2>
        </div>

        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
          <div className="pointer-events-none absolute left-0 right-0 top-[15px] hidden h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent lg:block" />

          {steps.map((step, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#12121a] text-sm font-bold text-violet-400 ring-1 ring-violet-500/40">
                {i + 1}
              </div>
              <div className="inline-flex w-fit rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                {step.icon}
              </div>
              <h3 className="font-semibold text-white">{step.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 4: Self-Host in Minutes ─────────────────────────────────────────

function SelfHost() {
  const steps = [
    {
      icon: <IconTerminal className="h-5 w-5" />,
      title: "Clone the repo",
      code: `git clone https://github.com/\nritikakaushik-18/RAG_EVAL_APP\ncd rag-eval-framework`,
    },
    {
      icon: <IconSettings className="h-5 w-5" />,
      title: "Add your API keys",
      code: `cp .env.example .env\n# Add your keys:\n# OpenRouter, Cohere, AWS S3\n# Neon PostgreSQL`,
    },
    {
      icon: <IconRocket className="h-5 w-5" />,
      title: "Run it",
      code: `pip install -r requirements.txt\nuvicorn backend.main:app\ncd frontend && npm run dev`,
    },
  ];

  return (
    <section id="self-host" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
            Self-hosting
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Self-host in minutes
          </h2>
        </div>
        <p className="mb-14 mx-auto max-w-xl text-center text-neutral-400">
          Clone the repo and run locally in under 5 minutes. No vendor
          lock-in. Your data stays yours.
        </p>

        <div className="grid gap-6 lg:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-[#12121a] p-7 transition-colors hover:border-white/12"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/10 text-sm font-bold text-violet-400 ring-1 ring-violet-500/40">
                  {i + 1}
                </div>
                <div className="inline-flex rounded-xl bg-violet-500/10 p-2 text-violet-400">
                  {step.icon}
                </div>
              </div>
              <h3 className="font-semibold text-white">{step.title}</h3>
              <pre className="rounded-lg bg-[#0d0d15] border border-white/8 p-4 font-mono text-xs leading-relaxed text-neutral-300 whitespace-pre-wrap break-all">
                {step.code}
              </pre>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-neutral-500">
          <a
            href="https://github.com/ritikakaushik-18/RAG_EVAL_APP#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 transition-colors hover:text-violet-300"
          >
            Full setup guide in the README →
          </a>
        </p>
      </div>
    </section>
  );
}

// ─── Section 5: Strategies ───────────────────────────────────────────────────

function Strategies() {
  const strategies = [
    {
      badge: "Baseline",
      badgeCls: "bg-neutral-700/60 text-neutral-300",
      title: "Naive RAG",
      desc: "Pure vector similarity search. Fast, simple, often not enough.",
      wins: "Short focused documents",
    },
    {
      badge: "Most Popular",
      badgeCls: "bg-violet-500/15 text-violet-300",
      title: "Hybrid BM25 + Vector",
      desc: "Combines keyword and semantic search using Reciprocal Rank Fusion.",
      wins: "Technical docs with specific terms",
    },
    {
      badge: "Most Accurate",
      badgeCls: "bg-emerald-500/15 text-emerald-300",
      title: "Cohere Rerank",
      desc: "Cross-encoder re-scores 20 candidates by true relevance.",
      wins: "Long policy documents",
    },
    {
      badge: "Most Innovative",
      badgeCls: "bg-amber-500/15 text-amber-300",
      title: "HyDE",
      desc: "Generates a hypothetical answer first, then searches with that embedding.",
      wins: "Questions worded differently than docs",
    },
    {
      badge: "Best Context",
      badgeCls: "bg-sky-500/15 text-sky-300",
      title: "Parent-Child",
      desc: "Matches small chunks but returns surrounding context for richer answers.",
      wins: "Multi-paragraph answers",
    },
  ];

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
            5 strategies
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            5 strategies. One winner. No guessing.
          </h2>
        </div>
        <p className="mb-14 text-center text-neutral-400">
          Most teams pick one and hope. We test all five in 9 seconds.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          {strategies.map((s, i) => (
            <div
              key={i}
              className="flex w-full flex-col gap-3 rounded-2xl border border-white/8 bg-[#12121a] p-6 transition-colors hover:border-white/12 sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"
            >
              <div>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.badgeCls}`}>
                  {s.badge}
                </span>
              </div>
              <h3 className="text-base font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{s.desc}</p>
              <div className="mt-auto border-t border-white/5 pt-3">
                <span className="text-xs text-neutral-600">When it wins: </span>
                <span className="text-xs text-neutral-400">{s.wins}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 6: Use Cases ────────────────────────────────────────────────────

function UseCases() {
  const readmeLink = "https://github.com/ritikakaushik-18/RAG_EVAL_APP";

  return (
    <section id="use-cases" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
            Use cases
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Who this is built for
          </h2>
        </div>
        <p className="mb-14 mx-auto max-w-xl text-center text-neutral-400">
          Any team shipping RAG in production faces the same problem. Here is how
          different industries use RAG Eval.
        </p>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Card 1 — Finance */}
          <div className="flex flex-col rounded-2xl border border-white/8 bg-[#12121a] p-7 transition-colors hover:border-white/12">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
                <IconBank className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/8 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                Example use case
              </span>
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Financial Institution
            </p>
            <h3 className="mb-4 text-lg font-semibold text-white">OSFI-compliant RAG evaluation</h3>
            <p className="mb-5 text-sm leading-relaxed text-neutral-400">
              A Canadian bank building an internal policy assistant for compliance
              documents needs to prove systematic evaluation to regulators before
              going live.
            </p>
            <ul className="mb-6 space-y-2">
              {[
                "Auto-generates test questions from policy docs",
                "PII scrubbed before any cloud processing",
                "5-strategy benchmark across full corpus",
                "One-click audit ZIP for OSFI review",
                "CI/CD gate prevents quality regressions",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="mt-0.5 flex-shrink-0 text-emerald-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <a
                href={readmeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-400 transition-colors hover:text-violet-300"
              >
                → See implementation in the README
              </a>
            </div>
          </div>

          {/* Card 2 — Developer Tools */}
          <div className="flex flex-col rounded-2xl border border-white/8 bg-[#12121a] p-7 transition-colors hover:border-white/12">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                <IconRocket className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/8 px-2.5 py-0.5 text-xs font-medium text-violet-400">
                Example use case
              </span>
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
              AI-Native Startup
            </p>
            <h3 className="mb-4 text-lg font-semibold text-white">Shipping RAG without breaking production</h3>
            <p className="mb-5 text-sm leading-relaxed text-neutral-400">
              A developer tools company building an AI assistant over their
              documentation needs to pick the right retrieval strategy before
              launch and protect quality after.
            </p>
            <ul className="mb-6 space-y-2">
              {[
                "Benchmarks all 5 strategies in one run",
                "Failure attribution shows exactly why Naive RAG misses technical terminology",
                "Baseline locked after first evaluation",
                "GitHub Action blocks regressions on every PR",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="mt-0.5 flex-shrink-0 text-emerald-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <a
                href={readmeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-400 transition-colors hover:text-violet-300"
              >
                → See implementation in the README
              </a>
            </div>
          </div>

          {/* Card 3 — Healthcare */}
          <div className="flex flex-col rounded-2xl border border-white/8 bg-[#12121a] p-7 transition-colors hover:border-white/12">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                <IconHeart className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                Example use case
              </span>
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Healthcare Platform
            </p>
            <h3 className="mb-4 text-lg font-semibold text-white">Patient-safe RAG with full audit trail</h3>
            <p className="mb-5 text-sm leading-relaxed text-neutral-400">
              A healthcare platform building clinical decision support needs
              evaluation that never exposes patient data and produces evidence
              for clinical governance review.
            </p>
            <ul className="mb-6 space-y-2">
              {[
                "Self-hostable — runs entirely on your servers",
                "Zero data leaves your network",
                "Presidio PII scrubbing on all test questions",
                "Full audit export for clinical governance",
                "Batch evaluation across hundreds of questions",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="mt-0.5 flex-shrink-0 text-emerald-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <a
                href={readmeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-400 transition-colors hover:text-violet-300"
              >
                → See implementation in the README
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 7: Features ─────────────────────────────────────────────────────

function Features() {
  const tiles = [
    {
      icon: <IconSearch className="h-4 w-4" />,
      title: "Failure Attribution",
      desc: "Pinpoints exactly why each strategy failed — embedding weakness, retrieval logic, or generation layer.",
    },
    {
      icon: <IconShieldCheck className="h-4 w-4" />,
      title: "CI/CD Regression Gates",
      desc: "GitHub Action blocks merges when RAG quality drops below your baseline. Never ship a silent regression.",
    },
    {
      icon: <IconSparkles className="h-4 w-4" />,
      title: "Synthetic Test Generator",
      desc: "Auto-generates realistic Q&A pairs from your documents. No manual labeling required.",
    },
    {
      icon: <IconLock className="h-4 w-4" />,
      title: "PII Scrubbing",
      desc: "Microsoft Presidio automatically detects and removes names, emails, and sensitive data before processing.",
    },
    {
      icon: <IconDocDown className="h-4 w-4" />,
      title: "Audit Export",
      desc: "One-click ZIP with questions.csv, scrub_report.json, and a PDF summary formatted for regulatory review.",
    },
    {
      icon: <IconActivity className="h-4 w-4" />,
      title: "LangSmith Tracing",
      desc: "Every parallel agent run fully traced. See cost, latency, and token usage per strategy in real time.",
    },
  ];

  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
            Features
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Everything you need. Nothing you don&apos;t.
          </h2>
        </div>
        <p className="mb-14 text-center text-neutral-400">
          Built for production teams — not for demos.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/8 bg-[#12121a] p-6 transition-colors hover:border-white/12"
            >
              <div className="mb-4 inline-flex rounded-lg bg-violet-500/10 p-2 text-violet-400">
                {t.icon}
              </div>
              <h3 className="mb-2 text-sm font-semibold text-white">{t.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-500">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 8: Tech Stack ───────────────────────────────────────────────────

function TechStack() {
  const stack = [
    "FastAPI", "PostgreSQL + pgvector", "LangGraph",
    "LangSmith", "Cohere", "HuggingFace",
    "AWS S3", "Next.js", "Microsoft Presidio",
  ];

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-400">
          Tech stack
        </p>
        <h2 className="mb-12 text-3xl font-bold text-white md:text-4xl">
          Built on the stack you already trust
        </h2>

        <div className="mb-12 flex flex-wrap justify-center gap-2.5">
          {stack.map((tech) => (
            <span
              key={tech}
              className="rounded-lg border border-white/8 bg-[#12121a] px-3.5 py-1.5 text-sm text-neutral-300"
            >
              {tech}
            </span>
          ))}
        </div>

        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-400">
          Built with async Python, LangGraph parallel agents, pgvector for vector
          storage, and Microsoft Presidio for PII detection. Every evaluation
          traced in LangSmith. Open architecture — bring your own models, swap any component.
        </p>
      </div>
    </section>
  );
}

// ─── Section 9: Final CTA ────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="relative overflow-hidden px-6 py-32">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-emerald-900/8" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/8 blur-[120px]" />

      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Open source. Self-hostable. Free.
        </h2>
        <p className="mb-12 text-lg text-neutral-400">
          Clone the repo, add your API keys, and run your first evaluation in under 5 minutes.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://github.com/ritikakaushik-18/RAG_EVAL_APP"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-violet-900/40 transition-colors hover:bg-violet-500"
          >
            <IconGitHub className="h-5 w-5" />
            Clone on GitHub
          </a>
          <a
            href="https://github.com/ritikakaushik-18/RAG_EVAL_APP#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/10 px-8 py-4 text-base font-medium text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
          >
            Read the docs →
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/5 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-start">
          {/* Left */}
          <div>
            <div className="mb-2 flex items-center gap-1">
              <span className="font-bold text-violet-400">RAG</span>
              <span className="font-bold text-white">Eval</span>
            </div>
            <p className="mb-1 text-sm text-neutral-500">
              Open source RAG evaluation framework.
            </p>
            <p className="text-sm text-neutral-600">MIT License</p>
          </div>

          {/* Right */}
          <div className="text-left md:text-right">
            <p className="mb-3 text-sm font-medium text-neutral-300">
              Built by Ritika Kaushik
            </p>
            <div className="flex items-center gap-4 md:justify-end">
              <a
                href="https://github.com/ritikakaushik-18"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 transition-colors hover:text-white"
                aria-label="GitHub"
              >
                <IconGitHub className="h-5 w-5" />
              </a>
              <a
                href="https://www.linkedin.com/in/ritika-kaushik-30ab68284/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 transition-colors hover:text-white"
                aria-label="LinkedIn"
              >
                <IconLinkedIn className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/5 pt-6 text-center">
          <p className="text-xs text-neutral-700">
            MIT License · Open Source ·{" "}
            <a
              href="https://github.com/ritikakaushik-18/RAG_EVAL_APP/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-600 transition-colors hover:text-neutral-400"
            >
              Contributions welcome
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="scroll-smooth bg-[#0a0a0f] text-white">
      <LandingNav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <SelfHost />
        <Strategies />
        <UseCases />
        <Features />
        <TechStack />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

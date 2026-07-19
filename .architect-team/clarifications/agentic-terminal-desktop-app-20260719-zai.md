2026-07-19 user (during Phase 3 review gate of agentic-terminal-desktop-reachability):
"are we using zai?"
-> answered: NO, not in this session. Verified live:
   1. ANTHROPIC_BASE_URL empty in session env; settings.json env carries only
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS. No gateway routing.
   2. LiteLLM gateway 127.0.0.1:4000 /health returns 500; no gateway.json under ~/.claude.
   3. Agent frontmatter unchanged (dev/testing teammates: claude-haiku-4-5 spawn alias;
      orchestration: fable) — but without the gateway the alias resolves to REAL Anthropic
      Haiku 4.5, not GLM 5.2. Drift from the 2026-07-18 state (gateway then live+activated).
   Disposition: clarification (answer-only), no scope change. Run proceeds on direct
   Anthropic routing; user invited to request gateway re-wiring before next dispatch.

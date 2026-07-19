2026-07-19 user (mid-turn, during /architect-team "conitnue with updates and make desktop app work" startup):
"confirm youre using zai"
-> answered with live verification (delta from the earlier same-day note, where the gateway was down):
   1. ANTHROPIC_BASE_URL=http://127.0.0.1:4000 in this session env — the LiteLLM gateway IS live
      (python.exe PID 89956 listening on 0.0.0.0:4000; /v1/models and /model/info respond).
   2. Routing table (from /model/info):
      - claude-fable-5 (orchestrator, this session's main model) -> anthropic/claude-fable-5 (REAL Anthropic API)
      - claude-haiku-4-5 -> hosted_vllm/glm-5.2 @ https://api.z.ai/api/paas/v4 (z.ai GLM-5.2)
      - ct6-secondary -> hosted_vllm/glm-5.2 @ api.z.ai (fallback alias; router fallback rules not visible)
   3. Consequence for this run: teammates/agents spawned on the claude-haiku-4-5 alias ARE served by
      z.ai GLM-5.2; the orchestrator remains Anthropic Fable 5. This is the re-wired state the user
      was invited to request in the earlier clarification.
   Disposition: clarification (answer-only), no scope change. User was offered a stop-point to
   re-point the proxy before the pipeline proceeds; no stop requested.

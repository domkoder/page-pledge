# 0008 — Anti-cheating is mitigation, not a guarantee

**Status:** accepted (supersedes the "LLM cheating accepted" stance in 0001 and 0007)

## Context
No remote quiz can fully prevent a participant from using an LLM. We decided cheating must not be "accepted", so we make it costly and detectable and bound the damage.

## Decision
- Questions are application/inference-based and anchored to quotes in the supplied material (ADR 0003).
- Per-participant shuffled question variants; fresh questions on every attempt (max 3).
- Answers must include free-text citations from the material.
- Tight timer (~10 min).
- After the written answers, the AI asks a short follow-up (oral/voice or live text) generated from the participant's own answers.
- Cohorts are friends-only/invite-only by default.

## Consequences
- A cheater gains only from other participants' forfeitures, so the loss is bounded to the cohort's own pledges.
- The pitch must be honest: "makes cheating costly and detectable", never "prevents cheating".
- The follow-up question adds a real AI feature (judged on the AI track) but also build time; cut to text-only follow-up if short on time.

# 0007 — Quiz attempts, cohort lifecycle, keeper and demo

**Status:** accepted (amends 0001 retries; completes 0006 edge case)

## Decisions
- **Quiz:** max 3 attempts per milestone; each attempt uses freshly generated questions from the material; timed (~10 min); pass needs >=70% on the rubric. Supersedes "retry until deadline" in 0001. Cheating mitigations: see ADR 0008.
- **Lifecycle:** rules are locked at creation. A fixed join deadline is set at creation. The cohort starts at the join deadline if the minimum participants joined; otherwise everyone can refund in full.
- **No finishers:** the pool is returned pro rata by remaining balance. No treasury, no admin key.
- **Keeper:** a simple script anyone can run, plus one instance during the demo. A UI "Settle" button also exists. Settlement is permissionless, so the keeper has no special authority.
- **Demo:** fully live on devnet only, no seeded data. Use short, configurable deadlines (e.g. 2-minute milestones) so create, pledge, quiz pass, miss, settle and claim all happen on camera.

## Consequences
- The attempt limit is enforced by the oracle (it stops signing), which fits ADR 0001.
- Short deadlines must be a creation parameter with a sane minimum on mainnet.
- The demo needs a rehearsed run with pre-funded devnet wallets.

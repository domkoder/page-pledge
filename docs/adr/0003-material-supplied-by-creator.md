# 0003 — Quiz material is supplied by the creator and hashed on-chain

**Status:** accepted

## Context

The AI can't verify reading of a book it hasn't seen, and quizzes from model memory are trivially LLM-cheatable.

## Decision

- The creator supplies the material (pasted text, PDF or URL) per milestone.
- The AI generates questions from that text only.
- The material hash is stored on-chain with the milestone.

## Consequences

- Grading is anchored to a fixed, verifiable context.
- Copyright is the creator's responsibility; the app stores only the hash plus text off-chain.
- LLM-assisted cheating is mitigated by ADR 0008.

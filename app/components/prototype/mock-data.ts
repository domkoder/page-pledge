export interface CohortMock {
  id: string;
  title: string;
  bookOrTopic: string;
  depositSol: number;
  totalPledgedSol: number;
  membersCount: number;
  creator: string;
  currentMilestoneIndex: number;
  totalMilestones: number;
  nextMilestoneTitle: string;
  nextDeadlineIso: string;
  forfeitBps: number;
  status: "active" | "completed" | "upcoming";
  materialSnippet: string;
}

export interface QuizQuestionMock {
  id: number;
  question: string;
  quotePrompt: string;
  hintCitation: string;
}

export const MOCK_COHORTS: CohortMock[] = [
  {
    id: "cohort-rust-solana",
    title: "Rust & Solana 14-Day Sprint",
    bookOrTopic: "Solana Programming & Anchor Book (Ch 1-6)",
    depositSol: 2.5,
    totalPledgedSol: 15.0,
    membersCount: 6,
    creator: "7xKX...3bVq",
    currentMilestoneIndex: 2,
    totalMilestones: 4,
    nextMilestoneTitle: "Milestone 2: PDAs & CPI Security",
    nextDeadlineIso: new Date(Date.now() + 1000 * 60 * 18).toISOString(), // 18 mins left
    forfeitBps: 2500, // 25% per milestone
    status: "active",
    materialSnippet:
      "When creating accounts with seeds, Solana derives PDAs using find_program_address. A common vulnerability is missing signer verification or unchecked account ownership before invoking cross-program invocations (CPI).",
  },
  {
    id: "cohort-distributed-systems",
    title: "Designing Data-Intensive Apps",
    bookOrTopic: "DDIA by Martin Kleppmann (Part 2)",
    depositSol: 1.0,
    totalPledgedSol: 8.0,
    membersCount: 8,
    creator: "4mZP...99aL",
    currentMilestoneIndex: 1,
    totalMilestones: 5,
    nextMilestoneTitle: "Milestone 1: Replication Logs & Consensus",
    nextDeadlineIso: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(), // 5 hrs left
    forfeitBps: 2000,
    status: "active",
    materialSnippet:
      "Single-leader replication sends stream of writes to followers. In synchronous replication, the leader waits until followers confirm before reporting success.",
  },
  {
    id: "cohort-deep-learning",
    title: "Attention Is All You Need",
    bookOrTopic: "Transformer Architecture & FlashAttention Paper",
    depositSol: 0.5,
    totalPledgedSol: 4.5,
    membersCount: 9,
    creator: "9kTY...11fW",
    currentMilestoneIndex: 3,
    totalMilestones: 3,
    nextMilestoneTitle: "Milestone 3: Settle & Claim Rewards",
    nextDeadlineIso: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // Completed 1 hr ago
    forfeitBps: 3333,
    status: "completed",
    materialSnippet:
      "Scaled Dot-Product Attention computes softmax(QK^T / sqrt(d_k))V. Multi-head attention allows the model to jointly attend to information from different representation subspaces.",
  },
];

export const MOCK_QUIZ_QUESTIONS: QuizQuestionMock[] = [
  {
    id: 1,
    question:
      "Why is `find_program_address` used instead of `create_program_address` when deriving a PDA vault in Anchor?",
    quotePrompt:
      "Quote the excerpt from the assigned text explaining the nonce/bump seed derivation.",
    hintCitation: "Ref: Section 3.2 'PDA Derivation & Bump Seeds'",
  },
  {
    id: 2,
    question:
      "How does missing signer checks on a CPI lead to unauthorized fund movement?",
    quotePrompt:
      "Explain in your own words and quote the paragraph explaining CPI account checks.",
    hintCitation: "Ref: Section 4.1 'Cross-Program Invocations Security'",
  },
];

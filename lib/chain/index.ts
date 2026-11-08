import { MockChain, MockChainOptions } from "./mock-chain";
import { SolanaChain } from "./solana-chain";
import { ChainClient } from "./types";

export * from "./types";
export * from "./attestation";
export * from "./mock-chain";
export * from "./solana-chain";
export * from "./scenarios";

let singletonChain: ChainClient | null = null;

/**
 * Factory that selects `MockChain` (default) or `SolanaChain` stub via `NEXT_PUBLIC_CHAIN=mock|devnet`.
 */
export function getChainClient(options?: MockChainOptions): ChainClient {
  if (singletonChain) return singletonChain;

  const mode =
    typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_CHAIN === "devnet"
      ? "devnet"
      : "mock";

  singletonChain =
    mode === "devnet"
      ? new SolanaChain()
      : new MockChain({ seedDemoCohort: true, ...options });
  return singletonChain;
}

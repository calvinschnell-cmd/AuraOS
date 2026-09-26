import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mintToCollectionV1, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, publicKey, type Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { formatAura } from "@/lib/scoring";

/**
 * Custodial Solana badges: compressed NFTs (Metaplex Bubblegum) minted by the
 * server wallet into its own Merkle tree, grouped under one collection. Users
 * never connect a wallet. Devnet for now. Everything here is best-effort: a
 * failed or slow mint never affects the share card.
 *
 * Config (env first, for hosted deploys; else the files `npm run solana:setup` writes):
 * - SOLANA_SECRET_KEY: JSON byte array | .solana/devnet-keypair.json
 * - SOLANA_TREE / SOLANA_COLLECTION: base58 addresses | .solana/devnet.json
 */

export const SOLANA_DIR = ".solana";
export const KEYPAIR_FILE = path.join(SOLANA_DIR, "devnet-keypair.json");
export const STATE_FILE = path.join(SOLANA_DIR, "devnet.json");
export const DEFAULT_RPC = "https://api.devnet.solana.com";
export const EXPLORER_CLUSTER = "devnet";
/** A mint that takes longer is abandoned (the card never waits on it anyway). */
export const MINT_TIMEOUT_MS = 30_000;

export interface SolanaState {
  cluster: string;
  wallet: string;
  tree: string;
  collection: string;
}

export function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC;
}

export function badgesEnabled(): boolean {
  return process.env.SOLANA_BADGES_ENABLED?.trim().toLowerCase() === "true";
}

export function loadSecretKey(): Uint8Array | null {
  const fromEnv = process.env.SOLANA_SECRET_KEY?.trim();
  const raw = fromEnv || (existsSync(KEYPAIR_FILE) ? readFileSync(KEYPAIR_FILE, "utf8") : "");
  if (!raw) return null;
  return Uint8Array.from(JSON.parse(raw) as number[]);
}

export function loadState(): Pick<SolanaState, "tree" | "collection"> | null {
  const tree = process.env.SOLANA_TREE?.trim();
  const collection = process.env.SOLANA_COLLECTION?.trim();
  if (tree && collection) return { tree, collection };
  if (!existsSync(STATE_FILE)) return null;
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as SolanaState;
  return state.tree && state.collection ? state : null;
}

export function makeUmi(secretKey: Uint8Array): Umi {
  const umi = createUmi(rpcUrl()).use(mplTokenMetadata()).use(mplBubblegum());
  return umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secretKey)));
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

/** On-chain name: at most 32 bytes (Metaplex limit). */
export function badgeName(aura: number): string {
  return `AURA ${formatAura(aura, true)}`.slice(0, 32);
}

/**
 * Mint one badge (compressed NFT) to the server wallet. Metadata lives at
 * `${baseUrl}/api/nft/${cardId}` (served by the app). Resolves to the
 * transaction signature (base58).
 */
export async function mintBadge(opts: { cardId: string; aura: number; baseUrl: string }): Promise<string> {
  const secretKey = loadSecretKey();
  const state = loadState();
  if (!secretKey || !state) throw new Error("Solana badges are not set up (run npm run solana:setup)");
  const umi = makeUmi(secretKey);
  const builder = mintToCollectionV1(umi, {
    leafOwner: umi.identity.publicKey,
    merkleTree: publicKey(state.tree),
    collectionMint: publicKey(state.collection),
    metadata: {
      name: badgeName(opts.aura),
      symbol: "AURA",
      uri: `${opts.baseUrl.replace(/\/+$/, "")}/api/nft/${opts.cardId}`,
      sellerFeeBasisPoints: 0,
      collection: { key: publicKey(state.collection), verified: false },
      creators: [{ address: umi.identity.publicKey, verified: false, share: 100 }],
    },
  });
  const result = await Promise.race([
    builder.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("mint timed out")), MINT_TIMEOUT_MS)),
  ]);
  return base58.deserialize(result.signature)[0];
}

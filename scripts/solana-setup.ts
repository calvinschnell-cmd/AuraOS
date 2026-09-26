/**
 * Solana badge setup (devnet): `npm run solana:setup`. Idempotent.
 * 1. Server wallet: reuses .solana/devnet-keypair.json, or creates it (git-ignored).
 * 2. Funding: devnet airdrop if the balance is low (rate-limited: if it fails,
 *    fund the printed address at https://faucet.solana.com and rerun).
 * 3. Bubblegum Merkle tree (depth 14 = 16,384 badges) + a collection NFT,
 *    recorded in .solana/devnet.json.
 * Then set SOLANA_BADGES_ENABLED=true in .env.local.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createTree } from "@metaplex-foundation/mpl-bubblegum";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount, publicKey, sol } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { loadEnvConfig } from "@next/env";
import { KEYPAIR_FILE, SOLANA_DIR, STATE_FILE, makeUmi, rpcUrl, type SolanaState } from "../lib/server/solana";

loadEnvConfig(process.cwd());

/** Tree rent (depth 14, buffer 64) is ~0.162 SOL; the collection NFT and fees add ~0.02. */
const MIN_BALANCE_SOL = 0.2;
const explorer = (kind: "address" | "tx", id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

async function main() {
  if (!rpcUrl().includes("devnet")) throw new Error(`SOLANA_RPC_URL is not devnet (${rpcUrl()}); this setup only targets devnet.`);
  mkdirSync(SOLANA_DIR, { recursive: true });

  // 1. Wallet
  if (!existsSync(KEYPAIR_FILE)) {
    const kp = createUmi(rpcUrl()).eddsa.generateKeypair();
    writeFileSync(KEYPAIR_FILE, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`created server wallet -> ${KEYPAIR_FILE}`);
  }
  const umi = makeUmi(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_FILE, "utf8")) as number[]));
  const wallet = umi.identity.publicKey;
  console.log(`wallet: ${wallet}  ${explorer("address", wallet)}`);

  // 2. Funding
  let balance = Number((await umi.rpc.getBalance(wallet)).basisPoints) / 1e9;
  console.log(`balance: ${balance} SOL`);
  if (balance < MIN_BALANCE_SOL) {
    try {
      await umi.rpc.airdrop(wallet, sol(0.5));
      balance = Number((await umi.rpc.getBalance(wallet)).basisPoints) / 1e9;
      console.log(`airdropped 0.5 SOL -> ${balance} SOL`);
    } catch (err) {
      console.error(`Airdrop failed (${err instanceof Error ? err.message : err}).`);
      console.error(`The public faucet limits each IP per day. Paste ${wallet} into https://faucet.solana.com`);
      console.error(`(network: devnet, at least ${MIN_BALANCE_SOL} SOL; signing in with GitHub raises the limit), then rerun npm run solana:setup.`);
      process.exit(2);
    }
  }

  // 3. Tree + collection (once)
  const existing = existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as SolanaState) : null;
  if (existing?.tree && existing.collection && (await umi.rpc.accountExists(publicKey(existing.tree))) && (await umi.rpc.accountExists(publicKey(existing.collection)))) {
    console.log(`tree: ${existing.tree}\ncollection: ${existing.collection}\nalready set up.`);
    return;
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  const merkleTree = generateSigner(umi);
  const treeTx = await (await createTree(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64 })).sendAndConfirm(umi);
  console.log(`tree: ${merkleTree.publicKey}  (${treeTx.signature.length ? "created" : ""})`);

  const collectionMint = generateSigner(umi);
  await createNft(umi, {
    mint: collectionMint,
    name: "AURA OS BADGES",
    symbol: "AURA",
    uri: `${baseUrl}/api/nft/collection`,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
  }).sendAndConfirm(umi);
  console.log(`collection: ${collectionMint.publicKey}  ${explorer("address", collectionMint.publicKey)}`);

  const state: SolanaState = { cluster: "devnet", wallet, tree: merkleTree.publicKey, collection: collectionMint.publicKey };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`saved ${STATE_FILE}. Set SOLANA_BADGES_ENABLED=true in .env.local to mint a badge per claimed card.`);
}

main().catch((err) => {
  console.error("Solana setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

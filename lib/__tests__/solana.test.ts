import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GET as nftMetadata } from "@/app/api/nft/[id]/route";
import { POST as mint } from "@/app/api/nft/mint/route";
import { FIXTURE_RACING_JACKET } from "@/lib/fixtures";
import { gptJudge, scoreScan } from "@/lib/scoring";
import { badgeName, badgesEnabled, explorerTxUrl, loadState } from "@/lib/server/solana";
import { getScanStore } from "@/lib/server/store";

afterEach(() => {
  delete process.env.SOLANA_BADGES_ENABLED;
  delete process.env.SOLANA_TREE;
  delete process.env.SOLANA_COLLECTION;
  delete process.env.PUBLIC_BASE_URL;
});

describe("Solana badges", () => {
  it("keeps on-chain names within the 32-byte Metaplex limit", () => {
    expect(badgeName(1_000_000)).toBe("AURA +1,000,000");
    expect(badgeName(-999_999)).toBe("AURA -999,999");
    expect(badgeName(-999_999).length).toBeLessThanOrEqual(32);
  });

  it("is off unless enabled, and the mint route says so without touching Solana", async () => {
    expect(badgesEnabled()).toBe(false);
    const res = await mint(new Request("http://kiosk/api/nft/mint", { method: "POST", body: JSON.stringify({ cardId: "x" }) }));
    expect(res.status).toBe(404);
  });

  it("reads the tree and collection from env first (hosted deploys)", () => {
    process.env.SOLANA_TREE = "Tree111111111111111111111111111111111111111";
    process.env.SOLANA_COLLECTION = "Coll111111111111111111111111111111111111111";
    expect(loadState()).toEqual({ tree: process.env.SOLANA_TREE, collection: process.env.SOLANA_COLLECTION });
    expect(explorerTxUrl("sig")).toBe("https://explorer.solana.com/tx/sig?cluster=devnet");
  });

  it("serves Metaplex metadata for a saved card, with both judges", async () => {
    const store = getScanStore();
    const analysis = FIXTURE_RACING_JACKET;
    const breakdown = scoreScan(analysis, [gptJudge(analysis, "gpt-4o-mini"), { ...gptJudge(analysis, "gemini-3.8-flash"), judge: "gemini", specialness: 40 }]);
    const scanId = randomUUID();
    await store.insert({ id: scanId, imageHash: scanId, analysis, breakdown, aura: breakdown.aura, createdAt: new Date().toISOString() });
    const card = await store.insertCard(
      { id: randomUUID(), scanId, battleId: null, kind: "scan", headline: breakdown.aura, target: breakdown.aura, title: analysis.nickname, verdict: analysis.verdict, caption: null, parentId: null, slot: null },
      Buffer.from("png"),
    );
    process.env.PUBLIC_BASE_URL = "https://aura.example.tech";

    const res = await nftMetadata(new Request(`http://localhost:3000/api/nft/${card.id}`), { params: Promise.resolve({ id: card.id }) });
    const meta = (await res.json()) as { name: string; image: string; attributes: { trait_type: string; value: unknown }[] };
    expect(meta.name).toBe(badgeName(breakdown.aura));
    // Public URLs come from PUBLIC_BASE_URL, never the request's localhost.
    expect(meta.image).toBe(`https://aura.example.tech/api/cards/${card.id}/image`);
    expect(meta.attributes.map((a) => a.trait_type)).toEqual(expect.arrayContaining(["Aura", "JUDGE 1", "JUDGE 2", "Judges disagree"]));

    const collection = await nftMetadata(new Request("http://kiosk/api/nft/collection"), { params: Promise.resolve({ id: "collection" }) });
    expect(((await collection.json()) as { name: string }).name).toBe("AURA OS BADGES");
  });
});

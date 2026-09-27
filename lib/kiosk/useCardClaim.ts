"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ShareCardProps } from "@/components/card/ShareCardView";
import { blurFace, grainDataUrl, renderCardNode } from "@/lib/card/render";
import { mintBadge } from "./api";
import { battleCardMeta, metaForm, scanCardMeta, squadMemberMeta, type CardMeta } from "./cardJobs";
import { makeKioskQrDataUrl, makeQrDataUrl } from "./qr";
import { printCertificate } from "./print";
import type { BattleResult, CardResponse, KioskEvent, KioskState, SessionState } from "./types";

export interface CardClaim {
  /** Props for the offscreen ShareCardView while a card is being rendered. */
  cardProps: ShareCardProps | null;
  cardRef: RefObject<HTMLDivElement | null>;
}

interface Job {
  props: ShareCardProps;
  meta: CardMeta;
  /** The card the QR on screen points at (squad member cards follow in the background). */
  primary: boolean;
}

/** Battle cards wait this long at most for the commentary to finish streaming. */
const COMMENTARY_WAIT_MS = 8000;

const newId = () => crypto.randomUUID();

async function battlePhotos(battle: BattleResult): Promise<Record<number, string>> {
  const entries = await Promise.all(battle.players.map(async (p) => [p.slot, await blurFace(p.scan.image.dataUrl, p.scan.analysis.face_box)] as const));
  return Object.fromEntries(entries);
}

/**
 * Thumbs up -> CLAIM: blur faces, render the share card offscreen (its QR
 * already deep-links to /r/[id]), upload only that PNG plus the card meta,
 * which also posts it to the public feed. Squads then get one card per member
 * ("from Squad Battle"), rendered one at a time in the background.
 */
export function useCardClaim(opts: { state: KioskState; session: SessionState; send: (e: KioskEvent) => void; printingEnabled: boolean; publicBaseUrl: string | null }): CardClaim {
  const { state, session, send, printingEnabled, publicBaseUrl } = opts;
  const [job, setJob] = useState<Job | null>(null);
  const queue = useRef<Job[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const claimedFor = useRef<string | null>(null);
  /** The battle whose commentary we stopped waiting for (keyed, so nothing needs resetting). */
  const [waitOverFor, setWaitOverFor] = useState<string | null>(null);

  const subjectId = session.battle?.id ?? session.scan?.id ?? null;
  const active = state === "CLAIM" && subjectId !== null && session.card === null && session.cardError === null;
  const commentaryReady = !session.battle || session.commentaryDone || waitOverFor === session.battle.id;

  // Battle cards carry the commentary: give the stream a moment to finish.
  useEffect(() => {
    if (!active || commentaryReady || !subjectId) return;
    const id = window.setTimeout(() => setWaitOverFor(subjectId), COMMENTARY_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [active, commentaryReady, subjectId]);

  // The session is read through a ref: streamed commentary keeps changing it,
  // and that must never cancel a card that is already being prepared.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Step 1: blur photos, build the card(s), mount the first offscreen.
  useEffect(() => {
    if (!active || !commentaryReady || !subjectId || claimedFor.current === subjectId) return;
    claimedFor.current = subjectId;
    let cancelled = false;
    const session = sessionRef.current;
    (async () => {
      try {
        const base = publicBaseUrl ?? window.location.origin;
        const pageUrl = (id: string) => `${base}/r/${id}`;
        const grain = grainDataUrl();
        if (session.battle) {
          const b = session.battle;
          const photos = await battlePhotos(b);
          const id = newId();
          const kind = b.mode === "squad" ? "squad" : "battle";
          const main: Job = { props: { kind, battle: b, photos, qr: await makeQrDataUrl(pageUrl(id)), pageUrl: pageUrl(id), grain }, meta: battleCardMeta(id, b), primary: true };
          const members: Job[] =
            b.mode === "squad"
              ? await Promise.all(
                  b.players.map(async (p) => {
                    const mid = newId();
                    return {
                      props: { kind: "scan" as const, scan: { ...p.scan, aura: p.total }, photo: photos[p.slot], tag: "FROM SQUAD BATTLE", pose: p.pose, qr: await makeQrDataUrl(pageUrl(mid)), pageUrl: pageUrl(mid), grain },
                      meta: squadMemberMeta(mid, id, b, p.slot),
                      primary: false,
                    };
                  }),
                )
              : [];
          if (cancelled) return;
          queue.current = members;
          setJob(main);
        } else if (session.scan) {
          const scan = session.scan;
          const photo = await blurFace(scan.image.dataUrl, scan.analysis.face_box);
          const id = newId();
          if (cancelled) return;
          queue.current = [];
          setJob({
            props: { kind: "scan", scan, photo, name: session.playerName, handle: session.playerHandle, qr: await makeQrDataUrl(pageUrl(id)), pageUrl: pageUrl(id), grain },
            meta: scanCardMeta(id, scan, session.playerName, session.playerHandle),
            primary: true,
          });
        }
      } catch (err) {
        console.warn("[aura] card prep failed", err);
        if (!cancelled) send({ type: "CARD_FAILED", message: "CARD COULD NOT BE RENDERED." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, commentaryReady, subjectId, send, publicBaseUrl]);

  // Step 2: once mounted, render + upload; then the next queued card.
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    (async () => {
      try {
        // Give React a frame to paint the offscreen card.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const node = cardRef.current;
        if (!node) throw new Error("card node missing");
        const png = await renderCardNode(node);
        const res = await fetch("/api/cards", { method: "POST", body: metaForm(job.meta, png) });
        const body = (await res.json().catch(() => null)) as (CardResponse & { error?: string }) | null;
        if (!res.ok || !body || body.error) throw new Error(body?.error ?? "CARD COULD NOT BE SAVED.");
        if (cancelled) return;
        if (job.primary) {
          // The on-screen QR is its own: black on white, big modules, readable through the acrylic.
          const screenQr = await makeKioskQrDataUrl(job.props.pageUrl).catch(() => job.props.qr);
          send({ type: "CARD_READY", card: { id: body.id, url: body.url, pageUrl: job.props.pageUrl, qrDataUrl: screenQr, kind: job.props.kind } });
          // Solana badge: a bonus layered on top of the saved card. Fire and forget.
          if (job.props.kind === "scan") {
            send({ type: "BADGE", badge: { status: "minting" } });
            void mintBadge(body.id).then((badge) => send({ type: "BADGE", badge: badge ?? { status: "failed" } }));
          }
          if (printingEnabled && job.props.kind === "scan") {
            send({ type: "PRINTING" });
            const p = job.props;
            const seed = sessionRef.current.outfit.seed;
            const name = `${p.name ? `&name=${encodeURIComponent(p.name)}` : ""}${p.handle ? `&handle=${encodeURIComponent(p.handle)}` : ""}`;
            void printCertificate(`${window.location.origin}/certificate/${p.scan.id}?seed=${encodeURIComponent(seed)}&card=${body.id}${name}`);
          }
        }
      } catch (err) {
        console.warn("[aura] card claim failed", err);
        if (!cancelled && job.primary) send({ type: "CARD_FAILED", message: err instanceof Error ? err.message : "CARD COULD NOT BE SAVED." });
      } finally {
        if (!cancelled) setJob(queue.current.shift() ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per mounted card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  // Reset for the next session.
  useEffect(() => {
    if (state === "SPINNING" || state === "ATTRACT") {
      claimedFor.current = null;
      queue.current = [];
    }
  }, [state]);

  return { cardProps: job?.props ?? null, cardRef };
}

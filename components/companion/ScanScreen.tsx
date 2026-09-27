"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShareCardView, type ShareCardProps } from "@/components/card/ShareCardView";
import { blurFace, grainDataUrl, renderCardJpeg } from "@/lib/card/render";
import { clientId } from "@/lib/companion/identity";
import { postWithProgress, preparePhoto, uuid, type PreparedPhoto } from "@/lib/companion/photo";
import { metaForm, scanCardMeta } from "@/lib/kiosk/cardJobs";
import { makeQrDataUrl } from "@/lib/kiosk/qr";
import type { CardResponse, QuickScanResponse, ScanResult } from "@/lib/kiosk/types";
import { AppShell } from "./AppShell";
import { IdentityForm, useIdentity } from "./Identity";

type Step =
  | { kind: "pick" }
  | { kind: "preparing" }
  | { kind: "uploading"; progress: number }
  | { kind: "scoring" }
  | { kind: "card" }
  | { kind: "battle" }
  | { kind: "error"; message: string; retry: boolean };

const SCORING_LINES = ["READING THE FIT", "CONSULTING THE JUDGES", "COUNTING AURA POINTS", "CHECKING THE DRIP"];

/**
 * /scan: the phone version of a mirror scan. Name once (AURA ID, remembered
 * on this phone) → take or pick a photo → shrink it here → score it on the
 * server (/api/scan/quick) → render the same share card the mirror makes
 * (face blurred) → post it (feed + board) → its result page (/r/[id]).
 * Every step survives bad venue wifi: the photo and the score are kept, and
 * RETRY resumes from the step that failed. From a challenge link
 * (/scan?c=[id]) the new card then accepts the challenge and lands on /c/[id].
 */
export function ScanScreen({ challengeId = null }: { challengeId?: string | null }) {
  const router = useRouter();
  const [player, setPlayer] = useIdentity();
  const [switching, setSwitching] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [line, setLine] = useState(0);
  const [cardProps, setCardProps] = useState<ShareCardProps | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** Shown on a refused challenge: the card itself was saved. */
  const [savedCard, setSavedCard] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<PreparedPhoto | null>(null);
  const scanRef = useRef<ScanResult | null>(null);
  const cardIdRef = useRef<string | null>(null);
  /** The card is saved: only the last step (open it, or accept the challenge) is left. */
  const cardSavedRef = useRef(false);
  const startRef = useRef(0);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const libraryInput = useRef<HTMLInputElement | null>(null);

  // Rotating status line while the judges think.
  useEffect(() => {
    if (step.kind !== "scoring") return;
    const id = window.setInterval(() => setLine((n) => n + 1), 1600);
    return () => window.clearInterval(id);
  }, [step.kind]);

  const fail = useCallback((message: string, retry = true) => setStep({ kind: "error", message, retry }), []);

  /** Step 4: open the card, or battle the challenger with it. */
  const finish = useCallback(async () => {
    const id = cardIdRef.current;
    if (!id) return;
    const ms = Date.now() - startRef.current;
    if (!challengeId) {
      router.push(`/r/${id}?t=${ms}`);
      return;
    }
    setStep({ kind: "battle" });
    try {
      const res = await fetch(`/api/duels/${encodeURIComponent(challengeId)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Id": clientId() },
        body: JSON.stringify({ cardId: id }),
      });
      const body = (await res.json().catch(() => null)) as { acceptId?: string; error?: string } | null;
      if (!res.ok || !body?.acceptId) {
        // Your card is saved either way: a refused challenge (your own link, taken down) still leaves your result.
        const retryable = res.status >= 500;
        return fail(body?.error ?? "THE BATTLE TRIPPED. TRY AGAIN.", retryable);
      }
      router.push(`/c/${encodeURIComponent(challengeId)}?a=${body.acceptId}`);
    } catch {
      fail("CONNECTION DROPPED. YOUR CARD IS SAVED: RETRY TO BATTLE.");
    }
  }, [challengeId, router, fail]);

  /** Step 3: render the card offscreen, upload it, open its page. */
  const makeCard = useCallback(async () => {
    const scan = scanRef.current;
    const photo = photoRef.current;
    if (!scan || !photo) return;
    setStep({ kind: "card" });
    try {
      const id = (cardIdRef.current ??= uuid());
      const pageUrl = `${window.location.origin}/r/${id}`;
      const blurred = await blurFace(photo.dataUrl, scan.analysis.face_box);
      setCardProps({ kind: "scan", scan, photo: blurred, name: player?.name ?? null, handle: player?.handle ?? null, qr: await makeQrDataUrl(pageUrl), pageUrl, grain: grainDataUrl() });
      // Two frames: React mounts the card, the browser paints it.
      // (The timer covers a backgrounded tab, where animation frames pause.)
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r(null)));
        window.setTimeout(r, 150);
      });
      const node = cardRef.current;
      if (!node) throw new Error("CARD COULD NOT BE DRAWN.");
      const jpeg = await Promise.race([
        renderCardJpeg(node),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("CARD TOOK TOO LONG. KEEP THIS TAB OPEN AND RETRY.")), 25_000)),
      ]);
      const meta = scanCardMeta(id, scan, player?.name ?? null, player?.handle ?? null);
      const res = await fetch("/api/cards", { method: "POST", body: metaForm(meta, jpeg), headers: { "X-Device-Id": clientId() } });
      const body = (await res.json().catch(() => null)) as (CardResponse & { error?: string }) | null;
      // 409: a retry after the first upload actually landed.
      if (!res.ok && res.status !== 409) throw new Error(body?.error ?? "CARD COULD NOT BE SAVED.");
      cardSavedRef.current = true;
      setSavedCard(id);
    } catch (err) {
      console.warn("[aura] phone card failed", err);
      fail(err instanceof Error && err.message === err.message.toUpperCase() ? err.message : "COULDN'T SAVE YOUR CARD. WIFI?");
      return;
    }
    await finish();
  }, [player, fail, finish]);

  /** Step 2: upload + score. */
  const upload = useCallback(async () => {
    const photo = photoRef.current;
    if (!photo) return;
    setStep({ kind: "uploading", progress: 0 });
    const form = new FormData();
    form.append("image", photo.blob, "photo.jpg");
    const { status, body } = await postWithProgress<QuickScanResponse & { error?: string }>(
      "/api/scan/quick",
      form,
      { "X-Device-Id": clientId() },
      (progress) => setStep((s) => (s.kind === "uploading" ? { kind: "uploading", progress } : s)),
      () => setStep({ kind: "scoring" }),
    );
    if (status === 0) return fail("CONNECTION DROPPED. VENUE WIFI, PROBABLY.");
    if (!body || status >= 400 || !body.scan) return fail(body?.error ?? "THE JUDGES TRIPPED. TRY AGAIN.", status !== 413 && status !== 415);
    scanRef.current = { ...body.scan, capturedAt: Date.now(), image: { dataUrl: photo.dataUrl, width: photo.width, height: photo.height, hash: body.scan.id, placeholder: false } };
    await makeCard();
  }, [makeCard, fail]);

  /** Step 1: a photo was picked. */
  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.type && !file.type.startsWith("image/")) return fail("THAT'S NOT A PHOTO.", false);
      startRef.current = Date.now();
      photoRef.current = null;
      scanRef.current = null;
      cardIdRef.current = null;
      cardSavedRef.current = false;
      setSavedCard(null);
      setCardProps(null);
      setStep({ kind: "preparing" });
      try {
        photoRef.current = await preparePhoto(file);
        setPreview(photoRef.current.dataUrl);
      } catch {
        return fail("COULDN'T READ THAT PHOTO. TRY A DIFFERENT ONE (JPEG OR PNG).", false);
      }
      await upload();
    },
    [upload, fail],
  );

  const retry = () => {
    if (cardSavedRef.current) void finish();
    else if (scanRef.current) void makeCard();
    else if (photoRef.current) void upload();
    else setStep({ kind: "pick" });
  };

  const busy = step.kind !== "pick" && step.kind !== "error";
  const needsName = !player || switching;

  return (
    <AppShell title="SCAN YOUR FIT" tab="scan">
      <section className="os-window os-window--dark">
        <header className="os-window__title">
          <span>AURA_SCAN.EXE</span>
          <span>x</span>
        </header>
        <div className="os-window__body scan">
          {challengeId && (
            <p className="scan__from font-heading">
              CHALLENGE ACCEPTED. SCAN YOUR FIT TO BATTLE. <Link href={`/c/${encodeURIComponent(challengeId)}`}>[BACK]</Link>
            </p>
          )}
          {needsName ? (
            <>
              <p className="companion__note">FIRST: WHAT DO WE CALL YOU? THIS PHONE REMEMBERS IT.</p>
              <IdentityForm
                cta="LET'S GO"
                onDone={(p) => {
                  setPlayer(p);
                  setSwitching(false);
                }}
              />
            </>
          ) : (
            <>
              <div className="scan__who">
                <span>
                  SCANNING AS <strong>{player.handle}</strong>
                </span>
                {!busy && (
                  <button type="button" className="companion-bar__link" onClick={() => setSwitching(true)}>
                    [SWITCH]
                  </button>
                )}
              </div>

              {step.kind === "pick" && (
                <>
                  <p className="companion__note">FULL BODY, HEAD TO SHOES. A FRIEND TAKING IT OR A MIRROR SELFIE WORKS BEST.</p>
                  <button type="button" className="companion__big-btn" onClick={() => cameraInput.current?.click()}>
                    [TAKE PHOTO]
                  </button>
                  <button type="button" className="card-page__button scan__library" onClick={() => libraryInput.current?.click()}>
                    [CHOOSE FROM LIBRARY]
                  </button>
                </>
              )}

              {busy && (
                <div className="scan__status" role="status" aria-live="polite">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {preview && <img className="scan__preview" src={preview} alt="Your photo" />}
                  <div className="scan__state font-heading">
                    {step.kind === "preparing" && "PREPPING PHOTO"}
                    {step.kind === "uploading" && `UPLOADING ${Math.round(step.progress * 100)}%`}
                    {step.kind === "scoring" && SCORING_LINES[line % SCORING_LINES.length]}
                    {step.kind === "card" && "PRINTING YOUR CARD"}
                    {step.kind === "battle" && "BATTLING THE CHALLENGER"}
                    <span className="analyzing__dots" />
                  </div>
                  <div className="scan__bar" aria-hidden>
                    <span
                      style={{
                        width: `${step.kind === "preparing" ? 5 : step.kind === "uploading" ? 5 + step.progress * 30 : step.kind === "scoring" ? 70 : step.kind === "card" ? 85 : 95}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {step.kind === "error" && (
                <div className="scan__error" role="alert">
                  <div className="font-heading">{step.message}</div>
                  {step.retry ? (
                    <button type="button" className="companion__big-btn" onClick={retry}>
                      [RETRY]
                    </button>
                  ) : null}
                  {savedCard && challengeId && (
                    <Link href={`/r/${savedCard}`} className="card-page__button">
                      [SEE YOUR CARD]
                    </Link>
                  )}
                  <button type="button" className="card-page__button" onClick={() => setStep({ kind: "pick" })}>
                    [PICK ANOTHER PHOTO]
                  </button>
                </div>
              )}
            </>
          )}

          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <p className="card-page__note">
        RESULTS GO UP ON THE PUBLIC FEED AND BOARD (FACE BLURRED, PHOTO NOT KEPT). ONLY SCAN YOURSELF, OR FRIENDS WHO SAID YES.
      </p>

      {cardProps && (
        <div className="card-offscreen" aria-hidden>
          <ShareCardView ref={cardRef} {...cardProps} />
        </div>
      )}
    </AppShell>
  );
}

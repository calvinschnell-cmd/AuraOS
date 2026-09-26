import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { playerLabel } from "@/lib/battle/score";
import { EVENT_NAME } from "@/lib/config";
import type { BattlePlayerView, BattleResult, ScanResult } from "@/lib/kiosk/types";
import { formatAura } from "@/lib/scoring";
import { beatThisLine } from "@/lib/share/caption";

/**
 * The 1080x1350 (4:5) share card: ONE template, three content blocks (solo,
 * battle, squad). Same frame, grain, glow and footer (AURA OS wordmark +
 * "beat this score" + QR deep link) on all three, so the format reads at a
 * glance. Rendered offscreen and captured with html-to-image.
 */

interface CardBase {
  /** QR (PNG data URL) to this card's result page: /r/[id]. */
  qr: string;
  /** The deep link, printed small under the CTA. */
  pageUrl: string;
  /** Grain tile (PNG data URL) so the card reads as a designed graphic, not a screenshot. */
  grain: string | null;
}

export type ShareCardProps = CardBase &
  (
    | {
        kind: "scan";
        scan: ScanResult;
        photo: string;
        /** Leaderboard name the player typed (falls back to the fit nickname). */
        name?: string | null;
        handle?: string | null;
        /** Squad member card: "FROM SQUAD BATTLE". */
        tag?: string | null;
        /** Pose sub-score shown on squad member cards. */
        pose?: BattlePlayerView["pose"] | null;
      }
    | { kind: "battle" | "squad"; battle: BattleResult; photos: Record<number, string> }
  );

/** The number to beat for a card (solo aura, the battle winner's total, the squad score). */
export function cardTarget(props: Pick<ShareCardProps, "kind"> & ({ scan: ScanResult } | { battle: BattleResult })): number {
  if ("scan" in props) return props.scan.aura;
  const b = props.battle;
  if (b.squad) return b.squad.score;
  return Math.max(...b.players.map((p) => p.total));
}

const TITLES = { scan: "AURA_CARD.EXE", battle: "AURA_BATTLE_CARD.EXE", squad: "SQUAD_BATTLE_CARD.EXE" } as const;

export const ShareCardView = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCardView(props, ref) {
  const target = cardTarget(props);
  let body: ReactNode;
  if (props.kind === "scan") body = <SoloBlock {...props} />;
  else if (props.kind === "battle") body = <BattleBlock battle={props.battle} photos={props.photos} />;
  else body = <SquadBlock battle={props.battle} photos={props.photos} />;
  return (
    <div ref={ref} className={`share-card share-card--${props.kind}`}>
      {props.grain && <div className="share-card__grain" style={{ backgroundImage: `url(${props.grain})` }} aria-hidden />}
      <div className="share-card__title">
        <span>{TITLES[props.kind]}</span>
        <span>x</span>
      </div>
      <div className="share-card__content">{body}</div>
      <footer className="share-card__foot">
        <div className="share-card__brand">
          <span className="share-card__wordmark">AURA OS</span>
          <span className="share-card__brand-sub">AURA BATTLES @ {EVENT_NAME}</span>
        </div>
        <div className="share-card__cta">
          <span className="share-card__cta-line">{beatThisLine(target)}</span>
          <span className="share-card__cta-sub">SCAN TO BATTLE ›</span>
          <span className="share-card__url">{props.pageUrl.replace(/^https?:\/\//, "")}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="share-card__qr" src={props.qr} alt="" />
      </footer>
    </div>
  );
});

function Hero({ label, value, sub }: { label: string; value: number; sub?: string | null }) {
  const text = formatAura(value);
  return (
    <div className="share-card__hero">
      <div className="share-card__hero-glow" aria-hidden />
      <span className="share-card__label">{label}</span>
      {/* --chars shrinks long numbers (up to "-1,000,000") to fit. */}
      <span className="share-card__hero-value" style={{ "--chars": text.length } as CSSProperties}>
        {text}
      </span>
      {sub && <span className="share-card__hero-sub">{sub}</span>}
    </div>
  );
}

function Photo({ src, winner = false, dim = false, chip }: { src: string; winner?: boolean; dim?: boolean; chip?: string | null }) {
  return (
    <div className={`share-card__photo ${winner ? "share-card__photo--winner" : ""} ${dim ? "share-card__photo--dim" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      {chip && <span className="share-card__chip">{chip}</span>}
    </div>
  );
}

function SoloBlock({ scan, photo, name, handle, tag, pose }: Extract<ShareCardProps, { kind: "scan" }>) {
  const a = scan.analysis;
  const b = scan.breakdown;
  const stats: [string, string][] = [
    ["💸", `$${b.fitValue.toLocaleString("en-US")}`],
    ["🦄", String(Math.round(b.avgUniqueness))],
    ["🧩", String(b.cohesionScore)],
    ...(pose ? ([["🕺", String(pose.score)]] as [string, string][]) : [["★", String(b.statementCount)] as [string, string]]),
  ];
  return (
    <div className="share-card__solo">
      <Photo src={photo} chip={tag ?? null} />
      <div className="share-card__solo-side">
        <Hero label="AURA" value={scan.aura} sub={tag ? null : `#${scan.rank.position} OF ${scan.rank.total} FITS TODAY`} />
        <div className="share-card__nick">{(name ?? a.nickname).toUpperCase()}</div>
        {handle && <div className="share-card__small">AURA ID: {handle}</div>}
        <div className="share-card__mix">{a.style_mix.map((m) => `${m.style.toUpperCase()} ${Math.round(m.percent)}%`).join(" · ")}</div>
        <div className="share-card__icons">
          {stats.map(([icon, value]) => (
            <span key={icon} className="share-card__icon">
              <span aria-hidden>{icon}</span>
              {value}
            </span>
          ))}
        </div>
      </div>
      <div className="share-card__verdict">&quot;{a.verdict}&quot;</div>
    </div>
  );
}

const clip = (text: string | null, max: number) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function Fighter({ p, photo, battle }: { p: BattlePlayerView; photo: string; battle: BattleResult }) {
  const winner = battle.winnerSlot === p.slot;
  const dim = battle.winnerSlot !== null && !winner;
  return (
    <div className={`share-card__fighter ${winner ? "share-card__fighter--winner" : ""}`}>
      <Photo src={photo} winner={winner} dim={dim} chip={winner ? "WINNER" : null} />
      <span className="share-card__label">{playerLabel(p.slot)}</span>
      <span className="share-card__fighter-nick">{p.nickname.toUpperCase()}</span>
      <span className="share-card__fighter-total">{formatAura(p.total)}</span>
      <span className="share-card__small">
        FIT {formatAura(p.fitAura, true)} · POSE {p.pose.score}
      </span>
    </div>
  );
}

function BattleBlock({ battle, photos }: { battle: BattleResult; photos: Record<number, string> }) {
  const [a, b] = battle.players;
  const winner = battle.players.find((p) => p.slot === battle.winnerSlot) ?? null;
  const sub = winner ? `${playerLabel(winner.slot)} WINS${battle.decidedBy === "pose" ? " ON THE POSE" : ""}` : "DEAD TIE";
  return (
    <div className="share-card__battle">
      <div className="share-card__fighters">
        <Fighter p={a} photo={photos[a.slot]} battle={battle} />
        <div className="share-card__vs">VS</div>
        <Fighter p={b} photo={photos[b.slot]} battle={battle} />
      </div>
      <Hero label={winner ? "WON BY" : "AURA GAP"} value={battle.gap} sub={sub} />
      <div className="share-card__verdict share-card__verdict--small">{clip(battle.commentary, 230) || "THE AURA HAS SPOKEN."}</div>
    </div>
  );
}

function SquadBlock({ battle, photos }: { battle: BattleResult; photos: Record<number, string> }) {
  const s = battle.squad;
  return (
    <div className="share-card__squad">
      <div className="share-card__strip" style={{ "--n": battle.players.length } as CSSProperties}>
        {battle.players.map((p) => (
          <div key={p.slot} className="share-card__strip-cell">
            <Photo src={photos[p.slot]} winner={battle.winnerSlot === p.slot} chip={battle.winnerSlot === p.slot ? "MVP" : null} />
            <span className="share-card__label">P{p.slot + 1}</span>
            <span className="share-card__strip-total">{formatAura(p.total)}</span>
          </div>
        ))}
      </div>
      <Hero label="GROUP AURA" value={s?.score ?? 0} sub={s ? `SQUAD SYNERGY ${s.synergy}/100` : null} />
      <div className="share-card__vibe">{(s?.vibe ?? "chaotic energy").toUpperCase()}</div>
    </div>
  );
}

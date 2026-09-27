import { ImageResponse } from "next/og";
import { formatAura } from "@/lib/scoring";
import { IMAGE_MIME, sniffImage } from "./imageSafety";
import { getScanStore } from "./store";

/**
 * The feed image for a challenge battle (1080x1350, like every card): the two
 * players' own cards side by side, the winner lit up, the margin underneath.
 * Rendered on the server from the stored cards (no photos involved: the cards
 * are already face blurred), so the friend's phone uploads nothing extra.
 */

interface Side {
  name: string;
  /** /api/cards/[id]/image */
  imageUrl: string;
  total: number;
  winner: boolean;
}

const CYAN = "#9ee7ff";
const GLOW = "#c8f4ff";
const BG = "#161616";

async function cardDataUrl(imageUrl: string): Promise<string | null> {
  const id = imageUrl.match(/\/api\/cards\/([^/]+)\/image/)?.[1];
  const bytes = id ? await getScanStore().getCardImage(id) : null;
  if (!bytes) return null;
  const kind = sniffImage(bytes);
  return `data:${kind ? IMAGE_MIME[kind] : "image/png"};base64,${bytes.toString("base64")}`;
}

function Player({ side, src }: { side: Side; src: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 500, opacity: side.winner ? 1 : 0.6 }}>
      <div style={{ display: "flex", position: "relative", border: `${side.winner ? 6 : 2}px solid ${side.winner ? GLOW : CYAN}`, width: 500, height: 625 }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} width={488} height={610} alt="" style={{ width: side.winner ? 488 : 496, height: side.winner ? 613 : 621, objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 40 }}>NO CARD</div>
        )}
        {side.winner && (
          <div style={{ position: "absolute", top: 16, left: 16, display: "flex", background: CYAN, color: "#111", fontSize: 34, padding: "4px 14px", letterSpacing: 4 }}>WINNER</div>
        )}
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 36, letterSpacing: 2, maxWidth: 500, overflow: "hidden" }}>{side.name.slice(0, 20)}</div>
      <div style={{ display: "flex", fontSize: 64, color: side.winner ? GLOW : CYAN }}>{formatAura(side.total, true)}</div>
    </div>
  );
}

export async function renderDuelImage(input: { challenger: Side; friend: Side; gap: number }): Promise<Buffer> {
  const [a, b] = await Promise.all([cardDataUrl(input.challenger.imageUrl), cardDataUrl(input.friend.imageUrl)]);
  const tie = !input.challenger.winner && !input.friend.winner;
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: CYAN, border: `4px solid ${CYAN}`, fontFamily: "monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 24px", borderBottom: `3px solid ${CYAN}`, fontSize: 30, letterSpacing: 6 }}>
          <span>AURA_CHALLENGE.EXE</span>
          <span>x</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 26, fontSize: 44, letterSpacing: 6 }}>CHALLENGE ACCEPTED</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "26px 26px 0" }}>
          <Player side={input.challenger} src={a} />
          <Player side={input.friend} src={b} />
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 38, letterSpacing: 6 }}>{tie ? "DEAD TIE" : "WON BY"}</div>
          {!tie && <div style={{ display: "flex", fontSize: 110, color: GLOW, lineHeight: 1 }}>{formatAura(input.gap)}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderTop: `3px solid ${CYAN}`, fontSize: 26, letterSpacing: 4 }}>
          <span>AURA OS · AURA BATTLES @ HACKGT 13</span>
          <span>CHALLENGE A FRIEND ›</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  );
  return Buffer.from(await res.arrayBuffer());
}

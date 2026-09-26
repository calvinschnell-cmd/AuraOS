import { FOOTER_LINES } from "@/lib/copy";

export function Footer({ onReboot }: { onReboot: () => void }) {
  return (
    <footer className="kiosk-footer">
      <span>{FOOTER_LINES[0]}</span>
      <button type="button" className="kiosk-footer__reboot" onClick={onReboot}>
        [REBOOT]
      </button>
    </footer>
  );
}

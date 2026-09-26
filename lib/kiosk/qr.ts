import QRCode from "qrcode";

/** QR code as a PNG data URL, AURA OS paper colors. */
export function makeQrDataUrl(text: string, size = 640): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#111111", light: "#f4f4f0" },
  });
}

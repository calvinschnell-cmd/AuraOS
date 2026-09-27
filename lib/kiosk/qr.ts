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

/**
 * QR for the kiosk screen behind the one-way acrylic: pure black on pure
 * white, low error correction (a clean screen needs none, and fewer modules
 * means bigger ones) and a 2-module quiet zone, so it scans from ~1.5 m.
 */
export function makeKioskQrDataUrl(text: string, size = 900): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "L",
    margin: 2,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/** This machine's network IPv4s: phones open card links (/r/[id]) through them in dev. */
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a !== undefined && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  // A second (mock-mode) dev server builds into its own folder: scripts/dev-mock.mjs.
  distDir: process.env.AURA_DIST_DIR || ".next",
  // No dev badge floating over the kiosk (compile and runtime errors still show).
  devIndicators: false,
  // Dev only: let phones on the same network load the companion pages' scripts.
  allowedDevOrigins: lanHosts,
};

export default nextConfig;

/** Runs once per server start. The kiosk laptop listens for OPEN MIRROR requests relayed from the public /admin. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No-op except on the Windows kiosk laptop with Tiger Data (checked inside).
  const { startMirrorLaunchPoller } = await import("./lib/server/mirrorLaunch");
  startMirrorLaunchPoller(process.env.PORT ?? "3000");
}

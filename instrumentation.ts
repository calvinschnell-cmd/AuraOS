/** Runs once per server start. The kiosk laptop listens for OPEN MIRROR requests relayed from the public /admin. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.platform !== "win32") return;
  const { startMirrorLaunchPoller } = await import("./lib/server/mirrorLaunch");
  startMirrorLaunchPoller(process.env.PORT ?? "3000");
}

// Opt-in (`hivemind watch --notify`) OS notifications for the editor spec's toast moments: an edit breaks a locked
// rule, a collision, your lesson was approved. Zero deps: PowerShell + WinRT toasts on Windows, osascript on macOS,
// notify-send on Linux. Rate-limited like the spec: at most one per 2 minutes; extras are dropped, not queued.
import { spawn } from "node:child_process";

const GAP_MS = 2 * 60 * 1000;
let last = 0;

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const ps = (s) => String(s).replace(/'/g, "''");

export function notify(title, body, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - last < GAP_MS) return false;
  last = now;
  try {
    if (process.platform === "win32") {
      // PowerShell's own AppUserModelID is registered on every Windows 10/11 install, so the toast needs no shortcut.
      const toast = `<toast><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual><audio silent="true"/></toast>`;
      const script = [
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
        "$x = New-Object Windows.Data.Xml.Dom.XmlDocument",
        `$x.LoadXml('${ps(toast)}')`,
        "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))",
      ].join("; ");
      spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { stdio: "ignore", detached: true, windowsHide: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("notify-send", ["-a", "Hivemind", title, body], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    }
    return true;
  } catch {
    return false;
  }
}

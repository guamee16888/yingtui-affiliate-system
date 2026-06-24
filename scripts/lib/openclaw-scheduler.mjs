export const OPENCLAW_LAUNCHD_LABEL = "com.guamee.openclaw.daily";

export function buildOpenClawLaunchdPlist({
  label = OPENCLAW_LAUNCHD_LABEL,
  projectRoot,
  nodePath,
  hour = 8,
  minute = 10,
  stdoutPath,
  stderrPath
} = {}) {
  if (!projectRoot) throw new Error("projectRoot is required");
  if (!nodePath) throw new Error("nodePath is required");
  const normalizedHour = clampInt(hour, 0, 23, 8);
  const normalizedMinute = clampInt(minute, 0, 59, 10);
  const out = stdoutPath || `${projectRoot}/output/openclaw-daily.out.log`;
  const err = stderrPath || `${projectRoot}/output/openclaw-daily.err.log`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(projectRoot)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(`${projectRoot}/scripts/openclaw-daily.mjs`)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${normalizedHour}</integer>
    <key>Minute</key>
    <integer>${normalizedMinute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(out)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(err)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

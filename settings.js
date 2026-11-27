export const POLL_INTERVAL_SECONDS = Object.freeze([5, 15, 30, 60, 90, 150, 300])

export const DEFAULT_SETTINGS = Object.freeze({
  showHourly: true,
  showWeekly: true,
  showPercentage: true,
  showProgressBar: true,
  showResetCountdown: true,
  showResetCredits: true,
  pollIntervalSeconds: 90,
})

export function normalizeSettings(value) {
  const saved = value && typeof value === "object" ? value : {}
  return {
    showHourly: typeof saved.showHourly === "boolean" ? saved.showHourly : DEFAULT_SETTINGS.showHourly,
    showWeekly: typeof saved.showWeekly === "boolean" ? saved.showWeekly : DEFAULT_SETTINGS.showWeekly,
    showPercentage: typeof saved.showPercentage === "boolean" ? saved.showPercentage : DEFAULT_SETTINGS.showPercentage,
    showProgressBar: typeof saved.showProgressBar === "boolean" ? saved.showProgressBar : DEFAULT_SETTINGS.showProgressBar,
    showResetCountdown: typeof saved.showResetCountdown === "boolean" ? saved.showResetCountdown : DEFAULT_SETTINGS.showResetCountdown,
    showResetCredits: typeof saved.showResetCredits === "boolean" ? saved.showResetCredits : DEFAULT_SETTINGS.showResetCredits,
    pollIntervalSeconds: POLL_INTERVAL_SECONDS.includes(saved.pollIntervalSeconds)
      ? saved.pollIntervalSeconds
      : DEFAULT_SETTINGS.pollIntervalSeconds,
  }
}

export function isPollDue(lastAttempt, now, intervalSeconds) {
  return now - lastAttempt >= intervalSeconds * 1000
}

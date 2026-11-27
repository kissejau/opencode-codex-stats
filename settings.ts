export const POLL_INTERVAL_SECONDS = Object.freeze([5, 15, 30, 60, 90, 150, 300])

export const DEFAULT_SETTINGS = Object.freeze({
  showHourly: true,
  showWeekly: true,
  showPercentage: true,
  showProgressBar: true,
  showResetCountdown: true,
  showResetCredits: true,
  colorful: true,
  pollIntervalSeconds: 90,
})

export type Settings = {
  showHourly: boolean
  showWeekly: boolean
  showPercentage: boolean
  showProgressBar: boolean
  showResetCountdown: boolean
  showResetCredits: boolean
  colorful: boolean
  pollIntervalSeconds: number
}

export function normalizeSettings(value: unknown): Settings {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    showHourly: typeof saved.showHourly === "boolean" ? saved.showHourly : DEFAULT_SETTINGS.showHourly,
    showWeekly: typeof saved.showWeekly === "boolean" ? saved.showWeekly : DEFAULT_SETTINGS.showWeekly,
    showPercentage: typeof saved.showPercentage === "boolean" ? saved.showPercentage : DEFAULT_SETTINGS.showPercentage,
    showProgressBar: typeof saved.showProgressBar === "boolean" ? saved.showProgressBar : DEFAULT_SETTINGS.showProgressBar,
    showResetCountdown: typeof saved.showResetCountdown === "boolean" ? saved.showResetCountdown : DEFAULT_SETTINGS.showResetCountdown,
    showResetCredits: typeof saved.showResetCredits === "boolean" ? saved.showResetCredits : DEFAULT_SETTINGS.showResetCredits,
    colorful: typeof saved.colorful === "boolean" ? saved.colorful : DEFAULT_SETTINGS.colorful,
    pollIntervalSeconds: typeof saved.pollIntervalSeconds === "number" && POLL_INTERVAL_SECONDS.includes(saved.pollIntervalSeconds)
      ? saved.pollIntervalSeconds
      : DEFAULT_SETTINGS.pollIntervalSeconds,
  }
}

export function isPollDue(lastAttempt: number, now: number, intervalSeconds: number) {
  return now - lastAttempt >= intervalSeconds * 1000
}

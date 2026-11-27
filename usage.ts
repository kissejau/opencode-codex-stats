const FIVE_HOURS = 5 * 60 * 60
const ONE_WEEK = 7 * 24 * 60 * 60

export type UsageWindow = { usedPercent: number; resetsAt?: number }
export type UsageSnapshot = { checkedAt: number; hourly?: UsageWindow; weekly?: UsageWindow; availableResets?: number }
export type UsageResult = Partial<UsageSnapshot> & { status: "ready" | "stale" | "unavailable"; message?: string }

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseWindow(value: unknown, checkedAt: number) {
  const input = record(value)
  if (!input || typeof input.limit_window_seconds !== "number" || !Number.isFinite(input.limit_window_seconds) ||
      typeof input.used_percent !== "number" || !Number.isFinite(input.used_percent)) return

  let resetsAt
  if (typeof input.reset_at === "number" && Number.isSafeInteger(input.reset_at) && input.reset_at > 0) {
    resetsAt = input.reset_at
  } else if (
    typeof input.reset_after_seconds === "number" && Number.isFinite(input.reset_after_seconds) &&
    input.reset_after_seconds >= 0 &&
    Number.isFinite(checkedAt)
  ) {
    resetsAt = Math.ceil(checkedAt / 1000 + input.reset_after_seconds)
  }

  return {
    duration: input.limit_window_seconds,
    window: {
      usedPercent: Math.max(0, Math.min(100, input.used_percent)),
      ...(resetsAt === undefined ? {} : { resetsAt }),
    },
  }
}

export function parseUsage(body: unknown, checkedAt = Date.now()): UsageSnapshot | undefined {
  const input = record(body)
  const rateLimit = record(input?.rate_limit)
  if (!rateLimit) return

  const snapshot: UsageSnapshot = { checkedAt }
  const availableResets = record(input?.rate_limit_reset_credits)?.available_count
  if (typeof availableResets === "number" && Number.isSafeInteger(availableResets) && availableResets >= 0) {
    snapshot.availableResets = availableResets
  }
  for (const value of [rateLimit.primary_window, rateLimit.secondary_window]) {
    const entry = parseWindow(value, checkedAt)
    if (entry?.duration === FIVE_HOURS) snapshot.hourly = entry.window
    if (entry?.duration === ONE_WEEK) snapshot.weekly = entry.window
  }

  return snapshot.hourly || snapshot.weekly ? snapshot : undefined
}

export function remainingPercent(usedPercent: number) {
  return 100 - usedPercent
}

export function usageTone(remaining: number) {
  return remaining > 60 ? "normal" : remaining > 30 ? "warning" : "error"
}

export function isOpenAISessionModel(sessionModel: { providerID?: string } | null | undefined, selectedModel: { providerID?: string } | null | undefined) {
  return (sessionModel?.providerID ?? selectedModel?.providerID) === "openai"
}

export function createRefreshController<T>({ read, onResult, onError }: {
  read: (force: boolean) => Promise<T>
  onResult: (result: T) => void
  onError: () => void
}) {
  let running = false
  let rerun = false
  let disposed = false
  let generation = 0

  async function refresh(force = false) {
    if (running) {
      if (force) rerun = true
      return
    }
    running = true
    const requestGeneration = generation

    try {
      const result = await read(force)
      if (!disposed && requestGeneration === generation) onResult(result)
    } catch {
      if (!disposed && requestGeneration === generation) onError()
    } finally {
      running = false
      if (rerun && !disposed) {
        rerun = false
        void refresh(true)
      }
    }
  }

  return {
    refresh,
    invalidate() {
      generation += 1
    },
    dispose() {
      disposed = true
    },
  }
}

export function formatRemaining(resetsAt: number | undefined, now = Date.now()) {
  if (resetsAt === undefined || !Number.isFinite(resetsAt)) return "—"

  const minutes = Math.max(0, Math.ceil((resetsAt * 1000 - now) / 60_000))
  if (minutes === 0) return "0m"

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60

  if (days) return `${days}d${hours}h`
  if (hours) return `${hours}h${remainingMinutes}m`
  return `${remainingMinutes}m`
}

export function progressBar(usedPercent: number, width = 10) {
  const safeWidth = Math.max(1, Math.floor(width))
  const percent = Number.isFinite(usedPercent) ? Math.max(0, Math.min(100, usedPercent)) : 0
  const filled = Math.round((percent / 100) * safeWidth)

  return {
    filled: "█".repeat(filled),
    empty: "░".repeat(safeWidth - filled),
  }
}

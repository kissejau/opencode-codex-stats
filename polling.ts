import { POLL_INTERVAL_SECONDS } from "./settings.ts"

export function requestIntervalSeconds(input: { pollIntervalSeconds?: number } | undefined) {
  return input?.pollIntervalSeconds !== undefined && POLL_INTERVAL_SECONDS.includes(input.pollIntervalSeconds)
    ? input.pollIntervalSeconds
    : 15
}

export function createPollScheduler(refresh: () => void, set = setInterval, clear = clearInterval) {
  let timer: ReturnType<typeof setInterval> | undefined
  return {
    restart(seconds: number) {
      if (timer !== undefined) clear(timer)
      timer = set(refresh, seconds * 1000)
    },
    dispose() {
      if (timer !== undefined) clear(timer)
    },
  }
}

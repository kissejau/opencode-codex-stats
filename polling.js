import { POLL_INTERVAL_SECONDS } from "./settings.js"

export function requestIntervalSeconds(input) {
  return POLL_INTERVAL_SECONDS.includes(input?.pollIntervalSeconds)
    ? input.pollIntervalSeconds
    : 15
}

export function createPollScheduler(refresh, set = setInterval, clear = clearInterval) {
  let timer
  return {
    restart(seconds) {
      if (timer !== undefined) clear(timer)
      timer = set(refresh, seconds * 1000)
    },
    dispose() {
      if (timer !== undefined) clear(timer)
    },
  }
}

import assert from "node:assert/strict"
import test from "node:test"
import { isPollDue, normalizeSettings } from "../settings.js"

const polling = await import("../polling.js").catch(() => ({}))

test("server request interval accepts five seconds and preserves the 15-second legacy default", () => {
  const configured = polling.requestIntervalSeconds({ pollIntervalSeconds: 5 })
  assert.equal(configured, 5)
  assert.equal(isPollDue(10_000, 14_999, configured), false)
  assert.equal(isPollDue(10_000, 15_000, configured), true)

  const legacy = polling.requestIntervalSeconds({})
  assert.equal(legacy, 15)
  assert.equal(isPollDue(10_000, 24_999, legacy), false)
  assert.equal(isPollDue(10_000, 25_000, legacy), true)
  assert.equal(polling.requestIntervalSeconds({ pollIntervalSeconds: 6 }), 15)
})

test("poll scheduler replaces the old timer with the saved interval and invokes refresh", () => {
  const scheduled = []
  const cleared = []
  let refreshes = 0
  const scheduler = polling.createPollScheduler(
    () => { refreshes += 1 },
    (callback, delay) => {
      const timer = { callback, delay }
      scheduled.push(timer)
      return timer
    },
    (timer) => cleared.push(timer),
  )

  scheduler.restart(90)
  const savedSettings = normalizeSettings({ pollIntervalSeconds: 5 })
  scheduler.restart(savedSettings.pollIntervalSeconds)
  assert.equal(scheduled[0].delay, 90_000)
  assert.equal(scheduled[1].delay, 5_000)
  assert.deepEqual(cleared, [scheduled[0]])
  scheduled[1].callback()
  assert.equal(refreshes, 1)

  scheduler.dispose()
  assert.deepEqual(cleared, scheduled)
})

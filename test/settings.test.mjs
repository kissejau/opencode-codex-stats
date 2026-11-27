import assert from "node:assert/strict"
import test from "node:test"

const settings = await import("../settings.ts")

test("settings default to the current display and 90-second interval", () => {
  assert.deepEqual(settings.DEFAULT_SETTINGS, {
    showHourly: true,
    showWeekly: true,
    showPercentage: true,
    showProgressBar: true,
    showResetCountdown: true,
    showResetCredits: true,
    pollIntervalSeconds: 90,
  })
})

test("normalizeSettings keeps valid values and defaults invalid values", () => {
  assert.deepEqual(
    settings.normalizeSettings({
      showHourly: false,
      showWeekly: "yes",
      showPercentage: false,
      showProgressBar: true,
      showResetCountdown: false,
      showResetCredits: false,
      pollIntervalSeconds: 5,
    }),
    {
      showHourly: false,
      showWeekly: true,
      showPercentage: false,
      showProgressBar: true,
      showResetCountdown: false,
      showResetCredits: false,
      pollIntervalSeconds: 5,
    },
  )
  assert.deepEqual(settings.normalizeSettings(null), settings.DEFAULT_SETTINGS)
  assert.equal(settings.normalizeSettings({ showResetCredits: "yes" }).showResetCredits, true)
  assert.equal(settings.normalizeSettings({ pollIntervalSeconds: 6 }).pollIntervalSeconds, 90)
})

test("poll intervals include each requested choice", () => {
  assert.deepEqual(settings.POLL_INTERVAL_SECONDS, [5, 15, 30, 60, 90, 150, 300])
  for (const seconds of settings.POLL_INTERVAL_SECONDS) {
    assert.equal(settings.normalizeSettings({ pollIntervalSeconds: seconds }).pollIntervalSeconds, seconds)
  }
})

test("isPollDue honors the selected interval in seconds", () => {
  assert.equal(settings.isPollDue(10_000, 14_999, 5), false)
  assert.equal(settings.isPollDue(10_000, 15_000, 5), true)
  assert.equal(settings.isPollDue(10_000, 69_999, 60), false)
  assert.equal(settings.isPollDue(10_000, 70_000, 60), true)
})

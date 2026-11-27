import assert from "node:assert/strict"
import test from "node:test"

const usage = await import("../usage.ts")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test("parseUsage maps five-hour and weekly used percentages and reset times", () => {
  const snapshot = usage.parseUsage(
    {
      rate_limit: {
        primary_window: {
          limit_window_seconds: 18_000,
          used_percent: 37,
          reset_at: 1_800_000_000,
        },
        secondary_window: {
          limit_window_seconds: 604_800,
          used_percent: 61,
          reset_at: 1_800_300_000,
        },
      },
    },
    1_700_000_000_000,
  )

  assert.deepEqual(snapshot, {
    checkedAt: 1_700_000_000_000,
    hourly: { usedPercent: 37, resetsAt: 1_800_000_000 },
    weekly: { usedPercent: 61, resetsAt: 1_800_300_000 },
  })
})

test("parseUsage maps available reset credits, including zero", () => {
  const body = {
    rate_limit: {
      primary_window: {
        limit_window_seconds: 18_000,
        used_percent: 0,
      },
    },
    rate_limit_reset_credits: { available_count: 3 },
  }

  assert.equal(usage.parseUsage(body).availableResets, 3)
  assert.equal(
    usage.parseUsage({ ...body, rate_limit_reset_credits: { available_count: 0 } }).availableResets,
    0,
  )
})

test("parseUsage leaves missing or invalid reset credit counts unknown", () => {
  const body = {
    rate_limit: {
      primary_window: {
        limit_window_seconds: 18_000,
        used_percent: 0,
      },
    },
  }

  for (const value of [undefined, null, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
    const credits = value === undefined ? {} : { available_count: value }
    assert.equal(
      usage.parseUsage({ ...body, rate_limit_reset_credits: credits }).availableResets,
      undefined,
      `available_count ${String(value)} should be unknown`,
    )
  }
})

test("parseUsage keeps an available window when the other window is missing", () => {
  const checkedAt = 1_700_000_000_000
  assert.deepEqual(
    usage.parseUsage({
      rate_limit: {
        primary_window: {
          limit_window_seconds: 604_800,
          used_percent: 12,
        },
      },
    }, checkedAt),
    {
      checkedAt,
      weekly: { usedPercent: 12 },
    },
  )
})

test("parseUsage rejects responses without supported windows", () => {
  assert.equal(usage.parseUsage({ rate_limit: {} }), undefined)
  assert.equal(usage.parseUsage({}), undefined)
})

test("parseUsage clamps used percentage and derives reset time when only delay is present", () => {
  assert.deepEqual(
    usage.parseUsage(
      {
        rate_limit: {
          primary_window: {
            limit_window_seconds: 18_000,
            used_percent: 130,
            reset_after_seconds: 7_200,
          },
        },
      },
      1_700_000_000_000,
    ),
    {
      checkedAt: 1_700_000_000_000,
      hourly: { usedPercent: 100, resetsAt: 1_700_007_200 },
    },
  )
})

test("remainingPercent returns the unused quota", () => {
  assert.equal(usage.remainingPercent(37), 63)
  assert.equal(usage.remainingPercent(0), 100)
  assert.equal(usage.remainingPercent(100), 0)
  assert.deepEqual(usage.progressBar(usage.remainingPercent(37), 10), {
    filled: "██████",
    empty: "░░░░",
  })
})

test("remaining usage selects the appropriate warning level at the thresholds", () => {
  assert.equal(usage.usageTone(100), "normal")
  assert.equal(usage.usageTone(60.1), "normal")
  assert.equal(usage.usageTone(60), "warning")
  assert.equal(usage.usageTone(30.1), "warning")
  assert.equal(usage.usageTone(30), "error")
  assert.equal(usage.usageTone(0), "error")
})

test("Codex display falls back to the current model only when the session has no override", () => {
  assert.equal(usage.isOpenAISessionModel(undefined, { providerID: "openai" }), true)
  assert.equal(usage.isOpenAISessionModel({ providerID: "anthropic" }, { providerID: "openai" }), false)
  assert.equal(usage.isOpenAISessionModel(undefined, undefined), false)
})

test("refresh controller ignores an old success and forces a refresh for the new credential", async () => {
  const oldRead = deferred()
  const newRead = deferred()
  let resolveNewStarted
  let resolveNewApplied
  const newStarted = new Promise((resolve) => { resolveNewStarted = resolve })
  const newApplied = new Promise((resolve) => { resolveNewApplied = resolve })
  const values = []
  const errors = []
  const forceValues = []
  let reads = 0
  const controller = usage.createRefreshController({
    read(force) {
      forceValues.push(force)
      reads += 1
      if (reads === 2) resolveNewStarted()
      return reads === 1 ? oldRead.promise : newRead.promise
    },
    onResult(value) {
      values.push(value)
      if (value === "new") resolveNewApplied()
    },
    onError: () => errors.push("error"),
  })

  const oldRefresh = controller.refresh()
  controller.invalidate()
  await controller.refresh(true)
  oldRead.resolve("old")
  await oldRefresh
  await newStarted

  assert.deepEqual(values, [])
  assert.deepEqual(forceValues, [false, true])
  newRead.resolve("new")
  await newApplied
  assert.deepEqual(values, ["new"])
  assert.deepEqual(errors, [])
  controller.dispose()
}, { timeout: 1_000 })

test("refresh controller ignores an old error after a credential switch", async () => {
  const oldRead = deferred()
  const newRead = deferred()
  let resolveNewStarted
  let resolveNewApplied
  const newStarted = new Promise((resolve) => { resolveNewStarted = resolve })
  const newApplied = new Promise((resolve) => { resolveNewApplied = resolve })
  const values = []
  const errors = []
  let reads = 0
  const controller = usage.createRefreshController({
    read() {
      reads += 1
      if (reads === 2) resolveNewStarted()
      return reads === 1 ? oldRead.promise : newRead.promise
    },
    onResult(value) {
      values.push(value)
      if (value === "new") resolveNewApplied()
    },
    onError: () => errors.push("error"),
  })

  const oldRefresh = controller.refresh()
  controller.invalidate()
  await controller.refresh(true)
  oldRead.reject(new Error("old account request failed"))
  await oldRefresh
  await newStarted

  assert.deepEqual(values, [])
  assert.deepEqual(errors, [])
  newRead.resolve("new")
  await newApplied
  assert.deepEqual(values, ["new"])
  controller.dispose()
}, { timeout: 1_000 })

test("formatRemaining uses compact countdowns and handles unavailable or elapsed resets", () => {
  const now = 1_700_000_000_000

  assert.equal(usage.formatRemaining(now / 1000 + 2 * 60 * 60 + 14 * 60, now), "2h14m")
  assert.equal(usage.formatRemaining(now / 1000 + 3 * 24 * 60 * 60 + 8 * 60 * 60, now), "3d8h")
  assert.equal(usage.formatRemaining(now / 1000 - 1, now), "0m")
  assert.equal(usage.formatRemaining(undefined, now), "—")
})

test("progressBar fills according to the supplied percentage", () => {
  assert.deepEqual(usage.progressBar(37, 10), {
    filled: "████",
    empty: "░░░░░░",
  })
})

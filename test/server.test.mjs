import assert from "node:assert/strict"
import test from "node:test"
import plugin from "../server.ts"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function usageResponse(usedPercent) {
  return Response.json({
    rate_limit: {
      primary_window: { limit_window_seconds: 18_000, used_percent: usedPercent },
    },
  })
}

async function server(t, fetch, resolveCredential) {
  t.mock.method(globalThis, "fetch", fetch)
  let account = "a"
  let credentialType = "oauth"
  let read
  await plugin.setup({
    integration: {
      connection: {
        active: async () => account && ({ type: "credential", id: account }),
        resolve: async (connection) => {
          if (resolveCredential) await resolveCredential(connection)
          return {
            type: credentialType,
            access: `token-${connection.id}`,
            metadata: { accountID: connection.id },
          }
        },
      },
    },
    rpc: {
      register: async (_schema, handlers) => {
        read = handlers.read
        return { dispose() {} }
      },
    },
  })
  return {
    read: (input = {}) => read(input, { signal: new AbortController().signal }),
    setAccount: (value) => { account = value },
    setCredentialType: (value) => { credentialType = value },
  }
}

test("parallel readers do not receive the previous account's result after an account switch", async (t) => {
  const oldRequest = deferred()
  const oldStarted = deferred()
  const api = await server(t, async (_url, options) => {
    if (options.headers["ChatGPT-Account-Id"] === "a") {
      oldStarted.resolve()
      return oldRequest.promise
    }
    return usageResponse(80)
  })

  const first = api.read()
  await oldStarted.promise
  const second = api.read()
  await new Promise(setImmediate)
  api.setAccount("b")
  assert.equal((await api.read()).hourly.usedPercent, 80)
  oldRequest.resolve(usageResponse(20))

  assert.equal((await first).status, "unavailable")
  assert.equal((await second).status, "unavailable")
})

test("a failed previous account request does not return the new account's cached data", async (t) => {
  const oldRequest = deferred()
  const oldStarted = deferred()
  const api = await server(t, async (_url, options) => {
    if (options.headers["ChatGPT-Account-Id"] === "a") {
      oldStarted.resolve()
      return oldRequest.promise
    }
    return usageResponse(80)
  })
  const first = api.read()
  await oldStarted.promise
  const second = api.read()
  await new Promise(setImmediate)
  api.setAccount("b")
  assert.equal((await api.read()).hourly.usedPercent, 80)
  oldRequest.reject(new Error("network error"))

  assert.equal((await first).status, "unavailable")
  assert.equal((await second).status, "unavailable")
})

test("an old request cannot overwrite data after switching away and back", async (t) => {
  const oldRequest = deferred()
  const oldStarted = deferred()
  let aRequests = 0
  const api = await server(t, async (_url, options) => {
    if (options.headers["ChatGPT-Account-Id"] === "a" && ++aRequests === 1) {
      oldStarted.resolve()
      return oldRequest.promise
    }
    return usageResponse(options.headers["ChatGPT-Account-Id"] === "a" ? 40 : 80)
  })
  const old = api.read()
  await oldStarted.promise
  api.setAccount("b")
  await api.read()
  api.setAccount("a")
  assert.equal((await api.read()).hourly.usedPercent, 40)
  oldRequest.resolve(usageResponse(20))

  assert.equal((await old).status, "unavailable")
  assert.equal((await api.read()).hourly.usedPercent, 40)
})

test("missing connection or OAuth credential returns unavailable without fetching", async (t) => {
  let calls = 0
  const api = await server(t, async () => {
    calls++
    return usageResponse(20)
  })
  api.setAccount(null)
  assert.equal((await api.read()).status, "unavailable")
  api.setAccount("a")
  api.setCredentialType("api")
  assert.equal((await api.read()).status, "unavailable")
  assert.equal(calls, 0)
})

test("successful requests use cached data until refresh is requested", async (t) => {
  let calls = 0
  let now = 1_700_000_000_000
  t.mock.method(Date, "now", () => now)
  const api = await server(t, async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer token-a")
    assert.equal(options.headers["ChatGPT-Account-Id"], "a")
    calls++
    return usageResponse(calls * 10)
  })

  assert.equal((await api.read()).hourly.usedPercent, 10)
  assert.equal((await api.read()).hourly.usedPercent, 10)
  assert.equal(calls, 1)
  now += 5_000
  assert.equal((await api.read({ refresh: true, pollIntervalSeconds: 5 })).hourly.usedPercent, 20)
  assert.equal(calls, 2)
  now += 90_000
  assert.equal((await api.read()).hourly.usedPercent, 30)
  assert.equal(calls, 3)
})

test("a response without supported usage windows is unavailable", async (t) => {
  const api = await server(t, async () => Response.json({ rate_limit: {} }))
  assert.equal((await api.read()).status, "unavailable")
})

test("request failures return unavailable or stale cached usage and respect retry interval", async (t) => {
  let now = 1_700_000_000_000
  t.mock.method(Date, "now", () => now)
  let calls = 0
  const api = await server(t, async () => {
    calls++
    if (calls === 1) throw new Error("network error")
    if (calls === 2) return usageResponse(30)
    return new Response(null, { status: 503 })
  })

  assert.equal((await api.read({ pollIntervalSeconds: 5 })).status, "unavailable")
  assert.equal((await api.read({ pollIntervalSeconds: 5 })).status, "unavailable")
  assert.equal(calls, 1)
  now += 5_000
  assert.equal((await api.read({ pollIntervalSeconds: 5 })).hourly.usedPercent, 30)
  now += 5_000
  const stale = await api.read({ refresh: true, pollIntervalSeconds: 5 })
  assert.equal(stale.status, "stale")
  assert.equal(stale.hourly.usedPercent, 30)
  assert.equal(calls, 3)
})

test("parallel requests share a single fetch and receive the same usage", async (t) => {
  const request = deferred()
  const started = deferred()
  let calls = 0
  const api = await server(t, async () => {
    calls++
    started.resolve()
    return request.promise
  })
  const first = api.read()
  await started.promise
  const second = api.read()
  await new Promise(setImmediate)
  assert.equal(calls, 1)
  request.resolve(usageResponse(25))
  assert.equal((await first).hourly.usedPercent, 25)
  assert.equal((await second).hourly.usedPercent, 25)
})

test("simultaneous initial reads for the same account share the request", async (t) => {
  let calls = 0
  const api = await server(t, async () => {
    calls++
    return usageResponse(25)
  })
  const results = await Promise.all([api.read(), api.read()])
  assert.deepEqual(results.map((result) => result.status), ["ready", "ready"])
  assert.equal(calls, 1)
})

test("disconnect invalidates an in-flight request before reconnecting the same account", async (t) => {
  const oldRequest = deferred()
  const started = deferred()
  let calls = 0
  const api = await server(t, async () => {
    calls++
    if (calls === 1) {
      started.resolve()
      return oldRequest.promise
    }
    return usageResponse(40)
  })
  const old = api.read()
  await started.promise
  api.setAccount(null)
  assert.equal((await api.read()).status, "unavailable")
  api.setAccount("a")
  assert.equal((await api.read()).hourly.usedPercent, 40)
  oldRequest.resolve(usageResponse(20))
  assert.equal((await old).status, "unavailable")
  assert.equal((await api.read()).hourly.usedPercent, 40)
})

test("a slow credential resolution cannot replace a newer account", async (t) => {
  const oldResolution = deferred()
  const started = deferred()
  const api = await server(t, async (_url, options) => {
    return usageResponse(options.headers["ChatGPT-Account-Id"] === "a" ? 20 : 80)
  }, async (connection) => {
    if (connection.id === "a") {
      started.resolve()
      await oldResolution.promise
    }
  })

  const old = api.read()
  await started.promise
  api.setAccount("b")
  assert.equal((await api.read()).hourly.usedPercent, 80)
  oldResolution.resolve()
  assert.equal((await old).status, "unavailable")
  assert.equal((await api.read()).hourly.usedPercent, 80)
})

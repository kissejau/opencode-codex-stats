import { Plugin } from "@opencode/plugin"
import { CodexLimits } from "./rpc.ts"
import { requestIntervalSeconds } from "./polling.ts"
import { isPollDue } from "./settings.ts"
import { parseUsage, type UsageSnapshot } from "./usage.ts"

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const CACHE_MS = 90_000

export default Plugin.define({
  id: "opencode-codex-stats.server",
  async setup(ctx) {
    let cache: UsageSnapshot | undefined
    let accountKey: string | undefined
    let generation = 0
    let lastAttempt = 0
    let pending: Promise<UsageSnapshot> | undefined

    const accountChanged = () => ({ status: "unavailable" as const, message: "OpenAI account changed; refreshing limits" })
    const registration = await ctx.rpc.register(CodexLimits, {
      read: async (input) => {
        const initialGeneration = generation
        const initialAccountKey = accountKey
        const requestInput = input as { refresh?: boolean; pollIntervalSeconds?: number } | undefined
        const connection = await ctx.integration.connection.active("openai")
        if (!connection || connection.type !== "credential") {
          if (generation !== initialGeneration) return accountChanged()
          cache = undefined
          accountKey = undefined
          generation++
          return { status: "unavailable", message: "Connect OpenAI with ChatGPT OAuth in /connect" }
        }

        const credential = await ctx.integration.connection.resolve(connection).catch(() => undefined)
        if (credential?.type !== "oauth") {
          if (generation !== initialGeneration) return accountChanged()
          cache = undefined
          accountKey = undefined
          generation++
          return { status: "unavailable", message: "Connect OpenAI with ChatGPT OAuth in /connect" }
        }

        const accountID = credential.metadata?.accountID
        if (!credential.access) {
          if (generation !== initialGeneration) return accountChanged()
          cache = undefined
          accountKey = undefined
          generation++
          return { status: "unavailable", message: "OpenAI OAuth access token is unavailable; reconnect in /connect" }
        }
        if (typeof accountID !== "string" || !accountID) {
          if (generation !== initialGeneration) return accountChanged()
          cache = undefined
          accountKey = undefined
          generation++
          const methodID = credential.methodID ?? "unknown"
          const metadataKeys = Object.keys(credential.metadata ?? {}).join(", ") || "none"
          return {
            status: "unavailable",
            message: `OpenAI account ID is unavailable (OAuth method: ${methodID}; metadata: ${metadataKeys})`,
          }
        }

        const key = `${connection.id}:${accountID}`
        if (generation !== initialGeneration &&
            !(initialAccountKey === undefined && generation === initialGeneration + 1 && key === accountKey)) return accountChanged()
        if (key !== accountKey) {
          cache = undefined
          pending = undefined
          lastAttempt = 0
          accountKey = key
          generation++
        }

        const requestedGeneration = generation
        if (cache && Date.now() - cache.checkedAt < CACHE_MS && !requestInput?.refresh) {
          return { status: "ready", ...cache }
        }
        if (pending) {
          try {
            const snapshot = await pending
            return generation === requestedGeneration ? { status: "ready", ...snapshot } : accountChanged()
          } catch {
            if (generation !== requestedGeneration) return accountChanged()
            return cache
              ? { status: "stale", ...cache, message: "Could not refresh Codex limits" }
              : { status: "unavailable", message: "Could not fetch Codex limits" }
          }
        }
        const pollIntervalSeconds = requestIntervalSeconds(requestInput)
        const now = Date.now()
        if (!isPollDue(lastAttempt, now, pollIntervalSeconds)) {
          return cache
            ? { status: "stale", ...cache, message: "Waiting to retry Codex limits" }
            : { status: "unavailable", message: "Waiting to retry Codex limits" }
        }

        lastAttempt = now
        const request = (async () => {
          const response = await fetch(USAGE_URL, {
            headers: {
              Authorization: `Bearer ${credential.access}`,
              "ChatGPT-Account-Id": accountID,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(8_000),
          })
          if (!response.ok) throw new Error("Codex usage request failed")

          const snapshot = parseUsage(await response.json(), Date.now())
          if (!snapshot) throw new Error("Codex usage response had no supported windows")
          if (generation === requestedGeneration) cache = snapshot
          return snapshot
        })()
        pending = request

        try {
          const snapshot = await request
          if (generation !== requestedGeneration) return accountChanged()
          return { status: "ready", ...snapshot }
        } catch {
          if (generation !== requestedGeneration) return accountChanged()
          return cache
            ? { status: "stale", ...cache, message: "Could not refresh Codex limits" }
            : { status: "unavailable", message: "Could not fetch Codex limits" }
        } finally {
          if (pending === request) pending = undefined
        }
      },
    })

    return () => registration.dispose()
  },
})

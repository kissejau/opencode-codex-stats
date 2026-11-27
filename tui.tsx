import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { CodexLimits } from "./rpc.ts"
import { createPollScheduler } from "./polling.ts"
import { DEFAULT_SETTINGS, normalizeSettings, POLL_INTERVAL_SECONDS, type Settings } from "./settings.ts"
import {
  createRefreshController,
  formatRemaining,
  isOpenAISessionModel,
  progressBar,
  remainingPercent,
  usageTone,
  type UsageResult,
  type UsageWindow,
} from "./usage.ts"

export default Plugin.define({
  id: "opencode-codex-stats.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(CodexLimits)
    const [limits, updateLimits] = ctx.storage.memory<Omit<UsageResult, "status"> & { status: UsageResult["status"] | "loading"; now: number }>("limits", {
      initial: { status: "loading", now: Date.now() },
    })
    const [settings, updateSettings] = ctx.storage.store("codex-limits.settings", {
      initial: { ...DEFAULT_SETTINGS },
    })
    const currentSettings = () => normalizeSettings(settings)
    const refresh = createRefreshController({
      read: async (force) =>
        await rpc.read(
          { refresh: force, pollIntervalSeconds: currentSettings().pollIntervalSeconds },
          {
            location: ctx.location ?? ctx.data.location.default(),
            signal: AbortSignal.timeout(10_000),
          },
        ) as UsageResult,
      onResult: (result) => {
        updateLimits((draft) => {
          draft.status = result.status
          draft.hourly = result.hourly
          draft.weekly = result.weekly
          draft.availableResets = result.availableResets
          draft.checkedAt = result.checkedAt
          draft.message = result.message
          draft.now = Date.now()
        })
      },
      onError: () => {
        updateLimits((draft) => {
          draft.status = draft.hourly || draft.weekly ? "stale" : "unavailable"
          draft.message = "OpenCode service unavailable"
        })
      },
    })

    const poll = createPollScheduler(() => void refresh.refresh(true))
    function restartPoll(intervalSeconds = currentSettings().pollIntervalSeconds) {
      poll.restart(intervalSeconds)
    }

    async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      const previousInterval = currentSettings().pollIntervalSeconds
      await updateSettings((draft) => {
        Object.assign(draft, normalizeSettings({ ...draft, [key]: value }))
      })
      const nextInterval = currentSettings().pollIntervalSeconds
      if (nextInterval !== previousInterval) {
        restartPoll(nextInterval)
        void refresh.refresh(true)
      }
    }

    async function showCodexSettings() {
      while (true) {
        const current = currentSettings()
        const selected = await ctx.ui.dialog.select({
          title: "Codex",
          options: [
            { title: `Hourly usage: ${current.showHourly ? "On" : "Off"}`, value: "hourly" },
            { title: `Weekly usage: ${current.showWeekly ? "On" : "Off"}`, value: "weekly" },
            { title: `Percentage: ${current.showPercentage ? "On" : "Off"}`, value: "percentage" },
            { title: `Progress bar: ${current.showProgressBar ? "On" : "Off"}`, value: "progressBar" },
            { title: `Colorful: ${current.colorful ? "On" : "Off"}`, value: "colorful" },
            { title: `Reset countdown: ${current.showResetCountdown ? "On" : "Off"}`, value: "resetCountdown" },
            { title: `Reset credits: ${current.showResetCredits ? "On" : "Off"}`, value: "resetCredits" },
            { title: `Poll interval: ${current.pollIntervalSeconds}s`, value: "pollInterval" },
            { title: "Done", value: "done" },
          ],
        })
        if (!selected || selected === "done") return

        if (selected === "pollInterval") {
          const interval = await ctx.ui.dialog.select({
            title: "Usage poll interval",
            current: String(current.pollIntervalSeconds),
            options: POLL_INTERVAL_SECONDS.map((seconds) => ({
              title: `${seconds} seconds`,
              value: String(seconds),
            })),
          })
          if (interval) await saveSetting("pollIntervalSeconds", Number(interval))
          continue
        }

        if (selected === "hourly") await saveSetting("showHourly", !current.showHourly)
        if (selected === "weekly") await saveSetting("showWeekly", !current.showWeekly)
        if (selected === "percentage") await saveSetting("showPercentage", !current.showPercentage)
        if (selected === "progressBar") await saveSetting("showProgressBar", !current.showProgressBar)
        if (selected === "colorful") await saveSetting("colorful", !current.colorful)
        if (selected === "resetCountdown") await saveSetting("showResetCountdown", !current.showResetCountdown)
        if (selected === "resetCredits") await saveSetting("showResetCredits", !current.showResetCredits)
      }
    }

    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "opencode-codex-stats.settings",
        title: "Codex Stats Settings",
        group: "Codex Stats",
        palette: true,
        slash: { name: "codex-stats" },
        run: showCodexSettings,
      }],
    }))

    function UsageRow(props: { label: string; value?: UsageWindow }) {
      const current = () => currentSettings()
      const remaining = () => remainingPercent(props.value?.usedPercent ?? 0)
      const bar = () => progressBar(remaining())
      const color = () => {
        const tone = usageTone(remaining(), current().colorful)
        return tone === "normal" ? ctx.theme.text.muted : ctx.theme.text.feedback[tone].base
      }
      return (
        <box flexDirection="row" flexWrap="wrap" gap={1} rowGap={0}>
          <text fg={ctx.theme.text.muted} width={7} flexShrink={0}>{props.label}</text>
          <Show when={props.value} fallback={<text fg={ctx.theme.text.muted}>—</text>}>
            <Show when={current().showPercentage}>
              <text fg={color()} width={4} flexShrink={0}>
                {Math.round(remaining())}%
              </text>
            </Show>
            <Show when={current().showProgressBar}>
              <box flexDirection="row" flexShrink={0}>
                <Show when={bar().filled}>
                  <text fg={color()} flexShrink={0}>{bar().filled}</text>
                </Show>
                <Show when={bar().empty}>
                  <text fg={ctx.theme.text.muted} flexShrink={0}>{bar().empty}</text>
                </Show>
              </box>
            </Show>
            <Show when={current().showResetCountdown}>
              <text fg={ctx.theme.text.muted}>
                ({formatRemaining(props.value?.resetsAt, limits.now)})
              </text>
            </Show>
          </Show>
        </box>
      )
    }

    const removeSlot = ctx.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => (
        <Show when={sessionID && isOpenAISessionModel(
          ctx.data.session.get(sessionID)?.model,
          ctx.ui.model.current(),
        )}>
          <box flexDirection="column" gap={0}>
            <text fg={ctx.theme.text.base}>
              <b>Codex</b>{limits.status === "stale" ? " (stale)" : ""}
            </text>
            <Show when={currentSettings().showHourly}>
              <UsageRow label="hourly" value={limits.hourly} />
            </Show>
            <Show when={currentSettings().showWeekly}>
              <UsageRow label="weekly" value={limits.weekly} />
            </Show>
            <Show when={currentSettings().showResetCredits}>
              <box flexDirection="row" gap={1}>
                <text fg={ctx.theme.text.muted} width={7} flexShrink={0}>resets</text>
                <text fg={ctx.theme.text.muted}>{limits.availableResets ?? "—"}</text>
              </box>
            </Show>
            <Show when={(currentSettings().showHourly || currentSettings().showWeekly) && !limits.hourly && !limits.weekly}>
              <text fg={ctx.theme.text.muted}>{limits.message ?? "Loading…"}</text>
            </Show>
          </box>
        </Show>
      ),
    })
    const stopSwitch = ctx.data.on("credential.switched", (event) => {
      if (event.data.integrationID !== "openai") return
      refresh.invalidate()
      updateLimits((draft) => {
        draft.status = "loading"
        draft.hourly = undefined
        draft.weekly = undefined
        draft.availableResets = undefined
        draft.message = undefined
      })
      void refresh.refresh(true)
    })

    restartPoll()
    const clock = setInterval(() => updateLimits((draft) => { draft.now = Date.now() }), 60_000)
    void refresh.refresh()

    return () => {
      refresh.dispose()
      poll.dispose()
      clearInterval(clock)
      stopSwitch()
      removeSlot()
    }
  },
})

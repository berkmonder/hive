/** One-time copy of UI preferences saved under the old AgentRoom keys. Imported before anything reads them. */
try {
  for (const k of ['layout', 'theme', 'accent']) {
    const old = localStorage.getItem(`agentroom.${k}`)
    if (old !== null && localStorage.getItem(`hive.${k}`) === null) localStorage.setItem(`hive.${k}`, old)
  }
} catch {
  /* storage unavailable */
}
export {}

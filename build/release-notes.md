## Download

| System | File |
|---|---|
| **macOS – Apple Silicon** (M1–M4) | `Hive-<version>-mac-arm64.dmg` |
| **macOS – Intel** | `Hive-<version>-mac-x64.dmg` |
| **Windows** | `Hive-<version>-windows-setup.exe` |
| **Linux** | `Hive-<version>-linux-x86_64.AppImage` |

You also need at least one agent CLI installed and logged in – e.g. [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`) or Codex (`codex login`).

### macOS: first launch
Hive is not notarized by Apple yet. After dragging it to Applications, run once in Terminal:

```bash
xattr -cr /Applications/Hive.app
```

(or right-click Hive → **Open** → **Open**). macOS asks for microphone / screen recording access only when you use dictation or screenshots.

### Windows
SmartScreen may warn about an unknown publisher → **More info** → **Run anyway**.

## What's new in 0.2

- **Plan review** – comment, edit or remove plan steps, then approve or send back
- **Test guard** – failing tests go back to the agent automatically
- **Daily budget** with alerts and auto-pause · **overlap warnings** between branches
- **Workflows** – chain agents (PM → Dev → QA) · **Idea radar** · **Webhooks**
- **Pick elements** in the preview · **draw on screenshots**
- **Weekly report** · **session replay** · commits carry their conversation
- **Secrets** (keychain, masked in terminals) · **databases** (read-only by default)
- **SSH agents** on remote servers · **share** dev servers on a public URL
- **Türkçe** interface · the office reacts (coffee during tests, confetti on merge)

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

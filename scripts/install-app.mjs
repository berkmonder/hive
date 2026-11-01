// Builds Hive for this Mac and installs it to /Applications (or ~/Applications as a fallback).
//   npm run app
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('npm run app is for macOS. On Windows use: npm run dist:win')
  process.exit(1)
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

console.log('\n▸ Building Hive…')
run('npx electron-vite build')
// --dir = just the .app (no dmg), for this Mac's CPU only → much faster
run(`npx electron-builder --mac dir --${process.arch === 'arm64' ? 'arm64' : 'x64'}`)

const outDir = readdirSync('dist').map((d) => join('dist', d)).find((d) => existsSync(join(d, 'Hive.app')))
if (!outDir) throw new Error('Hive.app was not produced – see the output above')
const src = join(outDir, 'Hive.app')

// quit a running copy first so it can be replaced
try {
  execSync('osascript -e \'tell application "Hive" to quit\'', { stdio: 'ignore' })
} catch {
  /* not running */
}

let target = '/Applications/Hive.app'
try {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  cpSync(src, target, { recursive: true, verbatimSymlinks: true })
} catch {
  target = join(homedir(), 'Applications', 'Hive.app')
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  cpSync(src, target, { recursive: true, verbatimSymlinks: true })
}
// no Apple developer certificate: sign ad-hoc (required on Apple Silicon) and clear the quarantine flag
try {
  execSync(`codesign --force --deep --sign - "${target}"`, { stdio: 'ignore' })
} catch {
  console.warn('  (ad-hoc signing failed – the app may still open; if not run: codesign --force --deep --sign - "' + target + '")')
}
try {
  execSync(`xattr -cr "${target}"`)
} catch {
  /* ignore */
}
console.log(`\n✓ Installed ${target}\n  Open it from Launchpad / Spotlight ("Hive"), and keep it in the Dock if you like.\n`)
run(`open "${target}"`)

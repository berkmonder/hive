// electron-builder afterPack hook (signing is off): without an Apple Developer certificate the app is
// signed ad-hoc, which Apple Silicon requires for it to start at all.
const { execSync } = require('child_process')
const { join } = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' })
}

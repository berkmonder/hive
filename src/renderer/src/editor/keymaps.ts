/**
 * Optional JetBrains (IntelliJ / WebStorm / PyCharm) keymap for Monaco.
 * Bindings are registered once per editor and only active while the
 * `jetbrainsKeymap` context key is true, so switching keymaps is instant.
 */
import type * as Monaco from 'monaco-editor'

export type KeymapId = 'vscode' | 'jetbrains'

export const KEYMAP_HELP: Record<KeymapId, [string, string][]> = {
  vscode: [
    ['⌘P', 'Go to file'], ['⌘S', 'Save'], ['⌘W', 'Close tab'], ['⌘F / ⌥⌘F', 'Find / replace'],
    ['⌘D', 'Select next match'], ['⇧⌥↓', 'Copy line down'], ['⌥↑ / ⌥↓', 'Move line'], ['F2', 'Rename symbol'],
    ['F12', 'Go to definition'], ['⇧⌥F', 'Format document'], ['⌘/', 'Toggle comment'], ['F1', 'Command palette']
  ],
  jetbrains: [
    ['⇧⇧ / ⌘⇧O', 'Search files'], ['⌘E', 'Recent files'], ['⌘S', 'Save'], ['⌘W', 'Close tab'],
    ['⌘D', 'Duplicate line'], ['⌘⌫', 'Delete line'], ['⌥⇧↑ / ⌥⇧↓', 'Move line'], ['⌥↑ / ⌥↓', 'Extend / shrink selection'],
    ['⌃G', 'Add next occurrence'], ['⌘B', 'Go to declaration'], ['⌥F7', 'Find usages'], ['⇧F6', 'Rename'],
    ['⌥⌘L', 'Reformat code'], ['⌘R', 'Replace'], ['⌘L', 'Go to line'], ['⌥⏎', 'Quick fix'],
    ['⌘F12', 'File structure'], ['⌘⇧A', 'Find action'], ['⌘/', 'Comment line']
  ]
}

export function installJetBrainsKeymap(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  extra: { quickOpen: () => void; recentFiles: () => void }
): Monaco.editor.IContextKey<boolean> {
  const { KeyMod: M, KeyCode: K } = monaco
  const key = editor.createContextKey<boolean>('jetbrainsKeymap', false)
  const run = (id: string) => () => editor.trigger('jetbrains', id, null)
  const isMac = navigator.platform.toLowerCase().includes('mac')

  const bindings: [number, () => void][] = [
    [M.CtrlCmd | K.KeyD, run('editor.action.copyLinesDownAction')],
    [isMac ? M.CtrlCmd | K.Backspace : M.CtrlCmd | K.KeyY, run('editor.action.deleteLines')],
    [M.Alt | M.Shift | K.UpArrow, run('editor.action.moveLinesUpAction')],
    [M.Alt | M.Shift | K.DownArrow, run('editor.action.moveLinesDownAction')],
    [isMac ? M.Alt | K.UpArrow : M.CtrlCmd | K.KeyW, run('editor.action.smartSelect.expand')],
    [isMac ? M.Alt | K.DownArrow : M.CtrlCmd | M.Shift | K.KeyW, run('editor.action.smartSelect.shrink')],
    [isMac ? M.WinCtrl | K.KeyG : M.Alt | K.KeyJ, run('editor.action.addSelectionToNextFindMatch')],
    [M.CtrlCmd | K.KeyB, run('editor.action.revealDefinition')],
    [M.Alt | K.F7, run('editor.action.goToReferences')],
    [M.Shift | K.F6, run('editor.action.rename')],
    [M.CtrlCmd | M.Alt | K.KeyL, run('editor.action.formatDocument')],
    [M.CtrlCmd | K.KeyR, run('editor.action.startFindReplaceAction')],
    [isMac ? M.CtrlCmd | K.KeyL : M.CtrlCmd | K.KeyG, run('editor.action.gotoLine')],
    [M.Alt | K.Enter, run('editor.action.quickFix')],
    [M.CtrlCmd | K.F12, run('editor.action.quickOutline')],
    [M.CtrlCmd | M.Shift | K.KeyA, run('editor.action.quickCommand')],
    [M.CtrlCmd | M.Shift | K.KeyO, extra.quickOpen],
    [isMac ? M.CtrlCmd | K.KeyE : M.CtrlCmd | K.KeyE, extra.recentFiles],
    [M.CtrlCmd | M.Shift | K.KeyU, run('editor.action.transformToUppercase')]
  ]
  for (const [kb, fn] of bindings) editor.addCommand(kb, fn, 'jetbrainsKeymap')
  return key
}

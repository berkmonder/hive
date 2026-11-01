/** plain text for speech: drop code blocks, markdown syntax and links */
export const speakable = (s: string): string =>
  s.replace(/```[\s\S]*?```/g, ' (code) ').replace(/`([^`]+)`/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>~|-]{1,3}\s?/g, '').replace(/\s+/g, ' ').trim()

export function speak(text: string, onEnd?: () => void): void {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(speakable(text).slice(0, 4000))
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) u.lang = 'tr-TR'
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  synth.speak(u)
}

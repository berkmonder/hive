/**
 * Interface language. Components are written in English; when Türkçe is selected a small
 * DOM translator swaps known texts, placeholders and tooltips. Terminals, the editor, chat
 * messages and code are never touched.
 */
const TR: Record<string, string> = {
  // navigation & top bar
  Room: 'Oda', 'Terminal grid': 'Terminal ızgarası', 'Split view': 'Bölünmüş görünüm', 'Backlog & schedules': 'Backlog ve zamanlamalar',
  'Code editor': 'Kod editörü', 'Dev servers & preview': 'Dev sunucular ve önizleme', 'Usage & cost': 'Kullanım ve maliyet',
  'Memory, skills, MCP & processes': 'Hafıza, skill, MCP ve süreçler', Settings: 'Ayarlar', 'Settings (⌘,)': 'Ayarlar (⌘,)',
  Search: 'Ara', 'Search everything (⌘K)': 'Her yerde ara (⌘K)', Library: 'Kütüphane', 'Prompt & role library': 'Prompt ve rol kütüphanesi',
  'Stop all': 'Hepsini durdur', 'Start all': 'Hepsini başlat', 'Stop every running agent in this project': 'Bu projedeki tüm ajanları durdur',
  'Start every stopped agent in this project': 'Bu projedeki duran tüm ajanları başlat', 'Remove project from list': 'Projeyi listeden kaldır',
  'New agent': 'Yeni ajan', 'New agent (⌘N)': 'Yeni ajan (⌘N)', 'Hire a new agent': 'Yeni ajan işe al',
  'Pause project: every agent stops after its current turn – safe to close the lid': 'Projeyi duraklat: her ajan mevcut turundan sonra durur – kapağı kapatabilirsin',
  'Resume paused agents (their conversations continue)': 'Duraklatılan ajanları sürdür (konuşmaları devam eder)',
  'Keeping the Mac awake while agents work or dev servers run (Settings → Agents)': 'Ajanlar çalışırken Mac uyanık tutuluyor (Ayarlar → Ajanlar)',
  'Welcome to Hive': "Hive'a hoş geldin", 'Add a project folder': 'Proje klasörü ekle',
  'Run Claude Code, Codex and Gemini agents side by side, each in its own terminal.': 'Claude Code, Codex ve Gemini ajanlarını yan yana, her biri kendi terminalinde çalıştır.',
  'No agents in this project yet.': 'Bu projede henüz ajan yok.', 'Create the first agent': 'İlk ajanı oluştur',
  // sidebar
  Project: 'Proje', Agents: 'Ajanlar', 'Needs you': 'Seni bekliyor', 'To review': 'İncelenecek', Working: 'Çalışıyor', Inactive: 'Pasif',
  'Search agents…': 'Ajan ara…', 'By status': 'Duruma göre', 'By team': 'Takıma göre', 'No team': 'Takım yok', Leads: 'Lider',
  'Reports to': 'Bağlı olduğu', Office: 'Ofis', Desks: 'Masalar', 'OPEN SPACE': 'AÇIK ALAN', LOUNGE: 'DİNLENME', 'REVIEW ROOM': 'İNCELEME ODASI',
  // agent view
  Code: 'Kod', 'Files & changes': 'Dosyalar ve değişiklikler', 'Browse and edit this agent\'s files': 'Bu ajanın dosyalarını aç ve düzenle',
  Terminal: 'Terminal', 'Conversation view': 'Sohbet görünümü', 'Ask a side question (doesn\'t interrupt)': 'Yan soru sor (ajanı bölmez)',
  'New session': 'Yeni oturum', 'Resume last session': 'Son oturumu sürdür', Resume: 'Sürdür', Restart: 'Yeniden başlat',
  'Stop agent': 'Ajanı durdur', 'Start new session': 'Yeni oturum başlat', 'Open folder': 'Klasörü aç', More: 'Daha fazla', Close: 'Kapat',
  'Plan ready for review': 'Plan incelemeye hazır', Open: 'Aç', 'Not running': 'Çalışmıyor',
  'Loading conversation…': 'Konuşma yükleniyor…', You: 'Sen',
  // composer
  Prompts: 'Promptlar', 'Prompt library': 'Prompt kütüphanesi', Queue: 'Sıra', 'Add to queue': 'Sıraya ekle', Clear: 'Temizle',
  'Move up': 'Yukarı taşı', 'Send now': 'Şimdi gönder', Remove: 'Kaldır', 'Undo enhance': 'İyileştirmeyi geri al',
  'Attach a screenshot (⌘⇧2 works anywhere) – or paste / drop an image': 'Ekran görüntüsü ekle (⌘⇧2 her yerde çalışır) – ya da görsel yapıştır / sürükle',
  'Enhance prompt (goal, context, constraints, done when)': 'Promptu iyileştir (hedef, bağlam, kısıtlar, bitiş kriteri)',
  'Send Esc (interrupt the agent)': 'Esc gönder (ajanı durdur)', 'Send Ctrl+C': 'Ctrl+C gönder', Dictate: 'Sesle yaz', 'Stop & transcribe': 'Durdur ve yazıya çevir',
  'Give your agent a prompt or task: Enter to send, Shift+Enter for a new line': 'Ajanına bir görev ver: Enter gönderir, Shift+Enter yeni satır',
  'Agent is stopped – type a task and press Enter to start it with that task': 'Ajan durdu – bir görev yaz, Enter ile o görevle başlat',
  'Click to draw on it': 'Üzerine çizmek için tıkla', 'Use image': 'Görseli kullan', Undo: 'Geri al', 'Mark what the agent should look at': 'Ajanın bakması gereken yeri işaretle',
  // changes / review
  Changes: 'Değişiklikler', Uncommitted: 'Commitlenmemiş', 'Whole branch': 'Tüm branch', 'Uncommitted changes': 'Commitlenmemiş değişiklikler',
  'Everything on the agent\'s branch since it branched off': 'Ajanın branch’inde ayrıldığından beri yapılan her şey',
  Unified: 'Tek sütun', 'Side by side': 'Yan yana', 'Wrap long lines': 'Uzun satırları kaydır', 'Smaller text': 'Küçük yazı', 'Larger text': 'Büyük yazı',
  Refresh: 'Yenile', 'Full-screen review': 'Tam ekran inceleme', 'Back to side panel': 'Yan panele dön', 'Commit all': 'Hepsini commitle', Merge: 'Birleştir',
  'Commit first, then merge this branch into the main project.': 'Önce commitle, sonra bu branch’i ana projeye birleştir.',
  'Commit message (✨ to write it with AI)': 'Commit mesajı (✨ ile AI yazsın)', 'Working tree clean': 'Değişiklik yok', Edit: 'Düzenle',
  'Edit in Hive': "Hive'da düzenle", 'Show in Finder': "Finder'da göster", 'Discard changes': 'Değişiklikleri at', 'Previous file (↑)': 'Önceki dosya (↑)', 'Next file (↓)': 'Sonraki dosya (↓)',
  'Send back': 'Geri gönder', Approve: 'Onayla', 'Overall feedback (optional)…': 'Genel geri bildirim (isteğe bağlı)…',
  'Write the message with AI (from the real diff, Conventional Commits)': 'Mesajı AI yazsın (gerçek diff’ten, Conventional Commits)',
  'Commit history with the conversations behind them': 'Commit geçmişi ve arkasındaki konuşmalar', Commits: 'Commitler',
  'This folder is not a git repository.': 'Bu klasör bir git deposu değil.', Later: 'Sonra',
  'Send your notes to the agent (queued if it is busy)': 'Notlarını ajana gönder (meşgulse sıraya girer)',
  // board
  Backlog: 'Backlog', Schedules: 'Zamanlamalar', Workflows: "Workflow'lar", 'Idea radar': 'Fikir radarı', Webhooks: "Webhook'lar",
  Todo: 'Yapılacak', 'In progress': 'Yapılıyor', Done: 'Bitti', 'New card': 'Yeni kart', 'Add card': 'Kart ekle', 'Filter cards…': 'Kartları filtrele…',
  'Import GitHub issues': "GitHub issue'larını içe aktar", 'Edit card': 'Kartı düzenle', Title: 'Başlık', Details: 'Detaylar', Agent: 'Ajan', Column: 'Sütun',
  Save: 'Kaydet', Cancel: 'Vazgeç', Delete: 'Sil', 'What should be done?': 'Ne yapılmalı?', 'Context, acceptance criteria, links…': 'Bağlam, kabul kriterleri, linkler…',
  'Assign an agent': 'Ajan ata', 'New schedule': 'Yeni zamanlama', 'Run now': 'Şimdi çalıştır', Schedule: 'Zamanlama', Repeat: 'Tekrar', Once: 'Bir kez',
  'Every hour': 'Her saat', 'Every day': 'Her gün', Weekdays: 'Hafta içi', 'Every week': 'Her hafta', Time: 'Saat', Day: 'Gün', When: 'Ne zaman', Prompt: 'Prompt',
  'New workflow': 'Yeni workflow', Workflow: 'Workflow', 'Add step': 'Adım ekle', Run: 'Çalıştır', 'Recent runs': 'Son çalışmalar', Start: 'Başlat', Stop: 'Durdur',
  'Find themes': 'Temaları bul', Card: 'Kart', Dismiss: 'Kapat', 'New webhook': 'Yeni webhook', Webhook: 'Webhook', 'Make public': 'Herkese aç',
  // workspace
  Memory: 'Hafıza', Skills: "Skill'ler", 'MCP servers': 'MCP sunucuları', Processes: 'Süreçler', Automation: 'Otomasyon', Secrets: 'Gizli bilgiler', Databases: 'Veritabanları',
  'New skill': 'Yeni skill', 'Add server': 'Sunucu ekle', 'Add database': 'Veritabanı ekle', Query: 'Sorgu', Discard: 'Vazgeç', Add: 'Ekle',
  'Process watchdog': 'Süreç bekçisi', 'Shared MCP servers': 'Ortak MCP sunucuları', 'Project memory': 'Proje hafızası',
  'Run tests after each turn': 'Her turdan sonra testleri çalıştır', 'Test command': 'Test komutu', 'Automatic fix attempts': 'Otomatik düzeltme denemesi',
  'Limit (USD / day)': 'Limit (USD / gün)', 'Read-only (recommended)': 'Salt okunur (önerilir)', 'Available in every project': 'Her projede kullanılabilir',
  // settings
  Appearance: 'Görünüm', 'Editor & review': 'Editör ve inceleme', 'Agents & CLIs': "Ajanlar ve CLI'lar", 'Input & AI helpers': 'Girdi ve AI yardımcıları',
  Notifications: 'Bildirimler', 'About & data': 'Hakkında ve veri', 'Changes apply instantly.': 'Değişiklikler anında uygulanır.', Theme: 'Tema',
  'Accent colour': 'Vurgu rengi', Layout: 'Yerleşim', 'Interface size': 'Arayüz boyutu', 'Room style': 'Oda stili', 'Reduce motion': 'Animasyonları azalt',
  'Panel sizes': 'Panel boyutları', 'Reset panel sizes': 'Panel boyutlarını sıfırla', Language: 'Dil', Font: 'Yazı tipi', 'Font size': 'Yazı boyutu', Cursor: 'İmleç',
  'Blinking cursor': 'Yanıp sönen imleç', Scrollback: 'Geçmiş satırlar', 'Dev servers': 'Dev sunucular', 'Auto-reload preview': 'Önizlemeyi otomatik yenile',
  'Tab size': 'Sekme genişliği', Ligatures: 'Ligatürler', 'Word wrap': 'Satır kaydırma', Minimap: 'Mini harita', Keymap: 'Tuş düzeni', 'Auto save': 'Otomatik kaydet',
  'Auto save delay': 'Otomatik kaydetme gecikmesi', 'Markdown files open in': 'Markdown dosyaları şurada açılır', 'Review (Changes panel)': 'İnceleme (Değişiklikler paneli)',
  'Diff layout': 'Diff düzeni', 'Diff text size': 'Diff yazı boyutu', 'New agents': 'Yeni ajanlar', 'Default CLI': 'Varsayılan CLI', 'Git worktree isolation': 'Git worktree yalıtımı',
  'Prompts & roles': 'Promptlar ve roller', 'Open library': 'Kütüphaneyi aç', 'While agents work': 'Ajanlar çalışırken', 'Queue messages while busy': 'Meşgulken mesajları sıraya al',
  'Keep the Mac awake': "Mac'i uyanık tut", 'Pause idle agents': 'Boştaki ajanları duraklat', 'Commits & webhooks': "Commit'ler ve webhook'lar",
  'Attach the conversation to commits': "Konuşmayı commit'lere ekle", 'Webhook port': 'Webhook portu', 'AI commit messages': 'AI commit mesajları', CLIs: "CLI'lar",
  'Add CLI': 'CLI ekle', 'Save CLIs': "CLI'ları kaydet", Check: 'Kontrol et', Command: 'Komut', 'Resume args': 'Sürdürme argümanları', 'First task': 'İlk görev',
  'Voice dictation': 'Sesle yazdırma', 'OpenAI API key': 'OpenAI API anahtarı', 'Local Whisper command': 'Yerel Whisper komutu', Screenshots: 'Ekran görüntüleri',
  'Capture & attach': 'Yakala ve ekle', 'Prompt enhancer': 'Prompt iyileştirici', 'Desktop notifications': 'Masaüstü bildirimleri', 'Agent needs you': 'Ajan seni bekliyor',
  'Agent finished': 'Ajan bitirdi', 'Agent crashed / exited with an error': 'Ajan hatayla çıktı', 'Also while Hive is focused': 'Hive öndeyken de',
  'Play sound': 'Ses çal', 'Dock badge': 'Dock rozeti', 'Data folder': 'Veri klasörü', 'Interface preferences': 'Arayüz tercihleri', 'Reset all': 'Hepsini sıfırla',
  'Keyboard shortcuts': 'Klavye kısayolları', 'Reset to defaults': 'Varsayılanlara dön', 'Warm graphite (default)': 'Sıcak grafit (varsayılan)',
  'Deeper, blue-black': 'Daha koyu, mavi-siyah', 'Bright, for daylight': 'Aydınlık, gündüz için', 'Follows macOS / Windows': 'macOS / Windows’u izler',
  Dark: 'Koyu', Midnight: 'Gece yarısı', Light: 'Açık', System: 'Sistem', Never: 'Asla', Always: 'Her zaman', 'From 2nd agent': '2. ajandan itibaren', Off: 'Kapalı',
  'Read & write': 'Okuma ve yazma', 'Read only': 'Salt okunur', Auto: 'Otomatik',
  // usage
  'Weekly report': 'Haftalık rapor', Today: 'Bugün', 'Last 7 days': 'Son 7 gün', 'All time (agents)': 'Tüm zamanlar (ajanlar)', 'Time working': 'Çalışma süresi',
  'This project': 'Bu proje', 'All projects': 'Tüm projeler', 'Cost per day': 'Günlük maliyet', 'By agent': 'Ajana göre', Sessions: 'Oturumlar', Cost: 'Maliyet',
  'Cards done': 'Biten kartlar', 'Estimated cost': 'Tahmini maliyet', 'Workflow runs': 'Workflow çalışmaları', 'Most changed files': 'En çok değişen dosyalar', Copy: 'Kopyala',
  // servers
  Preview: 'Önizleme', Reload: 'Yenile', 'Open in browser': 'Tarayıcıda aç', 'Auto-reload': 'Otomatik yenile', 'Pick element': 'Öğe seç', Share: 'Paylaş',
  'Stop sharing': 'Paylaşımı durdur', 'Send element to an agent': 'Öğeyi ajana gönder', 'What should change?': 'Ne değişmeli?', Send: 'Gönder', Suggested: 'Önerilen',
  'Add a dev server': 'Dev sunucu ekle', 'No dev servers yet.': 'Henüz dev sunucu yok.',
  // context menu & misc
  'Send prompt…': 'Prompt gönder…', 'Edit…': 'Düzenle…', 'Add team member…': 'Takım üyesi ekle…', Duplicate: 'Kopyala', 'Copy path': 'Yolu kopyala',
  'Remove agent': 'Ajanı kaldır', 'Interrupt (Esc)': 'Böl (Esc)', 'Ask (side question)…': 'Yan soru sor…', 'Fork conversation': 'Konuşmayı çatalla',
  'Session replay': 'Oturum tekrarı', 'Restart in plan mode': 'Plan modunda yeniden başlat', 'Run tests now': 'Testleri şimdi çalıştır', 'Change role…': 'Rolü değiştir…',
  'Schedule a task…': 'Görev zamanla…', 'Pause after this turn': 'Bu turdan sonra duraklat', 'Change role': 'Rolü değiştir', 'Other role…': 'Başka rol…',
  'TEAM STATUS': 'EKİP DURUMU', 'Team status': 'Ekip durumu', 'On break': 'Molada', Error: 'Hata', Idle: 'Boşta',
  Name: 'Ad', Role: 'Rol', Colour: 'Renk', CLI: 'CLI', 'First task (optional)': 'İlk görev (isteğe bağlı)', 'Branch name': 'Branch adı',
  'Run on a server over SSH': 'SSH ile sunucuda çalıştır', Host: 'Sunucu', 'Folder on the server': 'Sunucudaki klasör', 'SSH host (optional)': 'SSH sunucusu (isteğe bağlı)',
  'Create & start': 'Oluştur ve başlat', 'Edit agent': 'Ajanı düzenle', Workspace: 'Çalışma alanı', 'Loading…': 'Yükleniyor…'
}

const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) need input$/, (_, n) => `${n} seni bekliyor`],
  [/^Turn (\d+) \/ (\d+)$/, (_, a, b) => `Tur ${a} / ${b}`],
  [/^Updated (.+)$/, (_, t) => `Güncellendi ${t}`],
  [/^(.+) · (Inactive|Needs you|Working|To review|Done|Error)$/, (_, a, s) => `${a} · ${({ Inactive: 'Pasif', 'Needs you': 'Seni bekliyor', Working: 'Çalışıyor', 'To review': 'İncelenecek', Done: 'Bitti', Error: 'Hata' } as Record<string, string>)[s]}`],
  [/^(.+) today$/, (_, c) => `${c} bugün`],
  [/^(.+)['’]s team$/i, (_, n) => `${n} ekibi`],
  [/^\+ New agent$/, () => '+ Yeni ajan'],
  [/^(\d+) overlaps?$/, (_, n) => `${n} çakışma`]
]

const SKIP = '.xterm, .monaco-editor, .md-body, .chat-body, pre, code, .terminal, .mono, textarea, .kc-title, .kc-body, .o-thought, .pal-label, .tree-item, .tab'
const done = new WeakMap<Node, string>()

function tr(s: string): string | null {
  const key = s.trim()
  if (!key) return null
  const hit = TR[key]
  if (hit) return s.replace(key, hit)
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re)
    if (m) return s.replace(key, fn(...m))
  }
  return null
}

function translate(root: Node): void {
  const walk = (n: Node): void => {
    if (n.nodeType === 3) {
      const p = n.parentElement
      if (!p || p.closest(SKIP)) return
      const v = n.nodeValue ?? ''
      if (done.get(n) === v) return
      const t = tr(v)
      if (t && t !== v) {
        n.nodeValue = t
        done.set(n, t)
      }
      return
    }
    if (n.nodeType !== 1) return
    const el = n as Element
    if (el.matches?.('.xterm, .monaco-editor, pre, code, .md-body, .chat-body')) return
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute(a)
      if (v) {
        const t = tr(v)
        if (t && t !== v) el.setAttribute(a, t)
      }
    }
    el.childNodes.forEach(walk)
  }
  walk(root)
}

let observer: MutationObserver | null = null
export function setLanguage(lang: 'en' | 'tr'): void {
  document.documentElement.lang = lang
  observer?.disconnect()
  observer = null
  if (lang !== 'tr') return
  translate(document.body)
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translate(m.target)
      else if (m.type === 'attributes') translate(m.target)
      else m.addedNodes.forEach(translate)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] })
}

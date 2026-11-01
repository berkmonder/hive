/**
 * Voice dictation: records the microphone, converts to 16 kHz mono WAV (what Whisper
 * models expect) and asks the main process to transcribe it.
 */
export class Recorder {
  private rec?: MediaRecorder
  private chunks: Blob[] = []
  private stream?: MediaStream
  /** 0..1 input level for a little meter */
  level = 0
  private raf = 0

  async start(onLevel?: (v: number) => void): Promise<void> {
    if (!(await window.api.media.micAccess())) throw new Error('Microphone access is off – System Settings → Privacy & Security → Microphone → Hive')
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    this.chunks = []
    this.rec = new MediaRecorder(this.stream)
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(250)
    if (onLevel) {
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(this.stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const tick = (): void => {
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        this.level = Math.min(1, peak / 64)
        onLevel(this.level)
        if (this.rec?.state === 'recording') this.raf = requestAnimationFrame(tick)
        else ctx.close()
      }
      tick()
    }
  }

  /** Stop and return the transcription. */
  async stop(): Promise<string> {
    const rec = this.rec
    if (!rec) return ''
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.stop()
    await done
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((t) => t.stop())
    const blob = new Blob(this.chunks, { type: rec.mimeType })
    if (blob.size < 2000) return ''
    const wav = await toWav16k(await blob.arrayBuffer())
    return window.api.media.transcribe(new Uint8Array(wav))
  }

  cancel(): void {
    try {
      this.rec?.stop()
    } catch {
      /* ignore */
    }
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((t) => t.stop())
  }
}

async function toWav16k(data: ArrayBuffer): Promise<ArrayBuffer> {
  const decoded = await new AudioContext().decodeAudioData(data)
  const rate = 16000
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const pcm = (await off.startRendering()).getChannelData(0)
  const out = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(out)
  const str = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  return out
}

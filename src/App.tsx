import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Status = 'idle' | 'running' | 'paused' | 'done'
const QUICK_OPTIONS = [5, 10, 20, 40]

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function createAudioContext() {
  const AudioContextClass = window.AudioContext || (window as AudioContextWindow).webkitAudioContext
  return AudioContextClass ? new AudioContextClass() : null
}

function playChime(context: AudioContext) {
  const now = context.currentTime
  const bellDuration = 0.52
  const secondBellAt = 0.48

  const scheduleBell = (start: number, frequency: number, volume: number) => {
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, start)
    master.gain.exponentialRampToValueAtTime(volume, start + 0.014)
    master.gain.exponentialRampToValueAtTime(0.0001, start + bellDuration)
    master.connect(context.destination)

    // Fundamental plus two quiet partials gives each tone a clear electronic-bell shimmer.
    ;[
      { multiplier: 1, level: 0.78 },
      { multiplier: 2, level: 0.22 },
      { multiplier: 3, level: 0.08 },
    ].forEach(({ multiplier, level }) => {
      const oscillator = context.createOscillator()
      const partialGain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency * multiplier, start)
      partialGain.gain.value = level
      oscillator.connect(partialGain).connect(master)
      oscillator.start(start)
      oscillator.stop(start + bellDuration)
    })
  }

  // High, bright “ding”, followed by a lower “dong” after a short audible gap.
  scheduleBell(now, 1320, 0.30)
  scheduleBell(now + secondBellAt, 880, 0.32)
  window.setTimeout(() => void context.close(), 1250)
}

export default function App() {
  const [duration, setDuration] = useState(10 * 60)
  const [remaining, setRemaining] = useState(10 * 60)
  const [status, setStatus] = useState<Status>('idle')
  const [customMinutes, setCustomMinutes] = useState('')
  const endAt = useRef<number | null>(null)
  const played = useRef(false)
  const audioContext = useRef<AudioContext | null>(null)

  const unlockAudio = useCallback(() => {
    if (audioContext.current?.state === 'closed') audioContext.current = null
    audioContext.current ??= createAudioContext()
    if (audioContext.current?.state === 'suspended') return audioContext.current.resume()
    return Promise.resolve()
  }, [])

  const selectDuration = useCallback((minutes: number) => {
    const seconds = Math.max(1, Math.round(minutes * 60))
    setDuration(seconds); setRemaining(seconds); setStatus('idle'); endAt.current = null; played.current = false
  }, [])

  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt.current! - Date.now()) / 1000))
      setRemaining(next)
      if (next <= 0 && !played.current) {
        played.current = true
        setStatus('done')
        const context = audioContext.current
        if (context?.state === 'running') playChime(context)
        else if (context) void context.resume().then(() => {
          if (context.state === 'running') playChime(context)
        })
      }
    }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [status])

  const start = () => {
    void unlockAudio()
    endAt.current = Date.now() + remaining * 1000
    setStatus('running')
  }
  const pause = () => { if (endAt.current) setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))); endAt.current = null; setStatus('paused') }
  const reset = () => { setRemaining(duration); setStatus('idle'); endAt.current = null; played.current = false }
  const progress = useMemo(() => duration ? remaining / duration : 0, [duration, remaining])
  const dashOffset = 552.92 * (1 - progress)

  return <main className="app-shell">
    <section className="timer-card" aria-label="极简番茄钟">
      <header><span className="eyebrow">FOCUS TIMER</span><h1>专注一下</h1><p className="status">{status === 'idle' ? '准备开始' : status === 'running' ? '专注进行中' : status === 'paused' ? '已暂停' : '时间到'}</p></header>
      <div className="dial" aria-live="polite">
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="track" cx="100" cy="100" r="88" /><circle className="progress" cx="100" cy="100" r="88" style={{ strokeDashoffset: dashOffset }} /></svg>
        <div className="time">{formatTime(remaining)}</div>
      </div>
      <div className="quick-options">{QUICK_OPTIONS.map(minutes => <button className={duration === minutes * 60 ? 'quick active' : 'quick'} key={minutes} onClick={() => selectDuration(minutes)}>{minutes}<small>分钟</small></button>)}</div>
      <form className="custom-form" onSubmit={e => { e.preventDefault(); const value = Number(customMinutes); if (Number.isFinite(value) && value > 0 && value <= 999) selectDuration(value) }}><input inputMode="numeric" pattern="[0-9]*" placeholder="自定义分钟" value={customMinutes} onChange={e => setCustomMinutes(e.target.value)} aria-label="自定义分钟" /><button type="submit">设置</button></form>
      <div className="controls"><button className="primary" onClick={status === 'running' ? pause : start} disabled={status === 'done' && remaining === 0}>{status === 'running' ? '暂停' : status === 'paused' ? '继续' : '开始'}</button><button className="secondary" onClick={reset}>重置</button></div>
      <p className="note">选择时长后不会自动开始</p>
    </section>
  </main>
}

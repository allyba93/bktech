import { useRef, useCallback } from 'react'

function playErrorBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
  } catch (_) {
    // Audio not available — silent fail
  }
}

export function useModalShake() {
  const ref = useRef<HTMLDivElement>(null)

  const shake = useCallback(() => {
    playErrorBeep()
    const el = ref.current
    if (!el) return
    el.classList.remove('modal-shake')
    // Force reflow so animation restarts if triggered twice quickly
    void el.offsetWidth
    el.classList.add('modal-shake')
    el.addEventListener('animationend', () => el.classList.remove('modal-shake'), { once: true })
  }, [])

  return { ref, shake }
}

import { useSyncExternalStore } from "react"
import type { RepeatMode, Track } from "@/lib/types"

const STORAGE_KEY = "vitrail_v1_state"

export type PlayerState = {
  queue: Track[]
  index: number
  playing: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  loading: boolean
  error: string | null
  contextLabel: string | null
}

const initialState: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  time: 0,
  duration: 0,
  volume: 0.9,
  muted: false,
  shuffle: false,
  repeat: "off",
  loading: false,
  error: null,
  contextLabel: null,
}

type Persisted = {
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  queue: Track[]
  index: number
}

class PlayerEngine {
  private state: PlayerState = initialState
  private listeners = new Set<() => void>()
  private audio: HTMLAudioElement | null = null
  private history: number[] = []

  constructor() {
    this.restore()
    if (typeof window !== "undefined") {
      ;(window as unknown as { __vitrailAudio?: HTMLAudioElement }).__vitrailAudio = this.element()
    }
  }

  // --- abonnement React -------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PlayerState => this.state

  private emit(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private persist(): void {
    const data: Persisted = {
      volume: this.state.volume,
      shuffle: this.state.shuffle,
      repeat: this.state.repeat,
      queue: this.state.queue,
      index: this.state.index,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as Partial<Persisted>
      this.state = {
        ...this.state,
        volume: typeof data.volume === "number" ? data.volume : 0.9,
        shuffle: Boolean(data.shuffle),
        repeat: data.repeat === "all" || data.repeat === "one" ? data.repeat : "off",
        queue: Array.isArray(data.queue) ? data.queue : [],
        index: typeof data.index === "number" ? data.index : -1,
      }
    } catch {
      /* ignore */
    }
  }

  // --- élément audio ----------------------------------------------------
  private element(): HTMLAudioElement {
    if (this.audio) return this.audio
    const audio = new Audio()
    audio.preload = "metadata"
    audio.volume = this.state.volume

    audio.addEventListener("play", () => this.emit({ playing: true, error: null }))
    audio.addEventListener("pause", () => this.emit({ playing: false }))
    audio.addEventListener("waiting", () => this.emit({ loading: true }))
    audio.addEventListener("playing", () => this.emit({ loading: false, error: null }))
    audio.addEventListener("canplay", () => this.emit({ loading: false }))
    audio.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      this.emit({ duration, loading: false })
    })
    audio.addEventListener("durationchange", () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      this.emit({ duration })
    })
    audio.addEventListener("timeupdate", () => this.emit({ time: audio.currentTime, loading: false }))
    audio.addEventListener("ended", () => this.handleEnded())
    audio.addEventListener("error", () => {
      const code = audio.error?.code
      // Firefox laisse parfois un MEDIA_ERR_DECODE fantôme alors que la
      // lecture continue (readyState >= 2). On ne l'affiche que si le média
      // est réellement inutilisable.
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.emit({ loading: false })
        return
      }
      this.emit({
        playing: false,
        loading: false,
        error: code === 4 ? "Morceau indisponible" : "Lecture impossible",
      })
    })

    this.audio = audio
    return audio
  }

  private current(): Track | null {
    return this.state.queue[this.state.index] ?? null
  }

  private startPlayback(): void {
    const audio = this.element()
    const promise = audio.play()
    if (promise) {
      promise.catch(error => {
        this.emit({
          playing: false,
          loading: false,
          error: error instanceof Error && error.name === "NotAllowedError" ? null : "Lecture impossible",
        })
      })
    }
  }

  private loadCurrent(autoplay: boolean): void {
    const track = this.current()
    const audio = this.element()
    if (!track) {
      audio.pause()
      audio.removeAttribute("src")
      this.emit({ playing: false, time: 0, duration: 0, error: null })
      return
    }
    if (audio.src !== track.audio) {
      audio.src = track.audio
      audio.load()
      this.emit({ time: 0, duration: track.durationSec ?? 0, error: null, loading: true })
    }
    if (autoplay) this.startPlayback()
    else this.emit({ playing: false })
  }

  private handleEnded(): void {
    if (this.state.repeat === "one") {
      const audio = this.element()
      audio.currentTime = 0
      this.startPlayback()
      return
    }
    this.next(true)
  }

  // --- API publique -----------------------------------------------------
  playQueue(tracks: Track[], startIndex = 0, contextLabel?: string): void {
    if (tracks.length === 0) return
    const safeIndex = Math.min(Math.max(startIndex, 0), tracks.length - 1)
    this.history = []
    this.emit({
      queue: tracks,
      index: safeIndex,
      contextLabel: contextLabel ?? null,
      time: 0,
      error: null,
    })
    this.persist()
    this.loadCurrent(true)
  }

  playTrack(track: Track, context?: Track[]): void {
    const queue = context ?? this.state.queue
    const found = queue.findIndex(item => item.id === track.id)
    if (found >= 0) {
      this.emit({ queue, index: found, contextLabel: this.state.contextLabel, error: null })
      this.persist()
      this.loadCurrent(true)
      return
    }
    this.playQueue([track, ...this.state.queue.filter(item => item.id !== track.id)], 0, this.state.contextLabel ?? undefined)
  }

  toggle(): void {
    const audio = this.element()
    if (!this.current()) {
      const first = this.state.queue[0]
      if (!first) return
      this.emit({ index: 0 })
      this.loadCurrent(true)
      return
    }
    if (audio.paused) this.startPlayback()
    else audio.pause()
  }

  next(auto = false): void {
    const { queue, index } = this.state
    if (queue.length === 0) return

    if (this.state.shuffle && queue.length > 1) {
      this.history.push(index)
      let candidate = index
      while (candidate === index) candidate = Math.floor(Math.random() * queue.length)
      this.emit({ index: candidate })
      this.persist()
      this.loadCurrent(true)
      return
    }

    const last = index >= queue.length - 1
    if (last) {
      if (this.state.repeat === "all") {
        this.emit({ index: 0 })
        this.persist()
        this.loadCurrent(true)
        return
      }
      if (auto) {
        this.element().pause()
        this.emit({ playing: false, time: 0 })
        return
      }
      this.emit({ index: 0 })
      this.persist()
      this.loadCurrent(true)
      return
    }

    this.emit({ index: index + 1 })
    this.persist()
    this.loadCurrent(true)
  }

  prev(): void {
    const audio = this.element()
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    if (this.state.shuffle && this.history.length > 0) {
      const previous = this.history.pop()
      if (previous !== undefined) {
        this.emit({ index: previous })
        this.persist()
        this.loadCurrent(true)
        return
      }
    }
    const { index } = this.state
    if (index <= 0) {
      audio.currentTime = 0
      return
    }
    this.emit({ index: index - 1 })
    this.persist()
    this.loadCurrent(true)
  }

  seek(seconds: number): void {
    const audio = this.element()
    const clamped = Math.max(0, Math.min(seconds, audio.duration || seconds))
    audio.currentTime = clamped
    this.emit({ time: clamped })
  }

  setVolume(value: number): void {
    const volume = Math.max(0, Math.min(1, value))
    const audio = this.element()
    audio.volume = volume
    audio.muted = false
    this.emit({ volume, muted: false })
    this.persist()
  }

  toggleMute(): void {
    const audio = this.element()
    audio.muted = !audio.muted
    this.emit({ muted: audio.muted })
  }

  toggleShuffle(): void {
    this.emit({ shuffle: !this.state.shuffle })
    this.persist()
  }

  cycleRepeat(): void {
    const order: RepeatMode[] = ["off", "all", "one"]
    const position = order.indexOf(this.state.repeat)
    const nextMode = order[(position + 1) % order.length] ?? "off"
    this.emit({ repeat: nextMode })
    this.persist()
  }

  enqueue(track: Track): void {
    if (this.state.queue.some(item => item.id === track.id)) return
    this.emit({ queue: [...this.state.queue, track] })
    this.persist()
  }

  playNext(track: Track): void {
    const queue = [...this.state.queue]
    const existing = queue.findIndex(item => item.id === track.id)
    if (existing >= 0) queue.splice(existing, 1)
    const insertAt = Math.max(this.state.index, 0) + 1
    queue.splice(insertAt, 0, track)
    this.emit({ queue })
    this.persist()
  }

  jumpTo(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return
    this.emit({ index })
    this.persist()
    this.loadCurrent(true)
  }

  removeAt(index: number): void {
    const queue = [...this.state.queue]
    if (index < 0 || index >= queue.length) return
    const wasCurrent = index === this.state.index
    queue.splice(index, 1)
    const nextIndex = wasCurrent ? Math.min(this.state.index, queue.length - 1) : this.state.index > index ? this.state.index - 1 : this.state.index
    this.emit({ queue, index: nextIndex })
    this.persist()
    if (wasCurrent) this.loadCurrent(this.state.playing)
  }

  clearQueue(): void {
    this.element().pause()
    this.emit({ queue: [], index: -1, playing: false, time: 0, duration: 0, contextLabel: null })
    this.persist()
  }
}

export const player = new PlayerEngine()

export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot)
}

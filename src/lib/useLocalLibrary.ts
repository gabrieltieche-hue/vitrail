import { useCallback, useEffect, useRef, useState } from "react"
import { player } from "@/audio/player"
import {
  clearRecords,
  deleteRecord,
  importFiles,
  listRecords,
  recordToTrack,
  storageEstimate,
} from "@/lib/localLibrary"
import type { LocalRecord } from "@/lib/localLibrary"
import type { Track } from "@/lib/types"

type State = {
  loading: boolean
  importing: boolean
  tracks: Track[]
  records: LocalRecord[]
  usage: number
  quota: number
  error: string | null
}

const initial: State = {
  loading: true,
  importing: false,
  tracks: [],
  records: [],
  usage: 0,
  quota: 0,
  error: null,
}

export function useLocalLibrary() {
  const [state, setState] = useState<State>(initial)
  const objectUrls = useRef<string[]>([])

  const revokeUrls = useCallback(() => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url)
    objectUrls.current = []
  }, [])

  const refresh = useCallback(async () => {
    try {
      const records = await listRecords()
      revokeUrls()
      const tracks = records.map(record => {
        const audioUrl = URL.createObjectURL(record.blob)
        objectUrls.current.push(audioUrl)
        let artworkUrl: string | null = null
        if (record.artwork) {
          artworkUrl = URL.createObjectURL(record.artwork)
          objectUrls.current.push(artworkUrl)
        }
        return recordToTrack(record, audioUrl, artworkUrl)
      })
      // Les URL blob: de la file doivent être rafraîchies après un rechargement.
      player.syncLocalTracks(tracks)
      const estimate = await storageEstimate()
      setState({
        loading: false,
        importing: false,
        tracks,
        records,
        usage: estimate?.usage ?? 0,
        quota: estimate?.quota ?? 0,
        error: null,
      })
    } catch (error) {
      setState(current => ({
        ...current,
        loading: false,
        importing: false,
        error: error instanceof Error ? error.message : "IndexedDB indisponible",
      }))
    }
  }, [revokeUrls])

  useEffect(() => {
    void refresh()
    return () => revokeUrls()
  }, [refresh, revokeUrls])

  const addFiles = useCallback(
    async (files: File[]) => {
      setState(current => ({ ...current, importing: true }))
      try {
        await importFiles(files)
        await refresh()
      } catch (error) {
        setState(current => ({
          ...current,
          importing: false,
          error: error instanceof Error ? error.message : "import impossible",
        }))
      }
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteRecord(id)
      await refresh()
    },
    [refresh],
  )

  const clear = useCallback(async () => {
    await clearRecords()
    await refresh()
  }, [refresh])

  return { ...state, addFiles, remove, clear, refresh }
}

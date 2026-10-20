import { describe, expect, it } from "vitest"
import { metadataVariants, scoreMatch, similarity, stripVersionNumbers } from "@/lib/matching"

describe("normalisation des métadonnées", () => {
  it("isole le vrai titre d'un titre préfixé par l'artiste", () => {
    const variants = metadataVariants({
      title: "GIMS & La Mano 1.9 - PARISIENNE (Clip officiel)",
      artist: "GIMS",
    })
    const titles = variants.map(v => v.title)
    expect(titles).toContain("PARISIENNE")
    expect(titles.some(t => t.includes("Clip officiel"))).toBe(true)
  })

  it("retire les numéros de version du nom de l'artiste", () => {
    expect(stripVersionNumbers("GIMS & La Mano 1.9")).toBe("GIMS & La Mano")
  })

  it("ignore la casse, les accents et la ponctuation", () => {
    expect(similarity("PARISIENNE", "parisienne")).toBeGreaterThan(0.9)
    expect(similarity("Ça va", "ca va")).toBeGreaterThan(0.9)
  })

  it("distingue deux morceaux différents", () => {
    expect(similarity("PARISIENNE", "MAMMA")).toBeLessThan(0.3)
  })
})

describe("score de correspondance", () => {
  const target = {
    title: "GIMS & La Mano 1.9 - PARISIENNE (Clip officiel)",
    artist: "GIMS",
    durationSec: 190,
  }

  it("retient la bonne correspondance malgré des balises sales", () => {
    const variants = metadataVariants({
      title: "GIMS & La Mano 1.9 - PARISIENNE (Clip officiel)",
      artist: "GIMS",
    })
    const good = scoreMatch(
      { title: "PARISIENNE", artist: "GIMS & La Mano", duration: 190 },
      {
        title: variants.map(v => v.title),
        artist: variants.map(v => v.artist),
        durationSec: 190,
      },
    )
    const bad = scoreMatch(
      { title: "MAMMA", artist: "GIMS", duration: 190 },
      {
        title: variants.map(v => v.title),
        artist: variants.map(v => v.artist),
        durationSec: 190,
      },
    )
    expect(good.titleSim).toBeGreaterThan(0.9)
    expect(good.score).toBeGreaterThan(bad.score)
  })

  it("pénalise un écart de durée", () => {
    const near = scoreMatch(
      { title: "PARISIENNE", artist: "GIMS & La Mano", duration: 191 },
      target,
    )
    const far = scoreMatch(
      { title: "PARISIENNE", artist: "GIMS & La Mano", duration: 400 },
      target,
    )
    expect(near.score).toBeGreaterThan(far.score)
  })
})

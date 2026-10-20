# AGENTS.md — Vitrail

> Contexte complet pour le prochain agent IA qui reprend le projet.
> Langue de travail : **français** (UI, code commenté, réponses).
> Dernière mise à jour : **2026-10-20** (v0.3).

---

## 0. Origine du projet

Projet né d'un entretien produit (`grill-me`) le 2026-10-20. Décisions
arbitrées **avec** l'utilisateur, pas déduites :

- App de musique **pour la famille** (2 à 3 personnes).
- Direction artistique **« verre et lumière »**, declined en **thème clair et
  sombre**.
- **Pas de Spotify** (décision du 2026-10-20, v0.3) : l'utilisateur importe
  tous ses morceaux. L'app est un lecteur local + service de famille.
- **Paroles pour tout morceau importé**, synchronisées — c'est l'exigence
  numéro un, formulée explicitement.
- **Capsules d'écoute** et **file de la famille** : les deux autres piliers.

### Hors périmètre, définitivement

- YouTube, ripping, contournement de pub, toute source non autorisée.
- Apple Music (99 €/an de développeur) et tout service de streaming distant.
- Recommandations algorithmiques tierces (fermées par Spotify en 2024).

---

## 1. Architecture

```
src/                       application statique (Vercel)
  audio/player.ts          moteur de lecture + file + persistance
  components/              Backdrop, Artwork, NowPlaying, Lyrics, Queue,
                           Library, LocalLibrary, Capsules, FamilyQueue,
                           MiniPlayer, ProgressBar, ThemeToggle
  lib/
    demoCatalog.ts         53 morceaux libres (généré)
    lyrics.ts              client LRCLIB + appariement
    matching.ts            normalisation des balises + score de correspondance
    lyricsIndex.ts         index des morceaux ayant des paroles (généré)
    lrc.ts                 parseur LRC (ligne + mot à mot)
    id3.ts                 balises ID3v2 (titre, pochette APIC, paroles USLT)
    localLibrary.ts        IndexedDB : import des fichiers personnels
    family.ts              client du service local
    history.ts             historique d'écoute (base des capsules)
    theme.ts               thème clair / sombre
    useLyrics.ts           moteur de paroles (cascade à 3 étages)
server/                    service local (tourne sur la tablette)
  server.js                transcription, bibliothèque partagée, file, stats
  service.sh               start / stop / restart / status
  supervise.sh             relance le service s'il tombe
```

- **Aucun serveur distant.** L'app est 100 % statique.
- Persistances : `vitrail_v1_state` (file), `vitrail_history_v1` (écoute),
  `vitrail_lyrics_v2` (paroles LRCLIB), `vitrail_transcripts_v1`
  (transcriptions), `vitrail_theme_v1` (thème), IndexedDB `vitrail-local`
  (fichiers importés).

---

## 2. Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | http://127.0.0.1:5199 |
| `npm run typecheck` | `tsc --noEmit` (strict + `exactOptionalPropertyTypes`) |
| `npm run test` | vitest (appariement des métadonnées) |
| `npm run build` | `dist/` |
| `bash server/service.sh restart` | service local (port 8099) |

**Gate** : `typecheck` → `test` → `build` → captures → **lecture des PNG**.

---

## 3. Pièges rencontrés (ne pas les re-découvrir)

1. **Cascade Tailwind.** Les styles maison hors `@layer` écrasent les
   utilitaires (`button { color: inherit }` battait `text-ink-950`).
   → Tout CSS maison est dans `@layer base` ou `@layer components`.
2. **Grille et débordement.** `md:grid-cols-2` sans
   `grid-rows-[minmax(0,1fr)]` → les paroles débordent de l'écran.
3. **whisper.cpp dégrade les fichiers longs.** Le contexte glissant de 30 s
   se contamine dès le premier jeton `[Musique]` : seul le premier quart est
   transcrit. **Découper en blocs de 28 s avec 2 s de chevauchement.**
4. **`-sns` décale les horodatages.** Supprimer le jeton non vocal chez
   whisper décale les mots suivants. Filtrer côté serveur, pas dans l'outil.
5. **VAD écrase la fin des segments.** `--vad` donne de bons début de phrase
   mais tous les mots de queue partagent le même horodatage. Sans VAD.
6. **`pkill -f` tue le shell appelant** si le motif contient le nom du
   script. Filtrer sur `/proc/<pid>/cmdline`, exclure `$$` et `$PPID`.
7. **Service local en CommonJS.** Le `package.json` de l'app impose
   `"type": "module"` → `server/package.json` avec `"type": "commonjs"`.
8. **Le service doit vivre dans la session proot** : `--kill-on-exit` tue
   tout ce qui sort du groupe. D'où `server/supervise.sh`, lancé par
   `/root/oc-session.sh`.
9. **Firefox et `backdrop-filter`** : le verre dépoli laisse transparaître
   le contenu. Les panneaux posés sur du contenu (dock) sont opaques
   (`.dock-panel`).
10. **Mixed content** : une page HTTPS ne peut pas appeler une API HTTP
    locale — Firefox bloque la requête. C'est pourquoi le service local sert
    l'application elle-même : même origine, tout fonctionne. Depuis Vercel,
    seules les fonctions purement distantes (LRCLIB) marchent.
11. **Autoplay headless** : un clic Selenium scripté n'est pas un geste
    utilisateur → `media.autoplay.default = 0` dans les tests.
12. **archive.org répond 500 par intermittence** → le lecteur réessaie
    3 fois avec un paramètre anti-cache.
13. **`read -a` sur `/proc/<pid>/cmdline`** renvoie 1 en fin de fichier : un
    `|| continue` ecarte alors *tous* les processus. Filtrer avec
    `/proc/<pid>/exe` et `tr`.

---

## 4. Vérification

```bash
python3.13 scripts/acceptance.py [url]   # UI, import, lecture, paroles, capsules, file
python3.13 scripts/test-capsules.py       # historique + rendu des capsules
python3.13 scripts/test-paroles.py        # morceau sans paroles intégrées
python3.13 scripts/test-theme.py          # thèmes clair et sombre
python3.13 scripts/visual-check.py tablette
```

Les PNG atterrissent dans `/tmp/opencode/`. **Il faut les lire** avec l'outil
`read` avant d'affirmer quoi que ce soit sur le rendu.

---

## 5. Secrets

Aucun secret dans ce dépôt. Le `Client ID` Spotify (si l'app y revient)
viendra dans `/root/.config/vitrail/`, hors dépôt.

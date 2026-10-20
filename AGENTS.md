# AGENTS.md — Vitrail

> Contexte complet pour le prochain agent IA qui reprend le projet.
> Langue de travail : **français** (UI, code commenté, réponses).
> Dernière mise à jour : **2026-10-20**.

---

## 0. Origine du projet

Projet né d'un entretien produit (`grill-me`) du 2026-10-20. Les décisions ci-dessous
ont été **arbitrées avec l'utilisateur**, pas déduites :

- App **de musique pour la famille** (2 à 3 personnes), pas un clone de Spotify :
  une couche d'expérience (design, paroles, capsules) au-dessus d'un service de flux.
- **Direction artistique « verre et lumière »** : verre dépoli, transparence, la
  pochette et ses couleurs sont la source de lumière de l'interface.
- **Spotify = moteur du son** (et non Apple Music : 99 €/an de développeur).
- **Paroles synchronisées plein écran** = pilier nº 1.
- **File d'attente famille** = pilier nº 2, via playlist collaborative Spotify.
- **Capsules et statistiques d'écoute** = pilier nº 3.
- **v1 = lecteur + capsules.** La file famille arrive en v2 (non testable avant
  l'abonnement).

### Ce qui est hors périmètre, définitivement

- Télécharger depuis YouTube, contourner les pubs, toute source non autorisée.
- Apple Music (coût développeur 99 €/an), et plus généralement tout service qui
  impose un abonnement développeur.
- Recommandations algorithmiques Spotify, BPM, artistes similaires : **fermés aux
  apps tierces** depuis 2024.

---

## 1. État actuel

v0.1 — lecteur fonctionnel en mode démonstration.

- `src/audio/player.ts` : moteur de lecture (HTMLAudioElement), file, shuffle,
  repeat, persistance `localStorage` (clé `vitrail_v1_state`).
- `src/lib/demoCatalog.ts` : **53 morceaux** Josh Woodward (CC BY 4.0), audio
  streamé depuis archive.org. **Fichier généré**, ne pas éditer à la main.
- `src/lib/lyrics.ts` : client LRCLIB + cache 30 jours (`vitrail_lyrics_v1`).
- `src/lib/lrc.ts` : parseur LRC (ligne + mot à mot).
- `src/lib/id3.ts` : lecture des balises ID3v2 (titre, artiste, album,
  pochette APIC, paroles USLT) + repli sur le nom de fichier.
- `src/lib/localLibrary.ts` : IndexedDB — import des fichiers personnels.
- `src/lib/useLocalLibrary.ts` : hook de la bibliothèque personnelle.
- `src/lib/lyricsIndex.ts` : index des morceaux ayant des paroles. **Généré**.
- `src/components/` : `NowPlaying`, `Lyrics`, `Library`, `LocalLibrary`,
  `Queue`, `MiniPlayer`, `Artwork`, `Backdrop`, `ProgressBar`.

### Bibliothèque personnelle

Import de fichiers dans IndexedDB (bouton « Importer des fichiers ») ou lecture
d'un dossier en place (bouton « Choisir un dossier », File System Access API,
Chrome uniquement). Titre, artiste, album, pochette et paroles sont lus dans
les balises du fichier.

Vérification : `python3.13 scripts/test-local-import.py` (importe
`/mnt/sdcard/Download/Mirage.mp3`, vérifie la lecture et l'affichage des
paroles intégrées).

### Régénérer les fichiers générés

```bash
python3.13 scripts/build-lyrics-index.py
```

Le catalogue de démo est reconstruit par un script similaire (les métadonnées
archive.org sont dans `/tmp/jw-meta.json` — **à re-fetcher si absent**).

---

## 2. Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | http://127.0.0.1:5199 |
| `npm run typecheck` | `tsc --noEmit` (strict + `exactOptionalPropertyTypes`) |
| `npm run build` | `dist/` |
| `npm run preview` | http://127.0.0.1:4199 |
| `python3.13 scripts/visual-check.py tablette` | captures Firefox (voir §4) |

**Gate** : `typecheck` → `build` → capture visuelle → lecture des PNG.

---

## 3. Pièges rencontrés (ne pas les re-découvrir)

1. **Cascade Tailwind.** Mes styles maison étaient hors `@layer`, donc
   `button { color: inherit }` **écrasait** les utilitaires `text-ink-950`.
   Tout CSS maison doit être dans `@layer base` ou `@layer components`.
   → Symptôme : texte blanc sur fond blanc.
2. **Grille et débordement.** Une grille `md:grid-cols-2` sans
   `grid-rows-[minmax(0,1fr)]` laisse les paroles déborder de l'écran.
3. **`Object-fit` des pochettes.** `33-Full.png` et `Ashes-15242_itemimage.jpg`
   ont des parties sombres : ce n'est pas un bug de cadrage.
4. **LRCLIB renvoie 503** sous la charge : le client réessaie (3 fois, back-off
   `retry-after`). Le script de génération utilise 4 threads et `sleep` — ne pas
   monter le parallélisme.
5. **Filtres « No Vocals ».** Les noms de fichiers archive.org contiennent
   `No_Vocals` / `Instrumental` : le filtre regex doit porter sur le nom
   **nettoyé** (underscores → espaces), sinon les versions instrumentales
   s'invitent dans le catalogue.
6. **Playwright pip : impossible** (pas de wheel linux-aarch64). Selenium +
   `geckodriver` + Firefox headless fonctionne
   (`/tmp/opencode/geckodriver`, `/tmp/opencode/firefox/firefox`).
7. **Erreur audio fantôme.** Firefox émet `MEDIA_ERR_DECODE` alors que la
   lecture est nominale. Ne retenir l'erreur que si
   `readyState < HAVE_CURRENT_DATA`, et la réinitialiser sur `playing`.
8. **archive.org répond 500 par intermittence** (≈ 1 requête sur 10). Le
   lecteur relance jusqu'à 3 fois avec un paramètre `vitr=<timestamp>` qui
   passe d'un edge en cache défectueux. Sans ça, l'utilisateur voit
   « Morceau indisponible » sur un flux parfaitement bon.
9. **URL `blob:` volatiles.** Elles meurent au rechargement : la file
   persistée en `localStorage` contenait des sources mortes. Resynchroniser via
   `player.syncLocalTracks()` à chaque relecture de la bibliothèque.
10. **Autoplay headless.** Un clic Selenium scripté n'est pas un « geste
    utilisateur » : Firefox bloque la lecture. Passer
    `media.autoplay.default = 0` dans les tests.

---

## 4. Vérification visuelle

```bash
npm run preview &
python3.13 scripts/visual-check.py tablette   # 1280x800
python3.13 scripts/visual-check.py phone      # 430x900
```

Les PNG atterrissent dans `/tmp/opencode/vitrail-*.png`. **Il faut les lire** avec
l'outil `read` avant d'affirmer quoi que ce soit sur le rendu.

Le script vérifie aussi que l'audio joue (`window.__vitrailAudio`) : `paused`,
`currentTime`, `readyState`, `error`.

---

## 5. Étape suivante : brancher Spotify

Quand l'abonnement sera actif (règle Spotify de février 2026 : le propriétaire
de l'app doit avoir **Premium**, sinon *tous* les appels API sont rejetés).

1. Créer l'app sur <https://developer.spotify.com/dashboard> (gratuit).
2. OAuth **Authorization Code with PKCE** : aucun secret serveur, les jetons
   restent dans le navigateur. → l'app reste 100 % statique.
3. Web Playback SDK : l'onglet devient un appareil **Spotify Connect**.
   Bascule « lecteur / télécommande » selon l'appareil actif.
4. Contraintes à respecter : `GET /search` max **10** résultats → paginer ;
   requêtes groupées supprimées ; `popularity`/`followers`/`label` absents.

Voir `README.md` §4 pour le détail.

---

## 6. Secrets

Aucun secret dans ce dépôt. Le `Client ID` Spotify viendra dans
`/root/.config/vitrail/` (hors dépôt) quand l'app sera créée.

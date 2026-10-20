# MEMORY.md — Vitrail

> Journal de sessions. Chaque session significative laisse une entrée.

---

## SESSION — 2026-10-20 (v0.1 : origine + premier lecteur)

### Résumé

Création complète de l'app **Vitrail** à partir d'un entretien produit
(`grill-me`). Le projet part d'un cadrage dur : l'utilisateur voulait « tout
Spotify, gratuit, sans pub ». Ce n'est pas possible légalement et techniquement
— Spotify réserve le flux complet aux comptes Premium et ne le distribue pas à
un lecteur tiers, et les recommandations algorithmiques sont fermées aux apps
tierces depuis 2024. Arbitrage retenu avec l'utilisateur : **abonnement famille
Spotify** (~20 €/mois) comme moteur du son, et **Vitrail** comme couche
d'expérience (design, paroles, capsules, file partagée) — pas un clone.

Décisions actées : direction artistique **« verre et lumière »**, nom **Vitrail**,
pile **React 19 + Vite 7 + TS strict + Tailwind 4**, 2 à 3 utilisateurs,
**OAuth PKCE** (donc zéro serveur, zéro secret), v1 = **lecteur + capsules**,
file famille en v2 via playlist collaborative Spotify.

### Décisions

- **Pas d'Apple Music** : 99 €/an de développeur Apple requis, lecture fragile
  sur Chrome/Android, paroles via endpoints non documentés. Spotify gagne.
- **Mode démo avant abonnement** : la règle Spotify de février 2026 rejette
  *tous* les appels API sans Premium propriétaire. Sans démo, rien ne serait
  validable avant de payer. Le catalogue de démo est donc réel
  (53 morceaux CC BY 4.0, Josh Woodward, streamés depuis archive.org) et le
  connecteur Spotify se substituera ensuite.
- **Paroles** : LRCLIB (gratuit, CORS ouvert, base libre) plutôt que l'API
  Apple non documentée. 24 morceaux sur 53 ont des paroles synchronisées.
- **File famille** : playlist collaborative Spotify, pas de serveur maison.
- **Exclus** : YouTube/ripping, contournement de pub, toute source non
  autorisée, et toute recommandation algorithmique tierce.

### Vérifications

- `npm run typecheck` : OK (strict + `exactOptionalPropertyTypes`).
- `npm run build` : OK (~380 ko JS, 118 ko gzip).
- **Son réellement audible** : probe Selenium → `paused: false`,
  `currentTime` en cours d'avance, `readyState: 4`, `duration: 241.6 s`.
- Captures visuelles relues à 1280×800 et 430×900 : bibliothèque, lecteur,
  paroles synchronisées, file d'attente. Verdict écrit à chaque itération.
- Doc Spotify consultée directement (authorization, quota modes, changelog
  fév./mars 2026) — les limites citées sont vérifiées, pas estimées.

### Bugs trouvés et corrigés

1. **Cascade Tailwind** : mes règles CSS étaient hors `@layer`, donc
   `button { color: inherit }` écrasait `text-ink-950` → texte blanc sur fond
   blanc (bouton actif de la nav illisible). Tout est passé en
   `@layer base` / `@layer components`.
2. **Débordement des paroles** : grille `md:grid-cols-2` sans
   `grid-rows-[minmax(0,1fr)]` → les paroles sortaient de l'écran et
   chevauchaient l'en-tête.
3. **Ligne active rognée** : `scale-[1.06]` débordait de la colonne → scale
   supprimé, emphase portée par le poids et la couleur.
4. **Versions instrumentales dans le catalogue** : le filtre « No Vocals »
   portait sur le nom brut ; il faut nettoyer les underscores d'abord.
   Catalogue ramené de 65 à 53 morceaux.
5. **File d'attente translucide** : le `backdrop-blur` de Firefox laissait
   passer les paroles du lecteur malgré 96 % d'opacité → fond 100 % opaque.
6. **Erreur audio fantôme** : Firefox émet `MEDIA_ERR_DECODE` (code 3) alors
   que la lecture est nominale (`readyState: 4`, `currentTime` en marche).
   L'interface affichait « Lecture impossible » sur un son qui jouait.
   → l'erreur n'est retenue que si `readyState < HAVE_CURRENT_DATA`, et
   l'événement `playing` la réinitialise.
7. **Pochette en bandes** : `<img loading="lazy">` laissait Firefox décoder le
   JPEG par bandes (image tronquée horizontalement). → `eager` + `decoding="async"`
   sur la pochette du lecteur.

### Suite

1. Capsules d'écriture (historique persistant, top artistes/albums).
2. Connecteur Spotify PKCE + Web Playback SDK, avec bascule lecteur/télécommande.
3. File famille (playlist collaborative rafraîchie).
4. Déploiement Vercel + installation de la PWA sur la tablette.

---

## SESSION — 2026-10-20 (v0.2 : bibliothèque personnelle)

### Résumé

Ajout de **la musique de l'utilisateur** dans l'app, à la demande explicite :
« est-ce que je peux télécharger des musiques moi-mêmes et les rendre disponibles
sur mon app ? ». Réponse : oui, implémenté.

Deux entrées dans « Ma musique » :
- **Import** (sélection multiple) — le fichier est copié dans **IndexedDB**
  (`localStorage` est plafonné à ~5 Mo et n'accepte que des chaînes).
- **Dossier en direct** — File System Access API (`showDirectoryPicker`) : les
  fichiers sont lus sur place, sans duplication. Chrome uniquement ; le bouton
  n'apparaît pas sur Firefox.

Un **parseur ID3v2 maison** (sans dépendance) lit titre, artiste, album, année,
numéro de piste, **pochette (APIC)** et **paroles (USLT)**. Les fichiers non-MP3
retombent sur le nom de fichier (« Artiste - Titre »).

Bonus découvert en route : les fichiers de l'utilisateur contiennent souvent
des paroles intégrées (trame `USLT`). Elles sont utilisées **en priorité**,
sans appel à LRCLIB — le lecteur affiche donc les paroles de vos propres
fichiers, non synchronisées.

### Décisions

- **IndexedDB, pas localStorage** : les blobs audio n'y ont pas leur place.
- **Lecture des URL `blob:`** : elles meurent au rechargement, donc la file
  persistée contenait des sources mortes. Ajout de `player.syncLocalTracks()`,
  appelé à chaque relecture de la bibliothèque.
- **Import ≠ partage** : chaque appareil importe ses propres fichiers. Le
  partage familial reste porté par la playlist collaborative Spotify. L'app ne
  redistribue rien.
- **Relance automatique du flux** : archive.org répond 500 par intermittence
  (≈ 1 sur 10). Le lecteur réessaie 3 fois avec un paramètre anti-cache.

### Vérifications

- Import d'un vrai fichier de la tablette (`/sdcard/Download/Mirage.mp3`) :
  ID3 relu octet par octet en Python et comparé au résultat du parseur JS
  → `TIT2 = "Mirage"`, `TPE1 = "gabriel_tieche"` : **identiques**.
- Lecture du fichier importé : `paused: false`, `currentTime` en avance,
  `readyState: 4`, `duration: 186.4 s`, source `blob:` — **aucune erreur**.
- Pochette extraite du fichier affichée en plein écran, paroles intégrées
  visibles dans le lecteur (« [Intro] / Ouais… / [Verse 1] … »).
- Stockage : « 4,3 Mo utilisés sur 10 Go disponibles ».

### Bugs trouvés et corrigés

7. **Erreur audio fantôme** (déjà listée) : l'interface affichait « Lecture
   impossible » sur un son qui jouait.
8. **URL `blob:` mortes** après rechargement → `syncLocalTracks()`.
9. **Clic sur un morceau local** ne'ouvrait pas l'écran de lecture → callback
   `onPlay` propagé jusqu'à `LocalLibrary`.
10. **Autoplay headless** : un clic scripté n'est pas un geste utilisateur,
    Firefox bloque la lecture → `media.autoplay.default = 0` dans les tests
    (c'était un artefact de test, pas un bug produit).

### Suite

1. Capsules d'écoute (historique persistant, top artistes/albums).
2. Connecteur Spotify PKCE + Web Playback SDK, avec bascule lecteur/télécommande.
3. File famille (playlist collaborative rafraîchie).
4. Déploiement Vercel + installation de la PWA sur la tablette.

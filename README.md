# Vitrail

> Lecteur de musique familial. UI « verre et lumière », paroles synchronisées plein
> écran, file d'attente partagée, capsules d'écoute.
> Aucun serveur, aucun compte, aucune publicité, aucun pistage.

---

## 1. Le produit

Vitrail est une application web de musique, pensée pour un usage **familial** :

| Pilier | Ce que c'est | Statut |
|---|---|---|
| **Lecteur** | Recherche, lecture, file, pochette plein écran, transitions | v1 |
| **Paroles** | Synchronisation ligne à ligne, plein écran, clic pour se déplacer | v1 |
| **Capsules** | Historique, temps d'écoute, artistes et albums les plus écoutés | v1 (à détailler) |
| **File famille** | Playlist collaborative Spotify, rafraîchie en continu | v2 (nécessite Premium) |
| **Design** | Verre dépoli, lumière, couleurs prises de la pochette | transverse |

**Promesse :** ouvrir l'app montre la musique qui joue, pas un tableau de bord.

---

## 2. Architecture

```
src/
  audio/player.ts        moteur de lecture (HTMLAudioElement) + file + état
  components/            Backdrop, Artwork, NowPlaying, Lyrics, Queue, Library…
  lib/
    demoCatalog.ts       53 morceaux libres (généré)
    lyrics.ts            client LRCLIB + cache local 30 jours
    lyricsIndex.ts       index des morceaux ayant des paroles (généré)
    lrc.ts               parseur LRC (ligne + mot à mot)
    types.ts             types partagés
App.tsx                  coquille : navigation, raccourcis clavier
```

- **Aucun serveur.** Le state du lecteur vit dans `localStorage`
  (clé `vitrail_v1_state`), les paroles sont mises en cache (clé
  `vitrail_lyrics_v1`).
- **Source audio, deux modes, une seule interface :**
  - `demo` — morceaux Creative Commons streamés depuis archive.org,jouables
    sans aucun abonnement. Sert de terrain d'essai avant abonnement.
  - `spotify` — à brancher quand l'abonnement est actif (voir §4).

---

## 3. Lancer

```bash
npm install
npm run dev        # http://127.0.0.1:5199
npm run typecheck  # tsc --noEmit, strict
npm run build      # dist/
npm run preview    # http://127.0.0.1:4199
```

Vérification visuelle (Firefox headless piloté par Selenium) :

```bash
npm run preview &                       # doit tourner
python3.13 scripts/visual-check.py tablette
```

---

## 4. Brancher Spotify (quand l'abonnement sera actif)

Spotify impose depuis février 2026 qu'une app en mode développement ait un
**compte Premium propriétaire**. En mode développement : 1 Client ID, 5
utilisateurs autorisés.

Étapes :

1. Créer l'app sur <https://developer.spotify.com/dashboard>
   (gratuit), avec l'URL de redirection de l'app.
2. `npm i @spotify/web-playback-sdk` et un client OAuth PKCE
   (`authorization code with PKCE` — **aucun secret serveur requis**).
3. Le lecteur devient un appareil **Spotify Connect** : quand l'onglet est
   actif, le son sort de l'app ; sinon l'app pilote l'appareil connecté
   (téléphone, PC, enceinte).

Contraintes Spotify à connaître (doc officielle, 2026) :

- `GET /search` : **10 résultats max** par requête → paginer.
- Requêtes groupées supprimées (`GET /tracks?ids=…`) → un appel par morceau.
- Recommendations, artistes similaires, audio features, browse : **réservés
  au mode quota étendu** → notre radio maison se construit sur
  `/me/top` + `/artists/{id}/albums`.
- Champs retirés : `popularity`, `followers`, `label`, `available_markets`.
- Web Playback SDK : autoplay bloqué (geste requis) et **lecture en arrière-plan
  non garantie** dans le navigateur → d'où la bascule « lecteur / télécommande ».

---

## 5. Sources de données

| Source | Usage | Licence / contrainte |
|---|---|---|
| **archive.org** | Audio des morceaux de démo | CC BY 4.0 — attribution obligatoire |
| **LRCLIB** | Paroles synchronisées (LRC) | Base libre, API publique, CORS ouvert |
| **Josh Woodward** | Artiste du catalogue de démo | <https://www.joshwoodward.com/> |

L'index des paroles est régénérable :

```bash
python3.13 scripts/build-lyrics-index.py
```

---

## 6. Ce qui est volontairement absent

- Aucun téléchargement depuis YouTube ni aucune source non autorisée.
- Aucune embodiment de publicité, aucun pistage, aucun algorithme de vente.
- Aucun compte maison, aucun paiement, aucun serveur de données.

---

## 7. Prochaines étapes

1. Capsules d'écoute : historique persistant, top artistes/albums, rétrospectives.
2. Connecteur Spotify (PKCE + Web Playback SDK), avec bascule lecteur/télécommande.
3. File famille : lecture en boucle de la playlist collaborative, rafraîchissement.
4. PWA installable + raccourcis vers l'écran d'accueil de la tablette.

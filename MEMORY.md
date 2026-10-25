# MEMORY.md — Vitrail

> Journal de sessions. Chaque session significative laisse une entrée.

---

## SESSION — 2026-10-20 (v0.3 : paroles pour tout, capsules, file famille, thème clair)

### Résumé

Session dense, partie d'un retour utilisateur enflammé : « les paroles
n'apparaissent pas, c'est UN GROS PROBLEME », plus une demande de mode
clair et de design « plus Apple ».

Quatre chantiers livrés et déployés :
1. **UI** — le mini-lecteur et la barre de navigation se chevauchaient
   (signalé sur des captures). Corrigé par un dock unique.
2. **Paroles pour tout morceau importé** — le vrai problème. Résolu par une
   cascade à trois étages.
3. **Capsules d'écoute** — temps d'écoute, tops, graphique 7 jours.
4. **File de la famille** — service local, file commune en temps réel.

Décision structurante : **abandon de Spotify** (l'utilisateur importe tous
ses morceaux). L'app devient un lecteur local avec un service de famille.

### Décisions

- **Service local obligatoire.** Le navigateur seul ne peut ni transcrire, ni
  partager une file entre appareils. Le service tourne sur la machine de la
  tablette, port 8099, joignable en `127.0.0.1` et sur l'IP du réseau local.
- **Clé de partage = SHA-256 du fichier.** Le navigateur calcule
  l'empreinte, le service indexe la transcription par empreinte. Les paroles
  transcrites sont donc partagées entre les appareils sans recalcul.
- **LRCLIB avant la transcription.** LRCLIB est instantané et parfait ;
  enchaîner la transcription d'abord aurait coûté des minutes pour rien.
- **whisper.cpp découpé en blocs de 28 s avec 2 s de chevauchement.**
  whisper.cpp dégrade les fichiers longs : dès le premier jeton `[Musique]`,
  le contexte glissant contamine toutes les fenêtres de 30 s suivantes et le
  reste du morceau n'est plus transcrit. En découpant nous-mêmes, chaque bloc
  est traité à froid.
- **Thème par variables sémantiques** (`canvas`, `ink`, `surface`, `line`) :
  une seule Truth pour les deux thèmes, et une variante Tailwind `light:`.

### Vérifications

- **Paroles** : `Mirage` (paroles intégrées) et `PARISIENNE` (LRCLIB,
  159 s = durée exacte du fichier) affichent bien leurs paroles.
- **Transcription** : `Mirage` transcrit en entier par blocs —
  « Encore une fois / Je sais que je devrais pas / C'est qu'un mirage,
  mirage, mirage » — contre 3 lignes avant le découpage.
- **UI** : géométrie mesurée dans le navigateur, mini-lecteur 568–656 px,
  navigation 664–706 px, **aucun chevauchement**.
- **Capsules** : 7/7 (écoute enregistrée, temps affiché, graphique 7 jours).
- **Thèmes** : captures relues en clair et en sombre.
- **Production** : `https://vitrail-two.vercel.app` redéployée et testée.

### Bugs trouvés et corrigés

11. **Chevauchement mini-lecteur / navigation** : deux `fixed`.bottom
    concurrents. Remplacés par un dock unique en flux.
12. **Panneau du dock translucide** : le `backdrop-filter` de Firefox
    laissait voir les pochettes à travers → fond dense (`.dock-panel`).
13. **Paroles : ordre inversé** — la transcription partait avant LRCLIB.
14. **Paroles : homonymes** — « Mirage » existe chez Elvis Presley et
    Santana ; le filtre exige maintenant que l'artiste corresponde.
15. **Paroles : balises sales** — le titre nettoyé n'était jamais produit
    (le préfixe artiste restait) et le candidat était comparé au titre brut.
    Corrigé par des variantes + score max.
16. **whisper.cpp : fichiers longs** → découpage en blocs.
17. **whisper.cpp : `-sns`** supprime le jeton `[Musique]` *et* décale les
    horodatages → on ne l'utilise pas, on filtre côté serveur.
18. **whisper.cpp : VAD** écrase les horodatages de fin de segment → sans VAD.
19. **Historique jamais enregistré** si on n'écoutait jamais jusqu'au
    changement de morceau → enregistrement par pas de 15 s + à la pause.
20. **Graphe des 7 jours vide** : `items-end` effondrait la hauteur des
    colonnes → `items-stretch` + `h-full`.
21. **Service local : `require` en ESM** — le `package.json` de l'app impose
    `"type": "module"` → `server/package.json` en `commonjs`.
22. **Service local : EADDRINUSE** — l'ancienne instance tenait le port.
23. **`pkill -f` a tué le shell appelant** (le motif contenait le nom du
    script) → filtrage sur la ligne de commande exacte, exclusion de `$$`.
24. **Mode clair : fond resté sombre** → le backdrop et le voile de la
    page ne suivaient pas le thème.

### Suite

1. Partage explicite d'un import vers la bibliothèque de la famille.
2. Rétrospective hebdomadaire des capsules.
3. Pochettes de la bibliothèque de famille dans la file partagée.

---

## SESSION — 2026-10-21 (v0.4 : catalogue, recherche, streaming, telechargements)

### Résumé

Demande : « tout doit passer sur ma tablette, on doit pouvoir chercher des
chansons, meme si on ne l'a pas on la propose, on peut la telecharger avec
yt-dlp, sans surcharger la RAM, et que ce soit ULTRA RAPIDE ».

L'app est donc devenue un **lecteur de catalogue local** : elle interroge
l'installation notube-batch deja presente sur la machine (2 000 titres, son
journal de telechargements, le Drive) au lieu d'un catalogue distant.

### Décisions

- **Aucune nouvelle logique de téléchargement.** Le service délègue à
  `notube_batch.py` (3 moteurs en cascade, reprise, upload Drive) avec `--out`
  et `--drive-folder` **dedies** : les lots de l'utilisateur ne sont jamais
  perturbes. Repli sur `yt-dlp` en direct si le job échoue.
- **Identifiant canonique = identifiant vidéo.** Le journal `state.json` utilise
  des clés hachées, le Drive déduplique l'id du nom de fichier : sans
  unification, chaque morceau existait en double, dont une entrée sans accès
  disque.
- **Index inversé en mémoire** pour la recherche : 20-45 ms à froid, au lieu de
  1,3 s en balayage exhaustif.
- **Aucune copie pour la lecture** : relais des requêtes `Range` vers la
  source. RAM du service : ~90 Mo, index compris.
- **API iTunes** (publique, sans clé) pour pochettes et durées exactes.

### Vérifications

- Recherche « gims » : 19 résultats, avec rang et badge « Téléchargé ».
- Recherche à froid après redémarrage : 45 ms.
- Streaming local : **206**, `Content-Range: bytes 0-300000/6145868`,
  `Accept-Ranges: bytes`, données MP3 valides.
- Téléchargement de bout en bout : « DADJU - Reine » téléchargé via yt-dlp
  (6,4 Mo) et envoyé sur `gdrive:Vitrail/`, journal « 1 telecharge(s) |
  0 echec(s) ».
- 1 844 morceaux uniques indexés (catalog 2 000, téléchargés 969, Drive 961).

### Pièges rencontrés

25. **Quota de l'API Google Drive** (`403 Quota exceeded`, requêtes par
    minute) : l'index saturait le quota en listant le Drive à chaque
    démarrage, et rclone devenait muet. → liste mise en cache une heure,
    `--tpslimit 4`, index reconstruit toutes les 30 min au lieu de
    systématiquement.
26. **Cache de répertoire de rclone périmé** : un fichier téléversé
    récemment n'était pas dans le listing → 404. → repli sur
    `rclone cat --offset --count`.
27. **`spawnedDrive`** interdisait la relance de rclone après un arrêt.
28. **`lsf --format json`** n'existe pas dans rclone 1.60 : c'est `lsjson`.
29. **Correspondances partielles trop permises** : un jeton d'une lettre (« g »)
    faisait matcher la moitié de l'index → 20 s de recherche. → plancher de
    3 caractères.
30. **Chemin Drive non encodé** dans l'URL → 404 (espaces, accents).
31. **`rclone serve` met ~15 s à démarrer** (il liste le Drive) : le service
    le démarre après la construction de l'index, qui réchauffe le cache.
32. **`*/` dans un commentaire JS** (`dl_*/state.json`) ferme le commentaire →
    SyntaxError. Piège classique.

### Suite

1. Rétrospective hebdomadaire des capsules.
2. Partage d'un import vers la bibliothèque de la famille.
3. Tri et filtres dans la recherche.

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
  tablette, port 8099, joignable en `127.0.0.1` et en `192.168.1.114`.
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

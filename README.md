# Vitrail

> Lecteur de musique familial. UI « verre et lumière » (thème clair **et**
> sombre), paroles synchronisées pour **tout** morceau importé, file d'attente
> partagée et capsules d'écoute. Aucun serveur distant, aucune publicité,
> aucun pistage.

---

## 1. Le produit

| Pilier | Ce que c'est | Statut |
|---|---|---|
| **Lecteur** | Recherche, lecture réelle, file, pochette plein écran, navigation clavier | v0.3 |
| **Paroles** | Synchronisées mot à mot, pour **tout** morceau importé | v0.3 |
| **Bibliothèque personnelle** | Import de fichiers ou lecture d'un dossier, balises ID3 | v0.3 |
| **Capsules** | Temps d'écoute, top morceaux/artistes/albums, 7 jours | v0.3 |
| **File de la famille** | File commune, en temps réel, sur le réseau local | v0.3 |
| **Thèmes** | Clair et sombre, bascule soleil/lune | v0.3 |

**Promesse :** ouvrir l'app montre la musique qui joue, pas un tableau de bord.

---

## 2. L'architecture en deux pieces

L'application (100 % statique) et un **service local** qui tourne sur la
machine qui héberge la tablette.

```
Navigateur  ──▶  http://127.0.0.1:8099   (tablette)
                     ou http://192.168.1.114:8099  (autres appareils du réseau)
                          │
                          ├── l'application (dist/)
                          └── l'API : transcription, bibliothèque, file, stats
```

> **Pourquoi l'app est servie par le service local ?** Une page HTTPS ne peut
> pas appeler une API HTTP locale : le navigateur bloque la requête
> (*mixed content*). En servant l'app et l'API depuis la même origine, tout
> fonctionne. Sur la tablette, `127.0.0.1` est une origine sûre : la PWA
> s'installe normalement.

Le déploiement Vercel (`https://vitrail-two.vercel.app`) reste utile pour la
démonstration et l'accès hors de la machine, mais **sans** les fonctions
locales (paroles transcrites, file de la famille) : l'app y affiche
explicitement où aller.

### Ce que fait le service local, et pourquoi le navigateur ne peut pas le faire

1. **Transcription des paroles.** Aucun service public ne transcrit un morceau
   que personne ne connaît. `whisper.cpp` le fait localement, avec un
   horodatage mot à mot.
2. **Partage par empreinte.** Le navigateur calcule le SHA-256 du fichier ;
   la transcription est indexée par cette empreinte. Si un membre de la
   famille a déjà fait transcrire un morceau, tous les autres en profitent
   sans rien recalculer.
3. **Bibliothèque partagée et file commune** : l'état doit être partagé entre
   plusieurs appareils, ce qu'un navigateur seul ne peut pas faire.

---

## 3. Le catalogue : chercher, proposer, télécharger

L'app interroge **ton** installation, pas un catalogue distant :

| Source | Contenu |
|---|---|
| `notube-batch/urls_*.csv` | 2 000 titres (artiste, titre, URL, rang) |
| `notube-batch/dl_*/state.json` | ce que tu as déjà téléchargé |
| `gdrive:Notube` | ~960 fichiers sur le Drive |
| dossiers des lots | fichiers encore en local |

Tout est fusionné dans **un index en mémoire** (identifiant vidéo = identifiant
canonique), avec un index inversé par jeton : la recherche répond en **20 à
45 ms**, à froid compris, et jamais par appel réseau.

**Recherche.** Un champ unique interroge l'index. Si le résultat est mince, un
bouton « Chercher aussi en ligne » passe par ton `yt-dlp` (`ytsearch:`), ~10 s
la première fois puis mis en cache.

**Proposition.** Les titres du catalogue qui ne sont pas encore téléchargés
sont proposés avec leur rang et un bouton « Télécharger ».

**Téléchargement.** Le service crée un job et **délègue à ton
`notube_batch.py`**, avec un dossier de sortie et un dossier Drive dédiés
(`--out`, `--drive-folder Vitrail`) pour ne pas entrer en conflit avec tes
lots. Si le job échoue, il est relancé en `yt-dlp` direct.

**Lecture.** Le service relaie les requêtes `Range` vers la source (fichier
local, sinon Drive via rclone) : **aucune copie**, la RAM ne bouge pas. Le
service pèse ~90 Mo, l'index compris.

**Pochettes.** L'API publique iTunes (sans clé) fournit pochette et durée
exacte, à la demande pour les résultats affichés et en tâche de fond pour le
reste du catalogue.

---

## 4. Les paroles : la cascade

| Ordre | Source | Latence | Qualité |
|---|---|---|---|
| 1 | **Paroles intégrées au fichier** (ID3 `USLT`) | instantanée | non synchronisées |
| 2 | **LRCLIB** (base libre publique) | ~1 s | synchronisées |
| 3 | **Transcription locale** (whisper.cpp) | 4 à 5 min | synchronisées mot à mot |

L'ordre est important : LRCLIB est instantané et parfait quand le morceau y
est référencé ; la transcription est le filet de sécurité pour tout le reste.

### Le temps de transcription, en toute franchise

whisper.cpp sur ce processeur (8 cœurs ARM) traite environ une minute de
musique par minute de calcul. **Un morceau de trois minutes demande donc
quatre à cinq minutes de transcription**, une seule fois : le résultat est
mis en cache par empreinte du fichier, et partagé avec tous les appareils de
la famille. Les morceaux connus (c'est-à-dire la très grande majorité des
chansons commerciales) ne payent jamais ce délai, thanks à LRCLIB.

Le découpage en blocs de 28 s avec 2 s de chevauchement est indispensable :
whisper.cpp dégrade les fichiers longs, car dès le premier jeton `[Musique]`
le contexte glissant contamine toutes les fenêtres de 30 s suivantes.

### Normalisation des métadonnées

Les fichiers du monde réel ont des balises douteuses. Un titre comme
`GIMS & La Mano 1.9 - PARISIENNE (Clip officiel)` avec l'artiste `GIMS` est
nettoyé en variantes (`PARISIENNE`, `GIMS & La Mano`, …), puis chaque
réponse de LRCLIB est notée sur trois axes : titre, artiste, durée. Un
homonyme est écarté : si l'artiste est connu, il doit correspondre.

---

## 5. Lancer

```bash
npm install
npm run dev        # http://127.0.0.1:5199
npm run typecheck  # tsc --noEmit, strict
npm run test       # vitest
npm run build      # dist/
npm run preview    # http://127.0.0.1:4199
```

Le service local :

```bash
bash server/service.sh start|stop|restart|status
```

Il est relancé automatiquement s'il tombe (superviseur accroché à la session
proot, voir `server/README.md`).

---

## 6. Vérification

```bash
python3.13 scripts/acceptance.py     # UI, import, lecture, paroles, capsules, file
python3.13 scripts/test-capsules.py   # historique d'écoute et rendu des capsules
python3.13 scripts/test-paroles.py    # morceau sans paroles intégrées
python3.13 scripts/test-theme.py      # thèmes clair et sombre
python3.13 scripts/visual-check.py tablette   # captures de l'interface
```

---

## 7. Ce qui est volontairement absent

- Aucun téléchargement depuis YouTube, aucun contournement de publicité,
  aucune source non autorisée.
- Aucun service de streaming distant : le son vient des fichiers de
  l'utilisateur ou du catalogue libre de démonstration.
- Aucune publicité, aucun pistage, aucun algorithme de vente.
- Les statistiques et l'historique ne quittent jamais l'appareil (ni le
  réseau local).

---

## 8. Prochaines étapes

1. Rétrospective hebdomadaire des capsules (le plus joué, la série en cours).
2. Partage explicite d'un morceau importé vers la bibliothèque de la famille.
3. Tri et filtres dans l'interface de recherche (par artiste, par rang).

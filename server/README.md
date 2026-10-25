# Service local Vitrail

Le compagnon de l'application. Il tourne sur la machine qui héberge Vitrail
(la tablette) et fournit quatre choses que le navigateur ne peut pas faire
seul :

1. **Transcription des paroles** — `whisper.cpp` transcrit les morceaux que
   personne ne connaît, avec un horodatage mot à mot. L'application
   interroge le service par empreinte de fichier (SHA-256) : si un membre de
   la famille a déjà fait transcrire un morceau, tous en profitent.
2. **Bibliothèque partagée** — un appareil téléverse ses imports, les autres
   les jouent en flux.
3. **File d'attente de la famille** — la file commune, en temps réel.
4. **Statistiques d'écoute** — la base des capsules.

## Démarrer

```bash
bash server/service.sh start     # démarre (pid écrit dans /tmp/opencode)
bash server/service.sh status    # état
bash server/service.sh stop      # arrête
bash server/service.sh restart
```

Écoute sur `0.0.0.0:8099` : accessible en `127.0.0.1` depuis la tablette et via
l'IP du réseau local depuis les autres appareils.

## Dépendances

- `whisper.cpp` compilé dans `/root/whisper.cpp/build/bin/whisper-cli`
- modèle `/root/models/ggml-base.bin` (148 Mo)
- `ffmpeg` pour la conversion en 16 kHz mono

Sans `whisper.cpp`, le service fonctionne quand même : bibliothèque partagée,
file de la famille et statistiques restent disponibles ; seules les paroles
transcrites manquent.

## Mode ligne de commande

```bash
node server/server.js --transcribe /chemin/du/morceau.mp3 fr
```

## Données

Tout est dans `/root/vitrail-data/` : fichiers téléversés, transcriptions,
file d'attente, statistiques. Rien ne sort du réseau local.

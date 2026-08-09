# Corrections de l’audit du 8 août 2026

Cette branche corrige les anomalies confirmées relatives aux imports, au stockage, aux onglets multiples, aux semaines, aux repas verrouillés, aux restes, aux courses, aux exports, aux notifications, au catalogue hors ligne, au service worker, aux performances du catalogue, à l’accessibilité, au responsive et à la CI.

La vérification finale du 9 août complète ce travail :

- les sauvegardes vides, tronquées ou structurellement corrompues sont refusées avant toute écriture ;
- une sauvegarde valide est présentée à l’utilisateur et demande une confirmation explicite avant de remplacer les données locales ;
- des horloges par domaine de données fusionnent les changements simultanés de plusieurs onglets et convergent même en cas de collision ;
- les imports de polices sont limités aux sous-ensembles latins réellement utilisés ;
- le service worker relit correctement le cache malgré les en-têtes `Vary` d’un hébergeur statique ;
- le catalogue versionné par le build est reconnu et reste consultable après un rechargement sans connexion ;
- ces comportements sont couverts par de vrais tests Playwright avec service worker actif, ajoutés à la validation de la pull request.

Le commit a été créé uniquement après réussite de :

- l’intégrité mise à jour du runtime protégé ;
- la suite complète `test:preview` ;
- la compilation et le build GitHub Pages ;
- la vérification du précache des précautions hors ligne ;
- la présence de la page de repli `404.html` et de l’image sociale optimisée ;
- `test:app` sous Chromium ;
- `test:runtime` sous Chromium, mouvement réduit compris ;
- `test:pwa:built` sous Chromium, avec rechargement hors ligne et deux onglets ;
- le build alternatif et `test:sites` exécuté de manière autonome.

Les corrections restent sur une branche et une pull request en brouillon tant qu’elles ne sont pas fusionnées.

# Corrections de l’audit du 8 août 2026

Cette branche corrige les anomalies confirmées relatives aux imports, au stockage, aux onglets multiples, aux semaines, aux repas verrouillés, aux restes, aux courses, aux exports, aux notifications, au catalogue hors ligne, au service worker, aux performances du catalogue, à l’accessibilité, au responsive et à la CI.

Le commit a été créé uniquement après réussite de :

- l’intégrité mise à jour du runtime protégé ;
- la suite complète `test:preview` ;
- la compilation et le build GitHub Pages ;
- la vérification du précache des précautions hors ligne ;
- la présence de la page de repli `404.html` et de l’image sociale optimisée ;
- `test:app` sous Chromium ;
- `test:runtime` sous Chromium, mouvement réduit compris ;
- le build alternatif et `test:sites` exécuté de manière autonome.

Les corrections restent sur une branche et une pull request en brouillon tant qu’elles ne sont pas fusionnées.

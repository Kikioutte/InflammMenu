# Migration vers une origine dédiée

## Pourquoi cette migration est nécessaire

L’adresse historique `https://kikioutte.github.io/InflammMenu/` partage son origine
(`https://kikioutte.github.io`) avec les autres projets GitHub Pages du même compte.
Le navigateur isole `localStorage`, IndexedDB, Cache Storage et BroadcastChannel par
origine, et non par chemin. Les préfixes `inflamm-menu-*` évitent les collisions de
noms mais n’empêchent pas un autre projet de cette origine de lire ces données.

L’objectif est de publier Inflamm’Menu sur un domaine ou sous-domaine réservé à
l’application. Le nom exact et l’hébergeur doivent être décidés avant de modifier
les URL canoniques, le manifeste ou les workflows.

## Procédure sans perte de données

1. Conserver l’adresse historique accessible et sans redirection automatique.
2. Depuis cette adresse, ouvrir **Informations et confidentialité**, puis exporter
   la sauvegarde JSON.
3. Déployer le même SHA validé sur l’origine dédiée, relever l’identifiant exact du
   build déployé et vérifier les en-têtes HTTP ainsi que le mode hors ligne avant
   toute migration utilisateur.
4. Ouvrir l’origine dédiée, restaurer la sauvegarde et vérifier le récapitulatif
   avant de confirmer le remplacement.
5. Contrôler le profil, la semaine active, l’historique, les favoris, les recettes
   personnelles et la liste de courses sur la nouvelle origine.
6. Garder la sauvegarde et l’ancienne adresse jusqu’à ce que ces contrôles soient
   terminés. Ne supprimer les anciennes données qu’après restauration vérifiée.
7. Après la période de transition, conserver l’ancienne application en mode
   export/restauration ou la remplacer uniquement par un exporteur fonctionnel qui
   lit encore ses mêmes réplicas `localStorage` et IndexedDB. Une simple page
   d’instructions ou une redirection immédiate empêcherait les retardataires
   d’exporter les données de l’ancienne origine.

## Contrôles de passage

- L’origine dédiée ne sert aucun autre projet applicatif.
- `Content-Security-Policy` contient `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` et la `Permissions-Policy` attendue sont présents.
- L’import d’une sauvegarde complète passe et les compteurs affichés correspondent.
- Un retour à l’ancienne adresse reste possible pendant la transition.
- L’ancienne origine conserve un bouton d’export testé tant que des données
  historiques peuvent encore y exister.
- Les URL canonique, Open Graph, manifeste et configuration PWA ne changent qu’au
  moment où l’adresse dédiée est réellement connue et testée.

## Retour arrière

En cas d’échec, ne pas effacer les données de l’origine historique. Retirer la
nouvelle adresse de la communication, corriger le déploiement, puis recommencer à
partir de la sauvegarde exportée. Les deux origines ne synchronisent jamais leurs
données automatiquement.

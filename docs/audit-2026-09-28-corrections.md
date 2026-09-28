# Corrections de l'audit du 28 septembre 2026

Base : `eb9a54efbce565d36cde48f8362153673ccaa803`, branche
`fix/audit-2026-09-28`. Aucun changement de format des sauvegardes personnelles.
Les recettes, associations et fichiers du runtime protégé restent inchangés.

## Ordre et portes de validation

Chaque point est terminé, testé et relu avant de commencer le suivant. Un commit
séparé matérialise la fermeture du point. Les tests ne constituent pas une
garantie absolue sur tous les appareils ; les limites réelles restent indiquées.

1. C1 : catalogue hors ligne conservé entre éditions.
2. C3 : retour du focus des fenêtres WebSheet.
3. C4 : focus et annonces du mode magasin.
4. C5 : annonces des étapes en cuisine.
5. C2 : téléchargement du planificateur sur le chemin de démarrage.
6. Défauts fonctionnels restants : favoris de la fiche catalogue, puis durées
   de l'éditeur, puis pas des quantités, traités séparément.
7. C8 : icônes et formats de polices du précache.
8. C6 : variantes d'images adaptées à l'affichage.
9. C10 : demande de stockage persistant, sans garantie trompeuse.
10. C9 : benchmark du moteur ; optimisation seulement si démontrée utile et
    compatible avec des résultats déterministes inchangés.
11. C12 : fiabilité des métadonnées de partage ; pages indexables selon décision.
12. C13 : contrôles de qualité et de typage, entretien du code affecté.
13. C7/C11 : préparation d'une origine dédiée et protections HTTP ; migration et
    publication uniquement après choix explicite de la destination.

## C1 — Catalogue hors ligne

- Clé stable, récupération des anciennes clés et validation par empreinte de
  l'édition relue, puis validation complète de son contenu.
- Ancienne édition de 1 087 recettes signalée ; elle n'est pas rejetée au seul
  motif que le catalogue actuel contient 1 207 recettes.
- Écriture validée avant purge ; quota, contenu altéré, réseau coupé et refus de
  nettoyage couverts par les tests.
- Préservation des éditions inconnues potentiellement plus récentes d'un autre
  onglet. Verrou interonglets, ou repli conservateur sans suppression.
- Mise à jour immédiate de la liste déjà ouverte après téléchargement réussi.
- Aucun changement des favoris, collections, courses ou sauvegardes.

Vérification manuelle reproductible : ancien build `7a11e85` installé avec son
vrai service worker, téléchargement du catalogue, remplacement par le build
correctif, arrêt réel du serveur, rechargement hors ligne, mise à jour ratée puis
réussie, second arrêt et rechargement. Chromium et WebKit passent : 60 cartes
affichées avant et après, 1 081 puis 1 201 résultats, et une seule copie actuelle
après remplacement des éditions reconnues. Les images jamais consultées ne sont
pas promises hors ligne.

Le nouveau test `catalogue-offline-updates.spec.ts` vérifie aussi l'actualisation
sans rechargement et la conservation des données. La suite PWA et les tests
unitaires couvrent les autres garde-fous. Le serveur de test utilise `no-cache`,
pas `no-store`, pour ne pas empêcher l'installation du service worker historique.

Les éditions autorisées et leur entretien sont décrits dans
[offline-catalogue.md](offline-catalogue.md).

Clôture C1 : tests catalogue 30/30, `test:release`, TypeScript, contrôle des 28
fichiers protégés et relecture du diff réussis ; navigateur complet 161/161,
PWA 10/10, Worker/Sites 5/5, builds Pages et Worker réussis. Le scénario entre
deux vrais builds et les captures ont été revalidés sur le build final C1,
service worker `a136e25066fd`. Les autres points n'avaient pas encore été commencés
à ce jalon.

## C3 — Retour du focus des fenêtres

- Les neuf usages de WebSheet fournissent leur déclencheur explicitement, y
  compris sur Safari où le clic ne focalise pas toujours les boutons.
- Échap, fermeture, clic extérieur et validation rendent le focus au bon
  contrôle. Un déclencheur supprimé laisse un repli sur le titre de l'écran.
- Le résumé du constructeur revient à son bouton stable ; « Changer » revient
  à l'onglet de catégorie. Un nouvel écran ou dialogue conserve son propre focus.
- Les fenêtres et leur contenu visuel sont conservés ; aucun fichier du runtime
  protégé ni aucune donnée personnelle n'est modifié.

Clôture C3 : 12/12 tests ciblés Chromium/WebKit, 28/28 parcours existants de
non-régression, `test:release`, TypeScript, contrôle du runtime et relecture du
diff réussis. Une fixture indépendante a aussi vérifié la réouverture immédiate,
le passage à une autre fenêtre et le déclencheur retiré dans les deux moteurs.
Captures mobiles ouvertes/fermées relues. Pas de validation avec un lecteur
d'écran physique : les assertions portent sur le focus DOM et le clavier.

## C4 — Mode magasin

- Entrée sur le titre du rayon contextualisé ; sortie vers le bouton d'entrée
  recréé. Le cochage conserve le focus sur l'article.
- Une région polie annonce le rayon et les articles restants ; elle reste vide
  lorsque le titre focalisé fournit déjà cette information.
- Repli vers le titre lorsqu'un contrôle disparaît ou devient désactivé.
  Navigation corrigée après suppression externe d'un rayon ; liste vide sortie
  réellement du mode magasin, même depuis un inventaire entièrement couvert.
- Les articles cochés restent dans leur rayon ; calculs, prix, stocks, données
  personnelles et formats de sauvegarde sont conservés.

Clôture C4 : 10/10 tests ciblés et les deux exécutions du parcours existant
génération → courses réussis sur Chromium/WebKit. Les tests couvrent aussi un
second onglet réel, export/restauration et rechargement. `test:release`,
TypeScript, runtime protégé et relecture indépendante réussis ; captures mobile
et bureau relues. Deux sélecteurs du test existant ont été limités au repère
visible pour le distinguer de l'annonce accessible, sans retirer d'assertion.

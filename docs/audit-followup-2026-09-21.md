# Corrections complémentaires — 21 septembre 2026

Périmètre : points 1 à 4 et 6 à 9 de la liste complémentaire. Le point 5 (isolation par domaine dédié) est explicitement exclu. L’adresse et l’hébergement restent identiques.

| Point | Correction | Protection vérifiée |
| --- | --- | --- |
| 1. Restrictions libres | Reconnaissance des allergènes et des noms exacts d’ingrédients ; refus explicite des termes inconnus. | Génération, remplacement, planification, compositions et courses appliquent les mêmes restrictions. Aucun rapprochement approximatif ne définit une allergie. |
| 2. Retour à l’ingrédient d’origine | Réévaluation du plat et de ses restes liés avant toute mutation. | Une substitution incompatible est refusée avec un message ; un écran périmé ne modifie pas un autre repas. |
| 3. Recettes personnelles | Validation complète avant remplacement, vérification de la version ouverte et annulation si l’éditeur est quitté pendant le calcul. | Une recette vide ou invalide ne remplace plus la précédente. Favoris, notes et données concurrentes sont conservés. |
| 4. Mise à jour PWA | Conservation du document installé ; téléchargement de toutes les ressources obligatoires avant activation. | Une mise à jour interrompue laisse l’ancienne version complète utilisable hors ligne. Les fausses réponses HTML à une URL JavaScript sont refusées. |
| 6. Import et images | Validation des équipements, dont le grille-pain valide ; reconstruction des chemins d’images locaux sous le préfixe du déploiement. | Les sauvegardes invalides sont refusées sans écrasement. Les images externes ou chemins dangereux sont remplacés par l’image locale de secours. |
| 7. Saisies numériques | Virgule décimale acceptée, champs obligatoires et bornes contrôlés, brouillons invalides conservés avec explication. | Budget, temps, dépense et stock ne deviennent pas silencieusement une valeur par défaut. |
| 8. Estimations | Recalcul proportionnel ou par coefficients relus ; qualification explicite quand le calcul est impossible. | Les coûts des semaines courante et suivante sont actualisés. Historique et dépenses réelles restent inchangés. Les anciennes variantes sans preuve de recalcul sont signalées comme non recalculées. |
| 9. Rappels | Lecture et écriture du marqueur local protégées, garde en mémoire avant l’envoi. | Un refus d’accès au stockage ne bloque pas l’application. |

## Limites assumées

La table différée de coefficients couvre 957 des 1 087 recettes du catalogue. Elle est reconstruite exclusivement à partir des données nutritionnelles et conversions déjà relues du dépôt, avec comparaison aux totaux publiés. Les coûts par ingrédient disponibles sont des prix éditoriaux, pas des prix de magasin actualisés. Une modification non calculable conserve les données de sauvegarde, masque les anciens chiffres nutritionnels et signale le coût partiel. Les recettes et photographies d’origine ne sont pas modifiées.

Les rappels restent des rappels contextuels pendant que l’application est ouverte. Le catalogue complet demeure téléchargé à la demande. L’origine GitHub Pages partagée n’est pas modifiée dans ce lot.

## Validation

Les commandes de validation des données, des tests unitaires, des parcours Chromium/WebKit, du worker et de la PWA sont exécutées avant intégration. Les tests complémentaires couvrent les restrictions inconnues, les saisies invalides, les dépenses à virgule, les imports, les éditions personnelles, les estimations, les substitutions liées aux restes, l’annulation d’un calcul et une mise à jour PWA interrompue. Le contrôle des 28 fichiers du runtime mobile reste obligatoire et inchangé.

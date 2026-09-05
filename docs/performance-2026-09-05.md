# Performance — premier lot, 5 septembre 2026

## Référence et périmètre

Comparaison avec la version corrigée `69d1e316139f1391cd9d0fe9dc816c45c123dd3c` de la PR #15, et non avec l'ancien `main`. Son build Pages a été figé avant toute modification. Les recettes, le modèle de données, les fonctionnalités et le runtime mobile protégé sont conservés.

## Problème et cause

**P2 / MOYEN — attente réseau sur le démarrage.** `src/planner-catalog.ts` importait le validateur du catalogue complet avec un `await import()` au niveau du module. Toute la chaîne `recipes` → `Prototype` → `App` attendait cette requête supplémentaire avant de pouvoir s'exécuter. Un échec de ce module secondaire bloquait également le premier écran et la génération, même lorsque les données du planificateur étaient disponibles.

Le build de référence envoie 1 339 303 octets de JavaScript initial (301 202 gzip, entrée et préchargements comptés). Le JSON du planificateur et le grand composant applicatif restent les principaux volumes propres au produit. Le catalogue complet de 630 recettes est déjà différé.

## Correction

- `src/planner-validation.ts` contient le contrôle synchrone des recettes du planificateur.
- `src/recipe-validation.ts` rassemble les règles et primitives communes, sans duplication.
- `src/catalog-validation.ts` conserve les contrôles du catalogue complet et des précautions, chargés à la demande. L'ancien export `validatePlannerRecipes` reste compatible.
- `src/planner-catalog.ts` importe directement son petit validateur. Les fonctions déplacées ont été comparées textuellement à leur version précédente : leurs corps sont identiques. Les contrôles des allergènes, des unités, des identifiants et des estimations nutritionnelles ne sont pas assouplis.
- `scripts/validate-build-split.mjs` interdit désormais le préchargement du validateur du catalogue complet. Les budgets existants et sa présence dans le précache hors ligne restent obligatoires.
- Un test navigateur supplémentaire interdit le chargement du validateur secondaire et vérifie le premier écran puis la création d'une semaine, sans erreur JavaScript.

Un premier essai avec l'import statique de l'ensemble du validateur a été écarté : il fusionnait également le validateur complet dans le code initial et échouait au contrôle de découpage. La séparation retenue respecte ce contrôle sans le supprimer.

## Mesures avant / après

Lighthouse 13.4.1, Chromium 149.0.7827.0, profil mobile standard, même conteneur et même URL locale sous `/InflammMenu/`. Trois chargements à froid par version, alternés avant/après, navigateur neuf à chaque passage, aucune suite de tests ni compilation exécutée simultanément. Médianes ; mesures de laboratoire, pas des Core Web Vitals collectés sur des appareils réels. Écran mesuré : première ouverture avec onboarding.

| Indicateur | Avant | Après |
| --- | ---: | ---: |
| Performance Lighthouse | 73 | 75 |
| Scores individuels | 72 / 73 / 74 | 78 / 71 / 75 |
| Premier affichage, FCP | 2 750 ms | 2 480 ms |
| Affichage principal, LCP | 3 214 ms | 2 943 ms |
| Blocage du thread principal, TBT | 604 ms | 649 ms |
| Déplacement de mise en page, CLS | 0,0046 | 0,0046 |
| Accessibilité Lighthouse | 100 | 100 |
| Bonnes pratiques Lighthouse | 100 | 100 |
| SEO Lighthouse | 100 | 100 |
| JavaScript initial, brut | 1 339 303 octets | 1 348 023 octets |
| JavaScript initial, gzip Node | 301 202 octets | 303 487 octets |

L'affichage commence environ **270 ms plus tôt** (FCP −9,8 %, LCP −8,4 %). Le gain vient de la suppression de l'attente réseau, et non d'une réduction du poids initial : une partie du validateur est maintenant comptée dans l'entrée. Le TBT médian augmente de 45 ms ; ce lot ne démontre donc aucune amélioration du coût CPU. La variabilité des scores interdit de présenter les deux points gagnés comme une amélioration générale majeure. L'objectif Performance ≥95 n'est pas atteint.

## Vérifications

- Build Pages et contrôle du runtime protégé : réussis.
- Catalogue, schéma v2.1, moteur de menus et nutrition : **140 tests Node réussis**.
- Nouveau test navigateur avec le validateur secondaire bloqué : **réussi** ; démarrage et génération opérationnels.
- La CI de la PR conserve ses contrôles complets : dépendances de production, données, stockage, navigation Chromium/WebKit, accessibilité, runtime mobile, worker Sites, build Pages, PWA, hors ligne et synchronisation entre onglets. Consulter les checks du dernier commit pour leur état final.

## Suite priorisée

1. **P2 — coût CPU et code initial** : mesurer séparément la première visite et la réouverture d'une semaine enregistrée ; isoler les écrans secondaires et le poids du planificateur uniquement avec une stratégie qui préserve l'accès immédiat aux menus et le hors ligne. Le module applicatif monolithique et les 363 recettes disponibles synchroniquement restent une dette réelle.
2. **P2 — accueil après onboarding** : mesurer l'image principale et les ressources nécessaires à ce parcours avant d'adapter leur chargement. Les résultats ci-dessus ne prouvent pas un gain sur cet écran.
3. **P2 — appareils réels** : compléter les mesures sur un Android modeste et une PWA iOS ; mesurer la réactivité pendant les interactions. Aucun INP terrain ni résultat sur appareil physique n'est revendiqué ici.

Aucune dépendance ajoutée, aucune migration de données, aucun changement métier, aucune modification de l'identité visuelle. Aucun déploiement ni fusion dans `main` dans ce lot.

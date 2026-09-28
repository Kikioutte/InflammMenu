# Vérifier une optimisation du moteur

Le benchmark mesure uniquement `generateWeeklyPlan`, sur les recettes réellement
importées par le planificateur. Il ne représente ni le téléchargement du site,
ni le stockage, ni le rendu, ni les performances d'un téléphone réel.

## Protocole reproductible

Avant tout changement du moteur, dans un environnement sans autre mesure ou build
concurrent :

```sh
npm run benchmark:engine -- --output /tmp/inflamm-engine-before.json
```

Après le changement, sur la même machine et le même Node :

```sh
npm run benchmark:engine -- --output /tmp/inflamm-engine-after.json --compare /tmp/inflamm-engine-before.json
```

`--root /chemin/du/checkout` permet aussi de mesurer une autre copie déjà préparée,
sans la modifier. `--preflight` vérifie seulement que les scénarios sont faisables.
Chaque rapport conserve les profils, options, plans complets, empreintes,
échantillons bruts, versions Node/V8/OS/CPU et SHA du moteur. Un changement du
fichier moteur pendant la mesure est refusé. Les imports, assertions et empreintes
ne sont pas dans le chronomètre.

Huit profils sont croisés avec trois dates/graines fixes : 14 repas classiques,
21 repas pour 8 personnes, végétarien, allergies/exclusion, contraintes de jours,
repas conservés/favoris, budget serré et 12 repas ignorés. Une exécution initiale
non mesurée précède trois échauffements explicites puis vingt mesures par entrée,
en ordre tournant : 480 échantillons par version. Médiane et p95 au rang supérieur
sont descriptifs, jamais des seuils temporels de CI. Un budget irréalisable reste
une estimation best-effort : le scénario à 20 € ne promet pas de l'atteindre.

La comparaison refuse des environnements, protocoles, recettes, entrées, sorties
ou diagnostics incompatibles. Les plans sont comparés intégralement, sans retirer
de champ ; `generatedAt` est fixé dans les options.

## Contrat de déterminisme en CI

`tests/engine-selection.test.mjs` vérifie les 24 sorties complètes et le diagnostic
de refus contre `tests/fixtures/engine-selection-baseline.json`, capturé sur
`7c0fe61` avant optimisation. Il vérifie aussi le catalogue, les entrées et leur
absence de mutation. Les tests du benchmark contrôlent le calcul des statistiques
et les refus de comparaison. Ils sont inclus dans `test:engine` et `test:release`.

Une évolution volontaire des recettes ou des règles peut changer ces sorties.
Dans ce cas, examiner les différences et leur justification avant de remplacer
les références ; ne jamais les régénérer uniquement pour rendre les tests verts.

## Résultat du 28 septembre 2026

Catalogue de planification : 705 recettes. Node 26.10.0, V8 14.6, Apple M5 Pro
arm64. L'optimisation ne change que la sélection : chaque candidat reçoit son
score une fois, au lieu de le recalculer pendant le tri et le filtrage. Le cache
est local à la sélection ; aucune mémoire des scores entre créneaux. Tri,
départage par identifiant, seuil inclusif de 50, graine et passe budgétaire restent
identiques. Une entrée est conservée par occurrence, sans déduplication nouvelle.

Exemples automne, médiane / p95 en millisecondes :

| Scénario | Avant | Après |
| --- | ---: | ---: |
| 14 repas | 24,753 / 26,918 | 3,296 / 3,498 |
| 21 repas × 8 | 75,375 / 80,746 | 8,510 / 8,918 |
| Allergies et exclusion | 48,468 / 51,753 | 5,630 / 5,898 |
| Budget serré | 28,706 / 30,869 | 7,212 / 7,547 |
| 12 repas ignorés | 5,011 / 5,414 | 1,641 / 1,766 |

Les 24 sorties et le diagnostic sont strictement identiques. Aucun scénario n'est
ralenti dans cette campagne ; le gain médian minimal mesuré est de 67,25 %.
Ces chiffres sont des observations locales, pas des garanties universelles.

Une campagne Chromium distincte mesure dix parcours par version (deux profils,
cinq graines, contexte neuf, processeur ralenti ×4, 390×844, installation du shell
et réseau au repos avant génération). Le clic est réel. Le délai jusqu'au succès
et deux frames inclut les 50 ms applicatives, le calcul, les écritures d'état et
le rendu. Le temps et les timers restent natifs ; seul `Date.now` fixe la graine.
Seul `generatedAt` est exclu de cette comparaison navigateur des plans stockés.

- 14 repas : médiane 207,4 → 108,1 ms ; plus longue tâche médiane 146 ms → aucune
  tâche observée d'au moins 50 ms.
- 21 repas × 8 : médiane 428,4 → 147,4 ms ; plus longue tâche 366 → 86 ms.
- Dix plans comparés identiques, aucune erreur, captures succès avant/après
  identiques. Les rares requêtes de photos après génération sont conservées
  dans la mesure. Ce n'est ni un audit Lighthouse, ni de l'INP terrain, ni du
  CPU moteur pur ; la tâche initiale du clic peut précéder l'observateur.

La référence UI utilise la copie figée du build C10 `4e1ddbf` (shell
`19e888be7a2a`), dont moteur et données sont identiques à `7c0fe61`. Le candidat
mesuré porte le shell `93f9219c5c6f`. Les hashes HTML/entrée/SW identifient les
artefacts, distinctement du SHA du checkout. Rapports bruts conservés avec le
compte rendu local de l'audit ; aucun test temporel fragile n'est ajouté à la CI.

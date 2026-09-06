# Comparaison Lighthouse

Outillage de mesure uniquement, indépendant des dépendances et du build de l’application.
Le job `lighthouse-compare` de la CI compare la référence `61ab40d963fcef53c25cd8f98d2ff56f73081d8e`
au commit exact de la PR, après réussite des validations existantes. Il s’exécute uniquement
pour une PR du même dépôt, avec un jeton en lecture seule, sans secret ni déploiement.

Les deux révisions sont installées avec leur lockfile et construites avec `npm run build:pages`.
Lighthouse 13.4.1 et Playwright 1.61.1 sont verrouillés ici ; ce dernier fournit Chromium 149.
Trois passages par version et parcours alternent dans un même runner, sans build ou test concurrent.
Chaque passage crée un profil Chrome neuf. Le retour utilise la même vraie semaine courante générée
par les deux moteurs, déposée dans le stockage depuis le manifeste JSON sans exécuter l’application.
Le cache de l’application est froid ; son service worker n’est ni désactivé ni simulé.

Les rapports HTML/JSON, les résultats individuels, la fixture synthétique et la synthèse sont
conservés dans un artefact GitHub Actions pendant 30 jours. Aucune sauvegarde utilisateur n’est utilisée.
Les erreurs d’audit, de parcours, de console ou de réseau font échouer le job. La synthèse distingue
le seuil 95 sur les médianes et son atteinte sur tous les passages. Aucun score n’est inventé
en cas de campagne incomplète. Ce job mesure le résultat ; il ne remplace aucun test existant.

Reproduction, depuis ce dossier, avec deux checkouts construits et un navigateur autorisé :

```sh
npm ci
npm test
npx playwright install --with-deps chromium
node compare.mjs /chemin/avant /chemin/apres /chemin/resultats
```

Le mode `--prepare-only`, ajouté à la fin, vérifie les builds et l’égalité des fixtures sans lancer
de navigateur ni produire de score. Il autorise les changements locaux de l’outillage ; la mesure
complète exige des checkouts inchangés. Les fichiers produits restent hors du code publié.

Les mesures concernent un build Pages servi par Vite preview en local, avec les réglages mobiles
simulés par défaut. Elles ne mesurent pas le CDN publié, l’INP terrain ou un smartphone physique.
Ne pas comparer directement les scores d’anciens conteneurs à ceux de GitHub Actions : comparer
les deux versions dans une même campagne, en conservant leur variabilité.

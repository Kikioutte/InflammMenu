# Formatage des semaines au démarrage — 5 septembre 2026

## Cause mesurée

Référence : `61ab40d963fcef53c25cd8f98d2ff56f73081d8e`, validée par 340 tests en CI.

**P2 / MOYEN — `formatWeekRange` dans `Prototype.tsx`.** Chaque rendu d’une semaine construit deux formatages internationaux pour obtenir deux noms de mois français. Le profilage Chromium de l’accueil avec une semaine enregistrée, CPU ralenti ×4, attribue environ **428 ms de temps propre** à cette fonction lors de sa première exécution. La position dans le JavaScript produit a été vérifiée : elle contient bien les deux appels `toLocaleDateString("fr-FR", { month: "short" })`.

Ce chiffre provient d’une trace instrumentée, avec son surcoût. Il ne représente ni une nouvelle mesure Lighthouse ni un gain après correction. Les autres postes observés comprennent la validation des recettes et le rendu React ; cette trace ne permet pas d’imputer tout le coût de React au runtime mobile.

## Correction

Le formatage rejoint `view-format.ts`. Les douze abréviations françaises sont déclarées comme les libellés de jours déjà présents. Le calcul des dates reste identique : dates locales et ajout de jours calendaires, ce qui conserve le comportement lors des changements d’heure. Les jours, espaces, tirets, accents, changements de mois et d’année restent inchangés. Les dates invalides restent rejetées par une `RangeError`.

Le changement concerne uniquement un libellé de présentation. Aucune validation, règle de planification, donnée stockée, dépendance ni fichier runtime protégé n’est modifié. Le premier écran d’onboarding sans semaine ne bénéficie pas directement de cette correction.

## Vérification

Trois tests Node supplémentaires vérifient :
- **4 383 plages de dates** : chaque jour de 2024 à 2027, dans UTC, Europe/Paris et America/New_York, comparé au formatteur précédent ;
- le rejet des dates invalides ;
- le fonctionnement sans appel aux formatteurs internationaux pendant le rendu.

Un scénario navigateur compare aussi 72 plages dans Chromium et WebKit, y compris une année bissextile et les fins de mois. Il s’ajoute aux parcours fonctionnels existants. La CI de la PR exécute ces tests, tous les tests métier/stockage, les builds et le fonctionnement PWA, avec les exigences habituelles.

## Limite de mesure

L’environnement local s’est déconnecté après le profilage et avant l’application du correctif. Le lot est donc appliqué via GitHub et vérifié par sa CI. **Aucune mesure Lighthouse après cette correction n’est disponible à ce stade et l’objectif de 95 n’est pas déclaré atteint.**

La prochaine campagne devra comparer des builds froids de la référence et de cette correction, sur les deux parcours, sans tests concurrents. Les derniers scores mesurés restent ceux du lot précédent : 79 au premier lancement et 67 avec une semaine (médianes mobiles). Les longues tâches restantes demandent encore du profilage.

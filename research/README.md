# Recherche des 450 recettes — InflammMenu

Le cadrage des influences proposées par le porteur du projet, notamment Jean Seignalet et Yuval Noah Harari, est documenté dans [`editorial-influences.md`](./editorial-influences.md). Ces influences restent historiques et culturelles; les validations médicales, allergènes et nutritionnelles reposent sur les sources actuelles décrites ci-dessous.

## Objectif

Constituer 450 concepts culinaires originaux (`r051` à `r500`) avant leur rédaction complète et leur intégration dans le catalogue. Un concept n'est pas encore une recette validée : les quantités, la nutrition, les allergènes, le coût et les étapes doivent être calculés et relus avant publication.

L'expression « anti-inflammatoire » décrit ici une cohérence avec un modèle alimentaire global de type méditerranéen. Elle ne signifie pas qu'une recette ou qu'un ingrédient prévient, traite ou guérit une maladie.

## Références retenues

- Organisation mondiale de la Santé, alimentation saine : https://www.who.int/fr/news-room/fact-sheets/detail/healthy-diet
- Programme national nutrition santé, recommandations adultes : https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/les-recommandations-alimentaires-pour-les-adultes
- Anses, repères de consommation pour la population française : https://www.anses.fr/fr/content/lanses-actualise-les-reperes-de-consommations-alimentaires-pour-la-population-francaise
- Anses, consommation de poisson : https://www.anses.fr/fr/content/manger-du-poisson-pourquoi-comment
- Anses, table nutritionnelle Ciqual 2025 : https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025
- Anses, information sur les allergènes : https://www.anses.fr/fr/content/etiquetage-alimentaire
- Anses, précautions concernant les compléments au curcuma : https://www.anses.fr/fr/content/des-effets-indesirables-lies-la-consommation-de-complements-alimentaires-contenant-du
- Anses, vigilance sur l'iode des algues : https://www.anses.fr/fr/content/consommation-dalgues-rester-vigilant-sur-le-risque-dexces-dapport-en-iode
- Essai PREDIMED republié : https://pubmed.ncbi.nlm.nih.gov/29897866/
- Essai CORDIOPREV : https://pubmed.ncbi.nlm.nih.gov/35525255/
- Revue systématique d'essais randomisés sur les marqueurs inflammatoires : https://pubmed.ncbi.nlm.nih.gov/35831971/

## Répartition des 450 concepts

| Catégorie | Nombre |
|---|---:|
| Petits-déjeuners | 52 |
| Boissons | 21 |
| Soupes | 49 |
| Salades et bols | 78 |
| Plats principaux | 162 |
| Accompagnements | 27 |
| Encas | 22 |
| Desserts | 22 |
| Sauces et condiments | 17 |
| **Total** | **450** |

Répartition alimentaire cible : 240 concepts végétaliens, 80 végétariens, 90 pescétariens et 40 à base de volaille. Aucun nouveau concept ne repose sur de la charcuterie ou une viande transformée.

## Critères de sélection

- grande place aux légumes, fruits, légumineuses, céréales complètes, noix et graines ;
- priorité aux huiles d'olive, de colza et de noix ainsi qu'aux autres sources de graisses insaturées ;
- alternance des protéines végétales, poissons gras et maigres, œufs et volaille ;
- sucres ajoutés, sodium, graisses saturées et produits très transformés limités ;
- techniques, bases et familles aromatiques suffisamment différentes pour éviter les variantes superficielles ;
- titres, textes et étapes rédigés de façon originale, sans copie de recettes publiées ;
- inspirations culinaires du monde variées — Méditerranée, Maghreb, Levant, Afrique, Inde, Asie, Amérique latine et Europe du Nord — adaptées de façon originale aux critères du catalogue, sans présenter une adaptation comme une version traditionnelle authentique ;
- aucune promesse thérapeutique ni causalité attribuée à un ingrédient isolé.

## Contrôle d'unicité

Chaque candidat est comparé aux 50 entrées du catalogue et aux 36 recettes historiques. L'empreinte combine la catégorie, la technique, la protéine ou base, les ingrédients dominants et la famille aromatique. Une simple substitution d'herbe, d'épice ou de céréale ne suffit pas à créer une nouvelle recette.

## Étapes avant intégration

1. Relecture des 450 concepts et élimination des proximités restantes.
2. Rédaction par lots de 25 avec quantités et étapes originales.
3. Normalisation des ingrédients, unités et 14 allergènes réglementaires.
4. Calcul nutritionnel à partir de Ciqual 2025 avec source et version conservées.
5. Calcul du coût à partir d'une base de prix datée, et distinction entre temps actif, cuisson et repos.
6. Relecture culinaire et sanitaire humaine.
7. Tests du catalogue, du générateur, des filtres et de la liste de courses avant chaque intégration.

Les fichiers `recipes-r051-r200.json`, `recipes-r201-r350.json` et `recipes-r351-r500.json` constituent le répertoire de recherche. Ils ne doivent pas être importés directement par l'application tant que les étapes ci-dessus ne sont pas terminées.

## Extension inspirée de l’Ayurveda

Une collection séparée de 50 recettes, `r501` à `r550`, est cadrée dans `ayurveda-brief.md`. Elle reste strictement culinaire : aucun diagnostic de dosha, complément, extrait concentré, métal, plante médicinale ou promesse thérapeutique. Elle doit satisfaire les mêmes contrôles d’unicité, de nutrition, d’allergènes, de provenance, d’images et de générateur que la collection principale.

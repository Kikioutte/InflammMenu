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
4. C5 : retiré du périmètre à la demande de l'utilisateur le 28 septembre ;
   aucune annonce ajoutée et mode cuisine laissé inchangé.
5. C2 : téléchargement du planificateur sur le chemin de démarrage.
6. Défauts fonctionnels restants : favoris de la fiche catalogue, puis durées
   de l'éditeur, puis pas des quantités, traités séparément.
7. C8 : retiré du périmètre à la demande de l'utilisateur le 28 septembre ;
   icônes, polices et leur préchargement restent inchangés.
8. C6 : variantes d'images adaptées à l'affichage.
9. C10 : demande de stockage persistant, sans garantie trompeuse.
   Puis C14 : accès au raccourci de sauvegarde, défaut découvert pendant la
   vérification visuelle C10 et priorisé avant les optimisations.
10. C9 : benchmark du moteur ; optimisation seulement si démontrée utile et
    compatible avec des résultats déterministes inchangés.
11. C12 : référencement et métadonnées retirés à la demande de l'utilisateur
    le 28 septembre ; réglages actuels conservés.
12. C13 : contrôles de qualité et de typage, entretien du code affecté.
13. C7/C11 : changement d'origine et travaux dépendant d'un autre hébergement
    retirés à la demande de l'utilisateur le 28 septembre. L'adresse GitHub Pages
    actuelle est conservée ; aucune migration, configuration DNS ou publication.

## C6 — Photos adaptées aux écrans

- Les 1 243 JPEG de recettes et la photo d'accueil restent intacts. SHA global
  des JPEG de recettes avant/après :
  `cbbffcaf5efd5517880d829b794f76f4f81930661de2fbaf5b552ecbf7aa91ce`.
  Aucun changement des URL enregistrées dans les données et sauvegardes.
- Génération reproductible de 4 975 variantes WebP : recettes 160/320/640/900 px,
  accueil 640/960/1200 px. Ratios conservés, notamment les quatre JPEG 900×720 ;
  pas de recadrage ni d'agrandissement. Les dérivés ne sont pas suivis dans Git,
  les builds les produisent depuis les originaux. L'empreinte inclut sources,
  réglages et versions des encodeurs ; seul son petit identifiant est embarqué.
- Treize images réparties sur huit écrans utilisent la même balise `img`
  responsive, sans changement de CSS. Textes alternatifs, chargement et dimensions
  existants conservés ; dimensions manquantes ajoutées à l'accueil et aux favoris
  catalogue. Replis bornés vers JPEG puis illustration neutre, réinitialisés à
  chaque changement de source.
- Hors ligne : une variante déjà visitée peut servir une autre taille de la même
  photo ; compatibilité avec les JPEG existants et anciennes éditions. Écriture
  avant remplacement, quota conservateur, opérations sérialisées et limite de
  120 entrées maintenue. Aucune photo jamais visitée n'est annoncée disponible.
- La seule photo d'accueil précachée est désormais sa variante WebP1200
  (154 130 octets au lieu du JPEG de 332 807), également utilisable pour ses petites
  tailles hors ligne. Icônes, polices et leur précache restent inchangés. Aucune
  photo de recette n'entre dans le précache.

Mesures réelles sur `r1088`, Chromium et WebKit : original 306 691 octets ; aperçu
52 px en WebP160 : 6 026 octets (−98,0 %) ; carte bureau DPR1 en WebP320 : 18 620
(−93,9 %) ; carte mobile DPR2/3 en WebP640 : 59 660 (−80,5 %) ; fiche en WebP900 :
101 908 (−66,8 %). Mesures du corps des réponses, cohérentes avec les octets reçus,
pas une promesse de réduction de tout le chargement. L'artefact contient toujours
les JPEG de secours plus les tailles dérivées : il est plus volumineux sur disque.

Les tests ciblés incluent les quatre profils 320/DPR2, 390/DPR3, 1440/DPR1 et
1440/DPR2, erreurs WebP/JPEG/illustration, modification de photo entre onglets,
export/restauration et absence de modification des deux plans. Les tests PWA
ferment réellement le serveur avant d'ouvrir/agrandir les fiches, puis rechargent.
Captures mobile et bureau relues, ainsi que des JPEG et leurs variantes WebP ;
les références de mise en page ne changent pas. Procédure de maintenance dans
[responsive-images.md](responsive-images.md).

Validation intermédiaire C6 : 16/16 tests ciblés, 8 contrôles de génération/précache,
31 contrôles du service worker, 20/20 PWA (Chromium/WebKit), `test:release`,
TypeScript, runtime, Worker/Sites 5/5 et les deux builds passent. Première suite
navigateur complète : 222/225. Deux assertions de largeur décodée supposaient
l'absence de `srcset` : elles vérifient maintenant les vrais pixels du WebP reçu
(900×900), son identité et son affichage, puis les portions ; relance 2/2 réussie.
L'autre échec a été reproduit isolément (1/10). La trace montre le retour correct
du focus au champ à 1712 ms, puis le focus du H1 par `FlowStack.applyFocus` à
1719 ms en fin d'animation. L'éditeur et ce runtime sont inchangés depuis 6c.
Le test doit attendre l'activation de l'écran avant ses saisies ; les assertions
de focus après chaque erreur restent obligatoires. Cela ne corrige ni ne masque
la limite préexistante d'une interaction très rapide pendant la transition du
runtime protégé, laissé inchangé. Les 20 répétitions du test exact après cette
synchronisation passent (10 Chromium, 10 WebKit), de même que les 20 répétitions
préalables dans le harnais attendant l'activation. L'audit des dépendances ne
signale aucune vulnérabilité.

Clôture C6 : **225/225 tests navigateur** sur la relance complète, 20/20 PWA,
8/8 génération/précache, 31/31 service worker, `test:release`, TypeScript,
Worker/Sites 5/5, builds Pages et Worker, runtime protégé, relecture indépendante
et contrôle du diff réussis. Précache Pages `8569edfa2bf2` : 32 ressources, dont
les mêmes 12 polices et 2 icônes ; graphe critique 7 JavaScript, 2 261 879 octets
et 406 835 gzip, sous les budgets inchangés. Le point suivant n'avait pas été
commencé lors de cette clôture.

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

## C5 — Retiré à la demande de l'utilisateur

Le 28 septembre, l'utilisateur a demandé de ne pas ajouter d'annonce en mode
cuisine. Le travail a été arrêté avant toute modification ; aucun fichier du
mode cuisine ni test associé n'a été changé pour ce point. Le point suivant est
C2, le chargement initial du planificateur.

## C2 — Découverte anticipée du planificateur

- Les builds Pages et Worker utilisent le manifeste Vite pour précharger les
  modules du planificateur et du validateur, ainsi que leur dépendance commune,
  avant l'entrée HTML. Le registre synchrone et la validation restent inchangés.
- Le garde-fou compte les scripts d'entrée, les préchargements et leurs imports
  statiques transitifs, plus les deux imports dynamiques bloquants connus. Un
  nouvel import bloquant devra être déclaré ; un test navigateur confronte aussi
  ce graphe aux requêtes réelles. Catalogue complet et écrans secondaires exclus.
- Budget JavaScript critique fixe : 2 400 000 octets bruts et 425 000 gzip,
  contre 2 260 576 et 406 225 mesurés sur les sept fichiers avant et après.
  Aucune réduction du poids JavaScript ni amélioration CPU n'est revendiquée.

Comparaison de cinq navigateurs Chromium 149 neufs par version, vue 390 × 844,
cache froid, service worker bloqué, gzip niveau 6, réseau à 1,6 Mbit/s avec
150 ms de latence et CPU ralenti ×4 :

| Mesure | Avant `83caa0d` | Après C2 |
| --- | --- | --- |
| Premier affichage, médiane | 2 768 ms | 2 608 ms |
| Étendue des cinq essais | 2 748–2 792 ms | 2 600–2 724 ms |
| Début requête planificateur, médiane | 1 680,1 ms | 171,4 ms |
| Fin requête planificateur, médiane | 2 644,8 ms | 2 479,5 ms |

Premier affichage brut avant : 2792, 2768, 2772, 2748, 2760 ms ; après :
2724, 2600, 2600, 2612, 2608 ms. Le gain médian observé est de 160 ms (5,8 %),
pas une promesse pour tous les appareils. Les captures mobiles avant/après sont
identiques, empreinte `bd40eedcd808a106083ca64af5f307aad00464e3e152263fc5166a8490122ee6`.

Clôture C2 : 17/17 nouveaux tests de graphe/préparation ; suite performance
26/26 via `test:release` ; PWA complète 12/12, incluant le démarrage réel
Chromium/WebKit (chaque script une seule fois, catalogue toujours différé) ;
Worker/Sites 5/5 ; builds Pages/Worker, TypeScript, runtime protégé et relecture
indépendante réussis. Build Pages final : service worker `6e4db8ba4b2f`.

Ordre impératif de validation : Worker/Sites, puis reconstruction Pages, puis
PWA. Le préparateur Sites existant retire `dist/pages` pour éviter de publier
deux fois les assets ; un premier lancement PWA en parallèle a donc été arrêté
par l'absence de cette sortie, puis intégralement relancé dans le bon ordre.

## C8 — Retiré à la demande de l'utilisateur

Après explication des poids des icônes et des formats de polices, l'utilisateur
a demandé de ne pas faire cette optimisation. Aucune modification n'avait été
commencée : icônes, polices et leur préchargement sont conservés. Cette décision
ne retire pas le point distinct C6 sur les images des recettes.

## 6a — Favoris de la fiche catalogue

- Le cœur, le libellé et l'état accessible suivent désormais directement le
  favori partagé ; aucune copie locale ne peut rester périmée.
- Un changement dans un autre onglet actualise la fiche déjà ouverte, même
  sous un écran empilé, sans rechargement ni remise à zéro des portions.
- Les clics suivants, y compris rapides, utilisent l'état courant ; les autres
  données et les deux semaines sont conservées après rechargement.

Clôture 6a : 4/4 nouveaux tests interonglets Chromium/WebKit, 6/6 parcours
existants favoris/collections, `test:release`, TypeScript, runtime protégé et
relecture indépendante réussis. Deux captures mobiles relues. Les durées et
quantités n'avaient pas encore été modifiées à ce jalon.

## 6b — Durées de l'éditeur

- L'éditeur accepte de 1 à 1 440 minutes actives, comme la persistance existante,
  au lieu de bloquer au-delà de 600. Les bornes et le message sont partagés.
- L'éditeur exige toujours un entier ; la restauration conserve son arrondi
  historique, après contrôle des bornes. Les valeurs non finies restent refusées.
- Le repos reste indépendant. Une recette longue n'obtient aucune dérogation
  aux critères du profil pour entrer dans un menu.

Clôture 6b : 5/5 nouveaux tests unitaires, 10/10 tests Chromium/WebKit,
6/6 parcours existants de l'éditeur, `test:release`, TypeScript, runtime protégé
et relecture indépendante réussis. Les tests couvrent 600/601/1 440 minutes,
les refus hors borne ou invalides, l'édition d'une recette déjà à 1 440 minutes,
un export/restauration réel avec 2 880 minutes de repos distinctes, les deux
semaines compatibles et les autres données conservées. Le format des sauvegardes
et les quantités restent inchangés.

## C7/C11 — Changement d'adresse retiré à la demande de l'utilisateur

L'utilisateur ne dispose pas d'un autre hébergement et demande de conserver
l'adresse actuelle. La migration vers une origine dédiée et les travaux qui
nécessiteraient un autre hébergement sont retirés du plan. Les protections
existantes sont conservées ; les limites de l'origine GitHub Pages partagée
et des en-têtes HTTP configurables ne sont pas présentées comme corrigées.

## C12 — Référencement retiré à la demande de l'utilisateur

Après distinction entre moteurs de recherche et aperçus de partage,
l'utilisateur demande de retirer également ce point. Aucun chantier SEO,
nouvelle page indexable ni changement des métadonnées n'est entrepris.

## 6c — Pas et précision des quantités

- Pas de 5 g/ml conservés ; pièces et cuillères réglées par quarts. Le calcul
  décimal local évite l'arrondi systématique à deux décimales ; les lignes non
  éditées et leurs identifiants, unités, options et allergènes restent intactes.
- Compteur et explication affichent la même valeur française exacte, par exemple
  0,004, 0,125 ou 1,25. Le formateur des autres parcours n'est pas modifié.
- Une diminution peut volontairement atteindre zéro pour retirer un ingrédient ;
  le dernier ingrédient ne peut toujours pas être supprimé par une sauvegarde.
- La borne persistée reste 1 000 000. L'augmentation devient indisponible avant
  de la dépasser, sans tronquer une quantité valide. Les contrôles locaux font
  44 px et se replient sur les petits écrans sans rogner les chiffres.

Les nouveaux tests ont aussi révélé un défaut préexistant du chargement des
coefficients : sous Chromium/Vite, un import JSON attendait un type JSON mais
recevait du JavaScript ; les builds Pages et Worker conservaient également un
chemin source absent, malgré un fichier de données compilé présent. Le choix
d'import distingue maintenant Vite et Node. Les coefficients, les formules,
le chargement à la demande et la possibilité de réessayer après échec restent
inchangés. Les builds finaux demandent le véritable fichier compilé.

Clôture 6c : 9/9 tests unitaires de quantités, 9/9 tests nutrition, 12/12 nouveaux
parcours Chromium/WebKit, 18/18 parcours ciblés existants et suite navigateur
complète 209/209 réussis. `test:release`, TypeScript, runtime protégé, relecture
indépendante, Worker/Sites 5/5 et PWA complète 14/14 réussis. Les deux nouveaux
tests Pages chargent réellement les données puis vérifient r631 modifiée
(1,36 € et 378 kcal), les deux semaines et le rechargement, sans réponse simulée.
Les parcours de développement couvrent aussi export/restauration. Captures
320/390 px relues ; build Pages final au jalon : service worker `5e3021de37c3`.

Limite numérique inchangée : une modification reste stockée dans un nombre
JavaScript. Un résidu subnormal ajouté à un quart ne peut pas être retrouvé
ensuite ; aucune promesse d'aller-retour universel au-delà de cette précision.
L'affichage des petites valeurs non modifiées, même extrêmes, reste non nul.

## C10 — Protection facultative du stockage local

La demande `navigator.storage.persist()` est indépendante de l'enregistrement.
Elle n'est envisagée qu'après la génération d'une nouvelle semaine non vide,
puis la confirmation d'au moins une copie durable par `saveAppState`. Le plan
normalisé et la génération du stockage doivent encore correspondre dans l'état
demandé, le résultat sauvegardé et l'état vivant ; la promotion d'une semaine
suivante conserve cette éligibilité. Une réponse de sauvegarde ancienne ne
consomme pas l'intention d'une génération plus récente.

La sonde `persisted()` évite de redemander un stockage déjà persistant. Une seule
demande effective par session est tentée ; les appels concurrents sont réunis.
Une intention annulée avant la demande ne prive pas une nouvelle semaine de sa
tentative. Une restauration ou suppression pendant la sonde invalide l'ancienne
intention. API absente, refus, exception ou promesse qui ne répond pas n'empêchent
ni la navigation ni les enregistrements suivants. Aucun nouveau champ n'entre
dans les données, les sauvegardes ou le stockage local.

Le texte d'information précise que le navigateur reste décisionnaire et qu'un
export demeure nécessaire. Cela ne constitue pas une garantie contre l'effacement
manuel, la perte de l'appareil ou toutes les politiques des navigateurs. Références :
[StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
et [politique de stockage WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/).

Les tests doublent explicitement l'API de permission, pas la génération ni la
sauvegarde : les copies localStorage/IndexedDB, transactions, exports et imports
restent réels. Un verrou de transaction retarde l'écriture et vérifie l'absence
de demande avant sa fin. Le témoin de commit est installé avant le callback de
l'application : certains moteurs exécutent des microtâches entre les listeners
du même événement ; ce témoin ne modifie pas l'écriture ni ses callbacks.

Validation intermédiaire C10 : 11/11 tests unitaires, les 32 scénarios ciblés
réussis par sous-ensembles, `test:release`, TypeScript, runtime protégé, Worker/Sites
5/5, builds Pages/Worker et PWA complète 20/20 réussis. Relecture indépendante
terminée. Six captures Informations relues sur Chromium/WebKit, à 320, 390 et
1440 px : texte entier, aucun débordement ni erreur console ; styles inchangés.
Clôture C10 : **257/257 tests navigateur** réussis sur la passe complète, dont
32/32 nouveaux parcours ; les autres portes ci-dessus passent également.
Précache Pages `19e888be7a2a`, 32 ressources et 407 178 octets gzip critiques,
sous le budget inchangé. Aucun point suivant commencé lors de cette clôture.
Les permissions accordées dans ces tests sont des doubles API, pas une garantie
d'accord sur l'appareil de chaque utilisateur.

## C14 — Raccourci de sauvegarde découvert pendant la vérification

À 1440×1000 px, la carte de semaine recouvrait le raccourci « Sauvegarde et
hors-ligne » de l'accueil : clic réel intercepté par son en-tête. Capture, trace
et coordonnées conservées au jalon C10. La structure `home-shortcuts` puis
`week-preview`, la marge de −34 px sur bureau et celle de −8 px sur mobile sont
déjà présentes dans la source `eb9a54e`. Cette antériorité est vérifiée dans le
code ; la reproduction visuelle a été faite sur la branche, pas sur un build
séparé de cette base. Le bas de la cible mobile est également concerné par la
marge négative, même lorsque son centre reste cliquable.

Point commencé après la clôture de C10. Correction limitée à une règle adjacente :
`.home-shortcuts + .week-preview { margin-top: 12px; }`. Les marges latérales et
basse, les autres cartes, les couleurs, polices, handlers et données sont intacts.

Le test rouge reproduit le vrai clic intercepté avant correction. Après : 16/16
nouveaux parcours Chromium/WebKit passent (320/390/768/1440 px, textes normal et
agrandi, menus présents et absents répartis dans la matrice). Cinq points de
hit-test par cible, rectangles non recouvrants, vrais clics Informations/export,
Recettes et Semaine, aucun débordement horizontal ni changement des données
exportées ou enregistrées. Captures bureau/mobile relues. Les quatre tests
existants de navigation et de texte à 200 %, `test:release`, TypeScript, runtime
protégé et contrôle du diff passent. Relecture indépendante terminée : trois
captures relues et seize géométries contrôlées, écart de 12 px partout et tous les
points cliquables. C14 clôturé avant de commencer C9.

## C9 — Mesure et optimisation minimale du générateur

Commencé après C14. La mesure préalable sur 705 recettes confirme le coût des
recalculs de score dans le tri ; un profil V8 diagnostique séparé concentre environ
94 % des échantillons de génération dans la sélection des candidats. La passe
budgétaire n'est pas modifiée. Le correctif calcule chaque score une seule fois
par sélection, sans cache entre créneaux ni changement de formule, d'ordre de tri,
de seuil, de graine, de filtre ou de verrou.

Vingt-quatre plans complets à dates/graines fixées et le diagnostic d'échec restent
strictement identiques, sur 480 mesures Node par version. Le gain médian minimal
mesuré est de 67 %. Vingt-six tests de référence sans seuil temporel conservent
cette preuve dans la suite de livraison, en plus de six tests du benchmark.

Deux profils sont aussi vérifiés par dix parcours Chromium ×4 par version :
207,4 → 108,1 ms pour 14 repas ; 428,4 → 147,4 ms pour 21 repas ×8. Les dix plans
sauvegardés sont identiques hors horodatage, les captures succès sont identiques
et aucune erreur n'est observée. Mesures de laboratoire, pas de téléphone réel
ni d'INP terrain. Protocole, limites, résultats et maintenance des références :
[engine-benchmark.md](engine-benchmark.md).

Clôture C9 : relecture indépendante, 129 tests ciblés, `test:release`, TypeScript,
runtime protégé, builds Pages/Worker, Worker/Sites 5/5, PWA complète 20/20 et
**273/273 parcours navigateur** réussis. Précache final `93f9219c5c6f` ; 32
ressources et 407 175 octets gzip critiques, budgets inchangés. Aucun début de
C13 avant cette clôture. La simulation 21 repas ×8 garde une longue tâche médiane
de 86 ms : aucune promesse d'absence universelle de blocage ou de temps identique
sur tous les appareils.

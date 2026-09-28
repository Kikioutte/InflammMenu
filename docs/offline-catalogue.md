# Éditions du catalogue hors ligne

Le catalogue téléchargé explicitement est enregistré sous une clé logique stable,
`data/recettes-anti-inflammatoires.json`, dans le cache `inflamm-menu-catalogue-v2`.
Les anciennes clés hachées de v2 et les copies v1 restent lisibles lorsqu'elles
correspondent à une édition explicitement admise. Les sauvegardes personnelles
et les recettes du planificateur ne changent pas de format.

## Validation et intégrité

`src/data/catalogue-offline-editions.json` décrit l'édition courante et les éditions
antérieures admises. L'empreinte SHA-256 porte sur `JSON.stringify(JSON.parse(body))` :
les espaces du transport ne comptent pas, mais le contenu doit correspondre
exactement à une édition relue. Le nombre attendu vient du manifeste, jamais du
seul nombre déclaré par un JSON non fiable. Tous les champs passent ensuite par
le validateur structurel et éditorial habituel.

L'édition de 1 087 recettes du commit `7a11e85` est admise parce que ses recettes
sont identiques aux 1 087 premières de l'édition de 1 207 recettes ; celle-ci ajoute
120 recettes. Une copie ancienne est signalée dans le catalogue et dans les
informations, avec un bouton de mise à jour disponible.

## Lors d'une modification du catalogue

1. Relire et valider les nouvelles recettes et éventuelles corrections existantes.
2. Actualiser l'empreinte et le nombre de `current` dans le manifeste. Le contrôle
   `node scripts/validate-offline-editions.mjs` indique les valeurs calculées.
3. Décider explicitement quelles éditions précédentes restent acceptables. Une
   correction d'allergène ou de sécurité peut imposer d'en retirer une ; ne pas
   admettre automatiquement toute ancienne version. Adapter alors le test de
   reconstitution de l'édition historique.
4. Tester une mise à jour et un redémarrage hors ligne, avec un vrai arrêt réseau.

La copie téléchargée n'est remplacée qu'après validation complète et réussite de
`cache.put`. La purge des anciennes clés suit cette écriture ; un échec de purge
n'invalide pas la nouvelle copie. Une lecture d'une ancienne édition ne l'écrit
pas par-dessus une mise à jour concurrente. Une édition inconnue n'est jamais
affichée, mais est conservée jusqu'à un remplacement réussi pour ne pas détruire
la copie éventuellement utilisable par un autre onglet. Les écritures et purges
sont sérialisées par Web Locks. Si la clé stable contient une édition inconnue,
elle est préservée et le téléchargement courant utilise une clé par empreinte.
Sans Web Locks, chaque édition utilise également sa propre clé, sans purge :
la sécurité des copies concurrentes prime sur le gain d'espace.

Ces empreintes ne constituent pas une isolation contre un autre script de la
même origine. La migration vers une origine dédiée reste un chantier distinct.

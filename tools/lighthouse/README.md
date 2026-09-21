# Mesurer deux builds Pages

Outils isolés des dépendances de production : Lighthouse 13.4.1, Playwright 1.61.1,
chrome-launcher 1.2.1, Puppeteer Core 25.10.0. Les versions exactes sont verrouillées.

Les commandes lisent deux builds Pages **déjà terminés et figés**, sans recopier les
photos. Le premier argument est le build avant, le deuxième le build après. Le même
serveur statique sert successivement les deux dossiers sous `/InflammMenu/` sur le
port 4193. Les ressources absentes restent en 404. Le service worker réel reste actif.
Les ressources textuelles sont servies avec gzip niveau 6, calculé avant les mesures,
comme représentation compressée comparable à celle de Pages. Les octets exacts du
CDN et sa latence ne sont pas reproduits ; `Cache-Control: no-cache` reste identique.
`CHROME_PATH` peut désigner explicitement un Chrome Headless Shell officiel lorsque
le Chrome complet ne peut pas démarrer dans l’environnement. Utiliser le même binaire
pour toute la campagne ; son chemin et sa version réelle figurent dans les métadonnées.

```sh
npm ci --prefix tools/lighthouse
npm test --prefix tools/lighthouse
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-browsers npx --prefix tools/lighthouse playwright install chromium

# Préparation seulement : aucun navigateur, aucune note Lighthouse.
node tools/lighthouse/compare.mjs ../perf-baseline-pages dist/pages ../perf-prepare \
  --baseline-ref=cfe5f46f319c854db80586cd3efe008bdbb2822b --prepare-only

# À lancer lorsque les deux builds sont terminés et figés.
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-browsers node tools/lighthouse/compare.mjs \
  ../perf-baseline-pages dist/pages ../perf-lighthouse \
  --baseline-ref=cfe5f46f319c854db80586cd3efe008bdbb2822b

# Campagne distincte, après Lighthouse ; jamais en parallèle.
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-browsers node tools/lighthouse/interactions.mjs \
  ../perf-baseline-pages dist/pages ../perf-interactions \
  --baseline-ref=cfe5f46f319c854db80586cd3efe008bdbb2822b
```

Le candidat est identifié par son commit parent, son diff de travail et les SHA256
de tous les fichiers du build, y compris les sources non suivies par Git. La
référence avant est obligatoire. Aucun build, test ou changement
de source ne doit intervenir pendant les mesures.

Une seule fixture synthétique avec une semaine courante est construite à partir du
moteur actuel. Le moteur, son contrat de profil et les données du catalogue sont
comparés octet par octet à la référence : cette méthode refuse les changements qui
nécessiteraient deux fixtures différentes. Le prénom est fictif, aucune sauvegarde
utilisateur n’est lue. La fixture et toutes les empreintes sont conservées.

Lighthouse effectue trois passages froids par version et par parcours (première
ouverture et retour avec semaine), soit douze audits. L’ordre avant/après alterne.
Chaque audit utilise un nouveau profil Chromium. Les quatre catégories, rapports
HTML/JSON complets, requêtes, mesures individuelles et synthèse sont conservés.
Le parcours effectivement affiché, la semaine entière et les images visibles sont
vérifiés. Audit incomplet, avertissement Lighthouse ou erreur console/réseau font
échouer la campagne. Une campagne partielle ne produit aucune médiane publiée.

Le script d’interactions mesure séparément le délai jusqu’au premier catalogue et
le délai de génération visible, avec viewport mobile et CPU ralenti ×4. Les profils,
graines et plans produits sont vérifiés identiques. Il conserve toutes les valeurs
brutes ; il ne prétend pas mesurer le parse JSON seul ou l’INP terrain.

Ces résultats de laboratoire ne mesurent ni le CDN public ni un smartphone réel.
Le seuil 95 est un objectif, jamais une note présumée ni une certification WCAG.
Les dossiers de résultats sont des artefacts ; les conserver avec le rapport final.

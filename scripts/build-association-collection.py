#!/usr/bin/env python3
"""Rebuild only the authored personal-association collection from reviewable sources."""
import csv, json, re, unicodedata, hashlib, itertools, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(p): return json.loads((ROOT/p).read_text())
def write(p,d):
    path=ROOT/p; path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def slug(s):
    return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s.replace('œ','oe')).encode('ascii','ignore').decode().lower()).strip('-')
rules=read('research/associations-rules-v1.json')
groups=rules['groups']; matrix=[x.split() for x in rules['rows']]
assert all(matrix[i][j]==matrix[j][i] for i in range(17) for j in range(17))
base=read('research/association-baseline-catalogue.json')
generated_images=set(read('src/data/generated-recipe-images.json'))
foods={x['code']:x for x in read('research/association-ciqual-source.json')['foods']}
ids='riz-complet sarrasin-decortique-cru quinoa farine-sarrasin polenta-fine pomme-terre lentilles-vertes-seches lentilles-corail-seches pois-casses-secs pois-chiches-secs haricots-blancs-secs blanc-poulet dinde-escalope filet-cabillaud saumon-frais truite-filet sardines-fraiches maquereau-filet amande noisette noix pignons-pin graines-sesame avocat huile-olive-vierge-extra chou-blanc chou-rouge laitue mache endive fenouil-bulbe radis-rose cotes-blette-crues haricots-verts brocoli chou-fleur poivron-rouge champignon-paris aubergine concombre courge-musquee courgette cresson asperges-vertes epinard-frais ciboulette-fraiche persil-frais carotte navet betterave-crue celeri-branche celeri-rave panais petits-pois-frais rutabaga choux-bruxelles fonds-artichaut-frais basilic-frais fraise ananas-frais citron clementine framboise graines-grenade groseille orange tomate cerise peche poire pomme prune abricot-frais mangue banane figue-fraiche raisin-frais abricots-secs-non-sulfures figues-seches melon-charentais pasteque eau'.split()
rows=list(csv.DictReader((ROOT/'research/association-ingredients.tsv').open(),delimiter='\t'))
assert len(rows)==len(ids),(len(rows),len(ids))
alias_source=read('src/data/ingredient-id-aliases.json')
aliases={slug(a):slug(b) for a,b in alias_source['aliases'].items()}
for group in alias_source['canonical_groups']:
    for alias in group['aliases']:
        if slug(alias)!=slug(group['canonical_id']): aliases[slug(alias)]=slug(group['canonical_id'])
def canonical(raw):
    value=slug(raw); visited=set()
    while value in aliases and value not in visited:
        visited.add(value); value=aliases[value]
    return value
ids=[canonical(value) for value in ids]
registry={}
for r,id in zip(rows,ids):
    r['group']=r['group'].strip(); assert r['group'] in groups
    r['id']=id; r['allergens']=[a for a in r['allergens'].split(',') if a]
    r['price_per_kg']=float(r['price_per_kg']); r['food']=foods[r['ciqual']]
    registry[r['key']]=r

def classification(items):
    pairs=[]
    for a,b in itertools.combinations(items,2):
        ga,gb=a['group'],b['group']; color=rules['semantics'][matrix[groups.index(ga)][groups.index(gb)]]
        if color!='verte': pairs.append({'ingredient_a':a['id'],'ingredient_b':b['id'],'nom_a':a['nom'],'nom_b':b['nom'],'groupe_a':ga,'groupe_b':gb,'niveau':color})
    return {'ruleset':rules['version'],'niveau':'grise' if any(x['niveau']=='grise' for x in pairs) else 'orange' if pairs else 'verte','paires':pairs}

NUTRI={'calories':'energy_kcal','proteines_g':'protein_g','glucides_g':'carbohydrate_g','sucres_g':'sugars_g','lipides_g':'fat_g','acides_gras_satures_g':'saturated_fat_g','fibres_g':'fiber_g','sodium_mg':'sodium_mg'}
recipes=[]
authored_lines=[]
for source_file in ['association-recipes.txt','association-green-recipes.txt','association-green-recipes-02.txt','association-green-recipes-03.txt']:
    authored_lines.extend((ROOT/'research'/source_file).read_text().splitlines())
for line in authored_lines:
    if not line.strip() or line.startswith('#'):continue
    title,category,raw,times,equipment,steps=line.split('|')
    amounts=[(registry[k],float(g)) for k,g in (i.split(':') for i in raw.split(','))]
    assert len({i['key'] for i,g in amounts})==len(amounts),title
    prep,cook,rest=map(int,times.split(',')); items=[i for i,g in amounts]
    ass=classification(items)
    assert ass['niveau']!='grise',(title,ass['paires'])
    if len(recipes)>=200: assert ass['niveau']=='verte',('Le nouveau lot doit rester entièrement vert',title,ass['paires'])
    allergens=sorted(set(a for i in items for a in i['allergens']))
    assert not {'gluten','lait'} & set(allergens)
    animal=any(i['group']=='proteines-maigres' for i in items)
    fish='poisson' in allergens
    nutrients={};missing=[]
    for output,key in NUTRI.items():
        unavailable=[i['nom'] for i,g in amounts if i['food']['nutrients_per_100g'][key]['value'] is None]
        if unavailable: nutrients[output]=None;missing.append(output+': '+', '.join(unavailable))
        else:nutrients[output]=round(sum(i['food']['nutrients_per_100g'][key]['value']*g/100 for i,g in amounts)/2,1)
    assert all(nutrients[k] is not None for k in ['calories','proteines_g','fibres_g'])
    nutrition_detail=[{'ingredient_id':i['id'],'source_dataset':'ciqual','source_code':i['ciqual'],'source_name':i['food']['name'],'grams':g,'conversion':'factor_ml' if i['key']=='eau' else 'factor_g'} for i,g in amounts]
    nutrients['estimation']={'statut':'calculated-with-cautions' if missing else 'calculated','methode':'Somme des ingrédients bruts comestibles pour deux portions ; pas de correction des pertes ni des rendements de cuisson. Eau absorbée estimative le cas échéant.','provenance':'Anses Ciqual 2025, extraction locale documentée','details':nutrition_detail,'cautions':missing,'donnees_manquantes':missing}
    ingredients=[]
    for i,g in amounts:
        group=i['group']; note='Poids comestible avant cuisson, sauf indication contraire.'
        if group in ['amidons','legumes-secs']:note+=' Choisir un produit simple sans additifs, garanti sans gluten ; légumineuses sèches à cuire maison.'
        if i['key']=='huile':note="Huile vierge extra non raffinée, sans mélange ni arôme ajouté."
        if i['key']=='eau':note="Eau incorporée ; pour les légumes secs égouttés, voir l'estimation d'absorption et l'eau technique dans les étapes."
        if i['key'] in ['abricot_sec','figue_seche']:note+=' Sans sulfites, sucre, huile ni autre additif ajouté.'
        if i['key']=='pomme':note+=' Variété acidulée classée dans la colonne fruits mi-acides du tableau.'
        cat='meat-fish' if group=='proteines-maigres' else 'beverage' if i['key']=='eau' else 'grocery' if group in ['amidons','legumes-secs','proteines-grasses'] or i['key']=='huile' else 'fruit-vegetable'
        ingredients.append({'id':i['id'],'nom':i['nom'],'quantite':g,'unite':'ml' if i['key']=='eau' else 'g','quantite_normalisee':g,'unite_normalisee':'ml' if i['key']=='eau' else 'g','facultatif':False,'note':note,'categorie_courses':cat,'allergenes':i['allergens'],**({'pantry_staple':True} if i['key']=='eau' else {})})
    targets=[]
    if any(i['group']=='legumes-secs' for i in items):targets.append('pulse')
    if fish:targets.append('finfish')
    eligible=category in ['plat','salade','soupe','petit-dejeuner'] and nutrients['calories']>=220
    index=631+len(recipes);id=f'r{index}'
    status_text='Associations orange : '+ '; '.join(p['nom_a']+' + '+p['nom_b'] for p in ass['paires'])+'.' if ass['niveau']=='orange' else 'Toutes les associations de cette composition sont vertes dans le tableau fourni.'
    cautions='Recette relue sur données, non testée en cuisine ; quantités, texture, prix et durées restent estimatifs. '+status_text
    if missing:cautions+=' Certaines valeurs nutritionnelles secondaires ne sont pas disponibles dans la source et restent non renseignées.'
    conservation='Refroidir rapidement dans un récipient peu profond et réfrigérer à 4 °C ou moins dans les deux heures. Consommer sous 48 h ; réchauffer une seule fois à cœur.'
    if any(i['key']=='riz' for i in items):conservation='Refroidir le riz rapidement, le réfrigérer dans l’heure et consommer sous 24 h. Réchauffer une seule fois jusqu’à ce qu’il soit très chaud à cœur.'
    if category in ['salade','dessert','collation'] or cook==0:conservation='Conserver immédiatement au réfrigérateur à 4 °C ou moins et consommer sous 24 h. Assembler les éléments croquants au dernier moment.'
    if animal:conservation+=' Séparer les ustensiles ayant touché le poisson ou la volaille crus des aliments prêts à consommer.'
    cost=round(max(.1,sum(i['price_per_kg']*g/1000 for i,g in amounts)/2),2)
    regimes=['classique','sans-porc','sans-gluten','sans-lactose']
    if not animal:regimes[1:1]=['vegetalien','vegetarien']
    elif fish:regimes.insert(1,'pescetarien')
    if 'fruits-a-coque' not in allergens:regimes.append('sans-fruits-a-coque')
    diet=['classic','no-pork'] if animal else ['classic','vegetarian','no-pork']
    substitutions=[]
    # Each alternative remains within the closed ingredient list and is checked pairwise.
    replacements={'riz':'sarrasin','lentille':'corail','noix':'noisette','poulet':'dinde','cabillaud':'truite','courgette':'fenouil','carotte':'navet','poire':'pomme'}
    for item,g in amounts:
        dest=replacements.get(item['key'])
        if not dest or dest in [i['key'] for i in items]:continue
        other=registry[dest]; replaced=[other if i['key']==item['key'] else i for i in items]
        check=classification(replaced)
        if check['niveau']=='grise':continue
        # Culinary timing changes must remain visible; substitutions are informational, not silently applied.
        notes={'riz':'Cuire le sarrasin environ 15 min avec 2 volumes d’eau ; le temps et la texture changent.','lentille':'Cuire les lentilles corail 20 à 25 min ; elles se défont davantage.','poulet':'Même poids cru et contrôle de 74 °C à cœur.','cabillaud':'Même poids cru ; conserver le contrôle de 63 °C à cœur.'}
        substitutions=[{'remplacer':item['nom'],'par':other['nom'],'note':notes.get(item['key'],'Même poids ; adapter la coupe et vérifier la tendreté.')+' Associations '+check['niveau']+' après remplacement. Les allergènes, la nutrition et le coût de la fiche restent ceux de la recette de base. Vérifier le profil personnel.'}]
        break
    image_filename=id+'-'+slug(title)+'.jpg'
    image_ready=image_filename in generated_images
    recipe={'id':id,'slug':slug(title),'titre':title,'categorie':category,'description':title+'. Préparation maison à partir d’ingrédients simples ; les associations sont détaillées séparément de l’appréciation nutritionnelle.','temps':{'preparation':prep,'cuisson':cook,'repos':rest,'total':prep+cook+rest},'portions':2,'difficulte':'intermediaire' if prep>=25 else 'facile','cout':'economique' if cost<3 else 'moyen','regimes':regimes,'saisons':['toute-annee'],'tags':['associations-personnelles','sans-produits-laitiers','sans-alcool-ajoute','fait-maison','associations-'+ass['niveau']], 'composes_actifs':[], 'ingredients':ingredients,'etapes':['Laver les végétaux, parer et peser les ingrédients selon les quantités affichées.']+steps.split('~'),'conseils':['Ne pas ajouter de sauce, bouillon ou assaisonnement non prévu sans revérifier toutes les associations.','Pour composer un repas avec plusieurs fiches, utiliser le contrôle du repas complet : deux recettes compatibles séparément peuvent être incompatibles ensemble.'],'substitutions':substitutions,'conservation':conservation,'nutrition_par_portion':nutrients,'score_anti_inflammatoire':None,'image':{'nom_fichier':image_filename,'alt':('Photo du plat : ' if image_ready else 'Photo non réalisée : ')+title,'statut':'generated_inspected_optimized' if image_ready else 'differee-utilisateur'},'provenance':{'type':'original','author':'InflammMenu','license':'CC BY-SA 4.0','created_at':'2026-09-06','reviewed_at':'2026-09-06','sources':[{'kind':'inspiration','title':rules['source'],'accessed_at':'2026-09-06'},{'kind':'nutrition','title':'Anses Ciqual 2025 — valeurs des ingrédients bruts, extraction locale documentée','url':'https://doi.org/10.57745/RDMHWY','accessed_at':'2026-09-06'},{'kind':'cost','title':'Hypothèses éditoriales en euros par kilogramme ; aucun relevé de prix actuel','accessed_at':'2026-09-06'},{'kind':'safety','title':'Températures minimales de cuisson','url':'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures','accessed_at':'2026-09-06'}]},'associations':ass,'app':{'review':{'status':'caution','summary':'Composition maison sans gluten, produits laitiers ni alcool ajouté. '+('Associations orange signalées.' if ass['niveau']=='orange' else 'Associations vertes selon le tableau personnel.'),'caution':cautions},'planner':{'eligible':eligible,'meal_types':['breakfast'] if category=='petit-dejeuner' else ['lunch','dinner'],'diets':diet,'cost_per_portion_eur':cost,'equipment':equipment.split(',') if equipment else [],'allergens':allergens,'targets':targets,'active_minutes':prep+min(cook,15)}}}
    recipe['provenance']['sources'][1]['title']='Anses Ciqual 2025 — valeurs des ingrédients bruts, extraction locale'
    recipe['materiel']=['Couteau, planche, balance et récipient de préparation']+[{'hob':'Plaque de cuisson et casserole avec couvercle ; panier vapeur si indiqué','oven':'Four et plat adapté','blender':'Mixeur adapté à la préparation','steamer':'Cuiseur vapeur'}[x] for x in equipment.split(',') if x]
    recipes.append(recipe)

assert len({r['slug'] for r in recipes})==len(recipes),'titres dupliqués'
base_slugs={r['slug'] for r in base['recipes']}
assert not base_slugs.intersection(r['slug'] for r in recipes),'titre déjà présent dans la base'
signatures={};exact=[]
for r in recipes:
    sig=tuple(sorted(i['id'] for i in r['ingredients'] if i['id'] not in ['eau','huile-olive-vierge-extra']))
    if sig in signatures:exact.append([signatures[sig],r['id']])
    signatures[sig]=r['id']
write('research/association-exact-ingredient-overlaps.json',exact)
base['recipes']+=recipes;base['meta']['nombre_recettes']=len(base['recipes']);base['meta']['date_mise_a_jour']='2026-09-06'
write('src/data/recettes-anti-inflammatoires.json',base)
summary=read('src/data/catalogue-summary.json');summary['nombre_recettes']=len(base['recipes']);summary['nombre_recettes_visibles']=sum(not r['app'].get('duplicate_of') for r in base['recipes']);write('src/data/catalogue-summary.json',summary)
write('research/association-collection.json',recipes)
write('src/data/association-rules.json',rules)
write('src/data/association-ingredients.json',{i['id']:{'group':i['group'],'name':i['nom'],'sourceLabel':i['source_label']} for i in registry.values()})
write('src/data/association-recipe-ids.json',['catalog-'+r['id'] for r in recipes])
write('research/association-summary.json',{'recettes':len(recipes),'vertes':sum(r['associations']['niveau']=='verte' for r in recipes),'oranges':sum(r['associations']['niveau']=='orange' for r in recipes),'planifiables':sum(r['app']['planner']['eligible'] for r in recipes),'photos':{'generees_et_validees':sum(r['image']['statut']=='generated_inspected_optimized' for r in recipes),'reste_a_generer':sum(r['image']['statut']=='differee-utilisateur' for r in recipes)},'baseline_sha':'6b58fdc9753f09243e7ed7a749acbf7c77834e16','baseline_recipe_count':630,'exact_ingredient_overlaps':exact})
print(json.dumps(read('research/association-summary.json'),ensure_ascii=False))

# Keep the repository canonical JSON serialization and taxonomy reproducible.
subprocess.run(["node", "scripts/normalize-catalogue-taxonomy.mjs"], cwd=ROOT, check=True)

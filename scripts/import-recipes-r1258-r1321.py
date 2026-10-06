#!/usr/bin/env python3
"""Import the 64 individually reviewed additions without changing existing recipes."""
import csv, json, re, unicodedata, hashlib, itertools, subprocess, shutil, sys
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
source=read('research/recipes-r1258-r1321-source.json')['recipes']
assert len(source)==64
by_id={i['id']:i for i in registry.values()}
filtered={'r1274','r1279','r1311','r1314'}
recipes=[]
for authored in source:
    index=1258+len(recipes); rid=f'r{index}'
    assert authored['id']==rid
    title=authored['titre']; category={'collation':'snack'}.get(authored['categorie'],authored['categorie'])
    portions=authored['portions']; assert portions==2
    amounts=[(by_id[canonical(item['id'])], item, float(item['quantite'])) for item in authored['ingredients']]
    assert len({i['id'] for i,_,_ in amounts})==len(amounts)
    assert all(item['unite']=='g' or (i['key']=='eau' and item['unite']=='ml') for i,item,_ in amounts),rid
    items=[i for i,_,_ in amounts]
    ass=classification(items); assert ass['niveau']=='verte',rid
    allergens=sorted(set(a for i in items for a in i['allergens']))
    assert not {'gluten','lait'} & set(allergens)
    animal=any(i['group']=='proteines-maigres' for i in items)
    fish='poisson' in allergens
    nutrients={}; missing=[]
    for output,key in NUTRI.items():
        unavailable=[i['nom'] for i,_,g in amounts if i['food']['nutrients_per_100g'][key]['value'] is None]
        if unavailable: nutrients[output]=None; missing.append(output+': '+', '.join(unavailable))
        else: nutrients[output]=round(sum(i['food']['nutrients_per_100g'][key]['value']*g/100 for i,_,g in amounts)/portions,1)
    details=[{'ingredient_id':i['id'],'source_dataset':'ciqual','source_code':i['ciqual'],'source_name':i['food']['name'],'grams':g,'conversion':'factor_ml' if i['key']=='eau' else 'factor_g'} for i,_,g in amounts]
    if rid in filtered:
        nutrients={output:None for output in NUTRI}
        nutrients['estimation']={'statut':'unavailable-filtered-yield','methode':'Une partie des solides est retirée après extraction. Le rendement nutritif du liquide consommé n’est pas mesuré ; les ingrédients mis en œuvre ne peuvent pas être assimilés aux nutriments servis.','provenance':'Relecture du procédé de filtration ; aucune valeur calculée revendiquée.','details':[],'cautions':['Rendement de filtration inconnu. Valeurs nutritionnelles non estimées.'],'donnees_manquantes':['Rendement consommé après filtration']}
    else:
        nutrients['estimation']={'statut':'calculated-with-cautions' if missing else 'calculated','methode':'Somme des ingrédients bruts comestibles pour deux portions ; sans correction des pertes ni des rendements de cuisson.','provenance':'Anses Ciqual 2025, extraction locale documentée','details':details,'cautions':missing,'donnees_manquantes':missing}
    ingredients=[]
    for i,item,g in amounts:
        group=i['group']
        note=item['nom']+'. Poids net comestible avant cuisson, sauf mention d’extraction.'
        if group=='proteines-grasses': note+=' Produit nature non salé, sans huile ajoutée.'
        if i['key'] in ['abricot_sec','figue_seche']: note+=' Sans sulfites, sucre ou huile ajoutés.'
        if i['key']=='eau': note='Eau incorporée à la recette. L’eau technique des appareils de cuisson reste séparée.'
        if i['key']=='pomme': note+=' Variété acidulée classée dans la colonne fruits mi-acides du tableau personnel.'
        shopping='meat-fish' if animal and group=='proteines-maigres' else 'beverage' if i['key']=='eau' else 'grocery' if group in ['amidons','legumes-secs','proteines-grasses'] or i['key']=='huile' else 'fruit-vegetable'
        ingredients.append({'id':i['id'],'nom':i['nom'],'quantite':g,'unite':item['unite'],'quantite_normalisee':g,'unite_normalisee':item['unite'],'facultatif':False,'note':note,'categorie_courses':shopping,'allergenes':i['allergens'],**({'pantry_staple':True} if i['key']=='eau' else {})})
    regimes=['classique','sans-porc','sans-gluten','sans-lactose']
    if not animal: regimes[1:1]=['vegetalien','vegetarien']
    elif fish: regimes.insert(1,'pescetarien')
    if 'fruits-a-coque' not in allergens: regimes.append('sans-fruits-a-coque')
    cost=round(max(.1,sum(i['price_per_kg']*g/1000 for i,_,g in amounts)/portions),2)
    suggestion=authored['planner_suggestion']
    eligible=suggestion['eligible'] and rid not in filtered and (nutrients['calories'] or 0)>=220
    reason=suggestion['raison']
    if suggestion['eligible'] and not eligible: reason+=' La portion reste un complément : estimation inférieure au seuil éditorial existant de 220 kcal pour un plat planifié seul.'
    sources=[{'kind':'inspiration','title':rules['source'],'accessed_at':'2026-10-05'},
      {'kind':'nutrition','title':'Anses Ciqual 2025 — valeurs des ingrédients bruts, extraction locale documentée','url':'https://doi.org/10.57745/RDMHWY','accessed_at':'2026-10-05'},
      {'kind':'cost','title':'Hypothèses éditoriales en euros par kilogramme du registre du projet ; aucun relevé de prix actuel','accessed_at':'2026-10-05'},
      {'kind':'safety','title':'Températures minimales de cuisson','url':'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures','accessed_at':'2026-10-05'}]
    for s in authored.get('sources',[]): sources.append({'kind':'inspiration','title':s.get('titre',s.get('title')),'url':s['url'],'accessed_at':'2026-10-05','usage':s.get('usage','')})
    caution=authored['app']['review']['caution']+' '+reason
    if rid in filtered: caution+=' Rendement de filtration inconnu : les valeurs nutritionnelles ne sont pas estimées.'
    if missing and rid not in filtered: caution+=' Certaines valeurs nutritionnelles secondaires restent non renseignées dans la source.'
    recipe={'id':rid,'slug':slug(title),'titre':title,'categorie':category,'description':authored['technique'],
      'temps':authored['temps'],'portions':portions,'difficulte':authored['difficulte'],'cout':'economique' if cost<3 else 'moyen',
      'regimes':regimes,'saisons':authored['saisons'],'tags':['associations-personnelles','sans-produits-laitiers','sans-alcool-ajoute','fait-maison','associations-vertes'],
      'composes_actifs':[],'ingredients':ingredients,'etapes':authored['etapes'],
      'conseils':['Ne pas ajouter de sauce, bouillon ou assaisonnement non prévu sans revérifier toutes les associations.','Pour composer un repas avec plusieurs fiches, contrôler les ingrédients du repas complet.','Durées et textures relues sur dossier, sans essai physique en cuisine.','Si les portions changent, adapter le nombre de pièces et la taille des récipients ; ne pas multiplier les températures ni les durées de cuisson. Répartir en plusieurs fournées si nécessaire.'],
      'substitutions':[],'conservation':authored['conservation'],'nutrition_par_portion':nutrients,'score_anti_inflammatoire':None,
      'image':{'nom_fichier':rid+'-'+slug(title)+'.jpg','alt':'Visuel provisoire ; photographie de '+title+' non disponible.','statut':'waiting_image_generation'},
      'provenance':{'type':'original','author':'InflammMenu','license':'CC BY-SA 4.0','created_at':'2026-10-05','reviewed_at':'2026-10-05','sources':sources},
      'associations':ass,'app':{'review':{'status':'caution','summary':authored['app']['review']['summary'],'caution':caution},
      'planner':{'eligible':eligible,'meal_types':suggestion['meal_types'] or ['lunch','dinner'],'diets':['classic','no-pork'] if animal else ['classic','vegetarian','no-pork'],'cost_per_portion_eur':cost,'equipment':suggestion['equipment'],'allergens':allergens,'targets':['finfish'] if fish else [],'active_minutes':suggestion['active_minutes']}},
      'materiel':authored['materiel'],'ingredient_preparations':[{'id':canonical(i['id']),'preparation':i['nom']} for i in authored['ingredients']]}
    recipes.append(recipe)

catalogue=read('src/data/recettes-anti-inflammatoires.json')
original=[r for r in catalogue['recipes'] if int(r['id'][1:])<=1257]
assert len(original)==1257
assert not {r['slug'] for r in original}&{r['slug'] for r in recipes}
assert len({r['slug'] for r in recipes})==64
catalogue['recipes']=original+recipes
catalogue['meta'].update(nombre_recettes=1321,date_mise_a_jour='2026-10-05')
write('src/data/recettes-anti-inflammatoires.json',catalogue)
collection=[r for r in read('research/association-collection.json') if int(r['id'][1:])<=1257]+recipes
write('research/association-collection.json',collection)
write('src/data/association-recipe-ids.json',['catalog-'+r['id'] for r in collection])
summary=read('src/data/catalogue-summary.json')
summary.update(nombre_recettes=1321,nombre_recettes_visibles=sum(not r['app'].get('duplicate_of') for r in catalogue['recipes']))
write('src/data/catalogue-summary.json',summary)
a=read('research/association-summary.json')
a.update(recettes=len(collection),vertes=sum(r['associations']['niveau']=='verte' for r in collection),oranges=sum(r['associations']['niveau']=='orange' for r in collection),planifiables=sum(r['app']['planner']['eligible'] for r in collection))
a['photos']={'generees_et_validees':sum(r['image']['statut']=='generated_inspected_optimized' for r in collection),'reste_a_generer':sum(r['image']['statut']!='generated_inspected_optimized' for r in collection)}
write('research/association-summary.json',a)
subprocess.run(['node','scripts/normalize-catalogue-taxonomy.mjs'],cwd=ROOT,check=True)
print(json.dumps({'importees':len(recipes),'planifiables':sum(r['app']['planner']['eligible'] for r in recipes),'nutrition_indeterminee':sorted(filtered)}))

#!/usr/bin/env python3
"""Develop a curated list of compositions; reject gray/orange and close variants.
Quantities and cooking instructions are estimates, never kitchen-trial results.
"""
import csv,json,itertools,re,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((ROOT/p).read_text())
def write(p,value):(ROOT/p).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
rows={r['key']:r for r in csv.DictReader((ROOT/'research/association-ingredients.tsv').open(),delimiter='\t')}
registry=read('src/data/association-ingredients.json')
ids={k:next(i for i,r in registry.items() if r['name']==row['nom']) for k,row in rows.items()}
rules=read('research/associations-rules-v1.json');matrix=[r.split() for r in rules['rows']]
groups=rules['groups']
aliases=read('src/data/ingredient-id-aliases.json')
def slug(value):return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFD',value.replace('œ','oe')).encode('ascii','ignore').decode().lower()).strip('-')
mapping={slug(a):slug(b) for a,b in aliases['aliases'].items()}
for group in aliases['canonical_groups']:
    for a in group['aliases']:
        if slug(a)!=slug(group['canonical_id']):mapping[slug(a)]=slug(group['canonical_id'])
def canonical(value):
    value=slug(value);seen=set()
    while value in mapping and value not in seen:seen.add(value);value=mapping[value]
    return value
def signature(items):return {canonical(i) for i in items}-{canonical('eau'),canonical('huile-olive-vierge-extra'),ids['basilic'],ids['persil'],ids['ciboulette']}
# The preceding 880 are fixed. Re-running does not compare this batch with itself.
previous=read('src/data/recettes-anti-inflammatoires.json')['recipes'][:880]
assert len(previous)==880
seen=[(r['titre'],signature(i['id'] for i in r['ingredients'])) for r in previous]
quotas={'lean':50,'potato':35,'nut':40,'avocado':25,'oil':20,'soup':25,'fruit':12}
counts=dict.fromkeys(quotas,0);selected=[];rejected=[];lines=[]
labels=dict(zip(
'pomme_terre poulet dinde cabillaud saumon truite sardine maquereau amande noisette noix pignon sesame avocat huile chou chou_rouge laitue mache endive fenouil radis blette haricot_vert brocoli chou_fleur poivron champignon aubergine concombre courge courgette cresson asperge epinard ciboulette persil carotte navet betterave celeri celeri_rave panais petits_pois rutabaga choux_bruxelles artichaut basilic fraise ananas citron clementine framboise grenade groseille orange tomate cerise peche poire pomme prune abricot mangue banane figue raisin abricot_sec figue_seche melon pasteque'.split(),
['pommes de terre','poulet','dinde','cabillaud','saumon','truite','sardines','maquereau','amandes','noisettes','noix','pignons','sésame','avocat','huile d’olive','chou blanc','chou rouge','laitue','mâche','endives','fenouil','radis','côtes de blette','haricots verts','brocoli','chou-fleur','poivron','champignons','aubergine','concombre','courge','courgette','cresson','asperges','épinards','ciboulette','persil','carotte','navet','betterave','céleri branche','céleri-rave','panais','petits pois','rutabaga','choux de Bruxelles','artichaut','basilic','fraises','ananas','citron','clémentines','framboises','grenade','groseilles','orange','tomate','cerises','pêche','poire','pomme acidulée','prunes','abricots','mangue','banane','figues fraîches','raisin doux','abricots secs','figues séchées','melon','pastèque']))
assert set(rows)-{'riz','sarrasin','quinoa','farine_sarrasin','polenta','lentille','corail','pois_casses','pois_chiches','haricots_blancs','eau'}==set(labels)
plural=set('pomme_terre sardine amande noisette noix pignon endive radis blette haricot_vert champignon asperge epinard petits_pois choux_bruxelles fraise clementine framboise groseille cerise prune abricot figue abricot_sec figue_seche'.split())
feminine=set('dinde truite huile laitue mache aubergine courge courgette ciboulette carotte betterave grenade orange tomate peche poire pomme mangue banane pasteque'.split())
def food(k):
    label=labels[k]
    if k in plural:return 'les '+label
    if label[0].lower() in 'aeiouéèêà':return 'l’'+label
    return ('la ' if k in feminine else 'le ')+label
def of(k):
    value=food(k)
    return 'des '+value[4:] if value.startswith('les ') else 'du '+value[3:] if value.startswith('le ') else 'de '+value

def names(keys):
    values=[food(k) for k in keys]
    return ', '.join(values[:-1])+' et '+values[-1] if len(values)>1 else values[0] if values else ''
def titles(keys):return ', '.join(labels[k] for k in keys)
leaves={'laitue','mache','epinard','cresson'};herbs={'basilic','persil','ciboulette'}
roots={'carotte','navet','betterave','celeri_rave','panais','rutabaga'}
def amount(key):return 12 if key in herbs else 160 if key in leaves else 250
def prep(keys,fine=False):
    parts=[]
    for key in keys:
        name=food(key)
        if key in herbs:part=f'Ciseler {name} et réserver pour la fin.'
        elif key in leaves:part=f'Trier, laver puis bien essorer {name} ; couper les grandes feuilles en lanières.'
        elif key in roots:part=f'Peler {name} et '+('râper finement.' if fine else 'tailler en dés de 1 cm maximum ou en rondelles de 3 mm.')
        elif key=='artichaut':part='Émincer les fonds d’artichaut fraîchement parés et les cuire aussitôt, sans citron de protection ; un brunissement naturel est possible.'
        elif key=='asperge':part='Retirer les bases fibreuses des asperges puis couper les tiges en tronçons de 3 cm.'
        elif key=='haricot_vert':part='Équeuter les haricots verts puis les couper en tronçons de 3 cm.'
        elif key in {'brocoli','chou_fleur'}:part=f'Détailler {name} en petits bouquets et émincer les tiges tendres.'
        elif key=='choux_bruxelles':part='Retirer les feuilles abîmées des choux de Bruxelles et les couper en quatre.'
        elif key in {'chou','chou_rouge','fenouil','endive','blette','celeri'}:part=f'Retirer les parties dures {of(key)}, puis émincer très finement.'
        elif key=='poivron':part='Épépiner le poivron et le couper en très fines lanières ou petits dés.'
        elif key=='champignon':part='Nettoyer les champignons de Paris cultivés et les émincer.'
        elif key=='courge':part='Peler et épépiner la courge, puis la couper en dés de 1 cm.'
        else:part=f'Tailler {name} '+('en très fines lamelles.' if fine else 'en petits morceaux réguliers de 1 cm environ.')
        parts.append(part)
    return ' '.join(parts)
def steam(keys):
    firm=[k for k in keys if k not in leaves|herbs];leaf=[k for k in keys if k in leaves]
    duration='20 à 30' if any(k in roots or k=='artichaut' for k in firm) else '10 à 15'
    sentence=f'Cuire à la vapeur {names(firm)} pendant {duration} min, jusqu’à tendreté, en commençant par les morceaux les plus fermes.'
    if leaf:sentence+=f' Ajouter {names(leaf)} pendant les 2 dernières minutes.'
    return sentence+' L’eau située sous le panier sert uniquement à produire la vapeur et n’est pas incorporée ni servie.'

for line in (ROOT/'research/green-target-300-candidates.txt').read_text().splitlines():
    if not line or line.startswith('#'):continue
    family,method,raw=line.split('|');keys=raw.split(',')
    if counts[family]>=quotas[family]:continue
    colors=[matrix[groups.index(rows[a]['group'].strip())][groups.index(rows[b]['group'].strip())] for a,b in itertools.combinations(keys,2)]
    if any(c!='g' for c in colors):rejected.append({'composition':raw,'raison':'Association non verte'});continue
    sig=signature(ids[k] for k in keys)
    matches=[title for title,other in seen if len(sig&other)/len(sig|other)>=.7]
    if matches:rejected.append({'composition':raw,'raison':'Composition trop proche','recettes':matches});continue
    category='plat';equipment='';rest=0;steps=[];amounts={k:amount(k) for k in keys}
    if family=='lean':
        protein=keys[0];veg=keys[1:];amounts[protein]=380 if protein in {'cabillaud','poulet','dinde'} else 360
        temp=74 if protein in {'poulet','dinde'} else 63
        cooking=35 if temp==74 else 30;active=20;equipment='hob,oven' if method=='papillote' else 'hob'
        title={'papillote':'Papillotes','vapeur':'Vapeur','etuve':'Émincé à l’étouffée'}[method]+' : '+titles(keys)
        steps=[prep(veg),(f'Préparer {food(protein)} en morceaux d’épaisseur régulière ; réserver des ustensiles distincts pour la volaille crue.' if temp==74 else f'Vérifier soigneusement l’absence d’arêtes dans {food(protein)} et garder des filets d’épaisseur régulière. Réserver des ustensiles distincts pour le poisson cru.')]
        if method=='papillote':
            if temp==74:cooking=40
            firm=[k for k in veg if k not in leaves]
            steps+=[f'Précuire {names(firm)} 8 à 10 min à la vapeur pour amorcer leur cuisson. L’eau du générateur de vapeur n’est pas ajoutée au plat.',f'Répartir tous les légumes et {food(protein)} sur deux grandes feuilles de cuisson adaptées au four. Fermer hermétiquement, sans eau, huile ni sel ajouté.',f'Cuire à 180 °C pendant {"25 à 30" if temp==74 else "15 à 20"} min, selon l’épaisseur. Vérifier {temp} °C au cœur et prolonger à couvert si nécessaire. Servir avec le jus naturel recueilli.']
        elif method=='vapeur':
            steps+=[f'Commencer la cuisson des légumes fermes à la vapeur pendant 8 à 10 min. Poser ensuite {food(protein)} dessus et poursuivre {"20 à 25" if temp==74 else "12 à 18"} min à couvert ; les feuilles tendres éventuelles sont ajoutées pendant les 2 dernières minutes.',f'Contrôler {temp} °C au cœur de {food(protein)} et la tendreté des légumes. Prolonger la cuisson si nécessaire ; utiliser des ustensiles propres pour servir.','L’eau sous le panier reste technique et n’est pas versée dans les assiettes. Aucun assaisonnement supplémentaire n’est prévu.']
        else:
            steps+=[f'Disposer les légumes au fond d’une petite cocotte antiadhésive à fond épais. Répartir {food(protein)} en lanières dessus et couvrir hermétiquement, sans huile ni eau ajoutée.','Cuire à feu très doux 25 à 35 min dans le jus des légumes. Remuer à mi-cuisson et maintenir le couvercle ; si le fond sèche, réduire immédiatement le feu.',f'Vérifier {temp} °C au cœur de la volaille et la tendreté des légumes avant de servir. Aucun bouillon ou sauce ne doit être ajouté.']
    elif family=='potato':
        veg=keys[1:];amounts['pomme_terre']=600;active=25;equipment='oven';cooking=60
        title={'galette':'Galettes fines','rosace':'Rosace fondante','gratin':'Gratin de légumes sans crème','farci':'Pommes de terre garnies','quartiers':'Quartiers rôtis sous couvercle'}[method]+' : '+titles(keys)
        if method=='galette':
            cooking=40;rest=3
            steps=[prep(veg,True),'Râper finement les pommes de terre et presser légèrement dans un linge propre, sans les rincer, pour conserver leur amidon. Hacher très finement les feuilles éventuelles.',f'Mélanger les pommes de terre avec {names(veg)}. Former des galettes de 6 à 7 mm d’épaisseur sur une feuille de cuisson antiadhésive et bien tasser.','Cuire 35 à 40 min à 195 °C, en retournant délicatement à mi-cuisson. Vérifier que le centre est tendre ; couvrir si les bords colorent trop vite. Laisser se raffermir 3 min avant de décoller.']
        elif method=='farci':
            equipment='oven,hob';cooking=65
            steps=['Couper les pommes de terre en deux, les poser sur une feuille de cuisson et fermer le plat. Cuire 45 à 60 min à 190 °C jusqu’à tendreté.',prep(veg),steam(veg),f'Prélever un peu de chair des pommes de terre et l’écraser à sec. La mélanger avec {names(veg)} cuits et coupés en petits morceaux. Regarnir les demi-pommes de terre.','Réchauffer 5 min au four à couvert. Utiliser le seul moelleux des légumes pour la farce, sans liquide ni huile incorporée.']
        elif method in {'rosace','gratin'}:
            rest=5
            steps=[prep(veg),'Tailler les pommes de terre en tranches de 2 mm. Recouper aussi les légumes fermes en tranches très fines pour une cuisson régulière.',f'Alterner les couches de pommes de terre et {names(veg)} dans un petit plat chemisé de papier cuisson, sur une épaisseur de 4 cm maximum. Tasser et fermer hermétiquement.','Cuire 50 à 60 min à 180 °C dans l’humidité naturelle des légumes. Vérifier la tendreté au centre avec une lame ; prolonger à couvert si nécessaire. Laisser se raffermir 5 min avant de servir.']
        else:
            steps=[prep(veg),'Couper les pommes de terre en petits quartiers. Réunir les légumes fermes et les pommes de terre dans un petit plat couvert hermétiquement.',f'Cuire 45 à 60 min à 185 °C. Remuer à mi-cuisson ; ajouter les légumes plus tendres pendant les 20 dernières minutes et les herbes après cuisson. Vérifier la tendreté de {names(veg)} et des pommes de terre.','Servir avec les sucs naturels du plat. Éviter de brunir fortement les bords ; couvrir ou réduire la température s’ils colorent trop vite.']
        steps+=['Aucun ajout d’eau, d’huile, d’œuf, de farine ou de sauce n’est prévu ; la composition verte dépend de cette liste fermée.']
    elif family=='nut':
        nut=keys[0];veg=keys[1:];amounts[nut]=80;active=20
        title={'roti':'Légumes rôtis aux éclats','vapeur':'Légumes vapeur et croquant','cru':'Salade croquante'}[method]+' : '+titles(keys)
        steps=[prep(veg,fine=method=='cru'),f'Concasser {food(nut)} nature au couteau ou les écraser au mortier, sans les transformer en pâte diluée. Ne pas ajouter un deuxième fruit à coque ou type de graines.']
        if method=='cru':
            cooking=0;category='salade';steps += [f'Mélanger {names(veg)} bien essorés. Presser légèrement les légumes râpés ou émincés pour répartir leur jus naturel.',f'Ajouter {food(nut)} au dernier moment et servir aussitôt, sans vinaigrette ni huile.']
        elif method=='roti':
            cooking=45;equipment='oven';steps += [f'Répartir {names(veg)} dans un petit plat chemisé et fermer hermétiquement. Cuire 35 à 40 min à 180 °C jusqu’à tendreté dans leur humidité naturelle.',f'Ajouter {food(nut)} et remettre 5 min au four à découvert pour les chauffer légèrement, sans les brunir. Servir sans ajout de liquide ou de matière grasse.']
        else:
            cooking=30;equipment='hob';steps += [steam(veg),f'Mélanger les légumes chauds avec {food(nut)} concassés. Servir avec leur seule humidité naturelle, sans eau, huile ni sauce incorporée.']
    elif family=='avocado':
        amounts['avocat']=240;veg=keys[1:];active=20;cooking=0;category='salade'
        title={'cru':'Salade massée à l’avocat','tiede':'Légumes tièdes à l’avocat','barquette':'Barquettes croquantes à l’avocat'}[method]+' : '+titles(veg)
        steps=[prep(veg,fine=method!='tiede'),'Écraser la chair d’avocat à la fourchette sans eau, citron ni huile ajoutée. Son brunissement naturel est possible ; préparer au dernier moment.']
        if method=='tiede':
            cooking=30;rest=5;equipment='hob';steps += [steam(veg),'Laisser les légumes tiédir 5 min puis les enrober délicatement de la purée d’avocat. Servir rapidement, sans assaisonnement supplémentaire.']
        elif method=='barquette':
            # Preserve the first vegetable as the edible container rather than mince it.
            steps[0]=('Couper le poivron en deux et retirer les graines. ' if veg[0]=='poivron' else f'Détacher des feuilles entières {of(veg[0])}, les laver puis bien les essorer. ')+prep(veg[1:],fine=True)
            steps += [f'Mélanger {names(veg[1:])} finement coupés avec l’avocat écrasé.',f'Répartir la garniture dans {food(veg[0])} et servir aussitôt. Ne pas ajouter de graines, d’huile ou de vinaigrette.']
        else:steps += [f'Masser doucement {names(veg)} avec l’avocat pendant 2 min afin d’enrober et d’assouplir les légumes.','Assembler juste avant de servir. La recette ne comprend aucun liquide ou autre matière grasse ajoutée.']
    elif family=='oil':
        veg=keys[1:];amounts['huile']=18;active=25;category='accompagnement';title={'roti':'Trio rôti à l’huile d’olive','vapeur':'Trio vapeur, finition à l’huile d’olive','cru':'Trio cru à l’huile d’olive'}[method]+' : '+titles(veg)
        steps=[prep(veg,fine=method=='cru')]
        if method=='cru':
            cooking=0;steps += [f'Réunir {names(veg)} et mélanger avec toute l’huile prévue. Masser les légumes fermes finement râpés pendant 2 min.','Laisser les feuilles tendres et les herbes éventuelles pour la fin afin de préserver leur texture.','Servir aussitôt. Aucun citron, vinaigre, avocat ou fruit à coque n’est ajouté.']
        elif method=='roti':
            cooking=45;equipment='oven';steps += ['Mélanger les légumes avec toute l’huile et les répartir dans un plat à four. Couvrir et cuire 30 min à 185 °C, sans eau ni bouillon ajouté.','Remuer, découvrir puis poursuivre 10 à 15 min jusqu’à tendreté. Ajouter les éventuelles herbes après cuisson et éviter de carboniser les bords.','Servir avec les sucs naturels ; ne pas compléter avec une deuxième source de lipides.']
        else:
            cooking=30;equipment='hob';steps += [steam(veg),'Transférer les légumes dans le plat de service et les mélanger à toute l’huile prévue. Ajouter les éventuelles herbes ciselées à ce moment.','Servir immédiatement ; l’eau du générateur de vapeur n’est pas ajoutée. Aucun autre assaisonnement n’est prévu.']
    elif family=='soup':
        veg=keys;amounts['eau']=500;active=20;cooking=35;equipment='hob,blender' if method=='veloute' else 'hob';category='soupe'
        title=('Velouté' if method=='veloute' else 'Soupe en petits morceaux')+' : '+titles(veg)
        firm=[k for k in veg if k not in herbs|leaves];leaf=[k for k in veg if k in leaves]
        steps=[prep(veg),f'Placer {names(firm)} dans une petite casserole avec les 500 ml d’eau prévus. Porter à frémissement, couvrir et cuire 25 à 35 min jusqu’à tendreté ; garder le couvercle pour limiter l’évaporation.']
        if leaf:steps += [f'Ajouter {names(leaf)} pendant les 2 à 3 dernières minutes de cuisson.']
        if method=='veloute':steps+=['Retirer du feu, laisser retomber légèrement la température et mixer avec un appareil adapté aux préparations chaudes. Garder toute l’eau de cuisson, sans crème ni lait ajouté.']
        else:steps+=['Écraser quelques morceaux à la fourchette pour donner un peu de corps et conserver les autres entiers avec toute l’eau de cuisson.']
        steps+=['Ajouter les herbes prévues, le cas échéant, après cuisson. Servir sans bouillon industriel, huile, graines, céréales ou autre garniture supplémentaire.']
    else:
        fruit=keys;category='dessert';active=20;cooking=0
        amounts={k:35 if k in {'figue_seche','abricot_sec'} else 60 if k in {'groseille','grenade'} else 200 for k in keys}
        title={'carpaccio':'Carpaccio de fruits','roti':'Fruits fondants au four','verrine':'Verrines de fruits écrasés','salade':'Salade de fruits frais'}[method]+' : '+titles(keys)
        steps=['Laver les fruits, retirer les noyaux, cœurs, gros pépins et peaux non comestibles. Les poids indiqués correspondent aux parties comestibles ; les fruits secs doivent être sans additifs et ne sont pas réhydratés.']
        if method=='carpaccio':
            steps += [f'Émincer très finement {food(keys[0])} et disposer les tranches dans les assiettes.',f'Écraser ou couper finement {names(keys[1:])} et les répartir sur les tranches avec leur seul jus naturel.','Servir immédiatement sans sucre, eau, lait végétal, miel ni fruits à coque ajoutés.']
        elif method=='roti':
            equipment='oven';cooking=25
            steps += [f'Couper {names(keys)} en petits morceaux réguliers ; couper les fruits séchés éventuels en dés très fins. Répartir dans un petit plat et couvrir hermétiquement.','Cuire 20 à 25 min à 180 °C dans le jus naturel des fruits, sans eau, miel, huile ou autre ingrédient ajouté. Vérifier la tendreté et réduire la température si les bords sèchent.','Servir tiède avec tout le jus recueilli. La texture dépend de la maturité des fruits.']
        elif method=='verrine':
            steps += [f'Écraser finement {food(keys[0])} à la fourchette sans liquide ajouté.',f'Couper {names(keys[1:])} en tout petits dés et les incorporer à la purée de fruits. Répartir en verrines.','Servir rapidement après assemblage, sans crème, boisson végétale ou garniture supplémentaire.']
        else:steps += [f'Couper {names(keys)} en morceaux de taille comparable, sans extraire ni filtrer leurs jus.','Mélanger délicatement les fruits avec le jus libéré pendant la découpe.','Servir frais au moment de l’assemblage, sans liquide extérieur, sucre, miel ou oléagineux.']
    serialized=','.join(f'{k}:{v}' for k,v in amounts.items())
    lines.append('|'.join([title,category,serialized,f'{active},{cooking},{rest}',equipment,'~'.join(steps)]))
    selected.append({'titre':title,'famille':family,'methode':method,'ingredients':list(amounts),'niveau':'verte','ancien_catalogue':880})
    seen.append((title,sig));counts[family]+=1

write('research/green-target-300-review.json',{'quotas':quotas,'selected_counts':counts,'selected':selected,'rejected':rejected})
print(json.dumps({'counts':counts,'total':len(selected),'rejected':len(rejected)},ensure_ascii=False))
assert counts==quotas,('Liste de compositions à compléter',counts,quotas)
assert len(lines)==207
(ROOT/'research/association-green-recipes-03.txt').write_text('# 207 compositions sélectionnées pour atteindre 300 vertes ; détails dans green-target-300-review.json.\n'+'\n'.join(lines)+'\n')

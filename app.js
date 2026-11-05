'use strict';
/* ====================== utilitaires ====================== */
const DAY=864e5;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,10);
const pad=n=>String(n).padStart(2,'0');
const money=n=>new Intl.NumberFormat('fr-FR').format(Math.round(n||0)).replace(/\u202f/g,'\u00a0')+'\u00a0FCFA';
const dkey=d=>{d=new Date(d);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const keyDate=k=>new Date(k+'T12:00:00');
const hm=ts=>{const d=new Date(ts);return pad(d.getHours())+'h'+pad(d.getMinutes())};
const hmc=t=>String(t).replace(':','h');
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const dlong=d=>new Date(d).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
const dshort=d=>new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const DAYNAMES=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const normPhone=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('228')&&d.length>8)d=d.slice(3);return d};
const fmtPhone=d=>d&&d.length===8?'+228 '+d.replace(/(\d{2})(?=\d)/g,'$1 ').trim():(d||'');
const hash=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return h};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function ago(ts){const m=Math.round((Date.now()-ts)/60000);if(m<1)return 'à l\'instant';if(m<60)return 'il y a '+m+' min';const h=Math.round(m/60);if(h<24)return 'il y a '+h+' h';return dshort(ts)}

const CATS=['Entrées','Plats','Desserts','Boissons'];
const ALLERGENS=['Arachides','Poisson','Crustacés','Gluten','Œufs','Lait','Sésame','Soja'];
const BACKEND=!!(window.CANTINE_CONFIG&&window.API);
/* Installation de l'application sur l'écran d'accueil (PWA) : seulement sur le site publié */
let deferredInstall=null;
const isStandalone=()=>{try{return !!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true}catch(e){return false}};
const isIOS=()=>{try{return /iphone|ipad|ipod/i.test(navigator.userAgent)}catch(e){return false}};
const PROD=!!window.CANTINE_PROD;
const STAFF_APP=!!window.CANTINE_STAFF;
/* Deux sites séparés (clients et équipe) : chacun est une application installable à part, avec sa propre icône. */
const STAFF_URL=(BACKEND&&!STAFF_APP&&window.CANTINE_CONFIG.staffUrl)||'';     // site clients : adresse du site équipe
/* Capacité par créneau de retrait (0 = illimité) */
let slotUse={};
const slotCount=(d,t)=>BACKEND?(slotUse[d+' '+t]||0):S.orders.filter(o=>o.pickupDate===d&&o.pickupTime===t&&o.status!=='cancelled').length;
const slotFull=(d,t)=>{const c=(S&&S.settings&&S.settings.slotCap)||0;return c>0&&slotCount(d,t)>=c};
const CLIENT_URL=(BACKEND&&STAFF_APP&&window.CANTINE_CONFIG.clientUrl)||'';    // site équipe : adresse du site clients   // application « équipe » installée depuis /equipe/ : icône et nom distincts de l'application des clients
const installReady=()=>PROD&&!isStandalone()&&(!!deferredInstall||isIOS());   // site publié : aucune donnée ni identifiant de démonstration, jamais de repli en mode démo
/* Comptes clients (connexion par SMS) : désactivés si config.js contient clientAccounts: false. Les commandes en invité restent possibles. */
const ACCOUNTS=!(BACKEND&&window.CANTINE_CONFIG.clientAccounts===false);
const STATUS={awaiting:'Paiement en attente',new:'Nouvelle',prep:'En préparation',ready:'Prête',done:'Récupérée',cancelled:'Annulée'};
const FLOW=['new','prep','ready','done'];
const NEXT={new:['prep','Lancer la préparation'],prep:['ready','Marquer prête'],ready:['done','Marquer récupérée']};
const RIGHTS={commandes:'Commandes',menus:'Plats et menus',stocks:'Stocks',credits:'Crédits clients',actualites:'Actualités',stats:'Statistiques'};
const GERANT_RIGHTS=['commandes','menus','stocks','credits','actualites','stats'];
const ROLES={admin:'Administrateur',gerant:'Gérant',employe:'Employé'};
const STYLES=[
 {id:'nature',name:'Frais & Nature',desc:'Vert doux, crème, touches d\'orange',sw:['#3A7650','#F8F5E8','#F28C1B']},
 {id:'gourmand',name:'Chaleureux & Gourmand',desc:'Tons chauds, épices et miel',sw:['#B2491B','#FBF2E6','#E9A92B']},
 {id:'epure',name:'Épuré & Professionnel',desc:'Bleu sobre, fond clair',sw:['#1F4E79','#F3F5F7','#19A38F']},
 {id:'dynamique',name:'Dynamique & Coloré',desc:'Rose vif, jaune et bleu',sw:['#C2255C','#FFF7E3','#1C7ED6']}
];
const MOTIFS=['Reste de monnaie','Avoir','Prépaiement','Geste commercial','Autre'];

/* ====================== stockage ====================== */
const mem={};
const ls={
 get(k){try{return localStorage.getItem(k)}catch(e){return mem[k]==null?null:mem[k]}},
 set(k,v){try{localStorage.setItem(k,v)}catch(e){mem[k]=v}},
 del(k){try{localStorage.removeItem(k)}catch(e){delete mem[k]}}
};
const KEY='cantine-togo-v1';
let S=null;
function save(){try{ls.set(KEY,JSON.stringify(S))}catch(e){toast('Enregistrement impossible : espace de stockage plein.','bad')}}

/* ====================== données de démonstration ====================== */
function rng(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function seed(){
 const R=rng(2026),pick=a=>a[Math.floor(R()*a.length)];
 const D=(id,name,cat,price,desc,allergens,veg,badge)=>({id,name,cat,price,desc,allergens,veg,badge:badge||'',active:true,photo:''});
 const dishes=[
  D('d1','Accras de niébé','Entrées',500,'Beignets croustillants de haricots à œil noir, servis avec une sauce pimentée douce.',[],true),
  D('d2','Salade fraîcheur','Entrées',600,'Tomate, concombre, oignon rouge, avocat de saison et vinaigrette au citron.',[],true),
  D('d3','Soupe de poisson épicée','Entrées',800,'Bouillon parfumé au gingembre et au piment, tilapia émietté.',['Poisson'],false),
  D('d4','Fufu sauce graine et poulet','Plats',1800,'Fufu d\'igname pilé, sauce graine de palme mijotée, poulet fermier.',[],false,'Plat du jour'),
  D('d5','Akoumé sauce gombo','Plats',1500,'Pâte de maïs fermentée, sauce gombo à la viande et au poisson fumé.',['Poisson'],false),
  D('d6','Riz au gras et poulet braisé','Plats',2000,'Riz parfumé à la tomate et aux épices, poulet braisé au charbon.',[],false,'Suggestion'),
  D('d7','Atassi, riz et haricots','Plats',1500,'Riz et haricots cuits ensemble, sauce tomate pimentée, poisson frit.',['Poisson'],false),
  D('d8','Djenkoumé sauce poulet','Plats',1800,'Pâte rouge de maïs cuite au bouillon de tomate, sauce au poulet.',[],false),
  D('d9','Ablo et poisson frit','Plats',1600,'Petits gâteaux de riz cuits à la vapeur, sauce tomate, tilapia frit.',['Poisson'],false),
  D('d10','Aloko et poisson braisé','Plats',2200,'Bananes plantains frites, tilapia braisé, piment frais et oignons.',['Poisson'],false,'Suggestion'),
  D('d11','Riz sauce tomate et légumes','Plats',1000,'Riz blanc, sauce tomate maison, carottes et haricots verts.',[],true),
  D('d12','Igname sauce arachide','Plats',1700,'Igname bouillie, sauce arachide aux légumes, sans viande.',['Arachides'],true),
  D('d13','Beignets sucrés','Desserts',300,'Petits beignets dorés, légèrement sucrés (yovo doko).',['Gluten','Œufs'],true),
  D('d14','Salade de fruits','Desserts',500,'Ananas, mangue, papaye et citron vert.',[],true,'Suggestion'),
  D('d15','Riz au lait de coco','Desserts',400,'Riz doux au lait de coco et à la cannelle.',[],true),
  D('d16','Bissap glacé','Boissons',300,'Infusion de fleurs d\'hibiscus, menthe fraîche.',[],true),
  D('d17','Jus de gingembre','Boissons',300,'Gingembre pressé, citron et une pointe de sucre.',[],true),
  D('d18','Jus de baobab','Boissons',400,'Pulpe de baobab, onctueuse et acidulée.',[],true),
  D('d19','Jus d\'ananas frais','Boissons',500,'Pressé le matin, sans sucre ajouté.',[],true),
  D('d20','Eau minérale 50 cl','Boissons',300,'Bouteille fraîche.',[],true)
 ];
 const hours={};for(let d=0;d<7;d++)hours[d]=null;
 [1,2,3,4,5].forEach(d=>hours[d]=['11:30','15:30']);hours[6]=['11:30','15:00'];
 const users=[
  {id:'u1',name:'Kossi Mensah',login:'admin',code:'xxxxxxxx',role:'admin',rights:[],photo:'',active:true},
  {id:'u2',name:'Ama Dossou',login:'gerant',code:'xxxxxxxx',role:'gerant',rights:[],photo:'',active:true},
  {id:'u3',name:'Yao Agbeko',login:'employe',code:'xxxxxxxx',role:'employe',rights:['commandes','menus'],photo:'',active:true},
  {id:'u4',name:'Afi Lawson',login:'afi',code:'xxxxxxxx',role:'employe',rights:['commandes'],photo:'',active:true}
 ];
 const now=Date.now();
 const clients=[
  {id:'c1',name:'Edem Kpodar',phone:'90112233',pass:'xxxxxxxx',credit:2500,history:[{at:now-5*DAY,delta:3000,motif:'Prépaiement',by:'Ama Dossou'},{at:now-2*DAY,delta:-500,motif:'Commande A-1090',by:'Client'}]},
  {id:'c2',name:'Sena Ayivi',phone:'91445566',pass:'xxxxxxxx',credit:0,history:[]},
  {id:'c3',name:'Mawuli Attivon',phone:'97889900',pass:'xxxxxxxx',credit:1200,history:[{at:now-3*DAY,delta:1200,motif:'Reste de monnaie',by:'Yao Agbeko'}]},
  {id:'c4',name:'Essi Johnson',phone:'92334455',pass:'xxxxxxxx',credit:800,history:[{at:now-DAY,delta:800,motif:'Avoir',by:'Ama Dossou'}]}
 ];
 const stock=[
  ['Riz parfumé','kg',18,10],['Huile de palme','L',6,5],['Farine de maïs','kg',14,8],['Poulet','kg',9,10],['Tilapia','kg',7,6],
  ['Tomates','kg',5,6],['Oignons','kg',8,4],['Gombo','kg',2,3],['Pâte d\'arachide','kg',4,3],['Igname','kg',20,10],
  ['Plantains','pièces',30,20],['Fleurs de bissap','kg',2,1],['Gingembre','kg',1.5,1],['Eau minérale 50 cl','bouteilles',48,24]
 ].map(([name,unit,qty,min])=>({id:uid(),name,unit,qty,min}));
 const news=[
  {id:'n1',title:'La carte de saison est arrivée',body:'Le fufu sauce graine devient notre plat du jour du jeudi, et la salade de fruits revient avec les premières mangues.',at:now-2*DAY,pinned:true,published:true},
  {id:'n2',title:'Payez avec Mixx by Yas ou Flooz',body:'Commandez depuis votre téléphone, réglez par mobile money et passez récupérer votre repas à l\'heure choisie, sans attendre.',at:now-6*DAY,pinned:false,published:true},
  {id:'n3',title:'Fermeture exceptionnelle le 1er novembre',body:'La cantine sera fermée pour la Toussaint. Réouverture le lendemain à 11h30.',at:now-DAY,pinned:false,published:true}
 ];
 /* historique de commandes */
 const names=[['Kofi','Agbeko'],['Afi','Tchalla'],['Yao','Amegah'],['Abla','Dossou'],['Komla','Gbedey'],['Edem','Kpodar'],['Sena','Ayivi'],['Koffi','Amouzou'],['Essi','Johnson'],['Dela','Lawson'],['Mawuli','Attivon'],['Akossiwa','Mensah']];
 const plats=dishes.filter(d=>d.cat==='Plats'),drinks=dishes.filter(d=>d.cat==='Boissons'),sweets=dishes.filter(d=>d.cat==='Desserts');
 const payLabel={mixx:'Mixx by Yas',flooz:'Flooz (Moov)',card:'Carte bancaire',cash:'Espèces au retrait'};
 const orders=[];
 for(let off=6;off>=0;off--){
  const n=off===0?6:12+Math.floor(R()*14);
  for(let i=0;i<n;i++){
   let t;
   if(off===0)t=now-(i<2?3+i*9:12+Math.floor(R()*280))*60000;
   else{const d=new Date(now-off*DAY);d.setHours(11+Math.floor(R()*4),Math.floor(R()*60),0,0);t=d.getTime()}
   const p=pick(plats),items=[{id:p.id,name:p.name,price:p.price,qty:R()<.2?2:1}];
   if(R()<.6){const x=pick(drinks);items.push({id:x.id,name:x.name,price:x.price,qty:1})}
   if(R()<.3){const x=pick(sweets);items.push({id:x.id,name:x.name,price:x.price,qty:1})}
   const total=items.reduce((a,x)=>a+x.price*x.qty,0),method=pick(['mixx','mixx','flooz','card','cash','cash']);
   let status;
   if(off>0)status=R()<.07?'cancelled':'done';
   else{const a=(now-t)/60000;status=a>120?'done':a>45?'ready':a>20?'prep':'new'}
   const online=method!=='cash';
   const payStatus=status==='cancelled'?(online?'remboursé':'à payer'):(online?'payé':(status==='done'?'payé':'à payer'));
   const nm=pick(names),ph='9'+Math.floor(R()*10)+String(Math.floor(R()*1e6)).padStart(6,'0');
   const pt=new Date(t+25*60000);
   const history=[{s:'new',at:t,by:'Client'}];
   if(status!=='new')history.push({s:status,at:t+10*60000,by:'Yao Agbeko'});
   orders.push({id:uid(),num:'',at:t,name:nm.join(' '),phone:ph,pickupDate:dkey(pt),pickupTime:pad(pt.getHours())+':'+pad(pt.getMinutes()),items,subtotal:total,credit:0,due:total,method,methodLabel:payLabel[method],payStatus,status,clientId:null,note:'',history});
  }
 }
 orders.sort((a,b)=>a.at-b.at).forEach((o,i)=>o.num='A-'+(1001+i));
 const log=[
  {at:now-3*864e5,by:'Kossi Mensah',text:'A créé le compte de Afi Lawson'},
  {at:now-2*864e5,by:'Ama Dossou',text:'A publié l\'actualité « La carte de saison est arrivée »'},
  {at:now-864e5,by:'Yao Agbeko',text:'A défini le menu du jour'}
 ];
 return {v:1,seq:1000+orders.length,
  settings:{name:'Cantine du Quartier',tagline:'Cuisine togolaise faite maison, à emporter ou à déguster sur place.',address:'Boulevard du 13 Janvier, Lomé, Togo',phone:'+228 90 00 00 00',email:'contact@cantineduquartier.tg',style:'nature',hours,prepMin:20,slot:15,slotCap:0,notifyEmail:false,legal:{company:'',form:'',nif:'',rccm:'',director:'',host:'',contact:'',retention:''},
   payments:[
    {id:'mixx',label:'Mixx by Yas',kind:'momo',on:true,hint:'Paiement mobile, ex-T-Money'},
    {id:'flooz',label:'Flooz (Moov)',kind:'momo',on:true,hint:'Paiement mobile'},
    {id:'card',label:'Carte bancaire',kind:'card',on:true,hint:'Visa ou Mastercard'},
    {id:'cash',label:'Espèces au retrait',kind:'cash',on:true,hint:'À régler à la caisse'}]},
  dishes,menuDuJour:{items:['d1','d4','d14','d16'],formulePrice:2500},orders,clients,users,stock,news,log};
}

/* ====================== accès aux données ====================== */
const dish=id=>S.dishes.find(d=>d.id===id);
const client=()=>S.clients.find(c=>c.id===ls.get('cantine-client'))||null;
const staff=()=>S.users.find(u=>u.id===ls.get('cantine-staff')&&u.active)||null;
const isAdmin=()=>{const u=staff();return !!u&&u.role==='admin'};
function can(r){const u=staff();if(!u)return false;if(u.role==='admin')return true;if(u.role==='gerant')return GERANT_RIGHTS.includes(r);return (u.rights||[]).includes(r)}
function logAct(text){const u=staff();S.log.unshift({at:Date.now(),by:u?u.name:'Client',text});S.log=S.log.slice(0,300)}
const pays=()=>S.settings.payments.filter(p=>p.on);
const payById=id=>S.settings.payments.find(p=>p.id===id);
const pubNews=()=>S.news.filter(n=>n.published).sort((a,b)=>(b.pinned-a.pinned)||(b.at-a.at));
const lowStock=()=>S.stock.filter(s=>s.qty<=s.min);
const mapsUrl=()=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(S.settings.address);
const startOfDay=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()};
const activeOrders=from=>S.orders.filter(o=>o.at>=from&&o.status!=='cancelled');
const initials=n=>n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

/* ====================== horaires et retrait ====================== */
const toMin=t=>{const[a,b]=t.split(':');return +a*60+ +b};
function openInfo(now=new Date()){
 const h=S.settings.hours,day=now.getDay(),cur=now.getHours()*60+now.getMinutes(),t=h[day];
 if(t){if(cur<toMin(t[0]))return{open:false,text:'Ouvre à '+hmc(t[0])+' aujourd\'hui'};if(cur<toMin(t[1]))return{open:true,text:'Ouvert jusqu\'à '+hmc(t[1])}}
 for(let i=1;i<=7;i++){const d=(day+i)%7;if(h[d])return{open:false,text:'Fermé, rouvre '+(i===1?'demain':DAYNAMES[d])+' à '+hmc(h[d][0])}}
 return{open:false,text:'Fermé'};
}
function pickupOptions(){
 const out=[],now=new Date(),S_=S.settings,step=S_.slot||15;
 for(let i=0;i<7&&out.length<3;i++){
  const d=new Date(now.getTime()+i*DAY),t=S_.hours[d.getDay()];if(!t)continue;
  let start=toMin(t[0]);const end=toMin(t[1])-10;
  if(i===0)start=Math.max(start,now.getHours()*60+now.getMinutes()+(S_.prepMin||20));
  start=Math.ceil(start/step)*step;
  const slots=[];for(let m=start;m<=end;m+=step)slots.push(pad(Math.floor(m/60))+':'+pad(m%60));
  if(!slots.length)continue;
  out.push({key:dkey(d),label:i===0?'Aujourd\'hui':i===1?'Demain':cap(dlong(d)),slots});
 }
 return out;
}

/* ====================== visuels des plats ====================== */
const SAUCES=['#C4601F','#8E3B1D','#6E8F3A','#D6A021','#A2462C'],SIDES=['#F4E9C8','#EBD9A8','#FFF6DC','#E9C98A'];
function art(d){
 const k=hash(d.id||d.name),sa=SAUCES[k%5],sb=SAUCES[(k>>2)%5],si=SIDES[(k>>3)%4];let g='';
 if(d.cat==='Boissons')g=`<path d="M44 16h32l-4 56a6 6 0 0 1-6 5H54a6 6 0 0 1-6-5z" fill="#fff" fill-opacity=".75" stroke="${sa}" stroke-width="2"/><path d="M46.6 36h26.8l-2.5 36a4 4 0 0 1-4 3.6H53a4 4 0 0 1-4-3.6z" fill="${sa}"/><circle cx="72" cy="30" r="9" fill="${sb}"/><path d="M62 8l7 28" stroke="${si}" stroke-width="3" stroke-linecap="round"/>`;
 else if(d.cat==='Desserts')g=`<ellipse cx="60" cy="62" rx="44" ry="15" fill="#fff"/><ellipse cx="60" cy="58" rx="36" ry="11" fill="${si}"/><circle cx="46" cy="46" r="13" fill="${sa}"/><circle cx="68" cy="48" r="11" fill="${sb}"/><circle cx="58" cy="37" r="9" fill="${si}" stroke="${sa}" stroke-width="2"/>`;
 else if(d.cat==='Entrées')g=`<path d="M16 44h88a44 32 0 0 1-88 0z" fill="#fff" stroke="${sa}" stroke-width="2"/><circle cx="40" cy="40" r="12" fill="#6E8F3A"/><circle cx="60" cy="35" r="13" fill="#8DB04F"/><circle cx="80" cy="41" r="11" fill="${sa}"/><circle cx="52" cy="44" r="7" fill="${si}"/>`;
 else g=`<ellipse cx="60" cy="52" rx="54" ry="33" fill="#fff"/><ellipse cx="60" cy="52" rx="42" ry="24" fill="#F4F0E4"/><path d="M28 55c0-12 14-21 33-21s31 8 31 19-12 17-31 17-33-3-33-15z" fill="${sa}"/><circle cx="50" cy="46" r="16" fill="${si}"/><circle cx="44" cy="40" r="4.5" fill="#fff" opacity=".55"/><circle cx="82" cy="57" r="5" fill="#6E8F3A"/><circle cx="74" cy="62" r="3.5" fill="#8DB04F"/>`;
 return `<svg viewBox="0 0 120 90" role="img" aria-label="Illustration du plat" preserveAspectRatio="xMidYMid slice"><rect width="120" height="90" style="fill:var(--soft)"/>${g}</svg>`;
}
const visual=d=>d.photo?`<img src="${esc(d.photo)}" alt="${esc(d.name)}" loading="lazy">`:art(d);
function avatar(u,sz=40){
 if(u.photo)return `<img class="av" style="width:${sz}px;height:${sz}px" src="${esc(u.photo)}" alt="">`;
 return `<span class="av" style="width:${sz}px;height:${sz}px;background:hsl(${hash(u.id||u.name)%360} 35% 38%);font-size:${Math.round(sz*.38)}px" aria-hidden="true">${esc(initials(u.name))}</span>`;
}
const logo=()=>`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" style="fill:var(--primary)"/><path d="M8 22h24a12 10 0 0 1-24 0z" fill="#fff"/><path d="M20 20c-6-1-9-5-9-10 6 0 10 3 9 10z" style="fill:var(--accent)"/><path d="M20 20c6-1 9-5 9-10-6 0-10 3-9 10z" fill="#fff" opacity=".85"/></svg>`;
const leaf=()=>`<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4C9 4 4 10 4 17c0 1 .1 2 .3 3C6 12 12 10 12 10c-4 3-6 7-6.6 10.2C6 20.8 7 21 8 21c8 0 12-6 12-17z" fill="currentColor"/></svg>`;

/* ====================== panier ====================== */
let cart={items:[]};
try{const c=JSON.parse(ls.get('cantine-cart')||'null');if(c&&Array.isArray(c.items))cart=c}catch(e){}
const saveCart=()=>ls.set('cantine-cart',JSON.stringify(cart));
function cartLines(){
 const out=[];
 for(const it of cart.items){
  if(it.id==='formule'){const md=S.menuDuJour;if(md.formulePrice>0)out.push({id:'formule',name:'Formule du jour',sub:md.items.map(i=>dish(i)).filter(Boolean).map(d=>d.name).join(', '),price:md.formulePrice,qty:it.qty})}
  else{const d=dish(it.id);if(d&&d.active)out.push({id:d.id,name:d.name,price:d.price,qty:it.qty})}
 }
 return out;
}
const cartCount=()=>cartLines().reduce((a,l)=>a+l.qty,0);
const cartTotal=()=>cartLines().reduce((a,l)=>a+l.qty*l.price,0);
const qtyOf=id=>{const i=cart.items.find(x=>x.id===id);return i?i.qty:0};
/* ====================== infrastructure UI ====================== */
const ui={cat:'Tout',q:'',veg:false,acct:'login',draft:{}};
const route=()=>{const h=(location.hash||'#/').replace(/^#\/?/,'').split('?')[0];return{p:h.split('/').filter(Boolean).map(decodeURIComponent)}};
function toast(msg,kind){
 const box=$('#toasts');if(!box)return;
 const t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;box.appendChild(t);
 setTimeout(()=>t.remove(),3200);
}
let lastFocus=null,confirmCb=null;
const modalOpen=()=>!!($('#modal')&&$('#modal').innerHTML.trim());
function openModal(html,o={}){
 lastFocus=document.activeElement;
 $('#modal').innerHTML=`<div class="overlay" data-a="${o.lock?'noop':'modalClose'}"><div class="dlg ${o.cls||''}" role="dialog" aria-modal="true" aria-label="${esc(o.label||'Fenêtre')}">${html}</div></div>`;
 const f=$('#modal .dlg input:not([type=hidden]):not([type=file]),#modal .dlg select,#modal .dlg textarea,#modal .dlg .btn');
 if(f&&!o.nofocus)try{f.focus()}catch(e){}
}
function closeModal(){$('#modal').innerHTML='';tmpPhoto=undefined;if(lastFocus&&lastFocus.focus)try{lastFocus.focus()}catch(e){}}
function dlgHead(title,sub){return `<div class="dlg-h"><div><h2>${esc(title)}</h2>${sub?`<p class="muted small">${sub}</p>`:''}</div><button class="x" data-a="modalClose" aria-label="Fermer">×</button></div>`}
function askConfirm(msg,okLabel,cb,danger){
 confirmCb=cb;
 openModal(`${dlgHead('Confirmer')}<p>${esc(msg)}</p><div class="dlg-f"><button class="btn ghost" data-a="modalClose">Annuler</button><button class="btn ${danger?'danger':''}" data-a="confirmOk">${esc(okLabel||'Confirmer')}</button></div>`,{label:'Confirmation'});
}
let tmpPhoto;
function readImage(file,max=640){
 return new Promise((res,rej)=>{
  const fr=new FileReader();
  fr.onload=()=>{const img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.78))};img.onerror=rej;img.src=fr.result};
  fr.onerror=rej;fr.readAsDataURL(file);
 });
}

/* ====================== coque publique ====================== */
const ICON={
 home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
 pin:'<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/>',
 user:'<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};
function currentOrderInfo(){            // démonstration : dernière commande passée sur cet appareil
 const nums=mine();if(!nums.length)return null;
 const num=nums.slice().sort((a,b)=>(+b.replace(/\D/g,''))-(+a.replace(/\D/g,'')))[0];
 const o=S.orders.find(x=>x.num===num);
 return o?{num:o.num,status:o.status,payStatus:o.payStatus,pickupTime:o.pickupTime}:null;
}
function orderBar(){
 const i=currentOrderInfo();
 if(!i||i.status==='done'||i.status==='cancelled'||route().p[0]==='suivi')return '';
 const msg=i.status==='awaiting'?'Paiement en attente':i.status==='new'?(i.payStatus==='à vérifier'?'Reçue, paiement en cours de vérification':'Reçue'):i.status==='prep'?'En préparation':i.status==='ready'?'Prête : venez la récupérer':'En cours';
 return `<a class="orderbar ${i.status}" href="#/suivi/${esc(i.num)}"><span><strong>Commande ${esc(i.num)}</strong> : ${msg}</span><span class="ob-t">Retrait ${hmc(i.pickupTime)}</span></a>`;
}
function installBanner(){
 if(!installReady())return '';
 if(Date.now()-(+ls.get('cantine-install-off')||0)<14*DAY)return '';
 return `<div class="installbar"><div class="wrap"><span>${STAFF_APP?'Installez l\'application équipe sur cet appareil pour ouvrir les commandes plus vite.':'Installez l\'application sur votre téléphone pour commander plus vite.'}</span><span class="ib"><button class="btn sm accent" data-a="install">Installer</button><button class="x" data-a="installOff" aria-label="Masquer">×</button></span></div></div>`;
}
function shell(inner){
 const s=S.settings,r=route().p[0]||'',n=cartCount(),cl=client();
 const links=[['','Accueil'],['menu','Menu'],['actualites','Actualités'],['infos','Infos et accès'],['faq','FAQ']];
 const tabs=[['','Accueil','home'],['menu','Menu','menu'],['infos','Infos','pin'],...(ACCOUNTS?[['compte','Compte','user']]:[])];
 return `<a class="skip" href="#main">Aller au contenu</a>
 <header class="topbar"><div class="wrap">
  <a class="brand" href="#/">${logo()}<span>${esc(s.name)}</span></a>
  <nav class="main" aria-label="Navigation principale">${links.map(([h,l])=>`<a href="#/${h}" ${r===h?'aria-current="page"':''}>${l}</a>`).join('')}</nav>
  <span class="spacer"></span>
  ${ACCOUNTS?`<a class="btn ghost sm hide-m" href="#/compte">${cl?esc(cl.name.split(' ')[0]):'Mon compte'}</a>`:''}
  <button class="btn sm" data-a="cartOpen" aria-label="Ouvrir le panier">Panier${n?` <span class="count">${n}</span>`:''}</button>
 </div></header>
 <main id="main">${orderBar()}${installBanner()}${inner}</main>
 <footer class="site"><div class="wrap">
  <div><h3>${esc(s.name)}</h3><p>${esc(s.tagline)}</p></div>
  <div><h3>Nous trouver</h3><p>${esc(s.address)}</p><p><a href="tel:${esc(s.phone.replace(/\s/g,''))}">${esc(s.phone)}</a></p></div>
  <div><h3>Liens</h3><ul><li><a href="#/menu">La carte</a></li><li><a href="#/suivi">Suivre ma commande</a></li><li><a href="#/faq">Questions fréquentes</a></li><li><a href="#/mentions">Mentions légales</a></li><li><a href="#/confidentialite">Confidentialité</a></li><li><a href="#/cgv">Conditions de vente</a></li>${PROD&&!isStandalone()&&!STAFF_APP?'<li><button class="linkbtn" style="color:inherit" data-a="install">Installer l\'application</button></li>':''}<li><a href="${STAFF_URL||'#/admin'}">Espace équipe</a></li></ul></div>
 </div></footer>
 ${n&&r!=='commande'?`<button class="cartpill" data-a="cartOpen"><span>Panier, ${n} article${n>1?'s':''}</span><span>${money(cartTotal())}</span></button>`:''}
 <nav class="tabbar" aria-label="Navigation mobile">${tabs.map(([h,l,i])=>`<a href="#/${h}" ${r===h?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[i]}</svg>${l}</a>`).join('')}</nav>`;
}

/* ====================== accueil ====================== */
function board(){
 const md=S.menuDuJour,items=md.items.map(dish).filter(d=>d&&d.active);
 return `<section class="board" aria-label="Menu du jour">
  <div class="board-h"><h2>Menu du jour</h2><span>${esc(cap(dlong(Date.now())))}</span></div>
  ${items.length?`<ul>${items.map(d=>`<li><span class="n">${esc(d.name)}</span><span class="dots"></span><span class="p">${money(d.price)}</span><button class="plus" data-a="add" data-id="${d.id}" aria-label="Ajouter ${esc(d.name)} au panier">+</button></li>`).join('')}</ul>`:'<p>Le menu du jour sera publié bientôt.</p>'}
  ${md.formulePrice>0&&items.length>1?`<div class="formule"><div><strong>Formule complète</strong><span>Les ${items.length} plats ci-dessus</span></div><button class="btn accent" data-a="add" data-id="formule">${money(md.formulePrice)}</button></div>`:''}
 </section>`;
}
function hoursList(){
 return `<ul class="hours">${[1,2,3,4,5,6,0].map(d=>{const t=S.settings.hours[d];return `<li class="${new Date().getDay()===d?'today':''}"><span>${cap(DAYNAMES[d])}</span><span>${t?hmc(t[0])+' à '+hmc(t[1]):'Fermé'}</span></li>`}).join('')}</ul>`;
}
function mapArt(){
 return `<svg viewBox="0 0 400 300" role="img" aria-label="Plan schématique du quartier de la cantine" preserveAspectRatio="xMidYMid slice">
 <rect width="400" height="300" style="fill:var(--soft)"/>
 <g style="fill:var(--surface)" opacity=".85"><rect x="20" y="20" width="110" height="80" rx="10"/><rect x="150" y="20" width="90" height="80" rx="10"/><rect x="270" y="20" width="110" height="80" rx="10"/><rect x="20" y="130" width="70" height="70" rx="10"/><rect x="270" y="130" width="110" height="70" rx="10"/><rect x="20" y="230" width="150" height="50" rx="10"/><rect x="200" y="230" width="180" height="50" rx="10"/></g>
 <g style="stroke:var(--line)" stroke-width="14" fill="none" stroke-linecap="round"><path d="M0 115h400"/><path d="M140 0v300"/><path d="M255 0v300"/><path d="M0 215h400"/></g>
 <path d="M0 215h255V115" style="stroke:var(--accent)" stroke-width="5" stroke-dasharray="2 10" stroke-linecap="round" fill="none"/>
 <g transform="translate(150 150)"><path d="M0 40c-18-22-26-34-26-48a26 26 0 0 1 52 0c0 14-8 26-26 48z" style="fill:var(--primary)"/><circle cy="-8" r="10" fill="#fff"/></g>
 </svg>`;
}
function pageHome(){
 const s=S.settings,oi=openInfo(),sug=S.dishes.filter(d=>d.active&&d.badge).slice(0,4),news=pubNews().slice(0,3);
 return `<section class="wrap hero">
  <div>
   <span class="status ${oi.open?'on':''}"><i></i>${esc(oi.text)}</span>
   <h1>${esc(s.name)}</h1>
   <p class="lead">${esc(s.tagline)}</p>
   <div class="actions"><a class="btn accent lg" href="#/menu">Commander</a><a class="btn ghost lg" href="${mapsUrl()}" target="_blank" rel="noopener">Itinéraire</a></div>
   <p class="paynote">Paiement par ${pays().map(p=>esc(p.label)).join(', ')||'espèces'}. Aucun compte nécessaire.</p>
  </div>
  ${board()}
 </section>
 <section class="wrap block steps"><h2 style="margin-bottom:20px">Commander en trois étapes</h2><ol>
  <li><b>1</b><div><strong>Choisissez vos plats</strong><span class="muted">Parcourez la carte et remplissez votre panier.</span></div></li>
  <li><b>2</b><div><strong>Réglez en ligne ou au retrait</strong><span class="muted">Mobile money, carte ou espèces à la caisse.</span></div></li>
  <li><b>3</b><div><strong>Récupérez à l'heure choisie</strong><span class="muted">Votre repas est prêt, sans file d'attente.</span></div></li>
 </ol></section>
 ${sug.length?`<section class="wrap block"><div class="sechead"><h2>À ne pas manquer</h2><a href="#/menu">Voir toute la carte</a></div><div class="grid snap">${sug.map(dcard).join('')}</div></section>`:''}
 ${news.length?`<section class="wrap block"><div class="sechead"><h2>Actualités</h2><a href="#/actualites">Toutes les actualités</a></div><div class="news">${news.map(newsItem).join('')}</div></section>`:''}
 <section class="wrap block"><div class="loc">
  <div><h2>Venir à la cantine</h2><p class="muted" style="margin-top:10px">${esc(s.address)}</p>${hoursList()}
   <div class="actions"><a class="btn" href="${mapsUrl()}" target="_blank" rel="noopener">Y aller</a><a class="btn ghost" href="tel:${esc(s.phone.replace(/\s/g,''))}">Appeler</a></div></div>
  <div class="mapbox">${mapArt()}</div>
 </div></section>`;
}
function dcard(d){
 return `<article class="dcard"><div class="vis">${d.badge?`<span class="tag">${esc(d.badge)}</span>`:''}${visual(d)}</div>
 <div class="body"><h3><button class="linkbtn" style="text-decoration:none;color:inherit;font:inherit" data-a="dish" data-id="${d.id}">${esc(d.name)}</button></h3><p class="muted small">${esc(d.desc)}</p>
 <div class="foot"><span class="price">${money(d.price)}</span><button class="btn sm" data-a="add" data-id="${d.id}">Ajouter</button></div></div></article>`;
}
function newsItem(n){return `<article class="newsitem"><time>${esc(dshort(n.at))}</time><div><h3>${esc(n.title)}${n.pinned?'<span class="pin">À la une</span>':''}</h3><p class="muted">${esc(n.body)}</p></div></article>`}

/* ====================== carte ====================== */
function dishRow(d){
 const q=qtyOf(d.id);
 return `<article class="mrow"><div class="thumb">${visual(d)}</div><div>
  <div class="ttl"><button data-a="dish" data-id="${d.id}">${esc(d.name)}</button><span class="dots"></span><span class="price">${money(d.price)}</span></div>
  <p class="desc">${esc(d.desc)}</p>
  <div class="mfoot"><div class="badges">${d.badge?`<span class="bd">${esc(d.badge)}</span>`:''}${d.veg&&d.cat!=='Boissons'?`<span class="bd">${leaf()} Végétarien</span>`:''}${d.allergens.map(a=>`<span class="bd al">${esc(a)}</span>`).join('')}</div>
  ${q?`<div class="stepper"><button data-a="dec" data-id="${d.id}" aria-label="Retirer un ${esc(d.name)}">−</button><output>${q}</output><button data-a="inc" data-id="${d.id}" aria-label="Ajouter un ${esc(d.name)}">+</button></div>`:`<button class="btn sm" data-a="add" data-id="${d.id}">Ajouter</button>`}</div>
 </div></article>`;
}
function menuList(){
 const q=ui.q.trim().toLowerCase();
 const list=S.dishes.filter(d=>d.active&&(ui.cat==='Tout'||d.cat===ui.cat)&&(!ui.veg||d.veg)&&(!q||(d.name+' '+d.desc).toLowerCase().includes(q)));
 if(!list.length)return `<div class="empty" style="margin-top:28px">Aucun plat ne correspond. Essayez un autre mot ou retirez le filtre végétarien.</div>`;
 return CATS.filter(c=>list.some(d=>d.cat===c)).map(c=>`<h2 class="catname">${c}</h2>${list.filter(d=>d.cat===c).map(dishRow).join('')}`).join('');
}
function pageMenu(){
 return `<section class="wrap pagehead"><h1>La carte</h1><p class="lead">Tous les prix sont en FCFA. Les allergènes sont indiqués sous chaque plat.</p></section>
 <div class="filters"><div class="wrap fl">
  <div class="chips" role="group" aria-label="Catégories">${['Tout',...CATS].map(c=>`<button class="chip" data-a="cat" data-v="${c}" aria-pressed="${ui.cat===c}">${c}</button>`).join('')}</div>
  <input class="input search" type="search" placeholder="Rechercher un plat" aria-label="Rechercher un plat" data-i="menuQ" value="${esc(ui.q)}">
  <button class="chip" data-a="vegToggle" aria-pressed="${ui.veg}">${leaf()} Végétarien</button>
 </div></div>
 <section class="wrap" id="menulist">${menuList()}</section>`;
}
function dishModal(d){
 const q=qtyOf(d.id)||1;
 openModal(`${dlgHead(d.name)}<div class="vis" style="border-radius:16px;aspect-ratio:16/9;margin-bottom:14px">${visual(d)}</div>
 <p>${esc(d.desc)}</p>
 <div class="badges" style="margin:12px 0">${d.veg&&d.cat!=='Boissons'?`<span class="bd">${leaf()} Végétarien</span>`:''}${d.badge?`<span class="bd">${esc(d.badge)}</span>`:''}</div>
 <p class="small"><strong>Allergènes :</strong> ${d.allergens.length?esc(d.allergens.join(', ')):'aucun allergène majeur déclaré'}</p>
 <div class="dlg-f" style="justify-content:space-between;align-items:center"><span class="price" style="font-size:1.4rem">${money(d.price)}</span><button class="btn accent" data-a="add" data-id="${d.id}" data-close="1">Ajouter au panier</button></div>`,{label:d.name});
}

/* ====================== panier (tiroir) ====================== */
function cartLinesHtml(editable=true){
 const lines=cartLines();
 if(!lines.length)return `<div class="empty" style="margin:18px 0">Votre panier est vide. Ajoutez des plats depuis la carte.</div>`;
 return lines.map(l=>`<div class="cl"><div class="nm"><strong>${esc(l.name)}</strong>${l.sub?`<small>${esc(l.sub)}</small>`:''}<small>${money(l.price)}</small></div>
  ${editable?`<div class="stepper"><button data-a="dec" data-id="${l.id}" aria-label="Retirer un ${esc(l.name)}">−</button><output>${l.qty}</output><button data-a="inc" data-id="${l.id}" aria-label="Ajouter un ${esc(l.name)}">+</button></div>`:`<span>×${l.qty}</span>`}
  <strong style="min-width:84px;text-align:right">${money(l.price*l.qty)}</strong></div>`).join('');
}
function drawerHtml(){
 return `<div class="overlay" data-a="cartClose"><aside role="dialog" aria-modal="true" aria-label="Panier">
  <div class="dh"><h2>Mon panier</h2><button class="x" data-a="cartClose" aria-label="Fermer le panier">×</button></div>
  <div class="db">${cartLinesHtml()}</div>
  <div class="df"><div class="line tot" style="margin-top:0;border:0;padding-top:0"><span>Total</span><span>${money(cartTotal())}</span></div>
  <a class="btn accent lg" style="width:100%" href="#/commande" data-a="cartClose" ${cartCount()?'':'aria-disabled="true" tabindex="-1" style="width:100%;opacity:.5;pointer-events:none"'}>Passer la commande</a></div></aside></div>`;
}
let drawerIsOpen=false;
function refreshDrawer(){if(drawerIsOpen)$('#drawer').innerHTML=drawerHtml()}

/* ====================== commande ====================== */
function pageCheckout(){
 const opts=pickupOptions(),cl=client(),dr=ui.draft,p=pays();
 if(!cartCount())return shell(`<section class="wrap pagehead"><h1>Ma commande</h1><div class="empty" style="margin-top:20px">Votre panier est vide.<br><a class="btn" style="margin-top:14px" href="#/menu">Voir la carte</a></div></section>`);
 if(!opts.length)return shell(`<section class="wrap pagehead"><h1>Ma commande</h1><div class="empty" style="margin-top:20px">Aucun créneau de retrait n'est disponible pour le moment. Consultez les horaires ou appelez la cantine au ${esc(S.settings.phone)}.</div></section>`);
 const day=opts.find(o=>o.key===dr.day)||opts[0],method=dr.method&&p.find(x=>x.id===dr.method)?dr.method:(p[0]&&p[0].id);
 const phone0=dr.phone!=null?dr.phone:(cl?fmtPhone(cl.phone):'');
 return shell(`<section class="wrap pagehead"><h1>Ma commande</h1></section>
 <section class="wrap"><div class="twocol">
 <form id="checkout" data-form="checkout" novalidate>
  <div class="panel"><h2>Vos coordonnées</h2>
   <div class="row"><div class="field"><label for="f-name">Nom</label><input class="input" id="f-name" name="name" autocomplete="name" required value="${esc(dr.name!=null?dr.name:(cl?cl.name:''))}"></div>
   <div class="field"><label for="f-phone">Téléphone</label><input class="input" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="90 00 00 00" required value="${esc(phone0)}"></div></div>
   ${S.settings.notifyEmail?`<div class="field"><label for="f-email">E-mail (facultatif)</label><input class="input" id="f-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="vous@exemple.com" value="${esc(dr.email||'')}"><span class="hint">Pour être prévenu quand votre commande est reçue et prête. Utilisé uniquement pour cette commande.</span></div>`:''}
   ${cl||!ACCOUNTS?'':`<p class="hint">Vous avez un compte ? <a href="#/compte">Connectez-vous</a> pour pré-remplir vos informations et utiliser votre crédit.</p>`}
  </div>
  <div class="panel"><h2>Retrait</h2>
   <div class="row"><div class="field"><label for="f-day">Jour</label><select class="input" id="f-day" name="day" data-c="pickupDay">${opts.map(o=>`<option value="${o.key}" ${o.key===day.key?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>
   <div class="field"><label for="f-time">Heure</label><select class="input" id="f-time" name="time">${day.slots.map(t=>{const full=slotFull(day.key,t);return `<option value="${t}" ${dr.time===t&&!full?'selected':''} ${full?'disabled':''}>${hmc(t)}${full?' (complet)':''}</option>`}).join('')}</select></div></div>
   <div class="field"><label for="f-note">Instructions pour la cuisine (facultatif)</label><textarea class="input" id="f-note" name="note" placeholder="Ex. sans piment">${esc(dr.note||'')}</textarea></div>
  </div>
  <div class="panel"><h2>Paiement</h2>
   ${cl&&cl.credit>0?`<label class="check" style="margin-bottom:12px"><input type="checkbox" id="useCredit" name="useCredit" data-c="sum" ${dr.useCredit===false?'':'checked'}><span>Utiliser mon crédit de <strong>${money(cl.credit)}</strong></span></label>`:''}
   <div class="pay" role="radiogroup" aria-label="Moyen de paiement">${p.map(x=>`<label class="payopt"><input type="radio" name="method" value="${x.id}" data-c="method" ${x.id===method?'checked':''}><span><strong>${esc(x.label)}</strong><small>${esc(x.hint||'')}</small></span></label>`).join('')}</div>
   <div data-pane="momo" ${(payById(method)||{}).kind==='momo'?'':'hidden'}><div class="field"><label for="f-momo">Numéro à débiter</label><input class="input" id="f-momo" name="momo" type="tel" inputmode="tel" placeholder="90 00 00 00" value="${esc(dr.momo||phone0)}"><span class="hint">Vous recevrez une demande de validation sur ce numéro.</span></div></div>
   <div data-pane="card" ${(payById(method)||{}).kind==='card'?'':'hidden'}><div class="field"><label for="f-card">Numéro de carte</label><input class="input" id="f-card" name="card" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456"></div>
   <div class="row"><div class="field"><label for="f-exp">Expiration</label><input class="input" id="f-exp" name="exp" placeholder="MM/AA" autocomplete="cc-exp"></div><div class="field"><label for="f-cvc">Code</label><input class="input" id="f-cvc" name="cvc" inputmode="numeric" placeholder="CVC" autocomplete="cc-csc"></div></div></div>
   <div data-pane="manual" ${(payById(method)||{}).kind==='manual'?'':'hidden'}>${manualPaneHtml(payById(method)||{})}</div>
   <div data-pane="cash" ${(payById(method)||{}).kind==='cash'?'':'hidden'}><p class="muted">Vous réglez à la caisse au moment du retrait.</p></div>
   <p class="hint" style="margin-top:10px">Mode démonstration : aucun paiement réel n'est effectué.</p>
  </div>
  <label class="check" style="margin:4px 0 10px;align-items:flex-start"><input type="checkbox" name="cgv" ${dr.cgv?'checked':''}><span>J'ai lu et j'accepte les <a href="#/cgv" target="_blank" rel="noopener">conditions de vente</a> et la <a href="#/confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>.</span></label>
  <p class="err" id="coErr" role="alert"></p>
 </form>
 <aside class="panel sticky"><h2>Récapitulatif</h2><div id="sum">${summaryHtml()}</div>
  <button class="btn accent lg" style="width:100%;margin-top:14px" type="submit" form="checkout" id="payBtn">${payBtnLabel()}</button></aside>
 </div></section>`);
}
function manualPaneHtml(pm){const d=pm.details||{};return `<div class="panel" style="background:var(--soft);border:0;padding:14px;margin-bottom:12px"><p><strong>Comment payer</strong></p><ol style="margin:8px 0 0;padding-left:20px"><li>${d.steps?esc(d.steps):'Ouvrez '+esc(pm.label||'l\'application')+' et choisissez de payer un marchand, par QR code ou par code.'}</li><li>Code marchand : <strong>${esc(d.merchant||'')}</strong>${d.name?' ('+esc(d.name)+')':''}. Montant exact à payer : <strong id="manualAmount">${money(cartTotal()-creditApplied())}</strong>.</li><li>Vous recevez un SMS de confirmation avec une référence de transaction. Recopiez-la ci-dessous.</li></ol></div><div class="field"><label for="f-ref">Référence de la transaction (SMS de confirmation)</label><input class="input" id="f-ref" name="ref" autocomplete="off" placeholder="Le numéro reçu dans le SMS"><span class="hint">Votre commande sera préparée dès que la cantine aura vérifié votre paiement.</span></div>`}
function creditApplied(){const cl=client(),cb=$('#useCredit');const use=cb?cb.checked:(cl&&cl.credit>0&&ui.draft.useCredit!==false);return cl&&use?Math.min(cl.credit,cartTotal()):0}
function summaryHtml(){
 const t=cartTotal(),c=creditApplied();
 return cartLinesHtml()+`<div class="line" style="margin-top:6px"><span>Sous-total</span><span>${money(t)}</span></div>${c?`<div class="line"><span>Crédit utilisé</span><span>−${money(c)}</span></div>`:''}<div class="line tot"><span>À payer</span><span>${money(t-c)}</span></div>`;
}
function payBtnLabel(){const d=cartTotal()-creditApplied(),m=$('input[name=method]:checked');const k=m?(payById(m.value)||{}).kind:((pays()[0]||{}).kind);return d<=0?'Confirmer la commande':k==='cash'?'Confirmer, payer au retrait':k==='manual'?'Envoyer ma commande':'Payer '+money(d)}
function renderSummary(){const s=$('#sum');if(s)s.innerHTML=summaryHtml();const ma=$('#manualAmount');if(ma)ma.textContent=money(cartTotal()-creditApplied());const b=$('#payBtn');if(b)b.textContent=payBtnLabel()}

/* ====================== suivi ====================== */
const mine=()=>{try{return JSON.parse(ls.get('cantine-mine')||'[]')}catch(e){return[]}};
function remember(num){const m=mine();if(!m.includes(num)){m.push(num);ls.set('cantine-mine',JSON.stringify(m))}}
function pageTrack(num){
 if(!num)return shell(`<section class="wrap pagehead" style="max-width:560px"><h1>Suivre ma commande</h1><p class="lead">Entrez le numéro reçu à la commande et votre téléphone.</p>
  <form class="panel" style="margin-top:22px" data-form="lookup"><div class="field"><label for="l-num">Numéro de commande</label><input class="input" id="l-num" name="num" placeholder="A-1042" required></div>
  <div class="field"><label for="l-ph">Téléphone</label><input class="input" id="l-ph" name="phone" type="tel" placeholder="90 00 00 00" required></div><p class="err" role="alert" id="lkErr"></p><button class="btn" type="submit">Suivre</button></form></section>`);
 const o=S.orders.find(x=>x.num===num),cl=client();
 if(!o)return shell(`<section class="wrap pagehead"><h1>Commande introuvable</h1><p class="lead">Vérifiez le numéro ou <a href="#/suivi">réessayez</a>.</p></section>`);
 const ok=mine().includes(num)||(cl&&o.clientId===cl.id);
 if(!ok)return shell(`<section class="wrap pagehead" style="max-width:560px"><h1>Commande ${esc(num)}</h1><p class="lead">Confirmez votre numéro de téléphone pour l'afficher.</p>
  <form class="panel" style="margin-top:22px" data-form="lookup"><input type="hidden" name="num" value="${esc(num)}"><div class="field"><label for="l-ph">Téléphone</label><input class="input" id="l-ph" name="phone" type="tel" required></div><p class="err" role="alert" id="lkErr"></p><button class="btn" type="submit">Afficher</button></form></section>`);
 return shell(trackView(o));
}
function trackView(o){
 const idx=FLOW.indexOf(o.status),cancelled=o.status==='cancelled';
 return `<section class="wrap pagehead" style="max-width:820px">
  <p class="muted">Commande</p><div class="bignum">${esc(o.num)}</div>
  <p style="margin-top:6px"><span class="st st-${o.status}">${STATUS[o.status]}</span> &nbsp; Retrait ${o.pickupDate===dkey(Date.now())?'aujourd\'hui':'le '+esc(dshort(keyDate(o.pickupDate)))} à ${hmc(o.pickupTime)}</p>
  ${o.payStatus==='à vérifier'&&!cancelled?`<div class="panel" style="margin-top:14px"><h3>Paiement en cours de vérification</h3><p class="muted">La cantine vérifie votre paiement. Votre commande sera préparée dès qu'il sera confirmé. En cas de problème, appelez le ${esc(S.settings.phone)}.</p></div>`:''}${cancelled||o.status==='awaiting'?'':`<ol class="track" aria-label="Avancement de la commande">${FLOW.map((s,i)=>`<li class="${i<idx?'done':i===idx?(s==='done'?'done':'now'):''}">${s==='new'?'Reçue':STATUS[s]}</li>`).join('')}</ol>`}
  ${o.status==='awaiting'?`<div class="panel" style="margin-top:14px"><strong>Paiement en attente.</strong><p class="muted small" style="margin:6px 0 12px">Votre commande sera envoyée en cuisine dès que le paiement sera confirmé.</p><button class="btn accent" data-a="payNow" data-id="${esc(o.num)}">Payer maintenant</button></div>`:''}
  <div class="panel" style="margin-top:14px"><h3>Détail</h3>${o.items.map(i=>`<div class="line"><span>${i.qty}× ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}
   ${o.credit?`<div class="line"><span>Crédit utilisé</span><span>−${money(o.credit)}</span></div>`:''}<div class="line tot"><span>Total payé ou à payer</span><span>${money(o.due)}</span></div>
   <p class="muted small" style="margin-top:8px">${esc(o.methodLabel)}, ${o.payStatus==='à payer'?'à régler au retrait':esc(o.payStatus)}</p></div>
  <div class="actions"><a class="btn" href="${mapsUrl()}" target="_blank" rel="noopener">Itinéraire</a>
   ${o.status==='new'?`<button class="btn danger" data-a="cancelMine" data-id="${o.id}">Annuler ma commande</button>`:''}<a class="btn ghost" href="#/menu">Commander à nouveau</a></div>
  ${o.status==='prep'||o.status==='ready'?`<p class="hint" style="margin-top:12px">Pour modifier une commande déjà lancée, appelez le ${esc(S.settings.phone)}.</p>`:''}
 </section>`;
}

/* ====================== compte client ====================== */
function pageAccount(){
 const cl=client();
 if(!ACCOUNTS)return shell(`<section class="wrap pagehead" style="max-width:560px"><h1>Mon compte</h1><p class="lead">Les comptes clients ouvriront bientôt. En attendant, vous pouvez commander sans compte et suivre votre commande avec son numéro et votre téléphone.</p><div class="actions"><a class="btn accent" href="#/menu">Voir la carte</a><a class="btn ghost" href="#/suivi">Suivre ma commande</a></div></section>`);
 if(!cl&&BACKEND){
  const step2=!!ui.otpPhone;
  return shell(`<section class="wrap pagehead" style="max-width:520px"><h1>Mon compte</h1><p class="lead">Connectez-vous avec votre numéro de téléphone : nous vous envoyons un code par SMS. Aucun mot de passe à retenir.</p>
  ${step2?`<form class="panel" style="margin-top:22px" data-form="otpVerify"><p style="margin-bottom:14px">Code envoyé au <strong>${esc(fmtPhone(ui.otpPhone))}</strong>.</p>
   <div class="field"><label for="o-c">Code reçu par SMS</label><input class="input" id="o-c" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
   <p class="err" role="alert" id="acErr"></p><button class="btn" type="submit">Valider</button>
   <p class="hint" style="margin-top:12px"><button type="button" class="linkbtn" data-a="otpResend">Renvoyer le code</button> ou <button type="button" class="linkbtn" data-a="otpReset">changer de numéro</button></p></form>`
  :`<form class="panel" style="margin-top:22px" data-form="otpSend"><div class="field"><label for="o-p">Téléphone</label><input class="input" id="o-p" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="90 00 00 00" required></div>
   <div class="field"><label for="o-n">Votre nom (à la première connexion)</label><input class="input" id="o-n" name="name" autocomplete="name"></div>
   <p class="hint">En continuant, vous acceptez la <a href="#/confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>. Votre numéro sert uniquement à vous connecter et à suivre vos commandes.</p><p class="err" role="alert" id="acErr"></p><button class="btn" type="submit">Recevoir le code par SMS</button></form>`}
  <p style="margin-top:18px"><a href="#/suivi">Suivre une commande sans compte</a></p></section>`);
 }
 if(!cl){
  const reg=ui.acct==='register';
  return shell(`<section class="wrap pagehead" style="max-width:520px"><h1>Mon compte</h1><p class="lead">Un compte garde votre historique et votre crédit. Il n'est pas obligatoire pour commander.</p>
  <div class="tabs" role="tablist" style="margin-top:22px"><button role="tab" data-a="acctTab" data-v="login" aria-selected="${!reg}">Connexion</button><button role="tab" data-a="acctTab" data-v="register" aria-selected="${reg}">Créer un compte</button></div>
  ${reg?`<form class="panel" data-form="register"><div class="field"><label for="r-n">Nom complet</label><input class="input" id="r-n" name="name" autocomplete="name" required></div>
   <div class="field"><label for="r-p">Téléphone</label><input class="input" id="r-p" name="phone" type="tel" placeholder="90 00 00 00" required></div>
   <div class="field"><label for="r-c">Mot de passe (6 caractères minimum)</label><input class="input" id="r-c" name="pass" type="password" autocomplete="new-password" required></div><p class="err" role="alert" id="acErr"></p><button class="btn" type="submit">Créer mon compte</button></form>`
  :`<form class="panel" data-form="clogin"><div class="field"><label for="a-p">Téléphone</label><input class="input" id="a-p" name="phone" type="tel" placeholder="90 00 00 00" required></div>
   <div class="field"><label for="a-c">Mot de passe</label><input class="input" id="a-c" name="pass" type="password" autocomplete="current-password" required></div><p class="err" role="alert" id="acErr"></p><button class="btn" type="submit">Se connecter</button>
   ${PROD?'':'<p class="hint" style="margin-top:12px">Démonstration : 90 11 22 33, mot de passe xxxxxxxx.</p>'}</form>`}
  <p style="margin-top:18px"><a href="#/suivi">Suivre une commande sans compte</a></p></section>`);
 }
 const orders=S.orders.filter(o=>o.clientId===cl.id).sort((a,b)=>b.at-a.at);
 return shell(`<section class="wrap pagehead"><div class="sechead"><div><p class="muted">Bonjour</p><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(cl.name)}</h1></div><button class="btn ghost" data-a="clogout">Se déconnecter</button></div>
 <div class="twocol">
 <div><div class="panel"><h2>Mes commandes</h2>${orders.length?orders.map(o=>`<div class="cl"><div class="nm"><strong>${esc(o.num)}</strong><small>${esc(dshort(o.at))}, ${o.items.map(i=>i.qty+'× '+esc(i.name)).join(', ')}</small></div><span class="st st-${o.status}">${STATUS[o.status]}</span><a class="btn ghost sm" href="#/suivi/${esc(o.num)}">Voir</a></div>`).join(''):`<div class="empty">Aucune commande pour l'instant. <a href="#/menu">Voir la carte</a></div>`}</div></div>
 <div><div class="panel"><h2>Mon crédit</h2><div class="bignum">${money(cl.credit)}</div><p class="muted small">Utilisable sur votre prochaine commande.</p>
  <div style="margin-top:14px">${cl.history.length?cl.history.slice().sort((a,b)=>b.at-a.at).slice(0,8).map(h=>`<div class="line small"><span>${esc(dshort(h.at))}, ${esc(h.motif)}</span><strong style="color:${h.delta>0?'var(--ok)':'var(--ink)'}">${h.delta>0?'+':''}${money(h.delta)}</strong></div>`).join(''):'<p class="muted small">Aucun mouvement.</p>'}</div></div></div>
 </div></section>`);
}

/* ====================== infos, actualités, FAQ ====================== */
function pageInfo(){
 const s=S.settings;
 return shell(`<section class="wrap pagehead"><h1>Infos et accès</h1></section><section class="wrap"><div class="loc">
 <div><h2>Adresse</h2><p style="margin-top:8px">${esc(s.address)}</p><p class="muted"><a href="tel:${esc(s.phone.replace(/\s/g,''))}">${esc(s.phone)}</a>${s.email?`, <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`:''}</p>
 <h3 style="margin-top:26px">Horaires</h3>${hoursList()}
 <div class="actions"><a class="btn accent lg" href="${mapsUrl()}" target="_blank" rel="noopener">Itinéraire</a></div></div>
 <div class="mapbox">${mapArt()}</div></div></section>`);
}
function pageNews(){
 const n=pubNews();
 return shell(`<section class="wrap pagehead"><h1>Actualités</h1></section><section class="wrap"><div class="news">${n.length?n.map(newsItem).join(''):'<div class="empty">Aucune actualité pour le moment.</div>'}</div></section>`);
}
const FAQ={
 client:[
  ['Comment passer une commande ?','Ajoutez des plats au panier, ouvrez le panier, choisissez votre heure de retrait puis payez. Aucun compte n\'est nécessaire.'],
  ['Quels moyens de paiement sont acceptés ?','{pay}'],
  ['Puis-je modifier ou annuler ma commande ?','Vous pouvez l\'annuler vous-même depuis la page de suivi tant qu\'elle est « Nouvelle ». Pour la modifier, appelez le {phone}. Une fois la préparation lancée, nous ne pouvons plus la changer.'],
  ['Quels sont les horaires ?','{hours}'],
  ['Y a-t-il des options végétariennes ou sans allergènes ?','Oui. Activez le filtre « Végétarien » sur la carte. Les allergènes sont indiqués sous chaque plat.'],
  ['Que faire en cas de problème avec ma commande ?','Appelez le {phone} en indiquant votre numéro de commande. Si un paiement a été débité sans commande validée, nous le vérifions et le remboursons.'],
  ['Comment trouver la cantine ?','Ouvrez « Infos et accès » : la carte et le bouton Itinéraire vous guident. Adresse : {address}.']],
 employe:[
  ['Comment voir les commandes du jour ?','Ouvrez Commandes dans le menu : le filtre « Aujourd\'hui » est activé. Les nouvelles commandes apparaissent seules.'],
  ['Comment changer le statut d\'une commande ?','Ouvrez la commande puis choisissez le statut : Nouvelle, En préparation, Prête, Récupérée. Le client voit le changement tout de suite.'],
  ['Comment ajouter ou modifier un plat ?','Plats et menu, onglet Carte : « Ajouter un plat » ou « Modifier » sur un plat. Il faut le droit « Plats et menus ».'],
  ['Comment changer le Menu du jour ?','Plats et menu, onglet Menu du jour : cochez les plats, indiquez le prix de la formule, puis Enregistrer.'],
  ['Comment mettre à jour ma photo de profil ?','Ouvrez Mon profil et utilisez « Changer la photo ».'],
  ['Que faire si un client veut modifier sa commande ?','Si la commande est « Nouvelle », annulez-la et invitez le client à en passer une nouvelle. Si elle est en préparation, prévenez le gérant.']],
 gerant:[
  ['Comment gérer les inventaires et les stocks ?','Menu Stocks : ajustez les quantités avec + et −, fixez un seuil d\'alerte par article. Les articles sous le seuil apparaissent sur le tableau de bord.'],
  ['Quels sont mes droits par rapport à l\'Administrateur ?','Vous gérez commandes, menus, stocks, crédits, actualités, statistiques, horaires et coordonnées. Seul l\'Administrateur gère l\'équipe, le nom de la cantine, le style et les moyens de paiement.'],
  ['Comment voir les statistiques de vente ?','Tableau de bord : chiffre d\'affaires du jour, ventes sur 7 jours et plats les plus vendus.'],
  ['Comment gérer les crédits clients ?','Menu Crédits : ouvrez un client, ajoutez ou retirez un montant avec un motif. L\'historique garde chaque mouvement.'],
  ['Comment publier une information importante ?','Actualités, « Nouvelle actualité ». Cochez « À la une » pour la garder en haut de la page.'],
  ['Comment aider un employé qui a un problème ?','Vérifiez ses droits avec l\'Administrateur. Vous pouvez aussi changer le statut des commandes à sa place.']],
 admin:[
  ['Comment créer un compte Gérant ou Employé ?','Équipe, « Ajouter un membre » : nom, identifiant, code d\'accès et rôle.'],
  ['Comment donner ou retirer des droits à un employé ?','Équipe, « Modifier » sur l\'employé, puis cochez ou décochez ses droits.'],
  ['Comment changer le nom de la cantine ?','Paramètres, section Identité. Ce champ n\'est visible que par l\'Administrateur.'],
  ['Comment changer le style et les couleurs du site ?','Paramètres, section Apparence : choisissez un des quatre styles. Il s\'applique immédiatement.'],
  ['Comment configurer les moyens de paiement (Mixx, Flooz, Carte) ?','Paramètres, section Paiements : activez ou désactivez chaque moyen. La liaison à l\'agrégateur (CinetPay, PayDunya…) se fait à la mise en production.'],
  ['Comment voir toutes les activités de l\'équipe ?','Menu Activité : le journal indique qui a fait quoi et quand.']]
};
function faqHtml(role){
 const s=S.settings,hrs=[1,2,3,4,5,6,0].filter(d=>s.hours[d]).map(d=>cap(DAYNAMES[d])+' '+hmc(s.hours[d][0])+' à '+hmc(s.hours[d][1])).join(' ; ');
 const sub=t=>t.replace('{pay}','Nous acceptons : '+(pays().map(p=>p.label).join(', ')||'espèces')+'.').replace('{phone}',s.phone).replace('{hours}',hrs||'Fermé pour le moment.').replace('{address}',s.address);
 return `<div class="faq">${FAQ[role].map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(sub(a))}</p></details>`).join('')}</div>`;
}
function pageFaq(){return shell(`<section class="wrap pagehead" style="max-width:820px"><h1>Questions fréquentes</h1><div style="margin-top:20px">${faqHtml('client')}</div></section>`)}

/* ====================== pages légales ====================== */
const todo=t=>`<mark class="todo">${esc(t)}</mark>`;
function pageLegal(kind){
 const s=S.settings,lg=s.legal||{},v=(x,ph)=>x&&String(x).trim()?esc(x):todo(ph);
 const company=v(lg.company,'raison sociale'),contact=v(lg.contact||s.email,'e-mail de contact'),host=v(lg.host,'hébergeur du site');
 const upd=esc(dlong(Date.now()));
 const draft=staff()?`<div class="panel" style="margin-bottom:22px;border-color:var(--accent)"><strong>Brouillon à faire valider.</strong> Ce texte est un modèle de départ, pas un avis juridique : faites-le relire par un juriste togolais. Les champs surlignés sont à compléter dans Paramètres, Informations légales. Ce message n'est visible que par l'équipe connectée.</div>`:'';
 const pm=pays().map(p=>esc(p.label)).join(', ')||'espèces';
 let title,body;
 if(kind==='mentions'){
  title='Mentions légales';
  body=`<h2>Éditeur du site</h2><p>${company}, ${v(lg.form,'forme juridique')}, exploitant « ${esc(s.name)} ».<br>Siège : ${esc(s.address)}.<br>Téléphone : ${esc(s.phone)}. E-mail : ${contact}.<br>NIF : ${v(lg.nif,'numéro NIF')}. RCCM : ${v(lg.rccm,'numéro RCCM')}.</p>
  <p>Responsable de la publication : ${v(lg.director,'nom du responsable')}.</p>
  <h2>Hébergement</h2><p>Site : ${host}.<br>Base de données : Supabase Inc., région ${todo('région du serveur')}.</p>
  <h2>Propriété intellectuelle</h2><p>Les textes, illustrations et la marque « ${esc(s.name)} » appartiennent à l'éditeur. Toute reproduction sans autorisation est interdite.</p>
  <h2>Responsabilité</h2><p>L'éditeur s'efforce de maintenir les informations (carte, prix, horaires) à jour, mais ne peut garantir leur exactitude à tout instant. En cas de doute, contactez la cantine.</p>`;
 }else if(kind==='confidentialite'){
  title='Politique de confidentialité';
  body=`<p>Cette politique explique comment ${company} (« ${esc(s.name)} ») traite vos données personnelles, conformément à la loi n° 2019-014 du 29 octobre 2019 relative à la protection des données à caractère personnel.</p>
  <h2>Responsable du traitement</h2><p>${company}, ${esc(s.address)}. Contact pour vos données : ${contact}.</p>
  <h2>Données collectées et pourquoi</h2><ul>
  <li><strong>Commande</strong> : nom, téléphone, heure de retrait, contenu de la commande, instructions. Pour préparer et vous remettre votre commande, et vous prévenir en cas de problème.</li>
  ${S.settings.notifyEmail?'<li><strong>E-mail (facultatif)</strong> : adresse saisie à la commande, utilisée uniquement pour vous prévenir quand votre commande est reçue, prête ou annulée.</li>':''}
  ${ACCOUNTS?`<li><strong>Compte client (facultatif)</strong> : nom, téléphone, historique des commandes, crédit. Pour retrouver vos commandes et gérer votre crédit. La connexion se fait par code envoyé par SMS.</li>`:''}
  <li><strong>Paiement</strong> : le règlement en ligne est traité par CinetPay. La cantine ne reçoit ni votre numéro de carte ni votre code secret, seulement la confirmation du paiement.</li>
  <li><strong>Équipe</strong> : nom, identifiant, actions effectuées, pour la sécurité et le suivi du service.</li>
  <li><strong>Sécurité</strong> : votre adresse IP est utilisée brièvement pour limiter les abus (conservée environ 24 heures).</li></ul>
  <h2>Qui reçoit vos données</h2><p>Uniquement les prestataires nécessaires au service : Supabase (hébergement de la base de données), CinetPay (paiement en ligne), ${ACCOUNTS?todo('fournisseur SMS')+' (envoi des codes de connexion), ':''}${S.settings.notifyEmail?'Brevo (envoi des e-mails de suivi de commande), ':''}${host} (hébergement du site). Les polices d'écriture du site sont chargées depuis Google Fonts, ce qui transmet votre adresse IP à Google.</p>
  <h2>Transferts hors du Togo</h2><p>Ces prestataires peuvent être situés hors du Togo. Nous veillons à ce que le niveau de protection de vos données reste adéquat, comme l'exige la loi.</p>
  <h2>Durée de conservation</h2><p>Commandes : ${lg.retention?esc(lg.retention)+' an'+(+lg.retention>1?'s':''):todo('durée à fixer avec votre comptable')}. Compte client : jusqu'à votre demande de suppression. Les codes SMS ne sont pas conservés par la cantine.</p>
  <h2>Vos droits</h2><p>Vous pouvez demander l'accès à vos données, leur rectification, leur effacement ou vous opposer à leur traitement, en écrivant à ${contact} ou en appelant le ${esc(s.phone)}. Nous répondons dans un délai raisonnable. Pour un effacement, votre compte et vos commandes sont rendus anonymes (le crédit éventuel doit d'abord être utilisé ou remboursé). Vous pouvez aussi saisir l'Instance de protection des données à caractère personnel (IPDCP) du Togo.</p>
  <h2>Stockage dans votre navigateur</h2><p>Le site n'utilise ni cookie publicitaire ni outil de suivi. Il garde dans votre navigateur uniquement ce qui est nécessaire : votre panier, votre connexion et les numéros de vos commandes récentes.</p>`;
 }else{
  title='Conditions de vente';
  body=`<h2>Objet</h2><p>Ces conditions régissent les commandes passées sur ce site auprès de ${company} (« ${esc(s.name)} »), pour un retrait sur place.</p>
  <h2>Prix et carte</h2><p>Les prix sont indiqués en francs CFA (FCFA) ${todo('TVA : toutes taxes comprises ou non')}. La carte, les prix et les allergènes peuvent évoluer ; le prix applicable est celui affiché au moment de la commande.</p>
  <h2>Commande et retrait</h2><p>Vous choisissez un jour et une heure de retrait parmi les créneaux proposés. La commande est confirmée dès son enregistrement (et, pour un paiement en ligne, après confirmation du paiement). Elle est à retirer à la cantine, ${esc(s.address)}, à l'heure choisie. ${todo('règle en cas de commande non retirée')}</p>
  <h2>Paiement</h2><p>Moyens acceptés : ${pm}. Les paiements en ligne sont traités par CinetPay. Une commande payée en ligne qui n'est pas réglée dans les 30 minutes est annulée automatiquement. Les commandes payées en espèces sont réglées à la caisse, au retrait.</p>
  <h2>Annulation et remboursement</h2><p>Vous pouvez annuler vous-même votre commande depuis la page de suivi tant qu'elle est « Nouvelle ». Une fois la préparation commencée, appelez la cantine au ${esc(s.phone)}. Une commande annulée et déjà payée est remboursée en crédit sur votre compte, ou ${todo('modalité de remboursement sur Mixx, Flooz ou carte')}.</p>
  ${ACCOUNTS?`<h2>Crédit client</h2><p>Le crédit est rattaché à votre numéro de téléphone et utilisable sur vos prochaines commandes. ${todo('règles de validité et de remboursement du crédit')}</p>`:''}
  <h2>Allergènes</h2><p>Les allergènes principaux sont indiqués sur chaque plat. Les plats sont préparés dans une cuisine où des traces d'autres ingrédients peuvent subsister. Si vous êtes allergique, prévenez la cantine avant de commander.</p>
  <h2>Réclamations</h2><p>Pour toute question ou réclamation : ${contact} ou ${esc(s.phone)}, en indiquant votre numéro de commande.</p>
  <h2>Droit applicable</h2><p>Ces conditions sont soumises au droit togolais. ${todo('juridiction compétente')}</p>`;
 }
 return shell(`<section class="wrap pagehead legal" style="max-width:820px"><h1 style="font-size:clamp(2rem,4.5vw,3rem)">${title}</h1><p class="muted small" style="margin-top:6px">Dernière mise à jour : ${upd}</p><div style="margin-top:18px">${draft}${body}</div></section>`);
}
/* ====================== administration : coque ====================== */
const ADM=[
 ['','Tableau de bord',()=>true],
 ['commandes','Commandes',()=>can('commandes')],
 ['cuisine','Mode cuisine',()=>can('commandes')],
 ['plats','Plats et menu',()=>can('menus')],
 ['stocks','Stocks',()=>can('stocks')],
 ['credits','Crédits clients',()=>can('credits')],
 ['actualites','Actualités',()=>can('actualites')],
 ['equipe','Équipe',()=>isAdmin()],
 ['parametres','Paramètres',()=>isAdmin()||staff().role==='gerant'],
 ['activite','Activité',()=>isAdmin()],
 ['profil','Mon profil et FAQ',()=>true]
];
function adminShell(page,title,inner,actions=''){
 const u=staff(),newCount=S.orders.filter(o=>o.status==='new').length;
 return `<div class="adm"><aside class="side">
  <a class="brand" href="#/admin">${logo()}<span>${esc(S.settings.name)}</span></a>
  <nav aria-label="Administration">${ADM.filter(a=>a[2]()).map(([h,l])=>`<a href="#/admin${h?'/'+h:''}" ${page===h?'aria-current="page"':''}><span>${l}</span>${h==='commandes'&&newCount?`<span class="count">${newCount}</span>`:''}</a>`).join('')}</nav>
  <div class="me">${avatar(u,38)}<div style="flex:1;min-width:0"><strong>${esc(u.name)}</strong><small>${ROLES[u.role]}</small></div></div>
  <div style="display:flex;gap:8px"><a class="btn ghost sm" style="color:var(--board-ink);border-color:var(--board-line)" href="${STAFF_APP?(CLIENT_URL||'#/'):'#/'}">Voir le site</a>${PROD&&!isStandalone()?(STAFF_APP?'<button class="btn ghost sm" style="color:var(--board-ink);border-color:var(--board-line)" data-a="install">Installer</button>':(STAFF_URL?`<a class="btn ghost sm" style="color:var(--board-ink);border-color:var(--board-line)" href="${esc(STAFF_URL)}">Appli équipe</a>`:'')):''}<button class="btn ghost sm" style="color:var(--board-ink);border-color:var(--board-line)" data-a="slogout">Quitter</button></div>
 </aside><main class="amain" id="main">${STAFF_APP?installBanner():''}<div class="ahead"><h1 style="font-size:clamp(1.6rem,3vw,2.2rem)">${esc(title)}</h1><div>${actions}</div></div>${inner}</main></div>`;
}
function pageAdminLogin(){
 return `<div class="loginbox"><a class="brand" href="#/" style="margin-bottom:20px">${logo()}<span>${esc(S.settings.name)}</span></a>
 <form class="panel" data-form="slogin"><h1 style="font-size:1.8rem;margin-bottom:6px">Espace équipe</h1><p class="muted" style="margin-bottom:18px">Réservé à l'administrateur, au gérant et aux employés.</p>
 <div class="field"><label for="s-l">Identifiant</label><input class="input" id="s-l" name="login" autocomplete="username" required></div>
 <div class="field"><label for="s-c">Code d'accès</label><input class="input" id="s-c" name="code" type="password" autocomplete="current-password" required></div>
 <p class="err" role="alert" id="slErr"></p><button class="btn" style="width:100%" type="submit">Se connecter</button></form>
 ${BACKEND||PROD?'':`<div class="demo"><p class="muted small">Comptes de démonstration (touchez pour remplir) :</p>
 ${[['admin','xxxxxxxx','Administrateur'],['gerant','xxxxxxxx','Gérant'],['employe','xxxxxxxx','Employé']].map(([l,c,r])=>`<button data-a="fillLogin" data-l="${l}" data-c="${c}"><span>${r}</span><span class="muted">${l} / ${c}</span></button>`).join('')}</div>`}
 <p style="margin-top:18px"><a href="#/">Retour au site</a></p></div>`;
}

/* ====================== tableau de bord ====================== */
function barChart(){
 const days=[];for(let i=6;i>=0;i--){const s=startOfDay(Date.now()-i*DAY);days.push({s,label:new Date(s).toLocaleDateString('fr-FR',{weekday:'short'}),v:activeOrders(s).filter(o=>o.at<s+DAY).reduce((a,o)=>a+o.subtotal,0)})}
 const max=Math.max(1,...days.map(d=>d.v)),W=420,H=190,bw=40,gap=(W-bw*7)/8;
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chiffre d'affaires des 7 derniers jours" style="width:100%">${days.map((d,i)=>{const h=Math.round((H-52)*d.v/max),x=gap+i*(bw+gap);return `<rect x="${x}" y="${H-28-h}" width="${bw}" height="${h}" rx="8" style="fill:${i===6?'var(--accent)':'var(--primary)'}"/><text x="${x+bw/2}" y="${H-10}" text-anchor="middle" font-size="12" style="fill:var(--muted)">${esc(d.label)}</text><text x="${x+bw/2}" y="${H-34-h}" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--ink)">${d.v?Math.round(d.v/100)/10+'k':''}</text>`}).join('')}</svg>`;
}
function topDishes(from){
 const m={};activeOrders(from).forEach(o=>o.items.forEach(i=>{m[i.name]=(m[i.name]||0)+i.qty}));
 const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6),max=Math.max(1,...arr.map(a=>a[1]));
 return arr.length?`<div class="bars">${arr.map(([n,q])=>`<div class="bar"><span>${esc(n)}</span><span class="tr"><i style="width:${Math.round(q/max*100)}%"></i></span><strong>${q}</strong></div>`).join('')}</div>`:'<p class="muted">Aucune vente sur cette période.</p>';
}
let dashRange='today';
function pageDash(){
 const u=staff(),t0=startOfDay(Date.now()),today=activeOrders(t0),pending=S.orders.filter(o=>o.status==='new'||o.status==='prep').sort((a,b)=>a.at-b.at),low=lowStock();
 const kp=[];
 if(can('stats')){kp.push(['Commandes du jour',today.length,'']);kp.push(['Chiffre d\'affaires du jour',money(today.reduce((a,o)=>a+o.subtotal,0)),''])}
 kp.push(['Commandes en attente',pending.length,pending.length?'alert':'']);
 if(can('stocks'))kp.push(['Alertes de stock',low.length,low.length?'alert':'']);
 return adminShell('','Bonjour, '+u.name.split(' ')[0],`
 <div class="kpis">${kp.map(([l,v,c])=>`<div class="kpi ${c}"><span class="muted small">${l}</span><div class="v">${v}</div></div>`).join('')}</div>
 <div class="cols"><div>
  ${can('commandes')?`<div class="panel"><h2>À traiter</h2>${pending.length?`<div class="ords">${pending.slice(0,6).map(orderCard).join('')}</div>`:'<div class="empty">Aucune commande en attente.</div>'}</div>`:''}
  ${can('stats')?`<div class="panel"><h2>Ventes des 7 derniers jours</h2>${barChart()}</div>`:''}
 </div><div>
  ${can('stats')?`<div class="panel"><div class="sechead" style="margin-bottom:12px"><h2 style="margin:0">Plats les plus vendus</h2><div class="seg"><button data-a="range" data-v="today" aria-pressed="${dashRange==='today'}">Aujourd'hui</button><button data-a="range" data-v="week" aria-pressed="${dashRange==='week'}">7 jours</button></div></div>${topDishes(dashRange==='today'?t0:t0-6*DAY)}</div>`:''}
  ${can('stocks')?`<div class="panel"><h2>Stocks à surveiller</h2>${low.length?low.map(s=>`<div class="line"><span>${esc(s.name)}</span><span class="st ${s.qty<=0?'st-cancelled':'st-new'}">${s.qty<=0?'Épuisé':s.qty+' '+esc(s.unit)}</span></div>`).join(''):'<p class="muted">Tous les stocks sont au-dessus du seuil.</p>'}<p style="margin-top:10px"><a href="#/admin/stocks">Gérer les stocks</a></p></div>`:''}
 </div></div>`);
}

/* ====================== commandes ====================== */
function payDetailsForm(p){const d=p.details||{};return `<form data-form="payDetails" data-id="${p.id}" style="padding:10px 0 14px;border-bottom:1px solid var(--line)"><div class="row"><div class="field"><label for="pd-m-${p.id}">Code ou numéro marchand</label><input class="input" id="pd-m-${p.id}" name="merchant" value="${esc(d.merchant||'')}" required></div><div class="field"><label for="pd-n-${p.id}">Nom affiché au paiement (facultatif)</label><input class="input" id="pd-n-${p.id}" name="name" value="${esc(d.name||'')}"></div></div><div class="field"><label for="pd-s-${p.id}">Consigne pour le client (facultatif)</label><textarea class="input" id="pd-s-${p.id}" name="steps" placeholder="Ex. Dans l'application, choisissez Payer un marchand, scannez le QR code ou saisissez le code.">${esc(d.steps||'')}</textarea></div><button class="btn sm" type="submit">Enregistrer</button></form>`}
const payBadge=o=>o.status==='cancelled'&&(o.payStatus==='à payer'||o.payStatus==='à vérifier')?'<span class="st st-none">Sans paiement</span>':`<span class="st ${o.payStatus==='payé'?'st-paid':(o.payStatus==='à payer'||o.payStatus==='à vérifier')?'st-due':'st-refund'}">${cap(o.payStatus)}</span>`;
function orderCard(o){
 const nx=NEXT[o.status];
 const cash=o.payStatus==='à payer'&&o.status!=='cancelled'&&o.status!=='done';
 return `<article class="ord ${o.status}" data-a="orderOpen" data-id="${o.id}">
  <div class="ord-h"><strong>${esc(o.num)}</strong><span class="st st-${o.status}">${STATUS[o.status]}</span>${payBadge(o)}<span class="muted small">Retrait ${hmc(o.pickupTime)}</span><span class="muted small" style="margin-left:auto">${esc(ago(o.at))}</span></div>
  <div><strong>${esc(o.name)}</strong> <span class="muted small">${esc(fmtPhone(o.phone))}</span>${o.ref?` <span class="small">Réf. <strong>${esc(o.ref)}</strong></span>`:''}</div>
  <div class="muted small">${o.items.map(i=>i.qty+'× '+esc(i.name)).join(', ')}</div>
  ${cash?`<div class="ord-cash">💵 À encaisser au retrait : ${money(o.due)}</div>`:''}
  <div class="ord-f"><strong>${money(o.subtotal)}</strong><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-a="orderOpen" data-id="${o.id}">Détails</button>${o.payStatus==='à vérifier'&&o.status!=='cancelled'?`<button class="btn sm accent" data-a="markPaid" data-id="${o.id}">Valider le paiement</button>`:nx?`<button class="btn sm ${o.status==='new'?'accent':''}" data-a="advance" data-id="${o.id}">${nx[1]}</button>`:''}</div></div></article>`;
}
let oUi={f:'all',q:'',range:'today'};
function ordersFiltered(){
 const t0=startOfDay(Date.now()),from=oUi.range==='today'?t0:oUi.range==='week'?t0-6*DAY:0,q=oUi.q.trim().toLowerCase();
 return S.orders.filter(o=>o.at>=from&&(oUi.f==='all'||o.status===oUi.f)&&(!q||(o.num+' '+o.name+' '+o.phone).toLowerCase().includes(q))).sort((a,b)=>b.at-a.at);
}
function ordersList(){const l=ordersFiltered();return l.length?`<div class="ords">${l.slice(0,80).map(orderCard).join('')}</div>${l.length>80?'<p class="muted small" style="margin-top:10px">Affichage des 80 plus récentes. Affinez la recherche.</p>':''}`:'<div class="empty">Aucune commande ne correspond à ces filtres.</div>'}
function pageOrders(){
 const inRange=S.orders.filter(o=>o.at>=(oUi.range==='today'?startOfDay(Date.now()):oUi.range==='week'?startOfDay(Date.now())-6*DAY:0));
 const cnt=s=>s==='all'?inRange.length:inRange.filter(o=>o.status===s).length;
 return adminShell('commandes','Commandes',`
 <div class="panel" style="margin-bottom:18px"><div class="sechead" style="margin-bottom:0"><div class="seg" role="group" aria-label="Statut">${['all',...Object.keys(STATUS).filter(s=>BACKEND||s!=='awaiting')].map(s=>`<button data-a="ofilter" data-v="${s}" aria-pressed="${oUi.f===s}">${s==='all'?'Toutes':STATUS[s]} (${cnt(s)})</button>`).join('')}</div>
 <div style="display:flex;gap:10px;flex-wrap:wrap"><select class="input" style="width:auto" aria-label="Période" data-c="orange"><option value="today" ${oUi.range==='today'?'selected':''}>Aujourd'hui</option><option value="week" ${oUi.range==='week'?'selected':''}>7 jours</option><option value="all" ${oUi.range==='all'?'selected':''}>Tout</option></select>
 <input class="input" style="width:220px" type="search" placeholder="Numéro, nom, téléphone" aria-label="Rechercher une commande" data-i="orderQ" value="${esc(oUi.q)}"></div></div></div>
 <div style="margin-bottom:14px"><button class="btn ghost sm" data-a="exportCsv">Exporter en CSV (Excel)</button></div>
 <div id="orderlist">${ordersList()}</div>`);
}
function orderModal(o){
 const cl=S.clients.find(c=>c.phone===o.phone);
 openModal(`${dlgHead('Commande '+o.num,`${esc(cap(dlong(o.at)))} à ${hm(o.at)}`)}
 <div class="seg" role="group" aria-label="Changer le statut">${Object.keys(STATUS).filter(s=>s!=='awaiting').map(s=>`<button data-a="setStatus" data-id="${o.id}" data-v="${s}" aria-pressed="${o.status===s}">${STATUS[s]}</button>`).join('')}</div>
 <div class="row" style="margin:18px 0"><div><span class="muted small">Client</span><div><strong>${esc(o.name)}</strong></div><div class="small">${esc(fmtPhone(o.phone))}</div></div>
 <div><span class="muted small">Retrait</span><div><strong>${hmc(o.pickupTime)}</strong></div><div class="small">${o.pickupDate===dkey(Date.now())?'Aujourd\'hui':esc(dshort(keyDate(o.pickupDate)))}</div></div>
 <div><span class="muted small">Paiement</span><div><strong>${esc(o.methodLabel)}</strong></div><div>${payBadge(o)}</div>${o.ref?`<div class="small">Réf. <strong>${esc(o.ref)}</strong></div>`:''}</div></div>
 ${o.note?`<p class="panel" style="padding:12px;margin-bottom:14px"><strong>Instructions :</strong> ${esc(o.note)}</p>`:''}
 ${o.payStatus==='à vérifier'&&o.status!=='cancelled'?`<p class="panel" style="padding:12px;margin-bottom:14px;border-color:var(--accent)"><strong>À vérifier avant de préparer :</strong> dans votre application marchande, un paiement de ${money(o.due)} avec la référence <strong>${esc(o.ref||'')}</strong> doit apparaître. Si oui, validez le paiement ; sinon, annulez la commande.</p>`:''}
 ${o.items.map(i=>`<div class="line"><span>${i.qty}× ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}
 ${o.credit?`<div class="line"><span>Crédit utilisé</span><span>−${money(o.credit)}</span></div>`:''}<div class="line tot"><span>Total</span><span>${money(o.subtotal)}</span></div>
 <h3 style="margin-top:20px">Historique</h3><div class="small">${o.history.slice().reverse().map(h=>`<div class="line" style="padding:3px 0"><span>${STATUS[h.s]}${h.by?`, ${esc(h.by)}`:''}</span><span class="muted">${hm(h.at)}</span></div>`).join('')}</div>
 <div class="dlg-f">${(o.payStatus==='à payer'||o.payStatus==='à vérifier')&&o.status!=='cancelled'?`<button class="btn ${o.payStatus==='à vérifier'?'accent':'ghost'}" data-a="markPaid" data-id="${o.id}">${o.payStatus==='à vérifier'?'Valider le paiement':'Marquer comme payée'}</button>`:''}${o.payStatus==='à vérifier'&&o.status!=='cancelled'?`<button class="btn danger" data-a="setStatus" data-id="${o.id}" data-v="cancelled">Paiement non reçu : annuler</button>`:''}
 ${o.payStatus==='à rembourser'?`<button class="btn ghost" data-a="refundCredit" data-id="${o.id}">Rembourser en crédit${cl?'':' (créer le compte)'}</button>`:''}
 <button class="btn ghost" data-a="printTicket" data-id="${o.id}">Imprimer le ticket</button>
 <button class="btn" data-a="modalClose">Fermer</button></div>`,{label:'Commande '+o.num,cls:'wide'});
}
function addCredit(c,delta,motif,by){c.credit=Math.max(0,c.credit+delta);c.history.push({at:Date.now(),delta,motif,by:by||(staff()?staff().name:'Client')})}
function setStatus(o,s,by){
 if(o.status===s)return;
 const who=by||(staff()?staff().name:'Client');
 if(s==='cancelled')cancelOrder(o,who);
 else{o.status=s;o.history.push({s,at:Date.now(),by:who});if(s==='done'&&o.payStatus==='à payer')o.payStatus='payé'}
 logAct(`Commande ${o.num} : ${STATUS[s].toLowerCase()}`);save();
}
function cancelOrder(o,who){
 o.status='cancelled';o.history.push({s:'cancelled',at:Date.now(),by:who});
 const refund=o.credit+(o.payStatus==='payé'?o.due:0);
 if(refund>0){const c=S.clients.find(x=>x.id===o.clientId);if(c){addCredit(c,refund,'Remboursement '+o.num,who);o.payStatus='remboursé'}else o.payStatus='à rembourser'}
}

/* ====================== plats et menu du jour ====================== */
let dishTab='carte';
function pageDishes(){
 const tabs=`<div class="tabs" role="tablist"><button role="tab" data-a="dtab" data-v="carte" aria-selected="${dishTab==='carte'}">Carte</button><button role="tab" data-a="dtab" data-v="menu" aria-selected="${dishTab==='menu'}">Menu du jour</button></div>`;
 if(dishTab==='menu'){
  const md=S.menuDuJour;
  return adminShell('plats','Plats et menu',tabs+`<form class="panel" data-form="menuDuJour"><h2>Menu du jour, ${esc(dlong(Date.now()))}</h2>
  ${CATS.map(c=>{const l=S.dishes.filter(d=>d.cat===c&&d.active);return l.length?`<div class="field"><span class="lab">${c}</span><div class="checks">${l.map(d=>`<label class="check"><input type="checkbox" name="items" value="${d.id}" ${md.items.includes(d.id)?'checked':''}><span>${esc(d.name)} <span class="muted">${money(d.price)}</span></span></label>`).join('')}</div></div>`:''}).join('')}
  <div class="field" style="max-width:260px"><label for="fp">Prix de la formule complète (FCFA)</label><input class="input" id="fp" name="formule" type="number" min="0" step="50" value="${md.formulePrice||0}"><span class="hint">Laissez 0 pour ne pas proposer de formule.</span></div>
  <button class="btn" type="submit">Enregistrer le menu du jour</button></form>`);
 }
 return adminShell('plats','Plats et menu',tabs+`<div class="ahead" style="margin-top:-6px"><span class="muted">${S.dishes.length} plats, ${S.dishes.filter(d=>!d.active).length} désactivés</span><button class="btn" data-a="dishNew">Ajouter un plat</button></div>
 <div class="dgrid">${S.dishes.map(d=>`<article class="dcard" style="${d.active?'':'opacity:.65'}"><div class="vis" style="aspect-ratio:16/10">${d.badge?`<span class="tag">${esc(d.badge)}</span>`:''}${visual(d)}</div>
  <div class="body"><h3>${esc(d.name)}</h3><div class="badges"><span class="bd">${d.cat}</span>${d.veg?`<span class="bd">${leaf()} Végétarien</span>`:''}${d.active?'':'<span class="bd off">Désactivé</span>'}</div>
  <div class="foot"><span class="price">${money(d.price)}</span><div style="display:flex;gap:6px;align-items:center"><span class="switch" title="Activer ou désactiver"><input type="checkbox" role="switch" aria-label="Plat actif : ${esc(d.name)}" data-c="dishActive" data-id="${d.id}" ${d.active?'checked':''}></span><button class="btn ghost sm" data-a="dishEdit" data-id="${d.id}">Modifier</button></div></div></div></article>`).join('')}</div>`);
}
function dishForm(d){
 const n=!d;d=d||{name:'',cat:'Plats',price:'',desc:'',allergens:[],veg:false,badge:'',active:true,photo:''};
 tmpPhoto=undefined;
 openModal(`${dlgHead(n?'Ajouter un plat':'Modifier le plat')}<form data-form="dish" data-id="${n?'':d.id}">
 <div class="row"><div class="field"><label for="d-n">Nom</label><input class="input" id="d-n" name="name" required value="${esc(d.name)}"></div>
 <div class="field"><label for="d-p">Prix (FCFA)</label><input class="input" id="d-p" name="price" type="number" min="0" step="50" required value="${esc(d.price)}"></div></div>
 <div class="row"><div class="field"><label for="d-c">Catégorie</label><select class="input" id="d-c" name="cat">${CATS.map(c=>`<option ${d.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
 <div class="field"><label for="d-b">Mise en avant</label><select class="input" id="d-b" name="badge">${['','Suggestion','Plat du jour','Nouveau'].map(b=>`<option value="${b}" ${d.badge===b?'selected':''}>${b||'Aucune'}</option>`).join('')}</select></div></div>
 <div class="field"><label for="d-d">Description</label><textarea class="input" id="d-d" name="desc">${esc(d.desc)}</textarea></div>
 <div class="field"><span class="lab">Allergènes</span><div class="checks">${ALLERGENS.map(a=>`<label class="check"><input type="checkbox" name="al" value="${a}" ${d.allergens.includes(a)?'checked':''}>${a}</label>`).join('')}</div></div>
 <div class="field"><span class="lab">Photo</span><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="vis" id="photoPrev" style="width:120px;height:90px;border-radius:12px">${visual(d)}</div>
 <div><input type="file" accept="image/*" data-c="photo" aria-label="Choisir une photo"><br><button type="button" class="linkbtn small" data-a="photoClear">Retirer la photo</button></div></div></div>
 <label class="check"><input type="checkbox" name="veg" ${d.veg?'checked':''}>Plat végétarien</label><label class="check"><input type="checkbox" name="active" ${d.active?'checked':''}>Visible par les clients</label>
 <p class="err" role="alert" id="fErr"></p>
 <div class="dlg-f">${n?'':`<button type="button" class="btn danger" data-a="dishDelete" data-id="${d.id}" style="margin-right:auto">Supprimer</button>`}<button type="button" class="btn ghost" data-a="modalClose">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,{label:'Plat',cls:'wide'});
}

/* ====================== stocks ====================== */
let stockLow=false;
function stState(s){return s.qty<=0?['st-cancelled','Épuisé']:s.qty<=s.min?['st-new','Stock bas']:['st-paid','Suffisant']}
function pageStocks(){
 const list=S.stock.filter(s=>!stockLow||s.qty<=s.min),low=lowStock().length;
 return adminShell('stocks','Stocks',`<div class="ahead"><div class="seg"><button data-a="stockFilter" data-v="all" aria-pressed="${!stockLow}">Tous (${S.stock.length})</button><button data-a="stockFilter" data-v="low" aria-pressed="${stockLow}">À réapprovisionner (${low})</button></div><button class="btn" data-a="stockNew">Ajouter un article</button></div>
 <div class="tablewrap"><table class="tbl"><thead><tr><th>Article</th><th>Quantité</th><th>Seuil d'alerte</th><th>État</th><th></th></tr></thead><tbody>
 ${list.map(s=>{const [c,l]=stState(s);return `<tr><td><strong>${esc(s.name)}</strong></td><td><div class="stepper"><button data-a="stk" data-id="${s.id}" data-v="-1" aria-label="Retirer 1 ${esc(s.unit)} de ${esc(s.name)}">−</button><output>${s.qty} ${esc(s.unit)}</output><button data-a="stk" data-id="${s.id}" data-v="1" aria-label="Ajouter 1 ${esc(s.unit)} de ${esc(s.name)}">+</button></div></td><td>${s.min} ${esc(s.unit)}</td><td><span class="st ${c}">${l}</span></td><td class="right"><button class="btn ghost sm" data-a="stockEdit" data-id="${s.id}">Modifier</button></td></tr>`}).join('')||'<tr><td colspan="5" class="muted">Aucun article.</td></tr>'}
 </tbody></table></div>`);
}
function stockForm(s){
 const n=!s;s=s||{name:'',unit:'kg',qty:0,min:0};
 openModal(`${dlgHead(n?'Ajouter un article':'Modifier l\'article')}<form data-form="stock" data-id="${n?'':s.id}">
 <div class="field"><label for="s-n">Nom</label><input class="input" id="s-n" name="name" required value="${esc(s.name)}"></div>
 <div class="row"><div class="field"><label for="s-q">Quantité</label><input class="input" id="s-q" name="qty" type="number" step="0.1" min="0" required value="${s.qty}"></div>
 <div class="field"><label for="s-u">Unité</label><select class="input" id="s-u" name="unit">${['kg','L','pièces','bouteilles','sacs'].map(u=>`<option ${s.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
 <div class="field"><label for="s-m">Seuil d'alerte</label><input class="input" id="s-m" name="min" type="number" step="0.1" min="0" required value="${s.min}"></div></div>
 <div class="dlg-f">${n?'':`<button type="button" class="btn danger" data-a="stockDelete" data-id="${s.id}" style="margin-right:auto">Supprimer</button>`}<button type="button" class="btn ghost" data-a="modalClose">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,{label:'Article'});
}

/* ====================== crédits clients ====================== */
let creditQ='';
function creditRows(){
 const q=creditQ.trim().toLowerCase(),l=S.clients.filter(c=>!q||(c.name+' '+c.phone).toLowerCase().includes(q)).sort((a,b)=>b.credit-a.credit);
 return l.length?l.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(fmtPhone(c.phone))}</td><td><strong>${money(c.credit)}</strong></td><td class="right"><button class="btn ghost sm" data-a="creditOpen" data-id="${c.id}">Gérer</button></td></tr>`).join(''):'<tr><td colspan="4" class="muted">Aucun client trouvé.</td></tr>';
}
function pageCredits(){
 const tot=S.clients.reduce((a,c)=>a+c.credit,0);
 return adminShell('credits','Crédits clients',`<div class="ahead"><div class="kpi" style="min-width:230px"><span class="muted small">Crédit total en circulation</span><div class="v">${money(tot)}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><input class="input" style="width:240px" type="search" placeholder="Nom ou téléphone" aria-label="Rechercher un client" data-i="creditQ" value="${esc(creditQ)}"><button class="btn" data-a="clientNew">Nouveau client</button></div></div>
 <div class="tablewrap"><table class="tbl"><thead><tr><th>Client</th><th>Téléphone</th><th>Solde</th><th></th></tr></thead><tbody id="creditrows">${creditRows()}</tbody></table></div>`);
}
function creditModal(c){
 openModal(`${dlgHead(c.name,`${esc(fmtPhone(c.phone))}, solde ${money(c.credit)}`)}
 <form class="panel" data-form="credit" data-id="${c.id}"><h3>Nouveau mouvement</h3><div class="row"><div class="field"><label for="k-a">Montant (FCFA)</label><input class="input" id="k-a" name="amount" type="number" min="1" step="50" required></div>
 <div class="field"><label for="k-m">Motif</label><select class="input" id="k-m" name="motif">${MOTIFS.map(m=>`<option>${m}</option>`).join('')}</select></div></div><p class="err" role="alert" id="kErr"></p>
 <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit" name="op" value="add">Ajouter du crédit</button><button class="btn ghost" type="submit" name="op" value="sub">Retirer du crédit</button></div></form>
 <h3 style="margin:18px 0 6px">Historique</h3>${c.history.length?c.history.slice().reverse().map(h=>`<div class="line small"><span>${esc(dshort(h.at))}, ${esc(h.motif)} <span class="muted">(${esc(h.by||'')})</span></span><strong style="color:${h.delta>0?'var(--ok)':'var(--ink)'}">${h.delta>0?'+':''}${money(h.delta)}</strong></div>`).join(''):'<p class="muted">Aucun mouvement.</p>'}
 <div class="dlg-f">${BACKEND&&isAdmin()?`<button class="btn danger" data-a="clientAnon" data-id="${c.id}" style="margin-right:auto">Anonymiser (droit à l'effacement)</button>`:''}<button class="btn" data-a="modalClose">Fermer</button></div>`,{label:'Crédit client'});
}
function clientForm(){
 openModal(`${dlgHead('Nouveau client')}<form data-form="clientNew"><div class="field"><label for="n-n">Nom</label><input class="input" id="n-n" name="name" required></div><div class="field"><label for="n-p">Téléphone</label><input class="input" id="n-p" name="phone" type="tel" placeholder="90 00 00 00" required><span class="hint">Le client activera son compte en s'inscrivant avec ce numéro.</span></div><p class="err" role="alert" id="nErr"></p><div class="dlg-f"><button type="button" class="btn ghost" data-a="modalClose">Annuler</button><button class="btn" type="submit">Créer</button></div></form>`,{label:'Nouveau client'});
}

/* ====================== actualités ====================== */
function pageAdminNews(){
 const l=S.news.slice().sort((a,b)=>(b.pinned-a.pinned)||(b.at-a.at));
 return adminShell('actualites','Actualités',`<div class="ahead"><span class="muted">${l.length} publication${l.length>1?'s':''}</span><button class="btn" data-a="newsNew">Nouvelle actualité</button></div>
 <div class="ords">${l.map(n=>`<article class="panel" style="margin:0"><div class="sechead" style="margin-bottom:6px"><h3>${esc(n.title)}${n.pinned?'<span class="pin">À la une</span>':''}${n.published?'':'<span class="pin" style="background:var(--line);color:var(--muted)">Brouillon</span>'}</h3><span class="muted small">${esc(dshort(n.at))}</span></div><p class="muted">${esc(n.body)}</p><div style="margin-top:10px;display:flex;gap:8px"><button class="btn ghost sm" data-a="newsEdit" data-id="${n.id}">Modifier</button><button class="btn danger sm" data-a="newsDelete" data-id="${n.id}">Supprimer</button></div></article>`).join('')||'<div class="empty">Aucune actualité. Publiez la première.</div>'}</div>`);
}
function newsForm(n){
 const nw=!n;n=n||{title:'',body:'',pinned:false,published:true};
 openModal(`${dlgHead(nw?'Nouvelle actualité':'Modifier l\'actualité')}<form data-form="news" data-id="${nw?'':n.id}"><div class="field"><label for="w-t">Titre</label><input class="input" id="w-t" name="title" required value="${esc(n.title)}"></div>
 <div class="field"><label for="w-b">Message</label><textarea class="input" id="w-b" name="body" required>${esc(n.body)}</textarea></div>
 <label class="check"><input type="checkbox" name="pinned" ${n.pinned?'checked':''}>À la une</label><label class="check"><input type="checkbox" name="published" ${n.published?'checked':''}>Publiée sur le site</label>
 <div class="dlg-f"><button type="button" class="btn ghost" data-a="modalClose">Annuler</button><button class="btn" type="submit">${nw?'Publier':'Enregistrer'}</button></div></form>`,{label:'Actualité'});
}

/* ====================== équipe ====================== */
function pageTeam(){
 return adminShell('equipe','Équipe',`<div class="ahead"><span class="muted">${S.users.length} comptes</span><button class="btn" data-a="userNew">Ajouter un membre</button></div>
 <div class="tablewrap"><table class="tbl"><thead><tr><th>Membre</th><th>Rôle</th><th>Droits</th><th>État</th><th></th></tr></thead><tbody>
 ${S.users.map(u=>`<tr><td><div style="display:flex;gap:10px;align-items:center">${avatar(u,38)}<div><strong>${esc(u.name)}</strong><div class="muted small">${esc(u.login)}</div></div></div></td><td>${ROLES[u.role]}</td>
 <td class="small">${u.role==='employe'?(u.rights.length?u.rights.map(r=>RIGHTS[r]).join(', '):'Aucun'):u.role==='admin'?'Tous les droits':'Gestion complète sauf équipe et paramètres sensibles'}</td>
 <td><span class="st ${u.active?'st-paid':'st-none'}">${u.active?'Actif':'Désactivé'}</span></td><td class="right"><button class="btn ghost sm" data-a="userEdit" data-id="${u.id}">Modifier</button></td></tr>`).join('')}</tbody></table></div>`);
}
function userForm(u){
 const nw=!u;u=u||{name:'',login:'',code:'',role:'employe',rights:['commandes'],photo:'',active:true};tmpPhoto=undefined;
 const locked=u.role==='admin';
 openModal(`${dlgHead(nw?'Ajouter un membre':'Modifier '+u.name)}<form data-form="user" data-id="${nw?'':u.id}">
 <div class="row"><div class="field"><label for="u-n">Nom complet</label><input class="input" id="u-n" name="name" required value="${esc(u.name)}"></div><div class="field"><label for="u-l">Identifiant</label><input class="input" id="u-l" name="login" required value="${esc(u.login)}" autocomplete="off"></div></div>
 <div class="row"><div class="field"><label for="u-c">Code d'accès</label><input class="input" id="u-c" name="code" ${nw||!BACKEND?'required':''} minlength="6" value="${esc(u.code||'')}" ${BACKEND&&!nw?'placeholder="Laisser vide pour ne pas changer"':''} autocomplete="off"></div>
 <div class="field"><label for="u-r">Rôle</label><select class="input" id="u-r" name="role" data-c="roleSel" ${locked?'disabled':''}>${locked?'<option>Administrateur</option>':`<option value="gerant" ${u.role==='gerant'?'selected':''}>Gérant</option><option value="employe" ${u.role==='employe'?'selected':''}>Employé</option>`}</select></div></div>
 <div class="field" id="rightsBox" ${u.role==='employe'?'':'hidden'}><span class="lab">Droits de l'employé</span><div class="checks">${Object.entries(RIGHTS).map(([k,l])=>`<label class="check"><input type="checkbox" name="rights" value="${k}" ${u.rights.includes(k)?'checked':''}>${l}</label>`).join('')}</div></div>
 <div class="field"><span class="lab">Photo</span><div style="display:flex;gap:12px;align-items:center">${avatar(u,56).replace('<span class="av"','<span id="photoPrev" class="av"').replace('<img class="av"','<img id="photoPrev" class="av"')}<input type="file" accept="image/*" data-c="photoUser" aria-label="Choisir une photo"></div></div>
 ${locked?'':`<label class="check"><input type="checkbox" name="active" ${u.active?'checked':''}>Compte actif</label>`}
 <p class="err" role="alert" id="uErr"></p>
 <div class="dlg-f">${nw||locked?'':`<button type="button" class="btn danger" data-a="userDelete" data-id="${u.id}" style="margin-right:auto">Supprimer</button>`}<button type="button" class="btn ghost" data-a="modalClose">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,{label:'Membre',cls:'wide'});
}

/* ====================== paramètres ====================== */
function pageSettings(){
 const s=S.settings,ad=isAdmin(),lg=s.legal||{};
 const idn=ad?`<form class="panel" data-form="identity"><h2>Identité</h2><div class="field"><label for="i-n">Nom de la cantine</label><input class="input" id="i-n" name="name" required value="${esc(s.name)}"><span class="hint">Visible partout sur le site. Seul l'Administrateur peut le changer.</span></div><div class="field"><label for="i-t">Slogan</label><input class="input" id="i-t" name="tagline" value="${esc(s.tagline)}"></div><button class="btn" type="submit">Enregistrer</button></form>`:'';
 const contact=`<form class="panel" data-form="contact"><h2>Coordonnées</h2><div class="field"><label for="k-a">Adresse complète</label><input class="input" id="k-a" name="address" required value="${esc(s.address)}"></div><div class="row"><div class="field"><label for="k-p">Téléphone</label><input class="input" id="k-p" name="phone" required value="${esc(s.phone)}"></div><div class="field"><label for="k-e">E-mail</label><input class="input" id="k-e" name="email" type="email" value="${esc(s.email||'')}"></div></div><button class="btn" type="submit">Enregistrer</button></form>`;
 const hrs=`<form class="panel" data-form="hours"><h2>Horaires et retrait</h2>${[1,2,3,4,5,6,0].map(d=>{const t=s.hours[d];return `<div class="cl"><label class="check" style="min-width:140px"><input type="checkbox" name="o${d}" ${t?'checked':''}>${cap(DAYNAMES[d])}</label><input class="input" style="width:120px" type="time" name="f${d}" value="${t?t[0]:'11:30'}" aria-label="Ouverture ${DAYNAMES[d]}"><span>à</span><input class="input" style="width:120px" type="time" name="t${d}" value="${t?t[1]:'15:30'}" aria-label="Fermeture ${DAYNAMES[d]}"></div>`}).join('')}
 <div class="row" style="margin-top:14px"><div class="field"><label for="h-p">Délai minimal de préparation (min)</label><input class="input" id="h-p" name="prep" type="number" min="5" step="5" value="${s.prepMin}"></div><div class="field"><label for="h-s">Créneaux de retrait toutes les (min)</label><select class="input" id="h-s" name="slot">${[10,15,20,30].map(m=>`<option ${s.slot===m?'selected':''}>${m}</option>`).join('')}</select></div></div>
 <div class="field" style="max-width:340px"><label for="h-c">Commandes maximum par créneau (0 = illimité)</label><input class="input" id="h-c" name="cap" type="number" min="0" max="200" value="${s.slotCap||0}"><span class="hint">Évite de surcharger la cuisine : un créneau complet n'est plus proposé aux clients.</span></div><button class="btn" type="submit">Enregistrer</button></form>`;
 const legal=ad?`<form class="panel" data-form="legal"><h2>Informations légales</h2><p class="muted small" style="margin-bottom:12px">Utilisées dans les mentions légales, la politique de confidentialité et les conditions de vente.</p>
 <div class="row"><div class="field"><label for="g-c">Raison sociale</label><input class="input" id="g-c" name="company" value="${esc(lg.company||'')}"></div><div class="field"><label for="g-f">Forme juridique</label><input class="input" id="g-f" name="form" placeholder="Ex. entreprise individuelle, SARL" value="${esc(lg.form||'')}"></div></div>
 <div class="row"><div class="field"><label for="g-n">NIF</label><input class="input" id="g-n" name="nif" value="${esc(lg.nif||'')}"></div><div class="field"><label for="g-r">RCCM</label><input class="input" id="g-r" name="rccm" value="${esc(lg.rccm||'')}"></div></div>
 <div class="row"><div class="field"><label for="g-d">Responsable de la publication</label><input class="input" id="g-d" name="director" value="${esc(lg.director||'')}"></div><div class="field"><label for="g-h">Hébergeur du site</label><input class="input" id="g-h" name="host" placeholder="Ex. Netlify, Cloudflare" value="${esc(lg.host||'')}"></div></div>
 <div class="row"><div class="field"><label for="g-k">Contact pour les données personnelles</label><input class="input" id="g-k" name="contact" placeholder="E-mail ou téléphone" value="${esc(lg.contact||'')}"></div><div class="field"><label for="g-t">Conservation des commandes (années)</label><input class="input" id="g-t" name="retention" type="number" min="1" max="30" value="${esc(lg.retention||'')}"><span class="hint">À fixer avec votre comptable.</span></div></div>
 <button class="btn" type="submit">Enregistrer</button></form>`:'';
 const look=ad?`<div class="panel"><h2>Apparence</h2><div class="themes">${STYLES.map(t=>`<button class="theme" data-a="style" data-v="${t.id}" aria-pressed="${s.style===t.id}"><span class="sw">${t.sw.map(c=>`<i style="background:${c}"></i>`).join('')}</span><strong>${t.name}</strong><span class="muted small">${t.desc}</span></button>`).join('')}</div></div>`:'';
 const notif=ad?`<div class="panel"><h2>Notifications par e-mail</h2><div class="cl"><div class="nm"><strong>Prévenir les clients par e-mail</strong><small>Commande reçue, prête, annulée</small></div><span class="switch"><input type="checkbox" role="switch" aria-label="Activer les e-mails aux clients" data-c="notifyEmail" ${s.notifyEmail?'checked':''}></span></div><p class="hint" style="margin-top:10px">À activer seulement après avoir configuré l'envoi (guide EMAIL.md). Le champ e-mail apparaît alors à la commande.</p></div>`:'';
 const pay=ad?`<div class="panel"><h2>Moyens de paiement</h2>${s.payments.map(p=>`<div class="cl"><div class="nm"><strong>${esc(p.label)}</strong><small>${p.kind==='momo'?'Mobile money':p.kind==='card'?'Carte bancaire':p.kind==='manual'?'Compte marchand (vérification par l\'équipe)':'Paiement au retrait'}</small></div><span class="switch"><input type="checkbox" role="switch" aria-label="Activer ${esc(p.label)}" data-c="payToggle" data-id="${p.id}" ${p.on?'checked':''}></span></div>${p.kind==='manual'?payDetailsForm(p):''}`).join('')}
 <form data-form="payAdd" style="margin-top:14px"><h3>Ajouter un moyen de paiement mobile</h3><div class="row"><div class="field"><label for="p-l">Nom</label><input class="input" id="p-l" name="label" placeholder="Ex. Wave" required></div><div class="field" style="align-self:end"><button class="btn" type="submit">Ajouter</button></div></div></form>
 <p class="hint">La connexion à l'agrégateur (CinetPay, PayDunya, SEMOA) se configure lors de la mise en production.</p></div>`:'';
 const data=ad&&!BACKEND?`<div class="panel"><h2>Données de démonstration</h2><p class="muted" style="margin-bottom:12px">Remet les commandes, plats, stocks et comptes à leur état initial.</p><button class="btn danger" data-a="resetDemo">Réinitialiser les données</button></div>`:'';
 return adminShell('parametres','Paramètres',`<div class="cols"><div>${idn}${contact}${hrs}</div><div>${look}${pay}${notif}${legal}${data}</div></div>`);
}

/* ====================== profil, FAQ, activité ====================== */
function pageProfile(){
 const u=staff();
 return adminShell('profil','Mon profil',`<div class="cols"><form class="panel" data-form="profile"><h2>Mes informations</h2><div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">${avatar(u,72).replace('<span class="av"','<span id="photoPrev" class="av"').replace('<img class="av"','<img id="photoPrev" class="av"')}<div><input type="file" accept="image/*" data-c="photoUser" aria-label="Changer la photo"><div class="hint">Changer la photo</div></div></div>
 <div class="field"><label for="m-n">Nom complet</label><input class="input" id="m-n" name="name" required value="${esc(u.name)}"></div><div class="field"><label for="m-c">Nouveau code d'accès (laisser vide pour ne pas changer)</label><input class="input" id="m-c" name="code" type="password" minlength="6" autocomplete="new-password"></div>
 <p class="muted small" style="margin-bottom:12px">Rôle : ${ROLES[u.role]}</p><button class="btn" type="submit">Enregistrer</button></form>
 <div class="panel"><h2>Alertes de commandes</h2><p class="muted" style="margin-bottom:10px">Un son retentit à chaque nouvelle commande quand l'application est ouverte. Les notifications préviennent aussi quand elle est en arrière-plan.</p>${('Notification' in window)?(Notification.permission==='granted'?'<p><span class="st st-paid">Notifications activées</span></p>':Notification.permission==='denied'?'<p class="muted">Les notifications sont bloquées : autorisez-les dans les réglages du navigateur.</p>':'<button class="btn ghost" data-a="notifOn">Activer les notifications</button>'):'<p class="muted">Notifications non disponibles sur ce navigateur.</p>'}</div>
 <div class="panel"><h2>FAQ ${u.role==='admin'?'Administrateur':u.role==='gerant'?'Gérant':'Employé'}</h2>${faqHtml(u.role)}</div></div>`);
}
function pageLog(){
 return adminShell('activite','Activité de l\'équipe',`<div class="panel">${S.log.length?S.log.slice(0,120).map(l=>`<div class="logrow"><span class="muted">${esc(dshort(l.at))} à ${hm(l.at)}</span><strong>${esc(l.by)}</strong><span>${esc(l.text)}</span></div>`).join(''):'<div class="empty">Aucune activité enregistrée.</div>'}</div>`);
}
const GUARD={commandes:'commandes',cuisine:'commandes',plats:'menus',stocks:'stocks',credits:'credits',actualites:'actualites'};
function pageAdmin(sub){
 if(!staff())return pageAdminLogin();
 const p=sub||'';
 if(GUARD[p]&&!can(GUARD[p]))return adminShell('','Accès refusé',`<div class="empty">Votre compte n'a pas le droit d'ouvrir cette page. Demandez à l'Administrateur de vous l'accorder.</div>`);
 if((p==='equipe'||p==='activite')&&!isAdmin())return adminShell('','Accès refusé',`<div class="empty">Cette page est réservée à l'Administrateur.</div>`);
 if(p==='parametres'&&!(isAdmin()||staff().role==='gerant'))return adminShell('','Accès refusé',`<div class="empty">Cette page est réservée à l'Administrateur et au Gérant.</div>`);
 return ({'':pageDash,commandes:pageOrders,cuisine:pageKitchen,plats:pageDishes,stocks:pageStocks,credits:pageCredits,actualites:pageAdminNews,equipe:pageTeam,parametres:pageSettings,profil:pageProfile,activite:pageLog}[p]||pageDash)();
}

/* ====================== mode cuisine : tableau plein écran pour la tablette ====================== */
function pageKitchen(){
 const u=staff();
 const act=S.orders.filter(o=>['new','prep','ready'].includes(o.status));
 const byPickup=(a,b)=>(a.pickupDate+a.pickupTime).localeCompare(b.pickupDate+b.pickupTime)||a.at-b.at;
 const col=(st,title,hint)=>{
  const l=act.filter(o=>o.status===st).sort(byPickup);
  return `<section class="kcol k-${st}" aria-label="${title}"><h2>${title} <span class="kc">${l.length}</span></h2><p class="kh">${hint}</p>${l.length?l.map(kCard).join(''):'<div class="kempty">Aucune commande</div>'}</section>`;
 };
 const verif=act.filter(o=>o.payStatus==='à vérifier').length;
 const nNew=act.filter(o=>o.status==='new').length,nPrep=act.filter(o=>o.status==='prep').length,nReady=act.filter(o=>o.status==='ready').length;
 return `<div class="kitchen"><header class="khead"><div><strong>${esc(S.settings.name)}</strong> <span class="muted">· Mode cuisine</span>
  <span class="muted" style="margin-left:12px">${nNew+nPrep+nReady} en cours</span></div>
  <div class="kright">${verif?`<span class="st st-new">${verif} paiement${verif>1?'s':''} à vérifier</span>`:''}
  <span class="kclock" id="kclock">${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
  <a class="btn ghost sm" style="color:#fff;border-color:rgba(255,255,255,.4)" href="#/admin/commandes">Caisse</a>
  <a class="btn ghost sm" style="color:#fff;border-color:rgba(255,255,255,.4)" href="#/admin">Quitter</a></div></header>
 <div class="kgrid">${col('new','Nouvelles','À lancer en cuisine')}${col('prep','En préparation','Presque prêtes')}${col('ready','Prêtes','À remettre au client')}</div></div>`;
}
function kCard(o){
 const nx=NEXT[o.status],ver=o.payStatus==='à vérifier';
 const nowM=new Date().getHours()*60+new Date().getMinutes();
 const pickM=+o.pickupTime.slice(0,2)*60+ +o.pickupTime.slice(3,5);
 const late=o.pickupDate===dkey(Date.now())&&o.status!=='ready'&&pickM<nowM;
 const mins=Math.max(0,Math.round((Date.now()-o.at)/60000));
 const agoTxt=mins<1?'à l\'instant':mins<60?('il y a '+mins+' min'):('il y a '+Math.round(mins/60)+' h');
 const waitTxt=o.pickupDate===dkey(Date.now())?(pickM>=nowM?('dans '+(pickM-nowM)+' min'):('en retard de '+(nowM-pickM)+' min')):esc(dshort(keyDate(o.pickupDate)));
 return `<article class="kc-card ${late?'late':''}"><div class="kc-top"><strong class="kc-num">${esc(o.num)}</strong><span class="kc-time">${hmc(o.pickupTime)}</span></div>
  <div class="kc-ago">${esc(agoTxt)} · retrait ${waitTxt}</div>
  <div class="kc-name">${esc(o.name)}</div>
  <ul class="kc-items">${o.items.map(i=>`<li><b>${i.qty}×</b> ${esc(i.name)}</li>`).join('')}</ul>
  ${o.note?`<div class="kc-note">📝 ${esc(o.note)}</div>`:''}
  ${o.payStatus==='à payer'?`<div class="kc-pay">💵 À encaisser : ${money(o.due)}</div>`:''}
  ${o.payStatus==='payé'&&o.status!=='done'?`<div class="kc-ago" style="color:#5BC27A;font-weight:700">✓ Payé</div>`:''}
  ${ver?`<button class="btn accent kc-btn" data-a="markPaid" data-id="${o.id}">Valider le paiement${o.ref?' · '+esc(o.ref):''}</button>`:(nx?`<button class="btn kc-btn ${o.status==='new'?'accent':''}" data-a="advance" data-id="${o.id}">${nx[1]}</button>`:'')}
 </article>`;
}

/* ====================== export CSV et ticket ====================== */
const csvCell=v=>{const s=String(v==null?'':v).replace(/\r?\n/g,' ');return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function ordersCsv(list){
 const head=['Numéro','Date','Heure de retrait','Client','Téléphone','Articles','Total (FCFA)','Crédit utilisé','Reste à payer','Moyen de paiement','Paiement','Statut','Référence de transaction','Instructions'];
 const rows=list.map(o=>[o.num,new Date(o.at).toLocaleString('fr-FR'),o.pickupDate+' '+o.pickupTime,o.name,o.phone,o.items.map(i=>i.qty+'x '+i.name).join(' + '),o.subtotal,o.credit||0,o.due,o.methodLabel,o.payStatus,STATUS[o.status]||o.status,o.ref||'',o.note||'']);
 return '\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n');
}
function ticketHtml(o){
 const s=S.settings,pay=o.payStatus==='payé'?'PAYÉ':o.payStatus==='à vérifier'?'PAIEMENT À VÉRIFIER (réf. '+esc(o.ref||'')+')':o.payStatus==='à payer'?'À ENCAISSER : '+money(o.due):esc(String(o.payStatus).toUpperCase());
 return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Ticket ${esc(o.num)}</title><style>
 @page{margin:4mm}body{font:14px/1.35 system-ui,Arial,sans-serif;width:72mm;margin:0 auto;color:#000}
 h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}.n{font-size:30px;font-weight:800;text-align:center;margin:6px 0}
 .big{font-size:22px;font-weight:800;text-align:center}hr{border:0;border-top:1px dashed #000;margin:8px 0}
 table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}td.r{text-align:right;white-space:nowrap}.note{border:2px solid #000;padding:4px;margin:6px 0;font-weight:700}
 </style><h1>${esc(s.name)}</h1><div class="c">${esc(s.phone)}</div><hr>
 <div class="n">${esc(o.num)}</div><div class="big">Retrait ${hmc(o.pickupTime)}</div><div class="c">${esc(dlong(keyDate(o.pickupDate)))}</div><hr>
 <div><b>${esc(o.name)}</b><br>${esc(fmtPhone(o.phone))}</div><hr>
 <table>${o.items.map(i=>`<tr><td>${i.qty}× ${esc(i.name)}</td><td class="r">${money(i.price*i.qty)}</td></tr>`).join('')}</table>
 ${o.credit?`<table><tr><td>Crédit utilisé</td><td class="r">−${money(o.credit)}</td></tr></table>`:''}
 <hr><table><tr><td><b>Total</b></td><td class="r"><b>${money(o.subtotal)}</b></td></tr></table>
 ${o.note?`<div class="note">${esc(o.note)}</div>`:''}<div class="c"><b>${pay}</b></div>
 <hr><div class="c">${esc(new Date().toLocaleString('fr-FR'))}</div></html>`;
}
/* ====================== rendu ====================== */
function loadDB(){const r=ls.get(KEY);if(r){try{const o=JSON.parse(r);if(o&&o.v===1)return o}catch(e){}}return null}
let lastPath='';
function render(){
 document.documentElement.dataset.style=S.settings.style;
 document.title=S.settings.name+' – Menu, commande et gestion';
 const r=route(),top=r.p[0]||'';
 if(top==='admin'&&STAFF_URL&&!STAFF_APP){location.replace(STAFF_URL);return}   // l'espace équipe vit sur son propre site
 const pages={'':()=>shell(pageHome()),menu:()=>shell(pageMenu()),actualites:pageNews,mentions:()=>pageLegal('mentions'),confidentialite:()=>pageLegal('confidentialite'),cgv:()=>pageLegal('cgv'),infos:pageInfo,faq:pageFaq,compte:pageAccount,commande:pageCheckout,suivi:()=>pageTrack(r.p[1]),admin:()=>pageAdmin(r.p[1])};
 const html=top==='admin'?pageAdmin(r.p[1]):(pages[top]||pageHome)();
 $('#app').innerHTML=html;
 keepAwake();
 const path=r.p.join('/');if(path!==lastPath){window.scrollTo(0,0);lastPath=path}
}
function notifyNew(n){
 try{
  if(!document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;
  const t=n>1?n+' nouvelles commandes':'Nouvelle commande',o={body:'Ouvrez l\'application pour la préparer.',icon:'icon-192.png',tag:'cq-new',renotify:true};
  if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification(t,o)).catch(()=>{try{new Notification(t,o)}catch(e){}});else new Notification(t,o);
 }catch(e){}
}
const isTyping=()=>{const a=document.activeElement;return !!a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)};
function need(ok){if(!ok)toast(ls.get('cantine-staff')&&!staff()?'Votre compte est en cours de chargement : réessayez dans un instant.':'Votre compte n\'a pas ce droit.','bad');return ok}

/* ====================== panier : actions ====================== */
function captureDraft(){
 const f=$('#checkout');if(!f)return;const fd=new FormData(f),cb=$('#useCredit');
 ui.draft={name:fd.get('name'),phone:fd.get('phone'),day:fd.get('day'),time:fd.get('time'),note:fd.get('note'),method:fd.get('method'),momo:fd.get('momo'),email:fd.get('email'),cgv:!!fd.get('cgv'),useCredit:cb?cb.checked:undefined};
}
function cartChange(){saveCart();if(route().p[0]==='commande')captureDraft();render();refreshDrawer()}
function addToCart(id){const i=cart.items.find(x=>x.id===id);if(i)i.qty++;else cart.items.push({id,qty:1})}

/* ====================== actions (clic) ====================== */
const ACT={
 noop(){},
 exportCsv(){
  const l=ordersFiltered();if(!l.length){toast('Aucune commande à exporter.','bad');return}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ordersCsv(l)],{type:'text/csv;charset=utf-8'}));a.download='commandes-'+dkey(Date.now())+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);toast(l.length+' commande'+(l.length>1?'s':'')+' exportée'+(l.length>1?'s':''),'ok');
 },
 printTicket(el){
  const o=S.orders.find(x=>x.id===el.dataset.id);if(!o)return;
  const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  f.contentDocument.open();f.contentDocument.write(ticketHtml(o));f.contentDocument.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Impression impossible sur cet appareil.','bad')}setTimeout(()=>f.remove(),2000)},300);
 },
 async notifOn(){
  if(!('Notification' in window)){toast('Les notifications ne sont pas disponibles sur ce navigateur.','bad');return}
  try{const r=await Notification.requestPermission();toast(r==='granted'?'Alertes activées sur cet appareil':'Alertes refusées : autorisez-les dans les réglages du navigateur',r==='granted'?'ok':'bad')}catch(e){}
  render();
 },
 async install(){
  if(deferredInstall){const ev=deferredInstall;deferredInstall=null;try{ev.prompt();await ev.userChoice}catch(e){}render();return}
  const ios=isIOS();
  openModal(`${dlgHead('Installer l\'application')}<p>${ios?'Touchez le bouton <strong>Partager</strong> (le carré avec une flèche) en bas de Safari, puis <strong>« Sur l\'écran d\'accueil »</strong>.':'Ouvrez le menu de votre navigateur (les trois points), puis choisissez <strong>« Installer l\'application »</strong> ou <strong>« Ajouter à l\'écran d\'accueil »</strong>.'}</p><p class="muted small" style="margin-top:10px">L\'icône de la cantine apparaîtra avec vos autres applications.</p><div class="dlg-f"><button class="btn" data-a="modalClose">Compris</button></div>`,{label:'Installer l\'application'});
 },
 installOff(){ls.set('cantine-install-off',String(Date.now()));render()},
 modalClose(){closeModal()},
 confirmOk(){const cb=confirmCb;confirmCb=null;closeModal();if(cb)cb()},
 add(el){addToCart(el.dataset.id);cartChange();if(typeof soundAdd==='function')soundAdd();el.classList.add('just-added');setTimeout(()=>el.classList.remove('just-added'),450);toast('Ajouté au panier ✓','ok');if(el.dataset.close)closeModal()},
 inc(el){addToCart(el.dataset.id);cartChange()},
 dec(el){const i=cart.items.find(x=>x.id===el.dataset.id);if(!i)return;i.qty--;if(i.qty<=0)cart.items=cart.items.filter(x=>x!==i);cartChange()},
 cartOpen(){drawerIsOpen=true;$('#drawer').innerHTML=drawerHtml();const b=$('#drawer .x');if(b)b.focus()},
 cartClose(){drawerIsOpen=false;$('#drawer').innerHTML=''},
 dish(el){const d=dish(el.dataset.id);if(d)dishModal(d)},
 cat(el){ui.cat=el.dataset.v;render()},
 vegToggle(){ui.veg=!ui.veg;render()},
 acctTab(el){ui.acct=el.dataset.v;render()},
 clogout(){ls.del('cantine-client');render()},
 cancelMine(el){const o=S.orders.find(x=>x.id===el.dataset.id);if(!o)return;askConfirm('Annuler la commande '+o.num+' ?','Annuler la commande',()=>{if(o.status==='new'){cancelOrder(o,'Client');save();render();toast('Commande annulée','ok')}else toast('La préparation a déjà commencé. Appelez la cantine.','bad')},true)},
 /* administration */
 slogout(){ls.del('cantine-staff');location.hash='#/admin';render()},
 fillLogin(el){const l=$('#s-l'),c=$('#s-c');if(l)l.value=el.dataset.l;if(c)c.value=el.dataset.c},
 range(el){dashRange=el.dataset.v;render()},
 ofilter(el){oUi.f=el.dataset.v;render()},
 orderOpen(el){const o=S.orders.find(x=>x.id===el.dataset.id);if(o)orderModal(o)},
 advance(el){const o=S.orders.find(x=>x.id===el.dataset.id);if(!o||!need(can('commandes')))return;const next=NEXT[o.status][0];setStatus(o,next);if(next==='ready'&&typeof soundOk==='function')soundOk();if(next==='prep'&&typeof beep==='function')beep();render()},
 setStatus(el){const o=S.orders.find(x=>x.id===el.dataset.id);if(!o||!need(can('commandes')))return;setStatus(o,el.dataset.v);render();orderModal(o)},
 markPaid(el){const o=S.orders.find(x=>x.id===el.dataset.id);if(!o||!need(can('commandes')))return;o.payStatus='payé';logAct('Commande '+o.num+' : marquée payée');save();render();orderModal(o)},
 refundCredit(el){
  const o=S.orders.find(x=>x.id===el.dataset.id);if(!o||!need(can('credits')))return;
  let c=S.clients.find(x=>x.phone===o.phone);if(!c){c={id:'c'+uid(),name:o.name,phone:o.phone,pass:'',credit:0,history:[]};S.clients.push(c)}
  addCredit(c,o.due+o.credit,'Remboursement '+o.num);o.payStatus='remboursé';logAct('Commande '+o.num+' : remboursée en crédit');save();render();orderModal(o);
 },
 dtab(el){dishTab=el.dataset.v;render()},
 dishNew(){if(need(can('menus')))dishForm(null)},
 dishEdit(el){if(need(can('menus')))dishForm(dish(el.dataset.id))},
 dishDelete(el){const d=dish(el.dataset.id);if(!d)return;askConfirm('Supprimer « '+d.name+' » définitivement ? Vous pouvez aussi le désactiver.','Supprimer',()=>{S.dishes=S.dishes.filter(x=>x!==d);S.menuDuJour.items=S.menuDuJour.items.filter(i=>i!==d.id);cart.items=cart.items.filter(i=>i.id!==d.id);saveCart();logAct('A supprimé le plat « '+d.name+' »');save();render();toast('Plat supprimé','ok')},true)},
 photoClear(){tmpPhoto='';const p=$('#photoPrev');if(p){const f=$('#modal form');const d={id:f&&f.dataset.id||'x',name:$('#d-n')?$('#d-n').value:'',cat:$('#d-c')?$('#d-c').value:'Plats',photo:''};p.innerHTML=art(d)}},
 stockFilter(el){stockLow=el.dataset.v==='low';render()},
 stockNew(){if(need(can('stocks')))stockForm(null)},
 stockEdit(el){if(need(can('stocks')))stockForm(S.stock.find(s=>s.id===el.dataset.id))},
 stk(el){if(!need(can('stocks')))return;const s=S.stock.find(x=>x.id===el.dataset.id);if(!s)return;s.qty=Math.max(0,Math.round((s.qty+ +el.dataset.v)*10)/10);logAct(`Stock ${s.name} : ${s.qty} ${s.unit}`);save();render()},
 stockDelete(el){const s=S.stock.find(x=>x.id===el.dataset.id);if(!s)return;askConfirm('Supprimer « '+s.name+' » des stocks ?','Supprimer',()=>{S.stock=S.stock.filter(x=>x!==s);logAct('A supprimé l\'article de stock « '+s.name+' »');save();render()},true)},
 creditOpen(el){if(need(can('credits')))creditModal(S.clients.find(c=>c.id===el.dataset.id))},
 clientNew(){if(need(can('credits')))clientForm()},
 newsNew(){if(need(can('actualites')))newsForm(null)},
 newsEdit(el){if(need(can('actualites')))newsForm(S.news.find(n=>n.id===el.dataset.id))},
 newsDelete(el){const n=S.news.find(x=>x.id===el.dataset.id);if(!n)return;askConfirm('Supprimer l\'actualité « '+n.title+' » ?','Supprimer',()=>{S.news=S.news.filter(x=>x!==n);logAct('A supprimé l\'actualité « '+n.title+' »');save();render()},true)},
 userNew(){if(need(isAdmin()))userForm(null)},
 userEdit(el){if(need(isAdmin()))userForm(S.users.find(u=>u.id===el.dataset.id))},
 userDelete(el){const u=S.users.find(x=>x.id===el.dataset.id);if(!u||u.id===staff().id||u.role==='admin')return;askConfirm('Supprimer le compte de '+u.name+' ?','Supprimer',()=>{S.users=S.users.filter(x=>x!==u);logAct('A supprimé le compte de '+u.name);save();render()},true)},
 style(el){if(!need(isAdmin()))return;S.settings.style=el.dataset.v;logAct('A changé le style du site : '+STYLES.find(s=>s.id===el.dataset.v).name);save();render()},
 resetDemo(){if(!need(isAdmin()))return;askConfirm('Remettre toutes les données de démonstration à zéro ?','Réinitialiser',()=>{S=seed();save();toast('Données réinitialisées','ok');render()},true)}
};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-a]');if(!el)return;
 const a=el.dataset.a;
 if((a==='modalClose'||a==='cartClose'||a==='noop')&&el.classList.contains('overlay')&&e.target!==el)return;
 const fn=ACT[a];if(fn)fn(el,e);
});

/* ====================== saisies et changements ====================== */
const INP={
 menuQ(el){ui.q=el.value;$('#menulist').innerHTML=menuList()},
 orderQ(el){oUi.q=el.value;$('#orderlist').innerHTML=ordersList()},
 creditQ(el){creditQ=el.value;$('#creditrows').innerHTML=creditRows()}
};
document.addEventListener('input',e=>{const el=e.target.closest('[data-i]');if(el&&INP[el.dataset.i])INP[el.dataset.i](el)});
const CHG={
 method(el){const pm=payById(el.value)||{},k=pm.kind;$$('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==k);if(k==='manual'){const pn=$('[data-pane="manual"]');if(pn)pn.innerHTML=manualPaneHtml(pm)}renderSummary()},
 sum(){renderSummary()},
 pickupDay(el){captureDraft();ui.draft.day=el.value;ui.draft.time=undefined;render()},
 orange(el){oUi.range=el.value;render()},
 dishActive(el){if(!need(can('menus'))){el.checked=!el.checked;return}const d=dish(el.dataset.id);d.active=el.checked;logAct((d.active?'A activé':'A désactivé')+' le plat « '+d.name+' »');save();render()},
 notifyEmail(el){if(!need(isAdmin())){el.checked=!el.checked;return}S.settings.notifyEmail=el.checked;logAct((el.checked?'A activé':'A désactivé')+' les e-mails aux clients');save();render()},
 payToggle(el){if(!need(isAdmin())){el.checked=!el.checked;return}const p=payById(el.dataset.id);p.on=el.checked;logAct((p.on?'A activé':'A désactivé')+' le paiement '+p.label);save();render()},
 async photo(el){const f=el.files[0];if(!f)return;try{tmpPhoto=await readImage(f);const p=$('#photoPrev');if(p)p.innerHTML=`<img src="${tmpPhoto}" alt="Aperçu">`}catch(e){toast('Image illisible, essayez un autre fichier.','bad')}},
 async photoUser(el){const f=el.files[0];if(!f)return;try{tmpPhoto=await readImage(f,256);const p=$('#photoPrev');if(p){const w=p.style.width||'56px';p.outerHTML=`<img id="photoPrev" class="av" style="width:${w};height:${w}" src="${tmpPhoto}" alt="Aperçu">`}}catch(e){toast('Image illisible, essayez un autre fichier.','bad')}},
 roleSel(el){const b=$('#rightsBox');if(b)b.hidden=el.value!=='employe'}
};
document.addEventListener('change',e=>{const el=e.target.closest('[data-c]');if(el&&CHG[el.dataset.c])CHG[el.dataset.c](el,e)});

/* ====================== formulaires ====================== */
function setErr(id,m){const e=$('#'+id);if(e)e.textContent=m;return false}
function linkOrders(c){S.orders.forEach(o=>{if(!o.clientId&&o.phone===c.phone)o.clientId=c.id})}
const FORMS={
 async checkout(f){
  const fd=new FormData(f),fail=m=>{setErr('coErr',m);const e=$('#coErr');if(e)e.scrollIntoView({block:'center'});return false};
  const lines=cartLines();if(!lines.length)return fail('Votre panier est vide.');
  const name=String(fd.get('name')||'').trim(),phone=normPhone(fd.get('phone'));
  if(!name)return fail('Indiquez votre nom.');
  if(phone.length!==8)return fail('Le téléphone doit comporter 8 chiffres.');
  const email=String(fd.get('email')||'').trim().toLowerCase();
  if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return fail('Adresse e-mail invalide.');
  const op=pickupOptions().find(x=>x.key===fd.get('day')),time=fd.get('time');
  if(!op||!op.slots.includes(time))return fail('Choisissez un créneau de retrait valide.');
  if(slotFull(op.key,time))return fail('Ce créneau est complet : choisissez une autre heure.');
  const pm=payById(fd.get('method'));if(!pm||!pm.on)return fail('Choisissez un moyen de paiement.');
  if(!fd.get('cgv'))return fail('Cochez l\'acceptation des conditions de vente et de la politique de confidentialité.');
  const total=cartTotal(),cl=client(),credit=cl&&fd.get('useCredit')?Math.min(cl.credit,total):0,due=total-credit;
  if(due>0&&pm.kind==='momo'&&normPhone(fd.get('momo')).length!==8)return fail('Numéro de paiement invalide : 8 chiffres attendus.');
  if(due>0&&pm.kind==='card'){
   const n=String(fd.get('card')||'').replace(/\D/g,'');
   if(n.length<13||n.length>19)return fail('Numéro de carte invalide.');
   if(!/^\d{2}\s*\/\s*\d{2}$/.test(String(fd.get('exp')||'').trim()))return fail('Date d\'expiration attendue au format MM/AA.');
   if(!/^\d{3,4}$/.test(String(fd.get('cvc')||'').trim()))return fail('Code de sécurité invalide.');
  }
  setErr('coErr','');
  if(due>0&&pm.kind!=='cash'){
   const msg=pm.kind==='momo'?`Une demande de paiement de ${money(due)} a été envoyée au ${esc(fmtPhone(normPhone(fd.get('momo'))))}. Validez avec votre code secret.`:`Vérification de votre carte pour ${money(due)}.`;
   openModal(`<div class="center" style="padding:10px"><div class="spin"></div><h2 style="margin-bottom:8px">Paiement en cours</h2><p class="muted">${msg}</p><p class="hint" style="margin-top:12px">Simulation : aucune somme n'est prélevée.</p></div>`,{lock:true,nofocus:true,label:'Paiement en cours'});
   await sleep(2200);closeModal();
  }
  const c2=client(),num='A-'+(++S.seq),now=Date.now();
  const items=lines.map(l=>({id:l.id,name:l.id==='formule'?'Formule du jour ('+l.sub+')':l.name,price:l.price,qty:l.qty}));
  const o={id:uid(),num,at:now,name,phone,email:S.settings.notifyEmail?email:'',pickupDate:op.key,pickupTime:time,items,subtotal:total,credit,due,method:due===0?'credit':pm.id,methodLabel:due===0?'Crédit client':pm.label,
   payStatus:due===0?'payé':pm.kind==='cash'?'à payer':'payé',status:'new',clientId:c2?c2.id:null,note:String(fd.get('note')||'').trim(),history:[{s:'new',at:now,by:'Client'}]};
  if(credit>0&&c2)addCredit(c2,-credit,'Commande '+num,'Client');
  S.orders.push(o);save();cart.items=[];saveCart();ui.draft={};remember(num);
  location.hash='#/suivi/'+num;render();if(typeof soundOk==='function')soundOk();if(typeof confetti==='function')confetti();toast('Commande envoyée. Merci !','ok');
 },
 lookup(f){
  const fd=new FormData(f),num=String(fd.get('num')||'').trim().toUpperCase(),ph=normPhone(fd.get('phone'));
  const o=S.orders.find(x=>x.num===num&&x.phone===ph);
  if(!o)return setErr('lkErr','Aucune commande ne correspond à ce numéro et ce téléphone.');
  remember(num);location.hash='#/suivi/'+num;render();
 },
 clogin(f){
  const fd=new FormData(f),ph=normPhone(fd.get('phone')),c=S.clients.find(x=>x.phone===ph&&x.pass&&x.pass===fd.get('pass'));
  if(!c)return setErr('acErr','Téléphone ou mot de passe incorrect.');
  ls.set('cantine-client',c.id);render();
 },
 register(f){
  const fd=new FormData(f),name=String(fd.get('name')||'').trim(),ph=normPhone(fd.get('phone')),pass=String(fd.get('pass')||'');
  if(!name)return setErr('acErr','Indiquez votre nom.');
  if(ph.length!==8)return setErr('acErr','Le téléphone doit comporter 8 chiffres.');
  if(pass.length<6)return setErr('acErr','Le mot de passe doit contenir au moins 6 caractères.');
  let c=S.clients.find(x=>x.phone===ph);
  if(c&&c.pass)return setErr('acErr','Un compte existe déjà avec ce numéro. Connectez-vous.');
  if(c){c.pass=pass}else{c={id:'c'+uid(),name,phone:ph,pass,credit:0,history:[]};S.clients.push(c)}
  linkOrders(c);save();ls.set('cantine-client',c.id);ui.acct='login';render();toast('Compte créé','ok');
 },
 slogin(f){
  const fd=new FormData(f),u=S.users.find(x=>x.active&&x.login===String(fd.get('login')).trim()&&x.code===fd.get('code'));
  if(!u)return setErr('slErr','Identifiant ou code incorrect, ou compte désactivé.');
  ls.set('cantine-staff',u.id);logAct('Connexion');save();location.hash='#/admin';render();
 },
 dish(f){
  if(!need(can('menus')))return;
  const fd=new FormData(f),id=f.dataset.id,name=String(fd.get('name')||'').trim(),price=Math.round(+fd.get('price'));
  if(!name||!(price>=0))return setErr('fErr','Indiquez un nom et un prix valides.');
  let d=id?dish(id):null;const nw=!d;if(nw){d={id:'d'+uid(),photo:''};S.dishes.push(d)}
  Object.assign(d,{name,price,cat:fd.get('cat'),badge:fd.get('badge'),desc:String(fd.get('desc')||'').trim(),allergens:fd.getAll('al'),veg:!!fd.get('veg'),active:!!fd.get('active')});
  if(tmpPhoto!==undefined)d.photo=tmpPhoto;
  logAct((nw?'A ajouté':'A modifié')+' le plat « '+name+' »');save();closeModal();render();toast('Plat enregistré','ok');
 },
 menuDuJour(f){
  if(!need(can('menus')))return;const fd=new FormData(f);
  S.menuDuJour={items:fd.getAll('items'),formulePrice:Math.max(0,Math.round(+fd.get('formule')||0))};
  logAct('A défini le menu du jour');save();render();toast('Menu du jour enregistré','ok');
 },
 stock(f){
  if(!need(can('stocks')))return;const fd=new FormData(f),id=f.dataset.id,name=String(fd.get('name')||'').trim();
  if(!name)return;let s=id?S.stock.find(x=>x.id===id):null;if(!s){s={id:uid()};S.stock.push(s)}
  Object.assign(s,{name,unit:fd.get('unit'),qty:+fd.get('qty')||0,min:+fd.get('min')||0});
  logAct('Stock mis à jour : '+name);save();closeModal();render();
 },
 credit(f,e){
  if(!need(can('credits')))return;const fd=new FormData(f),c=S.clients.find(x=>x.id===f.dataset.id),amt=Math.round(+fd.get('amount')),op=e.submitter?e.submitter.value:'add';
  if(!c||!(amt>0))return setErr('kErr','Indiquez un montant supérieur à 0.');
  if(op==='sub'&&amt>c.credit)return setErr('kErr','Le solde est insuffisant (' +money(c.credit)+').');
  addCredit(c,op==='sub'?-amt:amt,fd.get('motif'));logAct(`Crédit de ${c.name} : ${op==='sub'?'-':'+'}${money(amt)} (${fd.get('motif')})`);save();render();creditModal(c);toast('Crédit mis à jour','ok');
 },
 clientNew(f){
  if(!need(can('credits')))return;const fd=new FormData(f),name=String(fd.get('name')||'').trim(),ph=normPhone(fd.get('phone'));
  if(!name||ph.length!==8)return setErr('nErr','Indiquez un nom et un téléphone à 8 chiffres.');
  if(S.clients.some(c=>c.phone===ph))return setErr('nErr','Ce numéro a déjà un compte.');
  const c={id:'c'+uid(),name,phone:ph,pass:'',credit:0,history:[]};S.clients.push(c);linkOrders(c);logAct('A créé le compte client de '+name);save();closeModal();render();creditModal(c);
 },
 news(f){
  if(!need(can('actualites')))return;const fd=new FormData(f),id=f.dataset.id;
  let n=id?S.news.find(x=>x.id===id):null;if(!n){n={id:uid(),at:Date.now()};S.news.push(n)}
  Object.assign(n,{title:String(fd.get('title')).trim(),body:String(fd.get('body')).trim(),pinned:!!fd.get('pinned'),published:!!fd.get('published')});
  logAct('A publié l\'actualité « '+n.title+' »');save();closeModal();render();
 },
 user(f){
  if(!need(isAdmin()))return;const fd=new FormData(f),id=f.dataset.id,name=String(fd.get('name')||'').trim(),login=String(fd.get('login')||'').trim(),code=String(fd.get('code')||'');
  if(!name||!login)return setErr('uErr','Indiquez un nom et un identifiant.');
  if(code.length<6)return setErr('uErr','Le code d\'accès doit contenir au moins 6 caractères.');
  if(S.users.some(u=>u.login===login&&u.id!==id))return setErr('uErr','Cet identifiant est déjà utilisé.');
  let u=id?S.users.find(x=>x.id===id):null;const nw=!u;if(nw){u={id:'u'+uid(),photo:''};S.users.push(u)}
  const role=u.role==='admin'?'admin':fd.get('role');
  Object.assign(u,{name,login,code,role,rights:role==='employe'?fd.getAll('rights'):[],active:role==='admin'?true:!!fd.get('active')});
  if(tmpPhoto!==undefined)u.photo=tmpPhoto;
  logAct((nw?'A créé':'A modifié')+' le compte de '+name);save();closeModal();render();toast('Compte enregistré','ok');
 },
 legal(f){if(!need(isAdmin()))return;const fd=new FormData(f),g=k=>String(fd.get(k)||'').trim(),r=g('retention');S.settings.legal={company:g('company'),form:g('form'),nif:g('nif'),rccm:g('rccm'),director:g('director'),host:g('host'),contact:g('contact'),retention:r?Math.max(1,Math.round(+r)):''};logAct('A modifié les informations légales');save();render();toast('Informations légales enregistrées','ok')},
 identity(f){if(!need(isAdmin()))return;const fd=new FormData(f);S.settings.name=String(fd.get('name')).trim()||S.settings.name;S.settings.tagline=String(fd.get('tagline')||'').trim();logAct('A modifié l\'identité de la cantine');save();render();toast('Identité enregistrée','ok')},
 contact(f){if(!need(isAdmin()||staff().role==='gerant'))return;const fd=new FormData(f);Object.assign(S.settings,{address:String(fd.get('address')).trim(),phone:String(fd.get('phone')).trim(),email:String(fd.get('email')||'').trim()});logAct('A modifié les coordonnées');save();render();toast('Coordonnées enregistrées','ok')},
 hours(f){
  if(!need(isAdmin()||staff().role==='gerant'))return;const fd=new FormData(f),h={};
  for(let d=0;d<7;d++){if(fd.get('o'+d)){const a=fd.get('f'+d),b=fd.get('t'+d);if(!a||!b||toMin(a)>=toMin(b)){toast('Vérifiez les horaires de '+DAYNAMES[d]+' : l\'ouverture doit précéder la fermeture.','bad');return}h[d]=[a,b]}else h[d]=null}
  S.settings.hours=h;S.settings.prepMin=Math.max(5,+fd.get('prep')||20);S.settings.slot=+fd.get('slot')||15;S.settings.slotCap=Math.max(0,Math.min(200,Math.round(+fd.get('cap')||0)));logAct('A modifié les horaires');save();render();toast('Horaires enregistrés','ok');
 },
 payAdd(f){if(!need(isAdmin()))return;const l=String(new FormData(f).get('label')||'').trim();if(!l)return;S.settings.payments.push({id:'p'+uid(),label:l,kind:'momo',on:true,hint:'Paiement mobile'});logAct('A ajouté le moyen de paiement '+l);save();render()},
 profile(f){
  const u=staff(),fd=new FormData(f),name=String(fd.get('name')||'').trim(),code=String(fd.get('code')||'');
  if(!name)return;if(code&&code.length<6){toast('Le code doit contenir au moins 6 caractères.','bad');return}
  u.name=name;if(code)u.code=code;if(tmpPhoto!==undefined){u.photo=tmpPhoto;tmpPhoto=undefined}
  logAct('A mis à jour son profil');save();render();toast('Profil enregistré','ok');
 }
};
document.addEventListener('submit',e=>{
 const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();
 const fn=FORMS[f.dataset.form];if(fn)fn(f,e);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(modalOpen()&&!$('#modal .overlay[data-a=noop]'))closeModal();else if(drawerIsOpen)ACT.cartClose()}});

/* ====================== synchronisation et démarrage ====================== */
let audioCtx=null;
function unlockAudio(){try{const A=window.AudioContext||window.webkitAudioContext;if(!audioCtx&&A)audioCtx=new A();if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
document.addEventListener('click',unlockAudio);document.addEventListener('touchstart',unlockAudio,{passive:true});
function tone(freq,start,dur,type,vol){
 try{unlockAudio();const c=audioCtx;if(!c||c.state!=='running')return;
  const o=c.createOscillator(),g=c.createGain();o.type=type||'sine';o.frequency.value=freq;
  g.gain.setValueAtTime(0,c.currentTime+start);g.gain.linearRampToValueAtTime(vol||.09,c.currentTime+start+.02);
  g.gain.exponentialRampToValueAtTime(.001,c.currentTime+start+dur);o.connect(g);g.connect(c.destination);
  o.start(c.currentTime+start);o.stop(c.currentTime+start+dur+.02)}catch(e){}
}
function beep(){tone(880,0,.22,'sine',.1);tone(1174,0.12,.18,'sine',.07)}
function soundOk(){tone(523,0,.12,'sine',.08);tone(659,.1,.12,'sine',.09);tone(784,.2,.28,'triangle',.1)}
function soundAdd(){tone(660,0,.08,'sine',.06);tone(880,.06,.1,'sine',.05)}
function confetti(opts={}){
 const n=opts.n||80,colors=opts.colors||['#F28C1B','#3A7650','#E9A92B','#C2255C','#1C7ED6','#fff','#F4E9C8'];
 const c=document.createElement('canvas');c.setAttribute('aria-hidden','true');
 Object.assign(c.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'400'});
 document.body.appendChild(c);const ctx=c.getContext('2d');
 const dpr=Math.min(window.devicePixelRatio||1,2);let W,H;
 const resize=()=>{W=window.innerWidth;H=window.innerHeight;c.width=W*dpr;c.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)};
 resize();
 const parts=Array.from({length:n},()=>({
  x:W*.3+Math.random()*W*.4,y:H*.15+Math.random()*H*.15,
  vx:(Math.random()-.5)*9,vy:-(6+Math.random()*10),g:.22+Math.random()*.18,
  w:6+Math.random()*8,h:8+Math.random()*10,rot:Math.random()*Math.PI,rv:(Math.random()-.5)*.25,
  color:colors[Math.floor(Math.random()*colors.length)],life:1,shape:Math.random()>.4?'rect':'circle'
 }));
 let start=performance.now();
 function frame(t){
  const dt=Math.min(32,(t-start))/16;start=t;ctx.clearRect(0,0,W,H);let alive=false;
  for(const p of parts){
   if(p.life<=0)continue;alive=true;p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.rv*dt;p.life-=.008*dt;p.vx*=.995;
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;
   if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.w*.5,0,Math.PI*2);ctx.fill()}
   else{ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h)}
   ctx.restore();
  }
  if(alive)requestAnimationFrame(frame);else c.remove();
 }
 requestAnimationFrame(frame);
 setTimeout(()=>{try{c.remove()}catch(e){}},4500);
}
/* écran de cuisine : empêche la mise en veille tant que l'espace équipe est ouvert */
let wakeLock=null;
async function keepAwake(){try{if(staff()&&'wakeLock' in navigator&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepAwake()});
window.addEventListener('storage',e=>{
 if(e.key===KEY&&e.newValue){
  const before=S.orders.length;let n;try{n=JSON.parse(e.newValue)}catch(x){return}
  S=n;const added=S.orders.length-before;
  if(added>0&&staff()){toast(added>1?added+' nouvelles commandes':'Nouvelle commande reçue','ok');beep();notifyNew(added)}
  if(!modalOpen()&&!isTyping())render();
 }
 if(e.key==='cantine-cart'){try{const c=JSON.parse(e.newValue||'{"items":[]}');if(c&&Array.isArray(c.items))cart=c;refreshDrawer()}catch(x){}}
});
window.addEventListener('hashchange',()=>{if(modalOpen()&&!$('#modal .overlay[data-a=noop]'))closeModal();if(drawerIsOpen)ACT.cartClose();render()});
setInterval(()=>{if(!modalOpen()&&!isTyping()&&!drawerIsOpen&&(route().p[0]||'')==='')render()},60000);
/* application installable : service worker et invitation d'installation (site publié uniquement) */
try{
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(S&&!modalOpen()&&!isTyping())render()});
 addEventListener('appinstalled',()=>{deferredInstall=null;toast('Application installée','ok');if(S)render()});
 if(PROD&&'serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))addEventListener('load',()=>navigator.serviceWorker.register(window.CANTINE_SW||'sw.js').catch(()=>{}));
}catch(e){}
if(STAFF_APP&&!location.hash)location.hash='#/admin';
try{const n=new URLSearchParams(location.search).get('suivi');if(n&&/^A-\d+$/.test(n)){history.replaceState(null,'',location.pathname);location.hash='#/suivi/'+n}}catch(e){}   // retour de la page de paiement
if(PROD&&!BACKEND){$('#app').innerHTML='<div style="padding:40px;max-width:560px;margin:auto;font-family:sans-serif"><h1>Configuration manquante</h1><p>Le fichier config.js est absent ou illisible. Vérifiez qu\'il se trouve dans le même dossier que index.html.</p></div>'}
else if(!BACKEND){S=loadDB()||seed();save();render()}   // en mode backend, backend.js démarre l'application

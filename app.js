
let utilisateur = JSON.parse(localStorage.getItem('evat_profil')) || null;
let iaDejaPresentee = localStorage.getItem('elaws_presentee') === 'true';
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {});
    });
}

let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {}
}
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});
requestWakeLock();

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('installBanner');
    if(banner) banner.style.display = 'flex';
});

function declencherInstallationApp() {
    const banner = document.getElementById('installBanner');
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                if(banner) banner.style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else {
        alert("Pour installer l'application, utilisez le menu de votre navigateur (Chrome / Safari) et sélectionnez 'Ajouter à l'écran d'accueil'.");
    }
}

function fermerBanniereInstall() {
    const banner = document.getElementById('installBanner');
    if(banner) banner.style.display = 'none';
}

function mettreAJourIndicatif() {
    const select = document.getElementById('selectPays');
    const telInput = document.getElementById('inputTelProfil');
    if(!select || !telInput) return;
    const prefix = select.value;
    let currentVal = telInput.value.trim();
    ['+228', '+233', '+225', '+33', '+1'].forEach(p => {
        if(currentVal.startsWith(p)) {
            currentVal = currentVal.substring(p.length);
        }
    });
    telInput.value = prefix + currentVal;
}

const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000
});

socket.on('connect', () => {
    const statusEl = document.getElementById('serverConnectionStatus');
    if(statusEl) {
        statusEl.innerHTML = "🟢 Connecté";
        statusEl.style.color = "var(--success)";
    }
    if(utilisateur) {
        socket.emit('register_user', { nom: utilisateur.nom, telephone: utilisateur.telephone, metier: utilisateur.metier });
    }
});

socket.on('disconnect', () => {
    const statusEl = document.getElementById('serverConnectionStatus');
    if(statusEl) {
        statusEl.innerHTML = "🔴 Déconnecté";
        statusEl.style.color = "var(--danger)";
    }
});

socket.on('contact_registered', (data) => {
    if(utilisateur && utilisateur.contacts) {
        const match = utilisateur.contacts.find(c => c.telephone === data.telephone);
        if(match) {
            match.metier = data.metier;
            localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
            afficherContacts();
            montrerNotification(`🚨 Votre contact ${match.nom} (${data.telephone}) vient de s'inscrire ! Métier : ${data.metier}`);
        }
    }
});

function montrerNotification(texte) {
    const banner = document.getElementById('notificationBanner');
    const textEl = document.getElementById('notificationText');
    if(banner && textEl) {
        textEl.innerText = texte;
        banner.style.display = 'block';
        setTimeout(() => { fermerNotification(); }, 10000);
    }
}

function fermerNotification() {
    const banner = document.getElementById('notificationBanner');
    if(banner) banner.style.display = 'none';
}

function sauvegarderProfilBase() {
    const nom = document.getElementById('inputNom').value.trim();
    const tel = document.getElementById('inputTelProfil').value.trim();
    const metier = document.getElementById('inputMetier').value.trim();
    
    if(!nom || !tel) {
        alert("Veuillez remplir votre nom et votre numéro.");
        return;
    }

    utilisateur = {
        nom: nom,
        telephone: tel,
        metier: metier || "Opérateur",
        qubits: 365,
        notes: [],
        messagesLocaux: [],
        contacts: [
            { nom: "Directeur Cabinet", telephone: "+22898231401", metier: "Cosmétiques & Management" },
            { nom: "Support Technique", telephone: "+22898231402", metier: "Ingénierie Continuum" }
        ],
        historiqueElaws: [],
        parametres: {
            sonnerieType: 'iphone',
            customRingtoneBase64: null,
            vibration: true
        }
    };

    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    const welcomeModal = document.getElementById('welcomeModal');
    if(welcomeModal) welcomeModal.style.display = 'none';
    
    socket.emit('register_user', { nom: utilisateur.nom, telephone: utilisateur.telephone, metier: utilisateur.metier });
    appliquerInfosProfil();
    verifierEtSynchroniserContacts();
}

function sauvegarderProfilBaseDesdeProfil() {
    const nom = document.getElementById('inputNomProfil').value.trim();
    const tel = document.getElementById('inputTelProfil2').value.trim();
    const metier = document.getElementById('inputMetierProfil').value.trim();
    
    if(!nom || !tel) {
        alert("Le nom et le téléphone sont obligatoires.");
        return;
    }

    if(!utilisateur) utilisateur = {};
    utilisateur.nom = nom;
    utilisateur.telephone = tel;
    utilisateur.metier = metier;

    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    socket.emit('register_user', { nom: utilisateur.nom, telephone: utilisateur.telephone, metier: utilisateur.metier });
    appliquerInfosProfil();
    alert("✅ Profil mis à jour ! Vous pouvez modifier vos réglages ici à tout moment.");
}

function sauvegarderParametresApp() {
    if(!utilisateur) return;
    if(!utilisateur.parametres) utilisateur.parametres = {};
    
    const selectSon = document.getElementById('selectSonnerieType');
    if(selectSon) {
        utilisateur.parametres.sonnerieType = selectSon.value;
    }
    
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    alert("⚙️ Paramètres enregistrés !");
}

function chargerSonneriePerso(event) {
    const file = event.target.files[0];
    if(!file) return;
    if(file.size > 1024 * 1024) {
        alert("Fichier trop volumineux. Choisissez un fichier MP3 de moins de 1 Mo.");
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        if(!utilisateur.parametres) utilisateur.parametres = {};
        utilisateur.parametres.customRingtoneBase64 = e.target.result;
        utilisateur.parametres.sonnerieType = 'custom';
        localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
        alert("🎵 Sonnerie MP3 personnelle enregistrée !");
    };
    reader.readAsDataURL(file);
}

function deconnecterUtilisateur() {
    if(confirm("Voulez-vous vraiment réinitialiser et refaire l'enregistrement ?")) {
        localStorage.removeItem('evat_profil');
        localStorage.removeItem('elaws_presentee');
        iaDejaPresentee = false;
        utilisateur = null;
        fermerTousLesMenus();
        const welcomeModal = document.getElementById('welcomeModal');
        if(welcomeModal) welcomeModal.style.display = 'flex';
    }
}

function appliquerInfosProfil() {
    if(!utilisateur) return;
    if(!utilisateur.contacts) {
        utilisateur.contacts = [
            { nom: "Directeur Cabinet", telephone: "+22898231401", metier: "Cosmétiques & Management" },
            { nom: "Support Technique", telephone: "+22898231402", metier: "Ingénierie Continuum" }
        ];
    }
    if(!utilisateur.parametres) {
        utilisateur.parametres = { sonnerieType: 'iphone', customRingtoneBase64: null };
    }

    if(document.getElementById('inputNom')) document.getElementById('inputNom').value = utilisateur.nom;
    if(document.getElementById('inputNomProfil')) document.getElementById('inputNomProfil').value = utilisateur.nom;
    if(document.getElementById('inputTelProfil')) document.getElementById('inputTelProfil').value = utilisateur.telephone;
    if(document.getElementById('inputTelProfil2')) document.getElementById('inputTelProfil2').value = utilisateur.telephone;
    if(document.getElementById('inputMetier')) document.getElementById('inputMetier').value = utilisateur.metier;
    if(document.getElementById('inputMetierProfil')) document.getElementById('inputMetierProfil').value = utilisateur.metier;
    
    if(document.getElementById('sidebarUserName')) document.getElementById('sidebarUserName').innerText = utilisateur.nom;
    if(document.getElementById('sidebarUserRole')) document.getElementById('sidebarUserRole').innerText = utilisateur.metier;
    if(document.getElementById('dashUserName')) document.getElementById('dashUserName').innerText = utilisateur.nom.toUpperCase();
    if(document.getElementById('dashUserMetier')) document.getElementById('dashUserMetier').innerText = utilisateur.metier;
    if(document.getElementById('voipStatusDisplay')) document.getElementById('voipStatusDisplay').innerText = "ID : " + utilisateur.telephone;

    const selectSon = document.getElementById('selectSonnerieType');
    if(selectSon && utilisateur.parametres.sonnerieType) {
        selectSon.value = utilisateur.parametres.sonnerieType;
    }
    
    verifierEtSynchroniserContacts();
    afficherContacts();
}

function verifierEtSynchroniserContacts() {
    if(!utilisateur || !utilisateur.contacts) return;
    socket.emit('query_contacts', utilisateur.contacts.map(c => c.telephone), (reponses) => {
        if(reponses && Array.isArray(reponses)) {
            reponses.forEach(info => {
                const contact = utilisateur.contacts.find(c => c.telephone === info.telephone);
                if(contact && info.metier) contact.metier = info.metier;
            });
            localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
            afficherContacts();
        }
    });
}

function afficherContacts() {
    const container = document.getElementById('listeContactsContainer');
    if(!container || !utilisateur || !utilisateur.contacts) return;
    if(utilisateur.contacts.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary); font-size:11.5px;">Aucun contact.</p>`;
        return;
    }
    let html = '';
    utilisateur.contacts.forEach((c, index) => {
        html += `<div style="background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div>
                <strong style="color:var(--accent); font-size:12.5px;">👤 ${c.nom}</strong>
                <div style="font-size:11px; color:var(--text-secondary);">📞 ${c.telephone} • <i style="color:var(--success);">${c.metier || 'Sync...'}</i></div>
            </div>
            <div style="display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end;">
                <button onclick="preparerAppel('${c.telephone}')" class="btn-action" style="background:var(--success); color:#fff; padding:5px 8px; font-size:10.5px;" title="Appeler">📞</button>
                <button onclick="ecrireAuContact('${c.nom}', '${c.telephone}')" class="btn-action" style="background:var(--accent); color:#030712; padding:5px 8px; font-size:10.5px;" title="Écrire">💬</button>
                <button onclick="modifierContact(${index})" class="btn-action" style="background:rgba(59,130,246,0.2); color:var(--accent); border:1px solid var(--accent); padding:5px 8px; font-size:10.5px;" title="Modifier">✏️</button>
                <button onclick="supprimerContact(${index})" class="btn-action" style="background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid #ef4444; padding:5px 8px; font-size:10.5px;" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function ajouterNouveauContact() {
    const nom = document.getElementById('nouveauNomContact').value.trim();
    const tel = document.getElementById('nouveauTelContact').value.trim();
    if(!nom || !tel) {
        alert("Nom et numéro obligatoires.");
        return;
    }
    if(!utilisateur.contacts) utilisateur.contacts = [];
    utilisateur.contacts.push({ nom, telephone: tel, metier: "Recherche..." });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    document.getElementById('nouveauNomContact').value = '';
    document.getElementById('nouveauTelContact').value = '';
    afficherContacts();
    verifierEtSynchroniserContacts();
    alert("✅ Contact enregistré !");
}

function modifierContact(index) {
    const c = utilisateur.contacts[index];
    const nouveauNom = prompt("Modifier le nom :", c.nom);
    if(nouveauNom === null) return;
    const nouveauTel = prompt("Modifier le numéro :", c.telephone);
    if(nouveauTel === null) return;
    utilisateur.contacts[index].nom = nouveauNom.trim();
    utilisateur.contacts[index].telephone = nouveauTel.trim();
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    afficherContacts();
    verifierEtSynchroniserContacts();
}

function supprimerContact(index) {
    if(confirm("Supprimer ce contact ?")) {
        utilisateur.contacts.splice(index, 1);
        localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
        afficherContacts();
    }
}

function ecrireAuContact(nom, tel) {
    const message = prompt(`Message à ${nom} (${tel}) :`);
    if(!message) return;
    if(!utilisateur.messagesLocaux) utilisateur.messagesLocaux = [];
    utilisateur.messagesLocaux.push({ expediteur: utilisateur.nom || "Moi", texte: `À ${nom} : ${message}`, heure: new Date().toLocaleTimeString() });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    switchTab('messagerie');
    alert("✅ Message enregistré !");
}

function preparerAppel(tel) {
    switchTab('communications');
    document.getElementById('appelCibleNum').value = tel;
}

function basculerEcouteVocaleIA() {
    const statusEl = document.getElementById('micStatusElaws');
    const inputEl = document.getElementById('elawsInput');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Reconnaissance vocale non supportée.");
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    if(statusEl) statusEl.innerText = "🎙️ Écoute...";
    
    recognition.onresult = (event) => {
        inputEl.value = event.results[0][0].transcript;
        if(statusEl) statusEl.innerText = "";
        // Réponse instantanée dès la fin de la parole
        poserQuestionElaws();
    };
    recognition.onerror = () => { if(statusEl) statusEl.innerText = ""; };
    recognition.onend = () => { if(statusEl) statusEl.innerText = ""; };
    
    recognition.start();
}

// ========== ELAWS — FORMATION PRATIQUE ==========
let elawsBusy = false;
let elawsHistory = [];
let elawsMode = 'chat'; // 'chat' | 'formation'

const PARCOURS_FORMATION = {
    commerce: {
        titre: 'Commerce & Vente',
        modules: [
            { id: 'c1', titre: 'Accueillir et comprendre le client', duree: '10 min',
              lecon: '1) Saluez clairement.\n2) Demandez le besoin en une phrase ouverte (« Qu\'est-ce que vous cherchez aujourd\'hui ? »).\n3) Reformulez pour confirmer.\n4) Proposez 1 à 2 options max, avec prix et avantage.\n5) Concluez : paiement, sac, remerciement.\n\nExercice : écrivez votre phrase d\'accueil + 2 questions ouvertes pour votre activité.',
              exercice: 'Écris ta phrase d\'accueil et 2 questions pour découvrir le besoin client.' },
            { id: 'c2', titre: 'Fixer un prix et une marge', duree: '12 min',
              lecon: 'Prix de vente = coût + marge.\n- Coût : achat + transport + pertes éventuelles.\n- Marge : ce qui paie ton temps et ton profit.\nExemple : coût 700, marge 30% → prix ≈ 1000.\n\nRègle simple : ne vends jamais sous ton coût total.\n\nExercice : prends 3 produits, calcule coût, marge 25%, prix de vente.',
              exercice: 'Calcule le prix de 3 produits avec 25% de marge.' },
            { id: 'c3', titre: 'Fidéliser sans budget marketing', duree: '10 min',
              lecon: '1) Qualité constante.\n2) Souvenir du client (prénom, préférence).\n3) Petit suivi après achat si possible.\n4) Offre « client régulier » simple (réduction ou bonus).\n5) Demande une recommandation orale.\n\nExercice : définis 1 geste de fidélisation que tu peux faire dès demain.',
              exercice: 'Quel geste de fidélisation démarres-tu demain ?' }
        ]
    },
    agri: {
        titre: 'Agriculture pratique',
        modules: [
            { id: 'a1', titre: 'Planifier une saison', duree: '15 min',
              lecon: '1) Note la période des pluies / sèche chez toi.\n2) Choisis 1 à 2 cultures prioritaires.\n3) Calcule semences, main-d\'œuvre, engrais/compost.\n4) Prépare un calendrier : préparation sol → semis → entretien → récolte.\n5) Garde 10–15% du budget pour imprévus.\n\nExercice : écris ton calendrier pour les 3 prochains mois.',
              exercice: 'Calendrier cultural des 3 prochains mois.' },
            { id: 'a2', titre: 'Suivre coûts et récolte', duree: '10 min',
              lecon: 'Chaque semaine : note dépenses (intrants, transport, aide).\nÀ la récolte : quantité + prix de vente.\nBénéfice ≈ ventes − dépenses.\n\nSans ces chiffres, tu travailles à l\'aveugle.\n\nExercice : liste tes 5 dernières dépenses liées à la production.',
              exercice: 'Liste 5 dépenses récentes de ton exploitation.' }
        ]
    },
    artisan: {
        titre: 'Artisanat & chantiers',
        modules: [
            { id: 'ar1', titre: 'Devis clair en 5 lignes', duree: '12 min',
              lecon: 'Un devis crédible contient :\n1) Description du travail\n2) Main-d\'œuvre (jours × tarif)\n3) Matériaux (liste + prix)\n4) Total + délai\n5) Conditions (acompte, reste à la fin)\n\nExercice : rédige un devis pour un petit chantier type de ton métier.',
              exercice: 'Rédige un mini-devis pour un job typique.' },
            { id: 'ar2', titre: 'Organiser un chantier', duree: '10 min',
              lecon: 'Avant : matériaux complets, outils, accord client.\nPendant : une étape à la fois, photo si possible, note les imprévus.\nAprès : contrôle qualité avec le client, paiement, entretien éventuel.\n\nExercice : checklist « avant de commencer » pour ton prochain job.',
              exercice: 'Ta checklist avant démarrage chantier.' }
        ]
    },
    admin: {
        titre: 'Administration efficace',
        modules: [
            { id: 'ad1', titre: 'Prioriser sa journée', duree: '8 min',
              lecon: 'Règle des 3 : chaque matin, choisis 3 tâches importantes seulement.\n1 critique, 1 importante, 1 utile.\nLe reste = bonus.\nCoupe les distractions pendant 25 min (focus), puis 5 min de pause.\n\nExercice : écris tes 3 priorités pour demain.',
              exercice: '3 priorités pour demain.' },
            { id: 'ad2', titre: 'Écrire un message pro', duree: '10 min',
              lecon: 'Structure :\n- Salutation\n- Pourquoi tu écris (1 phrase)\n- Demande claire ou information\n- Remerciement + signature\n\nCourt = lu. Long = ignoré.\n\nExercice : rédige un message de 5–7 lignes pour une demande réelle.',
              exercice: 'Rédige un court message professionnel.' }
        ]
    },
    tech: {
        titre: 'Tech & numérique pratique',
        modules: [
            { id: 't1', titre: 'Résoudre un problème étape par étape', duree: '12 min',
              lecon: '1) Reproduire le bug.\n2) Noter le message d\'erreur exact.\n3) Isoler : quel changement l\'a causé ?\n4) Tester une hypothèse à la fois.\n5) Documenter la solution en 2 lignes.\n\nExercice : décris un bug récent et ta méthode de résolution.',
              exercice: 'Décris un bug et comment tu l\'as (ou vas le) résoudre.' },
            { id: 't2', titre: 'Livrer une petite fonctionnalité', duree: '15 min',
              lecon: 'Découpe : objectif utilisateur → critères de « terminé » → tâches techniques → test manuel → livraison.\nNe commence pas à coder sans critère de fin.\n\nExercice : prends une idée et écris 3 critères « c\'est terminé quand… ».',
              exercice: '3 critères de fin pour une petite feature.' }
        ]
    },
    entrepreneur: {
        titre: 'Entrepreneuriat de terrain',
        modules: [
            { id: 'e1', titre: 'Offre claire en une phrase', duree: '10 min',
              lecon: 'Formule : J\'aide [qui] à [résultat] grâce à [ton produit/service].\nExemple : « J\'aide les petites boutiques à suivre leurs ventes grâce à un carnet simple. »\nSi tu ne peux pas le dire clairement, le client ne comprendra pas.\n\nExercice : écris ta phrase d\'offre.',
              exercice: 'Ta phrase d\'offre en une ligne.' },
            { id: 'e2', titre: 'Trésorerie de base', duree: '12 min',
              lecon: 'Chaque semaine : entrées, sorties, solde.\nSépare argent business et argent perso si possible.\nGarde une réserve pour 2–4 semaines de charges.\n\nExercice : estime entrées et sorties du mois en cours.',
              exercice: 'Estime entrées / sorties de ce mois.' }
        ]
    },
    education: {
        titre: 'Transmission & formation',
        modules: [
            { id: 'ed1', titre: 'Structurer une séance', duree: '12 min',
              lecon: '1) Objectif (ce que l\'apprenant saura faire).\n2) Accroche 2 min.\n3) Activité principale.\n4) Mise en pratique.\n5) Feedback court.\n\nExercice : plan d\'une séance de 30 min sur un sujet que tu maîtrises.',
              exercice: 'Plan d\'une séance de 30 minutes.' }
        ]
    },
    general: {
        titre: 'Compétences de base',
        modules: [
            { id: 'g1', titre: 'Apprendre en faisant', duree: '8 min',
              lecon: 'Cycle : observer → essayer → noter ce qui marche → recommencer.\n15 minutes de pratique valent mieux qu\'une heure de lecture passive.\n\nExercice : choisis une compétence et définis une pratique de 15 min pour aujourd\'hui.',
              exercice: 'Ta pratique de 15 min aujourd\'hui.' },
            { id: 'g2', titre: 'Communiquer clairement', duree: '10 min',
              lecon: 'Dis : qui, quoi, quand, combien / résultat attendu.\nÉvite les messages flous (« on verra », « bientôt »).\n\nExercice : réécris un message flou en message clair.',
              exercice: 'Transforme un message flou en message clair.' }
        ]
    }
};

function detecterParcoursFormation(metier) {
    const m = (metier || '').toLowerCase();
    if (/commerc|vente|vendeur|boutique|magasin/.test(m)) return 'commerce';
    if (/agri|élev|ferme|culture|pêche/.test(m)) return 'agri';
    if (/artisan|maçonn|plomb|électric|menuis|btp|mécanicien|chantier/.test(m)) return 'artisan';
    if (/admin|secrét|comptable|bureau|rh|assistant/.test(m)) return 'admin';
    if (/dev|info|tech|program|software|réseau|data|ingénieur/.test(m)) return 'tech';
    if (/entrepr|business|startup|freelance|commerçant/.test(m)) return 'entrepreneur';
    if (/enseign|prof|formateur|éduc|coach|tuteur/.test(m)) return 'education';
    return 'general';
}

function getProgressionFormation() {
    if (!utilisateur) return {};
    if (!utilisateur.formation) utilisateur.formation = { termines: [], notes: {} };
    if (!Array.isArray(utilisateur.formation.termines)) utilisateur.formation.termines = [];
    return utilisateur.formation;
}

function sauvegarderFormation() {
    if (!utilisateur) return;
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
}

function afficherFormationPratique() {
    const box = document.getElementById('formationContainer');
    if (!box || !utilisateur) return;
    const key = detecterParcoursFormation(utilisateur.metier);
    const parcours = PARCOURS_FORMATION[key] || PARCOURS_FORMATION.general;
    const prog = getProgressionFormation();
    const total = parcours.modules.length;
    const done = parcours.modules.filter(m => prog.termines.includes(m.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    let html = `<div style="margin-bottom:12px;">
        <strong style="color:var(--accent);">📚 ${parcours.titre}</strong>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Adapté à : ${utilisateur.metier || 'votre activité'} · ${done}/${total} modules (${pct}%)</div>
        <div style="height:6px; background:rgba(56,189,248,0.15); border-radius:4px; margin-top:8px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#0ea5e9,#34d399); border-radius:4px;"></div>
        </div>
    </div>`;

    parcours.modules.forEach((mod, i) => {
        const ok = prog.termines.includes(mod.id);
        html += `<div style="border:1px solid var(--border-color); border-radius:12px; padding:12px; margin-bottom:8px; background:rgba(2,6,23,0.35);">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
                <div>
                    <strong style="font-size:13px;">${ok ? '✅ ' : (i + 1) + '. '}${mod.titre}</strong>
                    <div style="font-size:11px; color:var(--text-secondary);">${mod.duree}</div>
                </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;">
                <button onclick="lancerModuleFormation('${key}','${mod.id}')" class="btn-action" style="width:auto; padding:8px 12px; font-size:11px;">Lire & pratiquer</button>
                <button onclick="demanderCoachElaws('${key}','${mod.id}')" class="btn-action" style="width:auto; padding:8px 12px; font-size:11px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">Coach ELAWS</button>
                ${!ok ? `<button onclick="marquerModuleTermine('${mod.id}')" class="btn-action" style="width:auto; padding:8px 12px; font-size:11px; background:linear-gradient(135deg,#10b981,#059669);">Marquer terminé</button>` : ''}
            </div>
        </div>`;
    });

    html += `<p style="font-size:11px; color:var(--text-secondary); margin-top:10px;">ELAWS te forme par la pratique : courte leçon → exercice → feedback. Tu progresses module après module.</p>
    <div id="formationLeconActive" style="margin-top:12px;"></div>`;
    box.innerHTML = html;
}

function lancerModuleFormation(parcoursKey, moduleId) {
    const parcours = PARCOURS_FORMATION[parcoursKey] || PARCOURS_FORMATION.general;
    const mod = parcours.modules.find(m => m.id === moduleId);
    if (!mod) return;
    const zone = document.getElementById('formationLeconActive');
    if (!zone) return;
    zone.innerHTML = `<div style="border:1px solid var(--accent); border-radius:12px; padding:14px; background:rgba(56,189,248,0.08);">
        <strong style="color:var(--accent); font-size:14px;">${mod.titre}</strong>
        <pre style="white-space:pre-wrap; font-family:inherit; font-size:12.5px; line-height:1.5; margin:10px 0;">${mod.lecon}</pre>
        <button onclick="soumettreExerciceFormation('${parcoursKey}','${moduleId}')" class="btn-action" style="background:linear-gradient(135deg,#10b981,#059669);">✍️ Soumettre mon exercice</button>
    </div>`;
    zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function marquerModuleTermine(moduleId) {
    const prog = getProgressionFormation();
    if (!prog.termines.includes(moduleId)) prog.termines.push(moduleId);
    sauvegarderFormation();
    afficherFormationPratique();
    alert('Module validé. Continue sur le suivant.');
}

function soumettreExerciceFormation(parcoursKey, moduleId) {
    const parcours = PARCOURS_FORMATION[parcoursKey] || PARCOURS_FORMATION.general;
    const mod = parcours.modules.find(m => m.id === moduleId);
    if (!mod) return;
    const reponse = prompt('Ton exercice :\n' + mod.exercice);
    if (reponse === null || !reponse.trim()) return;
    const prog = getProgressionFormation();
    prog.notes[moduleId] = reponse.trim();
    if (!prog.termines.includes(moduleId)) prog.termines.push(moduleId);
    sauvegarderFormation();
    afficherFormationPratique();
    // Feedback via ELAWS
    elawsMode = 'formation';
    switchTab('elaws-ia');
    const input = document.getElementById('elawsInput');
    if (input) {
        input.value = `Corrige mon exercice de formation « ${mod.titre} ». Consignes: ${mod.exercice}. Ma réponse: ${reponse.trim()}. Donne un feedback pratique, 4 à 6 phrases max, sans répéter ma réponse en entier.`;
        poserQuestionElaws();
    }
}

function demanderCoachElaws(parcoursKey, moduleId) {
    const parcours = PARCOURS_FORMATION[parcoursKey] || PARCOURS_FORMATION.general;
    const mod = parcours.modules.find(m => m.id === moduleId);
    if (!mod) return;
    elawsMode = 'formation';
    switchTab('elaws-ia');
    const input = document.getElementById('elawsInput');
    if (input) {
        input.value = `Tu es mon formateur pratique. Module: « ${mod.titre} ». Résume la méthode en 5 étapes max, puis donne-moi un mini-exercice concret pour mon métier (${utilisateur?.metier || 'mon activité'}). Sois direct, pas de blabla.`;
        poserQuestionElaws();
    }
}

function echapperHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function nettoyerReponseIA(texte, question) {
    if (!texte) return texte;
    let t = texte.trim();
    t = t.replace(/^(ELAWS\s*(AI)?\s*[:\-–—]\s*)/i, '');
    t = t.replace(/^(Réponse\s*[:\-–—]\s*)/i, '');
    const ban = [
        /^j'ai bien (reçu|compris|noté)[^.!]*[.!]?\s*/i,
        /^concernant (ta|votre|la) question[^.!]*[.!]?\s*/i,
        /^tu (as|m'as) (demandé|posé)[^.!]*[.!]?\s*/i,
        /^analyse (instantanée|de)[^.!]*[.!]?\s*/i
    ];
    ban.forEach(re => { t = t.replace(re, ''); });
    return t.trim() || texte.trim();
}

function reponseLocaleFormation(question, profil) {
    const prenom = profil?.nom ? profil.nom.split(' ')[0] : '';
    const q = (question || '').toLowerCase();
    if (/bonjour|salut|hello|hi/.test(q))
        return (prenom ? prenom + ', ' : '') + 'on enchaîne. Dis-moi ce que tu veux apprendre à faire concrètement.';
    if (/exercice|corrige|feedback/.test(q))
        return 'Bon réflexe de pratiquer. Vérifie : est-ce actionnable dès demain ? Est-ce mesurable ? Si oui, valide le module et passe au suivant. Sinon, raccourcis ta réponse en une action claire.';
    if (/former|apprendre|leçon|module/.test(q))
        return 'Va dans l\'onglet Formation pratique, choisis un module, lis la méthode, fais l\'exercice, puis renvoie-moi ton travail pour un feedback.';
    return 'Je suis en mode local. Ouvre Formation pratique pour les leçons structurées, ou réessaie ta question quand le réseau est disponible pour un coaching détaillé.';
}

async function appelerIAMondiale(question, profil) {
    const prenom = profil?.nom ? profil.nom.split(' ')[0] : 'toi';
    const metier = profil?.metier || 'activité de terrain';
    const modeFormation = elawsMode === 'formation' || /exercice|corrige|formateur|module|leçon|apprendre|entraîne/i.test(question);

    const systemPrompt = modeFormation
        ? `Tu es ELAWS, formateur pratique dans EVAT Continuum.
Règles:
- Réponds UNIQUEMENT avec le contenu utile. Ne répète jamais la question.
- Style humain, direct, clair. Tutoiement possible.
- Formation = méthode + exemple + mini-exercice. Pas de cours universitaire long.
- 4 à 8 phrases ou étapes courtes max sauf si on te demande plus.
- Adapte au métier: ${metier}. Prénom: ${prenom}.
- Corrige les exercices avec bienveillance et exigence: ce qui est bon, ce qui manque, prochaine action.`
        : `Tu es ELAWS dans EVAT Continuum. Réponds comme un humain compétent et direct.
Ne répète jamais la question. Pas de « j'ai bien reçu ». Langue de l'utilisateur.
Métier de l'utilisateur: ${metier}. Prénom: ${prenom}.
Si la question porte sur apprendre un savoir-faire, propose une méthode pratique courte.`;

    const messages = [{ role: 'system', content: systemPrompt }];
    elawsHistory.slice(-8).forEach(m => messages.push(m));
    messages.push({ role: 'user', content: question });

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 28000);
        const res = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model: 'openai', seed: Math.floor(Math.random() * 99999) }),
            signal: ctrl.signal
        });
        clearTimeout(t);
        if (res.ok) {
            let text = (await res.text()).trim();
            text = nettoyerReponseIA(text, question);
            if (text.length > 3) return text;
        }
    } catch (e) {}

    try {
        const prompt = encodeURIComponent(systemPrompt + '\n\nUtilisateur: ' + question + '\nELAWS:');
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 20000);
        const res2 = await fetch('https://text.pollinations.ai/' + prompt + '?model=openai', { signal: ctrl2.signal });
        clearTimeout(t2);
        if (res2.ok) {
            let text2 = (await res2.text()).trim();
            text2 = nettoyerReponseIA(text2, question);
            if (text2.length > 3) return text2;
        }
    } catch (e) {}

    return reponseLocaleFormation(question, profil);
}

async function poserQuestionElaws() {
    const input = document.getElementById('elawsInput');
    const question = (input?.value || '').trim();
    if (!question || !utilisateur || elawsBusy) return;
    const chatBox = document.getElementById('elawsChatBox');
    if (!chatBox) return;

    elawsBusy = true;
    chatBox.innerHTML += `<div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; text-align:right;"><strong style="color:var(--success); font-size:12px;">👤 ${echapperHtml(utilisateur.nom)}</strong><p style="margin:4px 0 0 0; font-size:12.5px; line-height:1.4;">${echapperHtml(question)}</p></div>`;
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    const loadingId = 'elaws-load-' + Date.now();
    chatBox.innerHTML += `<div id="${loadingId}" style="background:rgba(56,189,248,0.1); border:1px solid var(--border-color); padding:10px; border-radius:10px;"><strong style="color:var(--accent); font-size:12px;">🤖 ELAWS</strong><p style="font-size:12px; margin:6px 0 0 0; color:var(--text-secondary);">Réflexion…</p></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    let reponse = '';
    try {
        reponse = await appelerIAMondiale(question, utilisateur);
    } catch (e) {
        reponse = reponseLocaleFormation(question, utilisateur);
    }

    elawsHistory.push({ role: 'user', content: question });
    elawsHistory.push({ role: 'assistant', content: reponse });
    if (elawsHistory.length > 20) elawsHistory = elawsHistory.slice(-16);

    const html = `<div style="background:rgba(56,189,248,0.1); border:1px solid var(--border-color); padding:10px; border-radius:10px;"><strong style="color:var(--accent); font-size:12px;">🤖 ELAWS</strong><p style="margin:4px 0 0 0; font-size:12.5px; line-height:1.5; white-space:pre-wrap;">${echapperHtml(reponse)}</p></div>`;
    const el = document.getElementById(loadingId);
    if (el) el.outerHTML = html;
    else chatBox.innerHTML += html;
    chatBox.scrollTop = chatBox.scrollHeight;
    elawsBusy = false;
    elawsMode = 'chat';
}

function toggleMenu(e) {
    if(e) { e.stopPropagation(); e.preventDefault(); }
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('appOverlay');
    if(sidebar && overlay) {
        const isOpen = sidebar.classList.toggle('open');
        if(isOpen) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

function fermerTousLesMenus() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('appOverlay');
    if(sidebar) sidebar.classList.remove('open');
    if(overlay) overlay.classList.remove('active');
}

let mapInstance = null;
let userMarker = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab-' + tabId);
    if(target) target.style.display = 'block';
    const link = document.getElementById('link-' + tabId);
    if(link) link.classList.add('active');
    fermerTousLesMenus();

    if(tabId === 'contacts') afficherContacts();
    if(tabId === 'formation') afficherFormationPratique();
    if(tabId === 'map') {
        setTimeout(() => {
            if(!mapInstance) {
                mapInstance = L.map('mapContainer').setView([6.1375, 1.2123], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);
            } else {
                mapInstance.invalidateSize();
            }
        }, 200);
    }
}

function centrerSurMoi() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if(mapInstance) {
                mapInstance.setView([lat, lng], 15);
                if(userMarker) mapInstance.removeLayer(userMarker);
                userMarker = L.marker([lat, lng]).addTo(mapInstance).bindPopup("<b>📍 Vous êtes ici</b>").openPopup();
            }
        });
    }
}

function partagerMaPositionGPS() {
    if (navigator.geolocation && utilisateur) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            socket.emit('signal', { type: 'location', sender: utilisateur.nom, lat, lng });
            alert("Position partagée !");
        });
    }
}

socket.on('signal', (data) => {
    if (data.type === 'location' && mapInstance) {
        L.marker([data.lat, data.lng]).addTo(mapInstance).bindPopup(`<b>📍 ${data.sender}</b>`);
    }
});

function envoyerMessageChatLocal() {
    const input = document.getElementById('chatLocalInput');
    const texte = input.value.trim();
    if(!texte || !utilisateur) return;
    if(!utilisateur.messagesLocaux) utilisateur.messagesLocaux = [];
    utilisateur.messagesLocaux.push({ expediteur: utilisateur.nom || "Moi", texte, heure: new Date().toLocaleTimeString() });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    input.value = '';
    afficherMessagesLocaux();
}

function afficherMessagesLocaux() {
    const container = document.getElementById('listeMessagesLocaux');
    if(!container || !utilisateur || !utilisateur.messagesLocaux) return;
    let html = '';
    utilisateur.messagesLocaux.forEach(m => {
        html += `<div style="background:var(--bg-color); border:1px solid var(--border-color); padding:8px; border-radius:8px; margin-bottom:6px;"><div style="font-size:10px; color:var(--accent);">👤 ${m.expediteur} • ${m.heure}</div><p style="margin:3px 0 0 0; font-size:12px;">${m.texte}</p></div>`;
    });
    container.innerHTML = html;
}

function ajouterNoteBlocNotes() {
    const titre = document.getElementById('noteTitre').value.trim();
    const contenu = document.getElementById('noteContenu').value.trim();
    if(!titre || !contenu || !utilisateur) return;
    if(!utilisateur.notes) utilisateur.notes = [];
    utilisateur.notes.unshift({ titre, contenu });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    document.getElementById('noteTitre').value = '';
    document.getElementById('noteContenu').value = '';
    afficherNotesBlocNotes();
}

function afficherNotesBlocNotes() {
    const container = document.getElementById('listeNotesContainer');
    if(!container || !utilisateur || !utilisateur.notes) return;
    let html = '';
    utilisateur.notes.forEach(n => {
        html += `<div style="background:var(--bg-color); border:1px solid var(--border-color); padding:10px; border-radius:10px; margin-bottom:8px;"><strong style="color:var(--accent);">📌 ${n.titre}</strong><p style="margin:3px 0; font-size:12px;">${n.contenu}</p></div>`;
    });
    container.innerHTML = html;
}

function genererPlanSucces1000() {
    const obj = document.getElementById('inputObjectif1000').value.trim();
    const container = document.getElementById('resultatPlan1000');
    if(!obj) return;
    container.style.display = 'block';
    container.innerHTML = `<div style="background:var(--bg-color); padding:12px; border-radius:12px; border:1px solid var(--success);"><h4 style="color:var(--success);">🚀 ${obj}</h4><p style="font-size:12px;">Plan en cours d'exécution.</p></div>`;
}

function lancerAnalyseVoyageAvance() {
    const dest = document.getElementById('voyageDestination').value.trim();
    const container = document.getElementById('resultatAssistantVoyage');
    if(!dest) return;
    container.style.display = 'block';
    container.innerHTML = `<div style="background:var(--bg-color); padding:12px; border-radius:12px; border:1px solid var(--accent);"><h4 style="color:var(--accent);">✈️ ${dest}</h4><p style="font-size:12px;">Formalités validées.</p></div>`;
}

function exporterDonneesCloud() {
    if(!utilisateur) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(utilisateur, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "evat_backup.json");
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}

// VoIP P2P & Sonneries
let localStream = null;
let peerConnection = null;
let audioRingContext = null;
let ringInterval = null;
let customAudioRing = null;
let appelTimeoutTimer = null;
let incomingTimeout = null;
let pendingOfferData = null;
let activeCallType = 'audio';

const servers = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ] 
};

function jouerSonSonnerie() {
    try {
        const type = utilisateur && utilisateur.parametres ? utilisateur.parametres.sonnerieType : 'iphone';

        if (type === 'custom' && utilisateur.parametres.customRingtoneBase64) {
            if(customAudioRing) return;
            customAudioRing = new Audio(utilisateur.parametres.customRingtoneBase64);
            customAudioRing.loop = true;
            customAudioRing.play().catch(e => {});
            return;
        }

        if(audioRingContext) return;
        audioRingContext = new (window.AudioContext || window.webkitAudioContext)();
        
        let notes = [523.25, 659.25, 783.99, 1046.50];
        let pattern = 1800;
        let waveType = 'sine';

        if (type === 'motorola') {
            notes = [600, 750, 900, 600];
            pattern = 1400;
            waveType = 'square';
        } else if (type === 'samsung') {
            notes = [440, 554.37, 659.25, 880, 1108.73];
            pattern = 2200;
            waveType = 'triangle';
        } else if (type === 'classique') {
            notes = [800, 1000];
            pattern = 1000;
            waveType = 'sine';
        }

        let noteIndex = 0;
        ringInterval = setInterval(() => {
            if(!audioRingContext) return;
            const osc = audioRingContext.createOscillator();
            const gain = audioRingContext.createGain();
            osc.type = waveType;
            osc.frequency.setValueAtTime(notes[noteIndex % notes.length], audioRingContext.currentTime);
            gain.gain.setValueAtTime(0.12, audioRingContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioRingContext.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(audioRingContext.destination);
            osc.start();
            osc.stop(audioRingContext.currentTime + 0.5);
            noteIndex++;
        }, pattern / notes.length);
    } catch(e) {}
}

function arreterSonSonnerie() {
    if(ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    if(audioRingContext) { audioRingContext.close().catch(() => {}); audioRingContext = null; }
    if(customAudioRing) { customAudioRing.pause(); customAudioRing.currentTime = 0; customAudioRing = null; }
    if(appelTimeoutTimer) { clearTimeout(appelTimeoutTimer); appelTimeoutTimer = null; }
    if(incomingTimeout) { clearTimeout(incomingTimeout); incomingTimeout = null; }
}

function afficherModalAppelEntrant(senderTel, typeAppel) {
    let modal = document.getElementById('incomingCallModal');
    let typeTxt = typeAppel === 'video' ? '📹 Appel Vidéo Entrant' : '📞 Appel Audio Entrant';
    if(!modal) {
        modal = document.createElement('div');
        modal.id = 'incomingCallModal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(3,7,18,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; text-align:center;";
        modal.innerHTML = `
            <div style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); padding:30px; border-radius:24px; max-width:340px; width:100%; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                <div style="font-size:50px; margin-bottom:15px;">📞</div>
                <h2 id="incomingCallTitle" style="color:var(--text-primary); font-size:20px; margin:0 0 8px 0;">${typeTxt}</h2>
                <p id="incomingCallerName" style="color:var(--accent); font-size:15px; font-weight:bold; margin:0 0 25px 0;">${senderTel}</p>
                <div style="display:flex; gap:15px; justify-content:center;">
                    <button onclick="rejeterAppelEntrant()" style="background:#ef4444; color:#fff; border:none; padding:12px 24px; border-radius:50px; font-size:14px; font-weight:bold; cursor:pointer; flex:1;">Rejeter ❌</button>
                    <button onclick="accepterAppelEntrant()" style="background:#10b981; color:#fff; border:none; padding:12px 24px; border-radius:50px; font-size:14px; font-weight:bold; cursor:pointer; flex:1;">Décrocher 🟢</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        document.getElementById('incomingCallTitle').innerText = typeTxt;
        document.getElementById('incomingCallerName').innerText = senderTel;
        modal.style.display = 'flex';
    }
}

function cacherModalAppelEntrant() {
    const modal = document.getElementById('incomingCallModal');
    if(modal) modal.style.display = 'none';
}

async function lancerAppelDirectPeer(type) {
    const cibleTel = document.getElementById('appelCibleNum').value.trim();
    const logEl = document.getElementById('callStatusLog');
    const container = document.getElementById('callContainer');
    activeCallType = type;

    if(!cibleTel) {
        alert("Entrez le numéro du contact à appeler.");
        return;
    }
    if(cibleTel === utilisateur.telephone) {
        alert("Impossible de s'appeler soi-même !");
        return;
    }

    try {
        if(logEl) logEl.innerText = "🔄 Activation micro/caméra...";
        container.style.display = 'block';

        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false 
        });

        peerConnection = new RTCPeerConnection(servers);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = event => {
            if (event.streams && event.streams[0]) {
                const remoteAudio = document.getElementById('remoteAudio');
                const remoteVideo = document.getElementById('remoteVideo');
                if(remoteAudio) remoteAudio.srcObject = event.streams[0];
                if(remoteVideo && type === 'video') remoteVideo.srcObject = event.streams[0];
                if(logEl) logEl.innerText = "✅ Connexion active !";
                arreterSonSonnerie();
            }
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('p2p_signal', { target: cibleTel, sender: utilisateur.telephone, type: 'ice_candidate', candidate: event.candidate, callType: type });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('p2p_signal', { target: cibleTel, sender: utilisateur.telephone, type: 'offer', offer: offer, callType: type });

        jouerSonSonnerie();
        if(logEl) logEl.innerText = "📞 Sonnerie active...";

        appelTimeoutTimer = setTimeout(() => {
            if(peerConnection && peerConnection.connectionState !== 'connected') {
                raccrocherAppel(true);
                if(logEl) logEl.innerText = "❌ Pas de réponse.";
            }
        }, 30000);

    } catch (error) {
        if(logEl) logEl.innerText = "❌ Erreur micro/caméra.";
    }
}

socket.on('p2p_signal', async (data) => {
    const logEl = document.getElementById('callStatusLog');
    if(data.callType) activeCallType = data.callType;

    if (!peerConnection && data.type !== 'hangup' && data.type !== 'reject') {
        peerConnection = new RTCPeerConnection(servers);
        peerConnection.ontrack = event => {
            if (event.streams && event.streams[0]) {
                const remoteAudio = document.getElementById('remoteAudio');
                const remoteVideo = document.getElementById('remoteVideo');
                if(remoteAudio) remoteAudio.srcObject = event.streams[0];
                if(remoteVideo && activeCallType === 'video') remoteVideo.srcObject = event.streams[0];
                if(logEl) logEl.innerText = "✅ Connexion active !";
                arreterSonSonnerie();
            }
        };
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('p2p_signal', { target: data.sender, sender: utilisateur.telephone, type: 'ice_candidate', candidate: event.candidate, callType: activeCallType });
            }
        };
    }

    if (data.type === 'offer') {
        pendingOfferData = data;
        jouerSonSonnerie();
        afficherModalAppelEntrant(data.sender, data.callType || 'audio');
        incomingTimeout = setTimeout(() => { rejeterAppelEntrant(); }, 30000);
    } else if (data.type === 'answer') {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            arreterSonSonnerie();
            if(logEl) logEl.innerText = "✅ Appel décroché !";
        } catch(e) {}
    } else if (data.type === 'ice_candidate' && data.candidate && peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch(e) {}
    } else if (data.type === 'hangup' || data.type === 'reject') {
        fermerAppelTotalLocally();
        if(logEl) logEl.innerText = "❌ Appel terminé.";
    }
});

async function accepterAppelEntrant() {
    arreterSonSonnerie();
    cacherModalAppelEntrant();
    if(incomingTimeout) clearTimeout(incomingTimeout);

    const logEl = document.getElementById('callStatusLog');
    const container = document.getElementById('callContainer');
    container.style.display = 'block';

    if(!pendingOfferData) return;
    const data = pendingOfferData;
    activeCallType = data.callType || 'audio';

    try {
        if(logEl) logEl.innerText = "📞 Décrochage...";
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: activeCallType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false 
        });

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const remoteVideo = document.getElementById('remoteVideo');
        if(remoteVideo && activeCallType === 'video') {
            remoteVideo.srcObject = localStream;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('p2p_signal', { target: data.sender, sender: utilisateur.telephone, type: 'answer', answer: answer, callType: activeCallType });
        if(logEl) logEl.innerText = "✅ Établi avec " + data.sender;
    } catch(err) {
        if(logEl) logEl.innerText = "❌ Erreur micro/caméra.";
    }
}

function rejeterAppelEntrant() {
    arreterSonSonnerie();
    cacherModalAppelEntrant();
    if(incomingTimeout) clearTimeout(incomingTimeout);

    if(pendingOfferData) {
        socket.emit('p2p_signal', { target: pendingOfferData.sender, sender: utilisateur.telephone, type: 'reject' });
        pendingOfferData = null;
    }
    fermerAppelTotalLocally();
}

function raccrocherAppel(isTimeout = false) {
    let targetTel = document.getElementById('appelCibleNum').value.trim();
    if(pendingOfferData && pendingOfferData.sender) {
        targetTel = pendingOfferData.sender;
    }
    if(targetTel) {
        socket.emit('p2p_signal', { target: targetTel, sender: utilisateur.telephone, type: 'hangup' });
    }
    fermerAppelTotalLocally();
}

function fermerAppelTotalLocally() {
    arreterSonSonnerie();
    cacherModalAppelEntrant();
    
    if(peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if(localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    
    const remoteAudio = document.getElementById('remoteAudio');
    const remoteVideo = document.getElementById('remoteVideo');
    if(remoteAudio) remoteAudio.srcObject = null;
    if(remoteVideo) remoteVideo.srcObject = null;

    const container = document.getElementById('callContainer');
    if(container) container.style.display = 'none';
    
    pendingOfferData = null;
}

// LOGIQUE CRITIQUE DE GESTION DE LA PAGE D'ACCUEIL ET DE L'ENREGISTREMENT UNIQUE
document.addEventListener('DOMContentLoaded', () => {
    const welcomeModal = document.getElementById('welcomeModal');
    if (!utilisateur || !utilisateur.nom || !utilisateur.telephone) {
        // Premier accès : on affiche la modal d'enregistrement
        if(welcomeModal) welcomeModal.style.display = 'flex';
    } else {
        // Déjà enregistré : on masque définitivement la modal d'enregistrement
        if(welcomeModal) welcomeModal.style.display = 'none';
        appliquerInfosProfil();
        afficherContacts();
    }
    afficherNotesBlocNotes();
    afficherMessagesLocaux();
});

async function demanderPermissionsEtActiverProfil() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {}

    sauvegarderProfilBase();
}

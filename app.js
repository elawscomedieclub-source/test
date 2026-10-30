
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
    afficherOutilsPro();
    afficherOutilsProDashboard();
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

// Réponse IA instantanée et intelligente
function poserQuestionElaws() {
    const input = document.getElementById('elawsInput');
    const question = input.value.trim();
    if(!question || !utilisateur) return;
    const chatBox = document.getElementById('elawsChatBox');
    
    chatBox.innerHTML += `<div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px; text-align:right;"><strong style="color:var(--success);">👤 ${utilisateur.nom} :</strong><p style="margin:3px 0 0 0; font-size:12px;">${question}</p></div>`;
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
        let reponse = "";
        const qLower = question.toLowerCase();

        if (qLower.includes('bonjour') || qLower.includes('salut')) {
            reponse = `Bonjour ${utilisateur.nom} ! En tant qu'expert en ${utilisateur.metier}, je suis à votre service. Que souhaitez-vous analyser ?`;
        } else if (qLower.includes('merci')) {
            reponse = `C'est un plaisir, ${utilisateur.nom}. Je veille sur vos systèmes et communications.`;
        } else if (qLower.includes('contact') || qLower.includes('appel')) {
            reponse = `Pour vos appels VoIP sécurisés ou vos contacts, rendez-vous dans l'onglet Annuaire ou Appels. Votre ID : ${utilisateur.telephone}.`;
        } else if (qLower.includes('entreprise') || qLower.includes('business') || qLower.includes('nif') || qLower.includes('statut')) {
            reponse = `Concernant votre structure à Lomé et la gestion de vos entités avec un NIF, une distinction claire est recommandée. Souhaitez-vous un plan stratégique ?`;
        } else if (qLower.includes('aide') || qLower.includes('que peux-tu') || qLower.includes('fonction')) {
            reponse = `Je suis l'assistant ELAWS AI, intégré dans votre écosystème EVAT Continuum. Je gère vos notes, votre stratégie et vos communications chiffrées.`;
        } else {
            reponse = `Analyse instantanée de "${question}" validée pour ${utilisateur.nom} (${utilisateur.metier}). Le système applique vos consignes avec succès.`;
        }

        chatBox.innerHTML += `<div style="background:rgba(59,130,246,0.1); border:1px solid var(--accent); padding:8px; border-radius:8px;"><strong style="color:var(--accent);">🤖 ELAWS AI :</strong><p style="margin:3px 0 0 0; font-size:12px;">${reponse}</p></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    }, 150);
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


// ========== OUTILS PRO SELON LE MÉTIER ==========
const CATALOGUE_OUTILS_PRO = {
    commerce: {
        label: 'Commerce & Vente',
        icon: '🛒',
        outils: [
            { id: 'devis', titre: 'Devis rapide', desc: 'Estime un prix et une marge', action: 'outilDevis' },
            { id: 'stock', titre: 'Suivi stock simple', desc: 'Note tes produits et quantités', action: 'outilStock' },
            { id: 'clients', titre: 'Fiches clients', desc: 'Retrouve tes contacts pro', action: 'outilClients' },
            { id: 'objectifs', titre: 'Objectifs de vente', desc: 'Fixe et suis tes cibles', action: 'outilObjectifsVente' }
        ]
    },
    admin: {
        label: 'Administration & Bureau',
        icon: '📋',
        outils: [
            { id: 'checklist', titre: 'Checklist du jour', desc: 'Organise tes tâches prioritaires', action: 'outilChecklist' },
            { id: 'courrier', titre: 'Modèle de courrier', desc: 'Structure un message pro', action: 'outilCourrier' },
            { id: 'planning', titre: 'Planning simple', desc: 'Répartis ta journée', action: 'outilPlanning' },
            { id: 'notes_pro', titre: 'Notes de réunion', desc: 'Capture décisions et actions', action: 'outilNotesReunion' }
        ]
    },
    tech: {
        label: 'Tech & Informatique',
        icon: '💻',
        outils: [
            { id: 'bugs', titre: 'Journal de bugs', desc: 'Liste et priorise les incidents', action: 'outilBugs' },
            { id: 'specs', titre: 'Mini cahier des charges', desc: 'Clarifie une fonctionnalité', action: 'outilSpecs' },
            { id: 'checklist_deploy', titre: 'Checklist déploiement', desc: 'Évite les oublis avant mise en ligne', action: 'outilDeploy' },
            { id: 'idees', titre: 'Backlog idées', desc: 'Capte les améliorations', action: 'outilBacklog' }
        ]
    },
    agri: {
        label: 'Agriculture & Élevage',
        icon: '🌾',
        outils: [
            { id: 'saison', titre: 'Calendrier cultural', desc: 'Repères par saison', action: 'outilSaison' },
            { id: 'depenses', titre: 'Dépenses exploitation', desc: 'Suis tes coûts', action: 'outilDepensesAgri' },
            { id: 'recolte', titre: 'Suivi récolte / production', desc: 'Quantités et dates', action: 'outilRecolte' },
            { id: 'marche', titre: 'Prix du marché', desc: 'Note les prix observés', action: 'outilPrixMarche' }
        ]
    },
    education: {
        label: 'Éducation & Formation',
        icon: '📚',
        outils: [
            { id: 'cours', titre: 'Plan de cours', desc: 'Structure une séance', action: 'outilPlanCours' },
            { id: 'eleves', titre: 'Suivi apprenants', desc: 'Progression et remarques', action: 'outilEleves' },
            { id: 'eval', titre: 'Grille d\'évaluation', desc: 'Critères clairs', action: 'outilEval' },
            { id: 'ressources', titre: 'Ressources pédagogiques', desc: 'Liste de supports', action: 'outilRessources' }
        ]
    },
    sante: {
        label: 'Santé & Bien-être',
        icon: '🩺',
        outils: [
            { id: 'rdv', titre: 'Agenda rendez-vous', desc: 'Organisation de la journée', action: 'outilRdv' },
            { id: 'rappels', titre: 'Rappels patients / clients', desc: 'Ne rien oublier', action: 'outilRappels' },
            { id: 'protocole', titre: 'Protocoles', desc: 'Procédures standard', action: 'outilProtocole' },
            { id: 'stock_sante', titre: 'Stock matériel', desc: 'Consommables et équipements', action: 'outilStockSante' }
        ]
    },
    transport: {
        label: 'Transport & Logistique',
        icon: '🚚',
        outils: [
            { id: 'trajets', titre: 'Feuille de route', desc: 'Trajets du jour', action: 'outilTrajets' },
            { id: 'carburant', titre: 'Suivi carburant', desc: 'Coûts et consommation', action: 'outilCarburant' },
            { id: 'livraisons', titre: 'Livraisons', desc: 'Statut des courses', action: 'outilLivraisons' },
            { id: 'entretien', titre: 'Entretien véhicule', desc: 'Échéances et notes', action: 'outilEntretien' }
        ]
    },
    artisan: {
        label: 'Artisanat & BTP',
        icon: '🔧',
        outils: [
            { id: 'devis_art', titre: 'Devis chantier', desc: 'Main d\'œuvre + matériaux', action: 'outilDevisArtisan' },
            { id: 'materiaux', titre: 'Liste matériaux', desc: 'Ce qu\'il faut acheter', action: 'outilMateriaux' },
            { id: 'chantiers', titre: 'Chantiers en cours', desc: 'Avancement', action: 'outilChantiers' },
            { id: 'photos', titre: 'Notes de chantier', desc: 'Observations terrain', action: 'outilNotesChantier' }
        ]
    },
    entrepreneur: {
        label: 'Entrepreneuriat & Business',
        icon: '🚀',
        outils: [
            { id: 'cash', titre: 'Trésorerie simple', desc: 'Entrées / sorties', action: 'outilTresorerie' },
            { id: 'offre', titre: 'Offre de valeur', desc: 'Clarifie ton produit', action: 'outilOffre' },
            { id: 'pipeline', titre: 'Pipeline clients', desc: 'Prospects → clients', action: 'outilPipeline' },
            { id: 'kpi', titre: 'Indicateurs du mois', desc: 'Ce qui compte vraiment', action: 'outilKpi' }
        ]
    },
    general: {
        label: 'Outils universels',
        icon: '⚡',
        outils: [
            { id: 'todo', titre: 'To-do du jour', desc: '3 priorités max', action: 'outilTodo' },
            { id: 'idees_g', titre: 'Captures d\'idées', desc: 'Ne perds plus une idée', action: 'outilIdees' },
            { id: 'temps', titre: 'Bloc de focus', desc: 'Session de travail ciblée', action: 'outilFocus' },
            { id: 'bilan', titre: 'Bilan de fin de journée', desc: 'Ce qui a avancé', action: 'outilBilan' }
        ]
    }
};

function detecterCategorieMetier(metier) {
    const m = (metier || '').toLowerCase();
    if (/commerc|vente|vendeur|retail|boutique|magasin|market/.test(m)) return 'commerce';
    if (/admin|secrét|bureau|comptable|rh|ressources humaines|assistant|gestionnaire|office/.test(m)) return 'admin';
    if (/dev|info|tech|program|software|réseau|système|data|cyber|ingénieur/.test(m)) return 'tech';
    if (/agri|élev|fermier|plant|culture|pêche|ferme/.test(m)) return 'agri';
    if (/enseign|prof|éduc|formateur|école|pédagog|tuteur|coach/.test(m)) return 'education';
    if (/santé|médic|infirm|pharmac|soin|thérapie|dentaire|clinique/.test(m)) return 'sante';
    if (/transport|chauffeur|logistique|livreur|taxi|cargo|supply/.test(m)) return 'transport';
    if (/artisan|maçonn|plomb|électric|menuis|soudeur|btp|chantier|mécanicien/.test(m)) return 'artisan';
    if (/entrepr|business|startup|ceo|fondateur|commerçant|auto-entrepreneur|freelance/.test(m)) return 'entrepreneur';
    return 'general';
}

function getOutilsPourUtilisateur() {
    const cat = detecterCategorieMetier(utilisateur?.metier);
    const pack = CATALOGUE_OUTILS_PRO[cat] || CATALOGUE_OUTILS_PRO.general;
    const general = CATALOGUE_OUTILS_PRO.general;
    // Métier + toujours 2 outils universels
    const extra = general.outils.filter(o => !pack.outils.find(p => p.id === o.id)).slice(0, 2);
    return { categorie: cat, label: pack.label, icon: pack.icon, outils: [...pack.outils, ...extra] };
}

function afficherOutilsPro() {
    const container = document.getElementById('outilsProContainer');
    if (!container || !utilisateur) return;
    const pack = getOutilsPourUtilisateur();
    let html = `<div style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-size:22px;">${pack.icon}</span>
            <div>
                <strong style="color:var(--accent); font-size:13px;">${pack.label}</strong>
                <div style="font-size:11px; color:var(--text-secondary);">Outils adaptés à : ${utilisateur.metier || 'votre activité'}</div>
            </div>
        </div>
    </div>`;
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">`;
    pack.outils.forEach(o => {
        html += `<button onclick="${o.action}()" class="btn-action" style="background:rgba(56,189,248,0.12); color:var(--accent); border:1px solid var(--border-color); box-shadow:none; text-align:left; padding:12px; font-size:12px;">
            <strong style="display:block; margin-bottom:3px;">${o.titre}</strong>
            <span style="font-weight:400; color:var(--text-secondary); font-size:11px;">${o.desc}</span>
        </button>`;
    });
    html += `</div>
    <p style="font-size:11px; color:var(--text-secondary); margin-top:12px;">Ces outils sont fournis par EVAT pour améliorer ton rendement au quotidien. Utilise-les, note tes résultats, et avance.</p>
    <div id="outilProResultat" style="margin-top:12px;"></div>`;
    container.innerHTML = html;
}

function afficherOutilsProDashboard() {
    const el = document.getElementById('dashOutilsPro');
    if (!el || !utilisateur) return;
    const pack = getOutilsPourUtilisateur();
    el.innerHTML = `<div class="card">
        <h2 style="margin-bottom:8px;">${pack.icon} Tes outils pro</h2>
        <p style="font-size:12px; color:var(--text-secondary); margin:0 0 10px 0;">Adaptés à <strong style="color:var(--accent);">${utilisateur.metier || 'ton activité'}</strong> — pour mieux travailler et mieux gagner.</p>
        <button onclick="switchTab('outils')" class="btn-action" style="font-size:12px;">Ouvrir mes outils de travail</button>
    </div>`;
}

function sauvegarderDonneeOutil(cle, valeur) {
    if (!utilisateur) return;
    if (!utilisateur.outilsPro) utilisateur.outilsPro = {};
    utilisateur.outilsPro[cle] = valeur;
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
}

function lireDonneeOutil(cle, def) {
    return (utilisateur && utilisateur.outilsPro && utilisateur.outilsPro[cle] != null) ? utilisateur.outilsPro[cle] : def;
}

function afficherResultatOutil(titre, contenuHtml) {
    const box = document.getElementById('outilProResultat');
    if (!box) return;
    box.innerHTML = `<div style="background:var(--input-bg, rgba(2,6,23,0.6)); border:1px solid var(--border-color); border-radius:12px; padding:12px;">
        <strong style="color:var(--success); font-size:13px;">${titre}</strong>
        <div style="margin-top:8px; font-size:12.5px; line-height:1.45;">${contenuHtml}</div>
    </div>`;
}

// --- Actions outils ---
function outilDevis() {
    const produit = prompt('Produit / service :');
    if (produit === null) return;
    const cout = parseFloat(prompt('Coût pour toi :', lireDonneeOutil('dernierCout', '0')) || '0');
    const prix = parseFloat(prompt('Prix de vente :', lireDonneeOutil('dernierPrix', '0')) || '0');
    const marge = prix - cout;
    const pct = prix > 0 ? Math.round((marge / prix) * 100) : 0;
    sauvegarderDonneeOutil('dernierCout', cout);
    sauvegarderDonneeOutil('dernierPrix', prix);
    afficherResultatOutil('💰 Devis rapide', `<p><b>${produit}</b></p><p>Coût : ${cout} · Prix : ${prix}</p><p style="color:var(--success);">Marge : ${marge} (${pct}%)</p><p style="font-size:11px; color:var(--text-secondary);">Astuce EVAT : vise une marge saine et note chaque vente dans tes contacts.</p>`);
}
function outilStock() {
    const liste = prompt('Liste produits (ex: Riz:20, Huile:5) :', lireDonneeOutil('stock', ''));
    if (liste === null) return;
    sauvegarderDonneeOutil('stock', liste);
    afficherResultatOutil('📦 Stock', `<p style="white-space:pre-wrap;">${liste || 'Aucun produit noté.'}</p>`);
}
function outilClients() {
    switchTab('contacts');
    alert('Utilise l\'annuaire pour tes clients. Ajoute nom + numéro + métier.');
}
function outilObjectifsVente() {
    const obj = prompt('Objectif de vente (montant ou quantité) :', lireDonneeOutil('objVente', ''));
    if (obj === null) return;
    const fait = prompt('Réalisé jusqu\'ici :', lireDonneeOutil('faitVente', '0'));
    sauvegarderDonneeOutil('objVente', obj);
    sauvegarderDonneeOutil('faitVente', fait);
    afficherResultatOutil('🎯 Objectifs de vente', `<p>Objectif : <b>${obj}</b></p><p>Réalisé : <b>${fait}</b></p>`);
}
function outilChecklist() {
    const t = prompt('Tâches du jour (séparées par des virgules) :', lireDonneeOutil('checklist', 'Relire dossiers, Appeler X, Envoyer rapport'));
    if (t === null) return;
    sauvegarderDonneeOutil('checklist', t);
    const items = t.split(',').map(s => s.trim()).filter(Boolean);
    afficherResultatOutil('✅ Checklist', '<ul style="margin:0; padding-left:18px;">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>');
}
function outilCourrier() {
    const dest = prompt('Destinataire :', '');
    const objet = prompt('Objet :', '');
    if (objet === null) return;
    const modele = `Objet : ${objet}\n\nBonjour ${dest || ''},\n\n[Votre message ici]\n\nCordialement,\n${utilisateur?.nom || ''}`;
    afficherResultatOutil('✉️ Modèle de courrier', `<pre style="white-space:pre-wrap; font-size:12px; margin:0;">${modele}</pre>`);
}
function outilPlanning() {
    const p = prompt('Planning (ex: 8h-10h: dossier A, 10h-12h: réunions) :', lireDonneeOutil('planning', ''));
    if (p === null) return;
    sauvegarderDonneeOutil('planning', p);
    afficherResultatOutil('🗓️ Planning', `<p style="white-space:pre-wrap;">${p}</p>`);
}
function outilNotesReunion() {
    const n = prompt('Décisions & actions de la réunion :', '');
    if (n === null) return;
    if (!utilisateur.notes) utilisateur.notes = [];
    utilisateur.notes.unshift({ titre: 'Réunion ' + new Date().toLocaleDateString(), contenu: n });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    afficherNotesBlocNotes();
    afficherResultatOutil('📝 Note de réunion', `<p>Enregistrée dans tes notes.</p><p style="white-space:pre-wrap;">${n}</p>`);
}
function outilBugs() {
    const b = prompt('Bug / incident à tracer :', '');
    if (!b) return;
    const prev = lireDonneeOutil('bugs', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift({ t: b, d: new Date().toLocaleString() });
    sauvegarderDonneeOutil('bugs', arr.slice(0, 30));
    afficherResultatOutil('🐛 Journal de bugs', arr.slice(0, 5).map(x => `<div style="margin-bottom:6px;"><b>${x.d}</b><br>${x.t}</div>`).join(''));
}
function outilSpecs() {
    const s = prompt('Décris la fonctionnalité (qui / quoi / pourquoi) :', '');
    if (s === null) return;
    afficherResultatOutil('📄 Mini specs', `<p style="white-space:pre-wrap;">${s}</p><p style="font-size:11px; color:var(--text-secondary);">Garde ça comme référence avant de coder ou de déléguer.</p>`);
}
function outilDeploy() {
    afficherResultatOutil('🚀 Checklist déploiement', `<ul style="padding-left:18px; margin:0;">
        <li>Tests OK</li><li>Backup fait</li><li>Variables d'env vérifiées</li>
        <li>Migration DB si besoin</li><li>Monitoring prêt</li><li>Rollback possible</li>
    </ul>`);
}
function outilBacklog() {
    const i = prompt('Idée / amélioration :', '');
    if (!i) return;
    const prev = lireDonneeOutil('backlog', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift(i);
    sauvegarderDonneeOutil('backlog', arr.slice(0, 40));
    afficherResultatOutil('💡 Backlog', arr.slice(0, 8).map(x => `• ${x}`).join('<br>'));
}
function outilSaison() {
    afficherResultatOutil('🌾 Repères culturaux', `<p>Adapte à ta zone :</p><ul style="padding-left:18px; margin:0;">
        <li>Saison des pluies : préparer sols / semis</li>
        <li>Saison sèche : irrigation, récoltes, stockage</li>
        <li>Note tes dates réelles ici chaque mois</li>
    </ul>`);
}
function outilDepensesAgri() {
    const d = prompt('Dépense (ex: Engrais 15000) :', '');
    if (!d) return;
    const prev = lireDonneeOutil('depAgri', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift({ d, t: new Date().toLocaleDateString() });
    sauvegarderDonneeOutil('depAgri', arr.slice(0, 50));
    afficherResultatOutil('💸 Dépenses', arr.slice(0, 8).map(x => `${x.t} — ${x.d}`).join('<br>'));
}
function outilRecolte() {
    const r = prompt('Récolte / production (quantité + produit) :', '');
    if (!r) return;
    sauvegarderDonneeOutil('derniereRecolte', r);
    afficherResultatOutil('📊 Production', `<p>${r}</p>`);
}
function outilPrixMarche() {
    const p = prompt('Prix observés aujourd\'hui :', lireDonneeOutil('prixMarche', ''));
    if (p === null) return;
    sauvegarderDonneeOutil('prixMarche', p);
    afficherResultatOutil('🏷️ Prix du marché', `<p style="white-space:pre-wrap;">${p}</p>`);
}
function outilPlanCours() {
    const c = prompt('Titre de la séance + objectifs :', '');
    if (!c) return;
    afficherResultatOutil('📚 Plan de cours', `<p style="white-space:pre-wrap;">${c}</p><p style="font-size:11px; color:var(--text-secondary);">Découpe : intro → activité → synthèse → évaluation.</p>`);
}
function outilEleves() {
    const e = prompt('Nom apprenant + remarque :', '');
    if (!e) return;
    const prev = lireDonneeOutil('eleves', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift(e);
    sauvegarderDonneeOutil('eleves', arr.slice(0, 40));
    afficherResultatOutil('👩‍🎓 Suivi', arr.slice(0, 8).map(x => `• ${x}`).join('<br>'));
}
function outilEval() {
    afficherResultatOutil('📏 Grille d\'évaluation', `<ul style="padding-left:18px; margin:0;">
        <li>Compréhension (0-5)</li><li>Application (0-5)</li>
        <li>Participation (0-5)</li><li>Autonomie (0-5)</li>
    </ul>`);
}
function outilRessources() {
    const r = prompt('Ressources (liens, livres, supports) :', lireDonneeOutil('ressources', ''));
    if (r === null) return;
    sauvegarderDonneeOutil('ressources', r);
    afficherResultatOutil('📎 Ressources', `<p style="white-space:pre-wrap;">${r}</p>`);
}
function outilRdv() {
    const r = prompt('Rendez-vous (heure + nom) :', '');
    if (!r) return;
    const prev = lireDonneeOutil('rdv', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift(r);
    sauvegarderDonneeOutil('rdv', arr.slice(0, 20));
    afficherResultatOutil('📅 Agenda', arr.map(x => `• ${x}`).join('<br>'));
}
function outilRappels() {
    const r = prompt('Rappel à ne pas oublier :', '');
    if (!r) return;
    afficherResultatOutil('🔔 Rappel', `<p>${r}</p>`);
}
function outilProtocole() {
    afficherResultatOutil('📋 Protocole type', `<ol style="padding-left:18px; margin:0;">
        <li>Accueil</li><li>Écoute / anamnèse</li><li>Action / soin</li>
        <li>Conseils</li><li>Suivi</li>
    </ol>`);
}
function outilStockSante() {
    const s = prompt('Stock matériel / consommables :', lireDonneeOutil('stockSante', ''));
    if (s === null) return;
    sauvegarderDonneeOutil('stockSante', s);
    afficherResultatOutil('💊 Stock', `<p style="white-space:pre-wrap;">${s}</p>`);
}
function outilTrajets() {
    const t = prompt('Trajets du jour :', lireDonneeOutil('trajets', ''));
    if (t === null) return;
    sauvegarderDonneeOutil('trajets', t);
    afficherResultatOutil('🗺️ Feuille de route', `<p style="white-space:pre-wrap;">${t}</p>`);
}
function outilCarburant() {
    const c = prompt('Carburant (litres / coût) :', '');
    if (!c) return;
    afficherResultatOutil('⛽ Carburant', `<p>${c}</p>`);
}
function outilLivraisons() {
    const l = prompt('Livraisons (client + statut) :', lireDonneeOutil('livraisons', ''));
    if (l === null) return;
    sauvegarderDonneeOutil('livraisons', l);
    afficherResultatOutil('📦 Livraisons', `<p style="white-space:pre-wrap;">${l}</p>`);
}
function outilEntretien() {
    const e = prompt('Entretien véhicule (date + type) :', '');
    if (!e) return;
    afficherResultatOutil('🔩 Entretien', `<p>${e}</p>`);
}
function outilDevisArtisan() {
    const main = parseFloat(prompt('Main d\'œuvre :', '0') || '0');
    const mat = parseFloat(prompt('Matériaux :', '0') || '0');
    const total = main + mat;
    afficherResultatOutil('🏗️ Devis chantier', `<p>Main d'œuvre : ${main}</p><p>Matériaux : ${mat}</p><p style="color:var(--success);"><b>Total : ${total}</b></p>`);
}
function outilMateriaux() {
    const m = prompt('Liste matériaux :', lireDonneeOutil('materiaux', ''));
    if (m === null) return;
    sauvegarderDonneeOutil('materiaux', m);
    afficherResultatOutil('🧱 Matériaux', `<p style="white-space:pre-wrap;">${m}</p>`);
}
function outilChantiers() {
    const c = prompt('Chantier + avancement % :', '');
    if (!c) return;
    afficherResultatOutil('🏡 Chantier', `<p>${c}</p>`);
}
function outilNotesChantier() {
    const n = prompt('Notes de terrain :', '');
    if (!n) return;
    if (!utilisateur.notes) utilisateur.notes = [];
    utilisateur.notes.unshift({ titre: 'Chantier ' + new Date().toLocaleDateString(), contenu: n });
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
    afficherNotesBlocNotes();
    afficherResultatOutil('📝 Notes chantier', `<p>${n}</p>`);
}
function outilTresorerie() {
    const e = parseFloat(prompt('Entrées du mois :', lireDonneeOutil('cashIn', '0')) || '0');
    const s = parseFloat(prompt('Sorties du mois :', lireDonneeOutil('cashOut', '0')) || '0');
    sauvegarderDonneeOutil('cashIn', e);
    sauvegarderDonneeOutil('cashOut', s);
    afficherResultatOutil('💵 Trésorerie', `<p>Entrées : ${e}</p><p>Sorties : ${s}</p><p style="color:var(--success);"><b>Solde : ${e - s}</b></p>`);
}
function outilOffre() {
    const o = prompt('Que vends-tu, à qui, quel problème tu résous ?', lireDonneeOutil('offre', ''));
    if (o === null) return;
    sauvegarderDonneeOutil('offre', o);
    afficherResultatOutil('🎯 Offre de valeur', `<p style="white-space:pre-wrap;">${o}</p>`);
}
function outilPipeline() {
    const p = prompt('Prospects (nom → étape) :', lireDonneeOutil('pipeline', ''));
    if (p === null) return;
    sauvegarderDonneeOutil('pipeline', p);
    afficherResultatOutil('🧲 Pipeline', `<p style="white-space:pre-wrap;">${p}</p>`);
}
function outilKpi() {
    const k = prompt('Indicateurs du mois (CA, clients, etc.) :', lireDonneeOutil('kpi', ''));
    if (k === null) return;
    sauvegarderDonneeOutil('kpi', k);
    afficherResultatOutil('📈 KPI', `<p style="white-space:pre-wrap;">${k}</p>`);
}
function outilTodo() {
    const t = prompt('3 priorités du jour :', lireDonneeOutil('todo', ''));
    if (t === null) return;
    sauvegarderDonneeOutil('todo', t);
    afficherResultatOutil('✅ To-do', `<p style="white-space:pre-wrap;">${t}</p>`);
}
function outilIdees() {
    const i = prompt('Idée à capturer :', '');
    if (!i) return;
    const prev = lireDonneeOutil('idees', []);
    const arr = Array.isArray(prev) ? prev : [];
    arr.unshift(i);
    sauvegarderDonneeOutil('idees', arr.slice(0, 50));
    afficherResultatOutil('💡 Idées', arr.slice(0, 10).map(x => `• ${x}`).join('<br>'));
}
function outilFocus() {
    afficherResultatOutil('🎯 Session focus', `<p>Choisis <b>une</b> tâche. Coupe les distractions. 25 minutes. Puis pause 5 minutes.</p><p style="font-size:11px; color:var(--text-secondary);">Répète 3 à 4 cycles pour une matinée productive.</p>`);
}
function outilBilan() {
    const b = prompt('Qu\'as-tu terminé aujourd\'hui ?', '');
    if (b === null) return;
    afficherResultatOutil('🌙 Bilan', `<p style="white-space:pre-wrap;">${b}</p><p style="font-size:11px; color:var(--text-secondary);">Ce qui est mesuré s'améliore. Reviens demain avec 3 priorités.</p>`);
}


function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab-' + tabId);
    if(target) target.style.display = 'block';
    const link = document.getElementById('link-' + tabId);
    if(link) link.classList.add('active');
    fermerTousLesMenus();

    if(tabId === 'contacts') afficherContacts();
    if(tabId === 'outils') { afficherOutilsPro(); afficherNotesBlocNotes(); }
    if(tabId === 'dashboard') afficherOutilsProDashboard();
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

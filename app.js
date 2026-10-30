
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
        },
        equipe: {
            nom: '',
            role: 'membre',
            membres: [],
            taches: [],
            rapports: []
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


// ========== GESTION D'ÉQUIPE & SUPERVISION ==========
function assurerStructureEquipe() {
    if (!utilisateur) return;
    if (!utilisateur.equipe) {
        utilisateur.equipe = { nom: '', role: 'membre', membres: [], taches: [], rapports: [] };
    }
    if (!Array.isArray(utilisateur.equipe.membres)) utilisateur.equipe.membres = [];
    if (!Array.isArray(utilisateur.equipe.taches)) utilisateur.equipe.taches = [];
    if (!Array.isArray(utilisateur.equipe.rapports)) utilisateur.equipe.rapports = [];
}

function sauvegarderEquipe() {
    if (!utilisateur) return;
    localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
}

function creerOuModifierEquipe() {
    assurerStructureEquipe();
    const nom = prompt('Nom de l\'équipe :', utilisateur.equipe.nom || '');
    if (nom === null) return;
    if (!nom.trim()) { alert('Le nom est obligatoire.'); return; }
    utilisateur.equipe.nom = nom.trim();
    utilisateur.equipe.role = 'superviseur';
    // S'assurer que le créateur est dans les membres
    const moi = utilisateur.telephone;
    if (!utilisateur.equipe.membres.find(m => m.telephone === moi)) {
        utilisateur.equipe.membres.unshift({
            nom: utilisateur.nom,
            telephone: utilisateur.telephone,
            metier: utilisateur.metier || '',
            role: 'superviseur',
            statut: 'actif',
            ajouteLe: new Date().toISOString()
        });
    } else {
        const m = utilisateur.equipe.membres.find(m => m.telephone === moi);
        m.role = 'superviseur';
        m.statut = 'actif';
    }
    sauvegarderEquipe();
    afficherEquipe();
    alert('Équipe « ' + utilisateur.equipe.nom + ' » prête. Vous êtes superviseur.');
}

function ajouterMembreEquipe() {
    assurerStructureEquipe();
    if (!utilisateur.equipe.nom) {
        alert('Créez d\'abord une équipe.');
        return;
    }
    if (utilisateur.equipe.role !== 'superviseur' && utilisateur.equipe.role !== 'chef') {
        alert('Seul un superviseur ou chef peut ajouter des membres.');
        return;
    }
    const nom = prompt('Nom du membre :');
    if (!nom) return;
    const tel = prompt('Téléphone / ID VoIP (ex: +228...) :');
    if (!tel) return;
    const role = prompt('Rôle : membre, chef ou superviseur ?', 'membre');
    const roleClean = (role || 'membre').toLowerCase().trim();
    if (!['membre', 'chef', 'superviseur'].includes(roleClean)) {
        alert('Rôle invalide. Utilisez: membre, chef ou superviseur.');
        return;
    }
    const cleanTel = tel.replace(/\s+/g, '').trim();
    if (utilisateur.equipe.membres.find(m => m.telephone === cleanTel)) {
        alert('Ce membre est déjà dans l\'équipe.');
        return;
    }
    utilisateur.equipe.membres.push({
        nom: nom.trim(),
        telephone: cleanTel,
        metier: '',
        role: roleClean,
        statut: 'actif',
        ajouteLe: new Date().toISOString()
    });
    // Ajouter aussi aux contacts si absent
    if (!utilisateur.contacts) utilisateur.contacts = [];
    if (!utilisateur.contacts.find(c => c.telephone === cleanTel)) {
        utilisateur.contacts.push({ nom: nom.trim(), telephone: cleanTel, metier: 'Équipe' });
    }
    sauvegarderEquipe();
    afficherEquipe();
    afficherContacts();
    // Notifier via socket si possible
    try {
        socket.emit('signal', {
            type: 'equipe_invite',
            sender: utilisateur.nom,
            target: cleanTel,
            equipe: utilisateur.equipe.nom
        });
    } catch (e) {}
    alert('Membre ajouté.');
}

function retirerMembreEquipe(index) {
    assurerStructureEquipe();
    if (utilisateur.equipe.role !== 'superviseur' && utilisateur.equipe.role !== 'chef') {
        alert('Action réservée au superviseur / chef.');
        return;
    }
    const m = utilisateur.equipe.membres[index];
    if (!m) return;
    if (m.telephone === utilisateur.telephone) {
        alert('Vous ne pouvez pas vous retirer ainsi. Transférez d\'abord le rôle superviseur.');
        return;
    }
    if (!confirm('Retirer ' + m.nom + ' de l\'équipe ?')) return;
    utilisateur.equipe.membres.splice(index, 1);
    // Nettoyer ses tâches assignées
    utilisateur.equipe.taches = utilisateur.equipe.taches.filter(t => t.assigneTel !== m.telephone);
    sauvegarderEquipe();
    afficherEquipe();
}

function changerRoleMembre(index) {
    assurerStructureEquipe();
    if (utilisateur.equipe.role !== 'superviseur') {
        alert('Seul le superviseur peut changer les rôles.');
        return;
    }
    const m = utilisateur.equipe.membres[index];
    if (!m) return;
    const role = prompt('Nouveau rôle pour ' + m.nom + ' (membre / chef / superviseur) :', m.role);
    if (!role) return;
    const r = role.toLowerCase().trim();
    if (!['membre', 'chef', 'superviseur'].includes(r)) {
        alert('Rôle invalide.');
        return;
    }
    m.role = r;
    if (m.telephone === utilisateur.telephone) utilisateur.equipe.role = r;
    sauvegarderEquipe();
    afficherEquipe();
}

function assignerTacheEquipe() {
    assurerStructureEquipe();
    if (!utilisateur.equipe.nom) {
        alert('Créez d\'abord une équipe.');
        return;
    }
    if (utilisateur.equipe.role !== 'superviseur' && utilisateur.equipe.role !== 'chef') {
        alert('Réservé au superviseur / chef.');
        return;
    }
    if (utilisateur.equipe.membres.length === 0) {
        alert('Ajoutez des membres d\'abord.');
        return;
    }
    const titre = prompt('Titre de la tâche :');
    if (!titre) return;
    const detail = prompt('Détail / consigne :', '') || '';
    const liste = utilisateur.equipe.membres.map((m, i) => (i + 1) + '. ' + m.nom + ' (' + m.telephone + ')').join('\n');
    const choix = prompt('Assigner à quel n° ?\n' + liste, '1');
    const idx = parseInt(choix, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= utilisateur.equipe.membres.length) {
        alert('Choix invalide.');
        return;
    }
    const membre = utilisateur.equipe.membres[idx];
    const echeance = prompt('Échéance (ex: 2026-11-05) :', '') || '';
    utilisateur.equipe.taches.unshift({
        id: 't' + Date.now(),
        titre: titre.trim(),
        detail: detail.trim(),
        assigneNom: membre.nom,
        assigneTel: membre.telephone,
        par: utilisateur.nom,
        statut: 'a_faire',
        echeance: echeance,
        creeLe: new Date().toISOString()
    });
    sauvegarderEquipe();
    afficherEquipe();
    alert('Tâche assignée à ' + membre.nom);
}

function changerStatutTache(tacheId, nouveauStatut) {
    assurerStructureEquipe();
    const t = utilisateur.equipe.taches.find(x => x.id === tacheId);
    if (!t) return;
    // Membre ne peut modifier que ses tâches ; superviseur/chef toutes
    const estSuper = utilisateur.equipe.role === 'superviseur' || utilisateur.equipe.role === 'chef';
    if (!estSuper && t.assigneTel !== utilisateur.telephone) {
        alert('Vous ne pouvez modifier que vos propres tâches.');
        return;
    }
    t.statut = nouveauStatut;
    t.majLe = new Date().toISOString();
    sauvegarderEquipe();
    afficherEquipe();
}

function supprimerTache(tacheId) {
    assurerStructureEquipe();
    if (utilisateur.equipe.role !== 'superviseur' && utilisateur.equipe.role !== 'chef') {
        alert('Réservé au superviseur / chef.');
        return;
    }
    if (!confirm('Supprimer cette tâche ?')) return;
    utilisateur.equipe.taches = utilisateur.equipe.taches.filter(t => t.id !== tacheId);
    sauvegarderEquipe();
    afficherEquipe();
}

function deposerRapportSupervision() {
    assurerStructureEquipe();
    const texte = prompt('Rapport / point de situation :');
    if (!texte) return;
    utilisateur.equipe.rapports.unshift({
        id: 'r' + Date.now(),
        auteur: utilisateur.nom,
        auteurTel: utilisateur.telephone,
        texte: texte.trim(),
        date: new Date().toISOString()
    });
    if (utilisateur.equipe.rapports.length > 50) {
        utilisateur.equipe.rapports = utilisateur.equipe.rapports.slice(0, 50);
    }
    sauvegarderEquipe();
    afficherEquipe();
}

function labelStatutTache(s) {
    if (s === 'fait') return '✅ Fait';
    if (s === 'en_cours') return '🔄 En cours';
    if (s === 'bloque') return '⛔ Bloqué';
    return '📋 À faire';
}

function afficherEquipe() {
    const root = document.getElementById('equipeContainer');
    if (!root || !utilisateur) return;
    assurerStructureEquipe();
    const eq = utilisateur.equipe;
    const estSuper = eq.role === 'superviseur' || eq.role === 'chef';

    let html = '';

    // En-tête
    if (!eq.nom) {
        html += `<div style="text-align:center; padding:12px 0;">
            <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">Aucune équipe pour l'instant. Créez-en une pour superviser vos collaborateurs et suivre le travail.</p>
            <button onclick="creerOuModifierEquipe()" class="btn-action" style="background:linear-gradient(135deg,#10b981,#059669);">➕ Créer mon équipe</button>
        </div>`;
        root.innerHTML = html;
        return;
    }

    html += `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <div>
            <strong style="color:var(--accent); font-size:14px;">👥 ${eq.nom}</strong>
            <div style="font-size:11px; color:var(--text-secondary);">Votre rôle : <b style="color:var(--success);">${eq.role}</b> · ${eq.membres.length} membre(s)</div>
        </div>
        <button onclick="creerOuModifierEquipe()" class="btn-action" style="width:auto; padding:8px 12px; font-size:11px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">✏️ Renommer</button>
    </div>`;

    // Stats supervision
    const total = eq.taches.length;
    const faits = eq.taches.filter(t => t.statut === 'fait').length;
    const enCours = eq.taches.filter(t => t.statut === 'en_cours').length;
    const aFaire = eq.taches.filter(t => t.statut === 'a_faire').length;
    const bloques = eq.taches.filter(t => t.statut === 'bloque').length;
    html += `<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:14px;">
        <div style="background:rgba(2,6,23,0.5); border:1px solid var(--border-color); border-radius:10px; padding:8px; text-align:center;">
            <div style="font-size:16px; font-weight:700; color:var(--accent);">${total}</div>
            <div style="font-size:9px; color:var(--text-secondary);">TÂCHES</div>
        </div>
        <div style="background:rgba(2,6,23,0.5); border:1px solid var(--border-color); border-radius:10px; padding:8px; text-align:center;">
            <div style="font-size:16px; font-weight:700; color:var(--success);">${faits}</div>
            <div style="font-size:9px; color:var(--text-secondary);">FAIT</div>
        </div>
        <div style="background:rgba(2,6,23,0.5); border:1px solid var(--border-color); border-radius:10px; padding:8px; text-align:center;">
            <div style="font-size:16px; font-weight:700; color:#fbbf24;">${enCours}</div>
            <div style="font-size:9px; color:var(--text-secondary);">EN COURS</div>
        </div>
        <div style="background:rgba(2,6,23,0.5); border:1px solid var(--border-color); border-radius:10px; padding:8px; text-align:center;">
            <div style="font-size:16px; font-weight:700; color:#f87171;">${aFaire + bloques}</div>
            <div style="font-size:9px; color:var(--text-secondary);">RESTE</div>
        </div>
    </div>`;

    // Actions superviseur
    if (estSuper) {
        html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
            <button onclick="ajouterMembreEquipe()" class="btn-action" style="width:auto; flex:1; min-width:120px; padding:8px; font-size:11px; background:linear-gradient(135deg,#10b981,#059669);">➕ Membre</button>
            <button onclick="assignerTacheEquipe()" class="btn-action" style="width:auto; flex:1; min-width:120px; padding:8px; font-size:11px;">📋 Assigner tâche</button>
        </div>`;
    }
    html += `<div style="margin-bottom:14px;">
        <button onclick="deposerRapportSupervision()" class="btn-action" style="font-size:12px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">📝 Déposer un rapport</button>
    </div>`;

    // Membres
    html += `<h3 style="font-size:13px; color:var(--accent); margin:0 0 8px 0;">Membres</h3>`;
    if (eq.membres.length === 0) {
        html += `<p style="font-size:12px; color:var(--text-secondary);">Aucun membre.</p>`;
    } else {
        eq.membres.forEach((m, index) => {
            const tachesM = eq.taches.filter(t => t.assigneTel === m.telephone);
            const faitsM = tachesM.filter(t => t.statut === 'fait').length;
            html += `<div style="background:var(--bg-color,#030712); border:1px solid var(--border-color); border-radius:10px; padding:10px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div>
                    <strong style="font-size:12.5px; color:var(--text-primary);">${m.nom}</strong>
                    <div style="font-size:11px; color:var(--text-secondary);">${m.telephone} · <span style="color:var(--success);">${m.role}</span></div>
                    <div style="font-size:10px; color:var(--text-secondary);">${faitsM}/${tachesM.length} tâche(s) terminée(s)</div>
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button onclick="preparerAppel('${m.telephone}')" class="btn-action" style="width:auto; padding:5px 8px; font-size:10px; background:var(--success);">📞</button>
                    ${estSuper ? `<button onclick="changerRoleMembre(${index})" class="btn-action" style="width:auto; padding:5px 8px; font-size:10px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">Rôle</button>` : ''}
                    ${estSuper && m.telephone !== utilisateur.telephone ? `<button onclick="retirerMembreEquipe(${index})" class="btn-action" style="width:auto; padding:5px 8px; font-size:10px; background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.4); box-shadow:none;">✕</button>` : ''}
                </div>
            </div>`;
        });
    }

    // Tâches
    html += `<h3 style="font-size:13px; color:var(--accent); margin:14px 0 8px 0;">Supervision des tâches</h3>`;
    if (eq.taches.length === 0) {
        html += `<p style="font-size:12px; color:var(--text-secondary);">Aucune tâche assignée.</p>`;
    } else {
        eq.taches.forEach(t => {
            html += `<div style="background:var(--bg-color,#030712); border:1px solid var(--border-color); border-radius:10px; padding:10px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                    <strong style="font-size:12.5px;">${t.titre}</strong>
                    <span style="font-size:11px;">${labelStatutTache(t.statut)}</span>
                </div>
                <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">→ ${t.assigneNom} · par ${t.par}${t.echeance ? ' · échéance ' + t.echeance : ''}</div>
                ${t.detail ? `<p style="font-size:12px; margin:6px 0 0 0;">${t.detail}</p>` : ''}
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                    <button onclick="changerStatutTache('${t.id}','a_faire')" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:rgba(148,163,184,0.2); color:var(--text-secondary); box-shadow:none;">À faire</button>
                    <button onclick="changerStatutTache('${t.id}','en_cours')" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:rgba(251,191,36,0.2); color:#fbbf24; box-shadow:none;">En cours</button>
                    <button onclick="changerStatutTache('${t.id}','fait')" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:rgba(52,211,153,0.2); color:var(--success); box-shadow:none;">Fait</button>
                    <button onclick="changerStatutTache('${t.id}','bloque')" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:rgba(248,113,113,0.2); color:#f87171; box-shadow:none;">Bloqué</button>
                    ${estSuper ? `<button onclick="supprimerTache('${t.id}')" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:transparent; color:#f87171; box-shadow:none;">Suppr.</button>` : ''}
                </div>
            </div>`;
        });
    }

    // Rapports
    html += `<h3 style="font-size:13px; color:var(--accent); margin:14px 0 8px 0;">Rapports de supervision</h3>`;
    if (eq.rapports.length === 0) {
        html += `<p style="font-size:12px; color:var(--text-secondary);">Aucun rapport.</p>`;
    } else {
        eq.rapports.slice(0, 10).forEach(r => {
            const d = r.date ? new Date(r.date).toLocaleString() : '';
            html += `<div style="background:var(--bg-color,#030712); border:1px solid var(--border-color); border-radius:10px; padding:10px; margin-bottom:6px;">
                <div style="font-size:10px; color:var(--accent);">${r.auteur} · ${d}</div>
                <p style="font-size:12px; margin:4px 0 0 0; white-space:pre-wrap;">${r.texte}</p>
            </div>`;
        });
    }

    root.innerHTML = html;
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
    if(tabId === 'equipe') afficherEquipe();
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

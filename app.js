
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
    assurerStructureJour();
    majResumeJourDashboard();
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

// ========== ELAWS GRAND PUBLIC + VIE QUOTIDIENNE + JOUR ==========
let elawsBusy = false;
let elawsHistory = [];
let elawsMode = 'grand_public'; // grand_public | formation | chat

function echapperHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
function nettoyerReponseIA(texte) {
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

function assurerStructureJour() {
    if (!utilisateur) return;
    if (!utilisateur.vieQuotidienne) {
        utilisateur.vieQuotidienne = {
            budget: { solde: 0, notes: '' },
            famille: [],
            demarches: [],
            astuces: []
        };
    }
    if (!utilisateur.tableauJour) {
        utilisateur.tableauJour = { date: '', pro: '', perso: '', formation: '' };
    }
}

function sauvegarderProfilLocal() {
    if (utilisateur) localStorage.setItem('evat_profil', JSON.stringify(utilisateur));
}

// ----- Tableau de bord du jour -----
function dateDuJourISO() {
    return new Date().toISOString().slice(0, 10);
}

function afficherTableauJour() {
    assurerStructureJour();
    const el = document.getElementById('tableauJourContainer');
    if (!el || !utilisateur) return;
    const tj = utilisateur.tableauJour;
    if (tj.date !== dateDuJourISO()) {
        // nouveau jour : on garde les textes mais on marque la date
        tj.date = dateDuJourISO();
        sauvegarderProfilLocal();
    }
    el.innerHTML = `
        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">Aujourd'hui · ${tj.date}</div>
        <label style="font-size:11px;">1. Action pro / travail</label>
        <input type="text" id="jourPro" class="input" placeholder="Ex: Appeler 3 clients" value="${echapperHtml(tj.pro || '')}">
        <label style="font-size:11px;">2. Action perso / vie quotidienne</label>
        <input type="text" id="jourPerso" class="input" placeholder="Ex: Payer facture / courses" value="${echapperHtml(tj.perso || '')}">
        <label style="font-size:11px;">3. Formation / progression</label>
        <input type="text" id="jourFormation" class="input" placeholder="Ex: 15 min leçon prix & marge" value="${echapperHtml(tj.formation || '')}">
        <button onclick="sauvegarderTableauJour()" class="btn-action" style="background:linear-gradient(135deg,#10b981,#059669); margin-top:4px;">💾 Enregistrer ma journée</button>
        <button onclick="demanderConseilJourElaws()" class="btn-action" style="margin-top:8px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">🤖 ELAWS : m'aider à prioriser</button>
    `;
}

function sauvegarderTableauJour() {
    assurerStructureJour();
    utilisateur.tableauJour = {
        date: dateDuJourISO(),
        pro: (document.getElementById('jourPro')?.value || '').trim(),
        perso: (document.getElementById('jourPerso')?.value || '').trim(),
        formation: (document.getElementById('jourFormation')?.value || '').trim()
    };
    sauvegarderProfilLocal();
    const dash = document.getElementById('dashResumeJour');
    if (dash) majResumeJourDashboard();
    alert('Journée enregistrée.');
}

function majResumeJourDashboard() {
    const dash = document.getElementById('dashResumeJour');
    if (!dash || !utilisateur) return;
    assurerStructureJour();
    const tj = utilisateur.tableauJour || {};
    const lignes = [];
    if (tj.pro) lignes.push('💼 ' + tj.pro);
    if (tj.perso) lignes.push('🏠 ' + tj.perso);
    if (tj.formation) lignes.push('📚 ' + tj.formation);
    if (lignes.length === 0) {
        dash.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); margin:0;">Définis tes 3 actions du jour pour avancer clairement.</p>
        <button onclick="switchTab('vie-quotidienne')" class="btn-action" style="margin-top:8px; font-size:12px;">Ouvrir le tableau du jour</button>`;
    } else {
        dash.innerHTML = `<div style="font-size:12.5px; line-height:1.5;">${lignes.map(l => echapperHtml(l)).join('<br>')}</div>
        <button onclick="switchTab('vie-quotidienne')" class="btn-action" style="margin-top:8px; font-size:11px; background:rgba(56,189,248,0.15); color:var(--accent); border:1px solid var(--border-color); box-shadow:none;">Modifier</button>`;
    }
}

function demanderConseilJourElaws() {
    assurerStructureJour();
    const pro = document.getElementById('jourPro')?.value || utilisateur.tableauJour.pro || '';
    const perso = document.getElementById('jourPerso')?.value || utilisateur.tableauJour.perso || '';
    const form = document.getElementById('jourFormation')?.value || utilisateur.tableauJour.formation || '';
    elawsMode = 'grand_public';
    switchTab('elaws-ia');
    const input = document.getElementById('elawsInput');
    if (input) {
        input.value = `Voici mes 3 actions du jour — pro: «${pro||'vide'}», perso: «${perso||'vide'}», formation: «${form||'vide'}». Aide-moi à prioriser et donne 3 conseils concrets pour réussir cette journée. Réponse courte et simple.`;
        poserQuestionElaws();
    }
}

// ----- Vie quotidienne -----
function afficherVieQuotidienne() {
    assurerStructureJour();
    afficherTableauJour();
    const vq = utilisateur.vieQuotidienne;
    const budgetEl = document.getElementById('vqBudgetSolde');
    const notesEl = document.getElementById('vqBudgetNotes');
    if (budgetEl) budgetEl.value = vq.budget?.solde ?? '';
    if (notesEl) notesEl.value = vq.budget?.notes || '';

    const fam = document.getElementById('vqFamilleListe');
    if (fam) {
        if (!vq.famille.length) fam.innerHTML = '<p style="font-size:12px; color:var(--text-secondary);">Aucun contact famille / confiance pour l’instant.</p>';
        else fam.innerHTML = vq.famille.map((c, i) =>
            `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:6px;">
                <div><strong style="font-size:12.5px;">${echapperHtml(c.nom)}</strong><div style="font-size:11px; color:var(--text-secondary);">${echapperHtml(c.tel)} · ${echapperHtml(c.lien || '')}</div></div>
                <div style="display:flex; gap:4px;">
                    <button onclick="preparerAppel('${echapperHtml(c.tel)}')" class="btn-action" style="width:auto; padding:5px 8px; font-size:10px; background:var(--success);">📞</button>
                    <button onclick="retirerContactFamille(${i})" class="btn-action" style="width:auto; padding:5px 8px; font-size:10px; background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.4); box-shadow:none;">✕</button>
                </div>
            </div>`
        ).join('');
    }

    const dem = document.getElementById('vqDemarchesListe');
    if (dem) {
        if (!vq.demarches.length) dem.innerHTML = '<p style="font-size:12px; color:var(--text-secondary);">Aucune démarche en cours.</p>';
        else dem.innerHTML = vq.demarches.map((d, i) =>
            `<div style="padding:8px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:6px;">
                <strong style="font-size:12.5px;">${d.fait ? '✅ ' : '⏳ '}${echapperHtml(d.titre)}</strong>
                ${d.detail ? `<div style="font-size:11px; color:var(--text-secondary);">${echapperHtml(d.detail)}</div>` : ''}
                <div style="margin-top:6px; display:flex; gap:4px;">
                    <button onclick="toggleDemarche(${i})" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px;">${d.fait ? 'Réouvrir' : 'Fait'}</button>
                    <button onclick="retirerDemarche(${i})" class="btn-action" style="width:auto; padding:4px 8px; font-size:10px; background:rgba(248,113,113,0.15); color:#f87171; box-shadow:none;">Suppr.</button>
                </div>
            </div>`
        ).join('');
    }
}

function sauvegarderBudgetVQ() {
    assurerStructureJour();
    const solde = parseFloat(document.getElementById('vqBudgetSolde')?.value || '0') || 0;
    const notes = (document.getElementById('vqBudgetNotes')?.value || '').trim();
    utilisateur.vieQuotidienne.budget = { solde, notes };
    sauvegarderProfilLocal();
    alert('Budget enregistré.');
}

function ajouterContactFamille() {
    assurerStructureJour();
    const nom = prompt('Nom :');
    if (!nom) return;
    const tel = prompt('Téléphone :');
    if (!tel) return;
    const lien = prompt('Lien (conjoint, parent, ami de confiance…) :', 'Famille') || 'Famille';
    utilisateur.vieQuotidienne.famille.push({ nom: nom.trim(), tel: tel.replace(/\s+/g,'').trim(), lien: lien.trim() });
    sauvegarderProfilLocal();
    afficherVieQuotidienne();
}

function retirerContactFamille(i) {
    assurerStructureJour();
    utilisateur.vieQuotidienne.famille.splice(i, 1);
    sauvegarderProfilLocal();
    afficherVieQuotidienne();
}

function ajouterDemarche() {
    assurerStructureJour();
    const titre = prompt('Démarche (ex: Carte d\'identité, inscription école, facture…) :');
    if (!titre) return;
    const detail = prompt('Détail / prochain pas :', '') || '';
    utilisateur.vieQuotidienne.demarches.unshift({ titre: titre.trim(), detail: detail.trim(), fait: false });
    sauvegarderProfilLocal();
    afficherVieQuotidienne();
}

function toggleDemarche(i) {
    assurerStructureJour();
    const d = utilisateur.vieQuotidienne.demarches[i];
    if (d) d.fait = !d.fait;
    sauvegarderProfilLocal();
    afficherVieQuotidienne();
}

function retirerDemarche(i) {
    assurerStructureJour();
    utilisateur.vieQuotidienne.demarches.splice(i, 1);
    sauvegarderProfilLocal();
    afficherVieQuotidienne();
}

function astuceVQ(theme) {
    elawsMode = 'grand_public';
    switchTab('elaws-ia');
    const input = document.getElementById('elawsInput');
    const prompts = {
        budget: 'Donne 5 astuces simples pour gérer un petit budget familial au quotidien. Court, pratique, sans jargon.',
        demarches: 'Explique comment bien préparer une démarche administrative (papiers, file, questions à poser). Conseils universels, simples.',
        famille: 'Conseils concrets pour mieux s\'organiser en famille (tâches, communication, temps). Réponse courte.',
        sante: 'Donne des gestes de prévention santé au quotidien (hygiène, sommeil, hydratation, quand consulter). Rappelle que tu ne remplaces pas un médecin.',
        securite: 'Astuces de sécurité personnelle au quotidien (téléphone, trajets, argent, arnaques). Simple et prudent.'
    };
    if (input) {
        input.value = prompts[theme] || prompts.budget;
        poserQuestionElaws();
    }
}

function reponseLocaleElaws(question, profil) {
    const q = (question || '').toLowerCase();
    if (/bonjour|salut|hello|hi/.test(q)) return 'Salut. Dis-moi ce dont tu as besoin aujourd\'hui — travail, maison, budget, démarches…';
    if (/médecin|diagnostic|maladie grave|ordonnance/.test(q)) return 'Pour la santé, je peux donner des infos générales de prévention. Pour un diagnostic ou un traitement, vois un professionnel de santé.';
    if (/avocat|plainte|juridique|loi exacte/.test(q)) return 'Je peux t\'orienter sur les étapes générales d\'une démarche. Pour un conseil juridique précis, adresse-toi à un professionnel ou un service compétent local.';
    if (/budget|argent|épargne/.test(q)) return 'Règle simple : note entrées et sorties. Paye d\'abord le vital (nourriture, logement, transport). Mets de côté même un petit montant. Évite les dettes pour le superflu.';
    return 'Je suis en mode local. Reformule ta question simplement, ou réessaie avec le réseau pour une réponse plus complète. En attendant : utilise le Tableau du jour et Vie quotidienne.';
}

async function appelerIAMondiale(question, profil) {
    const prenom = profil?.nom ? profil.nom.split(' ')[0] : 'toi';
    const metier = profil?.metier || '';
    const systemPrompt = `Tu es ELAWS, assistant grand public de l'application EVAT Continuum.
RÈGLES STRICTES :
- Réponds UNIQUEMENT avec ta réponse utile. Ne répète JAMAIS la question.
- Langage simple, humain, clair. Accessible à tous.
- 4 à 8 phrases ou étapes courtes, sauf demande contraire.
- Tu aides au quotidien : travail, budget, famille, démarches, organisation, apprentissage pratique.
- SANTÉ : infos générales de prévention seulement. Ne pose JAMAIS de diagnostic et ne prescris pas. Invite à consulter un professionnel si besoin.
- JURIDIQUE / ARGENT RISQUÉ : reste général, prudent, pas de conseil absolu. Oriente vers services compétents si nécessaire.
- Pas de formules robotiques (« j'ai bien reçu », « concernant ta question »).
Utilisateur : ${prenom}${metier ? ', activité : ' + metier : ''}.`;

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
            text = nettoyerReponseIA(text);
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
            text2 = nettoyerReponseIA(text2);
            if (text2.length > 3) return text2;
        }
    } catch (e) {}
    return reponseLocaleElaws(question, profil);
}

async function poserQuestionElaws() {
    const input = document.getElementById('elawsInput');
    const question = (input?.value || '').trim();
    if (!question || !utilisateur || elawsBusy) return;
    const chatBox = document.getElementById('elawsChatBox');
    if (!chatBox) return;
    elawsBusy = true;
    chatBox.innerHTML += `<div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; text-align:right;"><strong style="color:var(--success); font-size:12px;">👤 ${echapperHtml(utilisateur.nom)}</strong><p style="margin:4px 0 0 0; font-size:12.5px;">${echapperHtml(question)}</p></div>`;
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;
    const loadingId = 'elaws-load-' + Date.now();
    chatBox.innerHTML += `<div id="${loadingId}" style="background:rgba(56,189,248,0.1); border:1px solid var(--border-color); padding:10px; border-radius:10px;"><strong style="color:var(--accent); font-size:12px;">🤖 ELAWS</strong><p style="font-size:12px; margin:6px 0 0; color:var(--text-secondary);">Réflexion…</p></div>`;
    let reponse = '';
    try { reponse = await appelerIAMondiale(question, utilisateur); }
    catch (e) { reponse = reponseLocaleElaws(question, utilisateur); }
    elawsHistory.push({ role: 'user', content: question });
    elawsHistory.push({ role: 'assistant', content: reponse });
    if (elawsHistory.length > 20) elawsHistory = elawsHistory.slice(-16);
    const html = `<div style="background:rgba(56,189,248,0.1); border:1px solid var(--border-color); padding:10px; border-radius:10px;"><strong style="color:var(--accent); font-size:12px;">🤖 ELAWS</strong><p style="margin:4px 0 0; font-size:12.5px; line-height:1.5; white-space:pre-wrap;">${echapperHtml(reponse)}</p></div>`;
    const el = document.getElementById(loadingId);
    if (el) el.outerHTML = html; else chatBox.innerHTML += html;
    chatBox.scrollTop = chatBox.scrollHeight;
    elawsBusy = false;
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
    if(tabId === 'vie-quotidienne') afficherVieQuotidienne();
    if(tabId === 'dashboard') majResumeJourDashboard();
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
    if (utilisateur) { assurerStructureJour(); majResumeJourDashboard(); }
});

async function demanderPermissionsEtActiverProfil() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {}

    sauvegarderProfilBase();
}

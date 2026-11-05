/* ============================================================
   EVAT Continuum v4.7 — Client dynamique
   ============================================================ */

/* ---------- Persistance optimisée ----------
   Avant : tout le profil (sonnerie en base64 jusqu'à 1,4 Mo incluse) était ré-écrit à CHAQUE message.
   Maintenant : écriture groupée (debounce) et gros fichiers dans des clés séparées, écrites seulement si modifiées. */
let _saveTimer = null, _ringSauvee = null, _photoSauvee = null;

function chargerProfil() {
    try {
        const p = JSON.parse(localStorage.getItem('evat_profil'));
        if (!p) return null;
        const ring = localStorage.getItem('evat_ringtone');
        if (ring) { p.parametres = p.parametres || {}; p.parametres.customRingtoneBase64 = ring; _ringSauvee = ring; }
        const photo = localStorage.getItem('evat_photo');
        if (photo) { p.photo = photo; _photoSauvee = photo; }
        return p;
    } catch (e) { return null; }
}

function sauverProfil() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(sauverProfilMaintenant, 300);
}

function sauverProfilMaintenant() {
    clearTimeout(_saveTimer); _saveTimer = null;
    if (!utilisateur) return;
    try {
        const copie = Object.assign({}, utilisateur, { photo: null });
        copie.parametres = Object.assign({}, utilisateur.parametres, { customRingtoneBase64: null });
        localStorage.setItem('evat_profil', JSON.stringify(copie));

        const ring = (utilisateur.parametres && utilisateur.parametres.customRingtoneBase64) || null;
        if (ring !== _ringSauvee) {
            if (ring) localStorage.setItem('evat_ringtone', ring); else localStorage.removeItem('evat_ringtone');
            _ringSauvee = ring;
        }
        const photo = utilisateur.photo || null;
        if (photo !== _photoSauvee) {
            if (photo) localStorage.setItem('evat_photo', photo); else localStorage.removeItem('evat_photo');
            _photoSauvee = photo;
        }
    } catch (e) {
        console.warn('Sauvegarde locale impossible :', e);
    }
}

function effacerProfilLocal() {
    clearTimeout(_saveTimer); _saveTimer = null;
    ['evat_profil', 'evat_ringtone', 'evat_photo'].forEach(k => localStorage.removeItem(k));
    _ringSauvee = _photoSauvee = null;
}

// Écriture immédiate quand l'app passe en arrière-plan / se ferme
window.addEventListener('pagehide', () => { if (_saveTimer) sauverProfilMaintenant(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && _saveTimer) sauverProfilMaintenant(); });

let utilisateur = chargerProfil();
let iaDejaPresentee = localStorage.getItem('elaws_presentee') === 'true';
let deferredPrompt = null;
let onlineUsers = new Map(); // tel → {nom, metier, lastSeen}

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

// ---------- PWA Install ----------
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'flex';
});

function declencherInstallationApp() {
    const banner = document.getElementById('installBanner');
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted' && banner) banner.style.display = 'none';
            deferredPrompt = null;
        });
    } else {
        alert("Pour installer l'application, utilisez le menu de votre navigateur (Chrome / Safari) → « Ajouter à l'écran d'accueil ».");
    }
}

function fermerBanniereInstall() {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
}

// ---------- Pays du monde (v4.4) : indicatifs, numéros internationaux ----------
/*  Tous les pays peuvent s'inscrire : la liste vient de cette table (ISO → indicatif),
    les noms de pays sont fournis en français par le navigateur (Intl.DisplayNames).        */
const DIAL_PAYS = {
    AF:'93', AL:'355', DZ:'213', AS:'1684', AD:'376', AO:'244', AI:'1264', AG:'1268', AR:'54', AM:'374', AW:'297',
    AU:'61', AT:'43', AZ:'994', BS:'1242', BH:'973', BD:'880', BB:'1246', BY:'375', BE:'32', BZ:'501', BJ:'229',
    BM:'1441', BT:'975', BO:'591', BA:'387', BW:'267', BR:'55', IO:'246', VG:'1284', BN:'673', BG:'359', BF:'226',
    BI:'257', KH:'855', CM:'237', CA:'1', CV:'238', BQ:'599', KY:'1345', CF:'236', TD:'235', CL:'56', CN:'86',
    CX:'61', CC:'61', CO:'57', KM:'269', CG:'242', CD:'243', CK:'682', CR:'506', CI:'225', HR:'385', CU:'53',
    CW:'599', CY:'357', CZ:'420', DK:'45', DJ:'253', DM:'1767', DO:'1', EC:'593', EG:'20', SV:'503', GQ:'240',
    ER:'291', EE:'372', SZ:'268', ET:'251', FK:'500', FO:'298', FJ:'679', FI:'358', FR:'33', GF:'594', PF:'689',
    GA:'241', GM:'220', GE:'995', DE:'49', GH:'233', GI:'350', GR:'30', GL:'299', GD:'1473', GP:'590', GU:'1671',
    GT:'502', GG:'44', GN:'224', GW:'245', GY:'592', HT:'509', HN:'504', HK:'852', HU:'36', IS:'354', IN:'91',
    ID:'62', IR:'98', IQ:'964', IE:'353', IM:'44', IL:'972', IT:'39', JM:'1876', JP:'81', JE:'44', JO:'962',
    KZ:'7', KE:'254', KI:'686', XK:'383', KW:'965', KG:'996', LA:'856', LV:'371', LB:'961', LS:'266', LR:'231',
    LY:'218', LI:'423', LT:'370', LU:'352', MO:'853', MG:'261', MW:'265', MY:'60', MV:'960', ML:'223', MT:'356',
    MH:'692', MQ:'596', MR:'222', MU:'230', YT:'262', MX:'52', FM:'691', MD:'373', MC:'377', MN:'976', ME:'382',
    MS:'1664', MA:'212', MZ:'258', MM:'95', NA:'264', NR:'674', NP:'977', NL:'31', NC:'687', NZ:'64', NI:'505',
    NE:'227', NG:'234', NU:'683', NF:'672', KP:'850', MK:'389', MP:'1670', NO:'47', OM:'968', PK:'92', PW:'680',
    PS:'970', PA:'507', PG:'675', PY:'595', PE:'51', PH:'63', PL:'48', PT:'351', PR:'1', QA:'974', RE:'262',
    RO:'40', RU:'7', RW:'250', BL:'590', SH:'290', KN:'1869', LC:'1758', MF:'590', PM:'508', VC:'1784', WS:'685',
    SM:'378', ST:'239', SA:'966', SN:'221', RS:'381', SC:'248', SL:'232', SG:'65', SX:'1721', SK:'421', SI:'386',
    SB:'677', SO:'252', ZA:'27', KR:'82', SS:'211', ES:'34', LK:'94', SD:'249', SR:'597', SJ:'47', SE:'46',
    CH:'41', SY:'963', TW:'886', TJ:'992', TZ:'255', TH:'66', TL:'670', TG:'228', TK:'690', TO:'676', TT:'1868',
    TN:'216', TR:'90', TM:'993', TC:'1649', TV:'688', VI:'1340', UG:'256', UA:'380', AE:'971', GB:'44', US:'1',
    UY:'598', UZ:'998', VU:'678', VA:'379', VE:'58', VN:'84', WF:'681', EH:'212', YE:'967', ZM:'260', ZW:'263',
    AX:'358'
};
// Pays dont le « 0 » du début fait partie du numéro (on ne le retire jamais)
const GARDE_ZERO = new Set(['IT', 'SM', 'VA', 'CI', 'BJ', 'GA', 'CG']);
// Pays « principal » quand plusieurs partagent un indicatif
const PAYS_PRINCIPAL = { '1': 'US', '7': 'RU', '44': 'GB', '358': 'FI', '61': 'AU', '47': 'NO', '590': 'GP', '599': 'CW', '262': 'RE', '212': 'MA', '39': 'IT' };

const _ISO_PAR_DIAL = {};
Object.keys(DIAL_PAYS).forEach(iso => { (_ISO_PAR_DIAL[DIAL_PAYS[iso]] = _ISO_PAR_DIAL[DIAL_PAYS[iso]] || []).push(iso); });
const _DIALS_TRIES = Object.keys(_ISO_PAR_DIAL).sort((a, b) => b.length - a.length);   // le plus long d'abord

function drapeEmoji(iso) {
    try { return String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); } catch (e) { return '🌍'; }
}

let _nomsPays = null;
function nomPays(iso) {
    try {
        _nomsPays = _nomsPays || new Intl.DisplayNames(['fr'], { type: 'region' });
        return _nomsPays.of(iso) || iso;
    } catch (e) { return iso; }
}

function dialPlusLong(chiffres) {
    for (const d of _DIALS_TRIES) if (chiffres.startsWith(d)) return d;
    return null;
}

function isoDepuisTel(tel) {
    const d = String(tel || '').replace(/\D/g, '');
    const dial = dialPlusLong(d);
    return dial ? (PAYS_PRINCIPAL[dial] || _ISO_PAR_DIAL[dial][0]) : null;
}

function paysUtilisateur() {
    return (typeof utilisateur !== 'undefined' && utilisateur && (utilisateur.pays || isoDepuisTel(utilisateur.telephone))) || null;
}

function paysParDefaut() {
    try {
        const m = (navigator.language || '').match(/[-_]([A-Za-z]{2})\b/);
        if (m && DIAL_PAYS[m[1].toUpperCase()]) return m[1].toUpperCase();
    } catch (e) {}
    return 'TG';
}

/** Numéro → format international (+indicatif…). Sans « + », le numéro est national et reçoit l'indicatif du pays. */
function normaliserTel(v, isoDefaut) {
    let t = String(v || '').replace(/[\s\-.()\u00A0\u202F]/g, '');
    if (!t) return '';
    if (t.startsWith('00')) t = '+' + t.slice(2);
    if (t.startsWith('+')) {
        const chiffres = t.slice(1).replace(/\D/g, '');
        const dial = dialPlusLong(chiffres);
        if (!dial) return '+' + chiffres;
        const iso = PAYS_PRINCIPAL[dial] || _ISO_PAR_DIAL[dial][0];
        let reste = chiffres.slice(dial.length);
        if (reste.startsWith('0') && reste.length > 1 && !GARDE_ZERO.has(iso)) reste = reste.replace(/^0+/, '');   // « +233 0244… »
        return '+' + dial + reste;
    }
    const iso = (isoDefaut && DIAL_PAYS[isoDefaut]) ? isoDefaut : (paysUtilisateur() || paysParDefaut());
    let nat = t.replace(/\D/g, '');
    if (nat.startsWith('0') && !GARDE_ZERO.has(iso)) nat = nat.replace(/^0+/, '');
    return '+' + DIAL_PAYS[iso] + nat;
}

function telEstValideClient(tel) {
    const t = String(tel || '').replace(/[\s\-.()]/g, '');
    return /^\+[1-9]\d{6,14}$/.test(t);
}

/** Nom : toutes les écritures (latin, arabe, cyrillique, chinois…) ; seuls les noms d'exemple exacts sont refusés */
const NOMS_INTERDITS = ['kodjo marceline', 'test', 'admin', 'utilisateur', 'user', 'exemple', 'demo', 'opérateur', 'operateur'];
function nomEstValideClient(nom) {
    const n = String(nom || '').trim().replace(/\s+/g, ' ');
    if ([...n].length < 2 || [...n].length > 80) return false;
    const simple = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (NOMS_INTERDITS.includes(simple)) return false;
    return /\p{L}/u.test(n);
}

/* ---------- Sélecteur de pays (inscription) ---------- */
function initialiserSelecteurPays() {
    const sel = document.getElementById('selectPays');
    if (!sel || sel.dataset.pret) return;
    sel.dataset.pret = '1';
    const liste = Object.keys(DIAL_PAYS).map(iso => ({ iso, nom: nomPays(iso) }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    sel.innerHTML = liste.map(p =>
        `<option value="+${DIAL_PAYS[p.iso]}" data-iso="${p.iso}">${drapeEmoji(p.iso)} ${escapeHtml(p.nom)} (+${DIAL_PAYS[p.iso]})</option>`).join('');
    const defaut = paysParDefaut();
    const opt = [...sel.options].find(o => o.dataset.iso === defaut);
    if (opt) opt.selected = true;
    const tel = document.getElementById('inputTelProfil');
    if (tel && !tel.value) tel.value = sel.value;
}

function isoSelectionne() {
    const sel = document.getElementById('selectPays');
    return sel && sel.selectedOptions[0] ? sel.selectedOptions[0].dataset.iso : null;
}

// Changer de pays : remplace l'indicatif au début du champ numéro
function mettreAJourIndicatif() {
    const sel = document.getElementById('selectPays');
    const telInput = document.getElementById('inputTelProfil');
    if (!sel || !telInput) return;
    let cur = telInput.value.replace(/[\s\-.()]/g, '');
    if (cur.startsWith('+')) {
        const d = dialPlusLong(cur.slice(1).replace(/\D/g, ''));
        cur = d ? cur.slice(1 + d.length) : cur.slice(1);
    }
    telInput.value = sel.value + cur;
}

// Numéro tapé en entier (+33…, +81…) : le pays s'ajuste tout seul
function synchroniserPaysDepuisTel() {
    const sel = document.getElementById('selectPays');
    const telInput = document.getElementById('inputTelProfil');
    if (!sel || !telInput || !telInput.value.trim().startsWith('+')) return;
    const iso = isoDepuisTel(telInput.value);
    if (!iso) return;
    const actuel = sel.selectedOptions[0];
    if (actuel && DIAL_PAYS[actuel.dataset.iso] === DIAL_PAYS[iso]) return;     // même indicatif : on garde le pays choisi
    const opt = [...sel.options].find(o => o.dataset.iso === iso);
    if (opt) opt.selected = true;
}

// ---------- Socket.io ----------
// Réveille le serveur (hébergement gratuit qui s'endort) dès l'ouverture, en parallèle du chargement
try { fetch(SERVER_URL + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {}

const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],   // WebSocket d'abord : connexion plus rapide, moins de requêtes
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    randomizationFactor: 0.4,
    timeout: 30000
});

let onlineTotal = 0;
const _outbox = [];

socket.on('connect', () => {
    const statusEl = document.getElementById('serverConnectionStatus');
    if (statusEl) {
        statusEl.innerHTML = "🟢 Connecté";
        statusEl.style.color = "var(--success)";
    }
    // IMPORTANT : on se signale au serveur même sans code de récupération (anciens comptes) : le serveur répond alors
    // « needsNew » et l'application recrée le compte toute seule. Avant, ces comptes restaient invisibles et injoignables.
    if (utilisateur && utilisateur.telephone) {
        socket.emit('register_user', {
            nom: utilisateur.nom,
            telephone: utilisateur.telephone,
            metier: utilisateur.metier,
            recoveryPin: utilisateur.recoveryPin || undefined
        }, (res) => {
            if (res && res.ok === false) {
                // Serveur redémarré qui ne connaît plus ce compte : on le recrée tout seul (nouveau code de récupération)
                if (res.needsNew && utilisateur) { reinscrireCompte(); return; }
                // PIN invalide ou compte pris → forcer la récupération
                const st = document.getElementById('serverConnectionStatus');
                if (st) { st.textContent = '🟠 Compte non reconnu — Menu → Refaire l’enregistrement'; st.style.color = 'var(--warning, #f59e0b)'; }
                montrerNotification(res.error || 'Session non reconnue. Récupérez votre compte.');
                return;
            }
            // Les abonnements de présence sont perdus à chaque reconnexion : on les refait
            verifierEtSynchroniserContacts();
            chargerHistorique();
            signalerVisibilite();
            activerPush();
            majStatsAccueil();
            while (_outbox.length) { const m = _outbox.shift(); envoyerMessage(m.to, m.texte, m.cid); }
        });
        if (window._heartbeatInterval) clearInterval(window._heartbeatInterval);
        window._heartbeatInterval = setInterval(() => socket.emit('heartbeat'), 25000);
    }
});

socket.on('disconnect', () => {
    const statusEl = document.getElementById('serverConnectionStatus');
    if (statusEl) {
        statusEl.textContent = "🔴 Déconnecté — reconnexion…";
        statusEl.style.color = "var(--danger)";
    }
});

socket.on('connect_error', () => {
    const statusEl = document.getElementById('serverConnectionStatus');
    if (statusEl && !socket.connected) {
        statusEl.textContent = "⏳ Réveil du serveur…";
        statusEl.style.color = "var(--text-secondary)";
    }
});

// Revenir sur l'app (réseau mobile coupé en arrière-plan) → reconnecte tout de suite
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
});
window.addEventListener('online', () => { if (!socket.connected) socket.connect(); });

// Compte ouvert sur un autre téléphone → cet appareil est déconnecté automatiquement
socket.on('force_logout', (data) => {
    const msg = (data && data.message)
        ? data.message
        : 'Votre compte a été ouvert sur un autre appareil. Vous êtes déconnecté.';

    try {
        if (typeof fermerAppelTotalLocally === 'function') fermerAppelTotalLocally();
    } catch (e) {}

    effacerProfilLocal();
    localStorage.removeItem('elaws_presentee');
    utilisateur = null;
    iaDejaPresentee = false;

    if (window._heartbeatInterval) {
        clearInterval(window._heartbeatInterval);
        window._heartbeatInterval = null;
    }

    fermerTousLesMenus();

    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
        welcomeModal.style.display = 'flex';
        if (typeof afficherModeAuth === 'function') afficherModeAuth('recover');
    }

    alert(msg);
    montrerNotification('🔒 Session terminée — compte ouvert ailleurs');
});

socket.on('contact_registered', (data) => {
    if (utilisateur && utilisateur.contacts) {
        const match = utilisateur.contacts.find(c => c.telephone === data.telephone);
        if (match) {
            match.metier = data.metier;
            match.online = true;
            sauverProfil();
            afficherContacts();
            montrerNotification(`🚨 ${match.nom} (${data.telephone}) vient de s'inscrire ! Métier : ${data.metier}`);
        }
    }
});

// Présence temps réel : le serveur n'envoie plus que les changements des contacts suivis
socket.on('presence', (info) => {
    if (!info || !utilisateur || !utilisateur.contacts) return;
    const c = utilisateur.contacts.find(x => x.telephone === info.telephone);
    if (!c) return;
    c.online = !!info.online;
    if (info.metier) c.metier = info.metier;
    sauverProfil();
    afficherContacts();
    if (convoOuverte) majEntetePeer();
    const tm = document.getElementById('tab-messagerie');
    if (!convoOuverte && tm && tm.style.display !== 'none') afficherMessagesLocaux();
});

socket.on('online_count', (n) => {
    onlineTotal = n | 0;
    const el = document.getElementById('onlineCount');
    if (el) el.textContent = onlineTotal;
});

// Position partagée
socket.on('signal', (data) => {
    if (data.type === 'location') {
        if (mapInstance) {
            L.marker([data.lat, data.lng])
                .addTo(mapInstance)
                .bindPopup(`<b>📍 ${escapeHtml(data.sender)}</b>`)
                .openPopup();
        }
        if (mapInstanceMessage) {
            L.marker([data.lat, data.lng])
                .addTo(mapInstanceMessage)
                .bindPopup(`<b>📍 ${escapeHtml(data.sender)}</b>`)
                .openPopup();
        }
        montrerNotification(`📍 Position reçue de ${String(data.sender).slice(0, 40)}`);
    }
});

// ---------- Notifications ----------
function montrerNotification(texte, onClick) {
    const banner = document.getElementById('notificationBanner');
    const textEl = document.getElementById('notificationText');
    if (banner && textEl) {
        window._notifClick = typeof onClick === 'function' ? onClick : null;
        banner.style.cursor = window._notifClick ? 'pointer' : '';
        textEl.innerText = texte;
        banner.style.display = 'block';
        banner.classList.add('notif-in');
        clearTimeout(window._notifTimer);
        window._notifTimer = setTimeout(() => fermerNotification(), 9000);
    }
}

document.addEventListener('click', (e) => {
    const b = document.getElementById('notificationBanner');
    if (b && b.contains(e.target) && !e.target.closest('.btn-close') && window._notifClick) {
        const f = window._notifClick; window._notifClick = null; fermerNotification(); f();
    }
});

function fermerNotification() {
    const banner = document.getElementById('notificationBanner');
    if (banner) {
        banner.classList.remove('notif-in');
        banner.style.display = 'none';
    }
}

// ---------- Auth sécurisée (1 numéro = 1 compte) ----------
function afficherErreurAuth(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function afficherModeAuth(mode) {
    const create = document.getElementById('authModeCreate');
    const recover = document.getElementById('authModeRecover');
    const btnC = document.getElementById('tabBtnCreate');
    const btnR = document.getElementById('tabBtnRecover');
    if (!create || !recover) return;
    if (mode === 'recover') {
        create.style.display = 'none';
        recover.style.display = 'block';
        if (btnC) btnC.classList.remove('active');
        if (btnR) btnR.classList.add('active');
    } else {
        create.style.display = 'block';
        recover.style.display = 'none';
        if (btnC) btnC.classList.add('active');
        if (btnR) btnR.classList.remove('active');
    }
    afficherErreurAuth('authCreateError', '');
    afficherErreurAuth('authRecoverError', '');
}

function creerProfilLocal(nom, tel, metier, recoveryPin) {
    return {
        nom,
        telephone: tel,
        metier: metier || 'Opérateur',
        recoveryPin: recoveryPin || null,
        pays: isoDepuisTel(tel),
        qubits: 365,
        notes: [],
        messagesLocaux: [],
        contacts: [],
        historiqueElaws: [],
        parametres: {
            sonnerieType: 'telephone',      // sonnerie du téléphone (notification) par défaut
            customRingtoneBase64: null,
            vibration: true
        },
        photo: null
    };
}

function sauvegarderProfilBase() {
    const nom = document.getElementById('inputNom').value.trim();
    const paysChoisi = isoSelectionne();
    const tel = normaliserTel(document.getElementById('inputTelProfil').value, paysChoisi);
    const metier = document.getElementById('inputMetier').value.trim();

    afficherErreurAuth('authCreateError', '');

    if (!nom || !tel) {
        afficherErreurAuth('authCreateError', 'Nom et numéro obligatoires.');
        return;
    }
    if (!nomEstValideClient(nom)) {
        afficherErreurAuth('authCreateError', 'Entrez VOTRE vrai nom et prénom (les noms d’exemple / test sont interdits).');
        return;
    }
    if (!telEstValideClient(tel)) {
        afficherErreurAuth('authCreateError', 'Numéro invalide. Entrez l’indicatif du pays puis le numéro (ex : +228 90 12 34 56).');
        return;
    }

    if (!socket.connected) {
        afficherErreurAuth('authCreateError', 'Serveur hors ligne. Réessayez dans un instant.');
        return;
    }

    // Création sécurisée côté serveur (1 numéro = 1 compte)
    socket.emit('register_new', { nom, telephone: tel, metier }, (res) => {
        if (!res || !res.ok) {
            afficherErreurAuth('authCreateError', (res && res.error) || 'Échec de la création.');
            if (res && res.needsRecovery) afficherModeAuth('recover');
            return;
        }

        utilisateur = creerProfilLocal(nom, tel, metier, res.recoveryPin);
        if (paysChoisi) utilisateur.pays = paysChoisi;
        sauverProfil();

        // Afficher le code UNE SEULE FOIS
        const pinModal = document.getElementById('pinModal');
        const pinDisplay = document.getElementById('pinDisplay');
        if (pinDisplay) pinDisplay.textContent = res.recoveryPin;
        if (pinModal) pinModal.style.display = 'flex';

        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) welcomeModal.style.display = 'none';

        appliquerInfosProfil();
        verifierEtSynchroniserContacts();
        montrerNotification(`Bienvenue ${utilisateur.nom} ! Notez votre code de récupération.`);
    });
}

function fermerPinModal() {
    const pinModal = document.getElementById('pinModal');
    if (pinModal) pinModal.style.display = 'none';
}

function recupererCompteExistant() {
    const tel = normaliserTel(document.getElementById('inputTelRecover').value);
    const pin = document.getElementById('inputPinRecover').value.trim();
    const metier = document.getElementById('inputMetierRecover').value.trim();

    afficherErreurAuth('authRecoverError', '');

    if (!tel || !pin) {
        afficherErreurAuth('authRecoverError', 'Numéro et code de récupération obligatoires.');
        return;
    }
    if (!telEstValideClient(tel)) {
        afficherErreurAuth('authRecoverError', 'Numéro invalide. Entrez l’indicatif du pays puis le numéro (ex : +228 90 12 34 56).');
        return;
    }

    if (!socket.connected) {
        afficherErreurAuth('authRecoverError', 'Serveur hors ligne. Réessayez.');
        return;
    }

    socket.emit('recover_account', { telephone: tel, recoveryPin: pin, metier }, (res) => {
        if (!res || !res.ok) {
            afficherErreurAuth('authRecoverError', (res && res.error) || 'Récupération impossible.');
            return;
        }

        const p = res.profil;
        // Nouveau code d'activation (l'ancien n'est plus valide)
        const nouveauPin = res.recoveryPin || pin;
        utilisateur = creerProfilLocal(p.nom, p.telephone, p.metier || metier, nouveauPin);
        sauverProfil();

        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) welcomeModal.style.display = 'none';

        // Afficher le NOUVEAU code une seule fois
        if (res.recoveryPin) {
            const pinModal = document.getElementById('pinModal');
            const pinDisplay = document.getElementById('pinDisplay');
            if (pinDisplay) pinDisplay.textContent = res.recoveryPin;
            if (pinModal) pinModal.style.display = 'flex';
        }

        appliquerInfosProfil();
        verifierEtSynchroniserContacts();
        montrerNotification(`Compte récupéré : ${utilisateur.nom} — notez le nouveau code`);
    });
}

function sauvegarderProfilBaseDesdeProfil() {
    if (!utilisateur) return;
    const nom = document.getElementById('inputNomProfil').value.trim();
    const tel = normaliserTel(document.getElementById('inputTelProfil2').value, paysUtilisateur());
    const metier = document.getElementById('inputMetierProfil').value.trim();

    if (!nom || !tel) {
        alert('Le nom et le téléphone sont obligatoires.');
        return;
    }
    if (!nomEstValideClient(nom)) {
        alert('Nom invalide ou réservé. Entrez votre vrai nom.');
        return;
    }

    // Le numéro ne peut PAS être changé librement (1 numéro = 1 compte)
    if (tel !== utilisateur.telephone) {
        alert('Le numéro de compte ne peut pas être modifié ici.\nPour un nouveau numéro, créez un nouveau compte.\nPour changer d’appareil, utilisez « Récupérer mon compte » avec votre code.');
        document.getElementById('inputTelProfil2').value = utilisateur.telephone;
        return;
    }

    utilisateur.nom = nom;
    utilisateur.metier = metier;
    sauverProfil();

    // Re-lier avec le PIN pour prouver l'identité
    socket.emit('register_user', {
        nom: utilisateur.nom,
        telephone: utilisateur.telephone,
        metier: utilisateur.metier,
        recoveryPin: utilisateur.recoveryPin
    }, (res) => {
        if (res && res.ok === false) {
            alert(res.error || 'Mise à jour serveur refusée.');
            return;
        }
        appliquerInfosProfil();
        alert('✅ Profil mis à jour !');
    });
}

function sauvegarderParametresApp() {
    if (!utilisateur) return;
    if (!utilisateur.parametres) utilisateur.parametres = {};
    const selectSon = document.getElementById('selectSonnerieType');
    if (selectSon) utilisateur.parametres.sonnerieType = selectSon.value;
    sauverProfil();
    alert("⚙️ Paramètres enregistrés !");
}

function chargerSonneriePerso(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
        alert("Fichier trop volumineux (max 1 Mo).");
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        if (!utilisateur.parametres) utilisateur.parametres = {};
        utilisateur.parametres.customRingtoneBase64 = e.target.result;
        utilisateur.parametres.sonnerieType = 'custom';
        sauverProfil();
        alert("🎵 Sonnerie personnelle enregistrée !");
    };
    reader.readAsDataURL(file);
}

function deconnecterUtilisateur() {
    if (confirm("Voulez-vous vraiment réinitialiser et refaire l'enregistrement ?")) {
        effacerProfilLocal();
        localStorage.removeItem('elaws_presentee');
        iaDejaPresentee = false;
        utilisateur = null;
        fermerTousLesMenus();
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) welcomeModal.style.display = 'flex';
    }
}

function appliquerInfosProfil() {
    if (!utilisateur) return;
    if (!utilisateur.contacts) {
        utilisateur.contacts = [
            { nom: "Directeur Cabinet", telephone: "+22898231401", metier: "Cosmétiques & Management", online: false },
            { nom: "Support Technique", telephone: "+22898231402", metier: "Ingénierie Continuum", online: false }
        ];
    }
    if (!utilisateur.parametres) {
        utilisateur.parametres = { sonnerieType: 'iphone', customRingtoneBase64: null };
    }

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    setVal('inputNom', utilisateur.nom);
    setVal('inputNomProfil', utilisateur.nom);
    setVal('inputTelProfil', utilisateur.telephone);
    setVal('inputTelProfil2', utilisateur.telephone);
    setVal('inputMetier', utilisateur.metier);
    setVal('inputMetierProfil', utilisateur.metier);

    if (document.getElementById('sidebarUserName')) document.getElementById('sidebarUserName').innerText = utilisateur.nom;
    if (document.getElementById('sidebarUserRole')) document.getElementById('sidebarUserRole').innerText = utilisateur.metier;
    if (document.getElementById('dashUserName')) document.getElementById('dashUserName').innerText = utilisateur.nom.toUpperCase();
    if (document.getElementById('dashUserMetier')) document.getElementById('dashUserMetier').innerText = utilisateur.metier;
    if (document.getElementById('voipStatusDisplay')) document.getElementById('voipStatusDisplay').innerText = "ID : " + utilisateur.telephone;

    const selectSon = document.getElementById('selectSonnerieType');
    if (selectSon && utilisateur.parametres.sonnerieType) {
        selectSon.value = utilisateur.parametres.sonnerieType;
    }

    rafraichirHeaderProfil();
    verifierEtSynchroniserContacts();
    afficherContacts();
}

function verifierEtSynchroniserContacts() {
    if (!utilisateur || !utilisateur.contacts) return;
    socket.emit('query_contacts', utilisateur.contacts.map(c => c.telephone), (reponses) => {
        if (reponses && Array.isArray(reponses)) {
            reponses.forEach(info => {
                const contact = utilisateur.contacts.find(c => c.telephone === info.telephone);
                if (contact) {
                    if (info.metier) contact.metier = info.metier;
                    contact.online = !!info.online;
                }
            });
            sauverProfil();
            afficherContacts();
        }
    });
}

// ---------- Contacts dynamiques ----------
function afficherContacts() {
    if (_ctRaf) return;
    _ctRaf = requestAnimationFrame(() => { _ctRaf = 0; rendreContacts(); });
}
let _ctRaf = 0;

function rendreContacts() {
    const container = document.getElementById('listeContactsContainer');
    if (!container || !utilisateur || !utilisateur.contacts) return;

    if (utilisateur.contacts.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary); font-size:11.5px;">Aucun contact.</p>`;
        return;
    }

    container.innerHTML = utilisateur.contacts.map((c, index) => {
        const statusDot = c.online
            ? `<span class="online-dot" title="En ligne"></span>`
            : `<span class="offline-dot" title="Hors ligne"></span>`;
        return `
        <div class="contact-card">
            <div class="contact-info">
                <strong>👤 ${escapeHtml(c.nom)} ${statusDot}</strong>
                <div class="contact-meta">📞 ${escapeHtml(c.telephone)} • <i>${escapeHtml(c.metier || 'Sync...')}</i></div>
            </div>
            <div class="contact-actions">
                <button data-act="call" data-i="${index}" class="btn-mini success" title="Appel audio">📞</button>
                <button data-act="vcall" data-i="${index}" class="btn-mini success" title="Appel vidéo">📹</button>
                <button data-act="write" data-i="${index}" class="btn-mini accent" title="Écrire">💬</button>
                <button data-act="edit" data-i="${index}" class="btn-mini blue" title="Modifier">✏️</button>
                <button data-act="del" data-i="${index}" class="btn-mini danger" title="Supprimer">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

// Un seul écouteur pour tous les boutons de contacts (plus de onclick avec des noms injectés dans le HTML)
document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#listeContactsContainer [data-act]');
    if (!b || !utilisateur) return;
    const c = utilisateur.contacts[Number(b.dataset.i)];
    if (!c) return;
    const act = b.dataset.act;
    if (act === 'call') lancerAppelDirectPeer('audio', c.telephone);
    else if (act === 'vcall') lancerAppelDirectPeer('video', c.telephone);
    else if (act === 'write') ouvrirMessagerie(c.telephone);
    else if (act === 'edit') modifierContact(Number(b.dataset.i));
    else if (act === 'del') supprimerContact(Number(b.dataset.i));
});

function ajouterNouveauContact() {
    const nom = document.getElementById('nouveauNomContact').value.trim();
    const tel = normaliserTel(document.getElementById('nouveauTelContact').value);
    if (!nom || !tel) {
        alert("Nom et numéro obligatoires.");
        return;
    }
    if (!telEstValideClient(tel)) {
        alert("Numéro invalide. Entrez l’indicatif du pays puis le numéro (ex : +228 90 12 34 56).");
        return;
    }
    if (!utilisateur.contacts) utilisateur.contacts = [];
    if (utilisateur.contacts.some(c => c.telephone === tel)) {
        alert("Ce numéro est déjà dans vos contacts.");
        return;
    }
    utilisateur.contacts.push({ nom, telephone: tel, metier: "Recherche...", online: false });
    sauverProfil();
    document.getElementById('nouveauNomContact').value = '';
    document.getElementById('nouveauTelContact').value = '';
    afficherContacts();
    verifierEtSynchroniserContacts();
    montrerNotification(`✅ Contact ${nom} enregistré`);
}

function modifierContact(index) {
    const c = utilisateur.contacts[index];
    const nouveauNom = prompt("Modifier le nom :", c.nom);
    if (nouveauNom === null) return;
    const nouveauTelBrut = prompt("Modifier le numéro :", c.telephone);
    if (nouveauTelBrut === null) return;
    const nouveauTel = normaliserTel(nouveauTelBrut);
    if (!telEstValideClient(nouveauTel)) { alert("Numéro invalide."); return; }
    utilisateur.contacts[index].nom = nouveauNom.trim() || c.nom;
    utilisateur.contacts[index].telephone = nouveauTel;
    sauverProfil();
    afficherContacts();
    verifierEtSynchroniserContacts();
}

function supprimerContact(index) {
    if (confirm("Supprimer ce contact ?")) {
        utilisateur.contacts.splice(index, 1);
        sauverProfil();
        afficherContacts();
    }
}

function ecrireAuContact(nom, tel) { ouvrirMessagerie(tel); }

// ---------- IA : voir module « Deux IA » plus bas ----------

function genererReponseElaws(question) {
    const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nom = utilisateur.nom.split(' ')[0];
    const metier = utilisateur.metier || 'opérateur';
    const onlineCount = onlineTotal;

    // Réponses contextuelles dynamiques
    const patterns = [
        {
            test: /(bonjour|salut|hello|bonsoir|hey)/,
            replies: [
                `Bonjour ${nom} ! En tant qu'expert en ${metier}, je suis pleinement opérationnel. Que puis-je analyser pour vous ?`,
                `Salut ${nom} 👋. Système Continuum synchronisé. Comment puis-je vous assister aujourd'hui ?`,
                `Bonjour ! ${onlineCount} opérateurs sont actuellement en ligne sur le réseau. Que souhaitez-vous ?`
            ]
        },
        {
            test: /(merci|thanks|remercie)/,
            replies: [
                `Avec plaisir, ${nom}. Je reste en veille sur vos systèmes.`,
                `C'est un honneur, ${nom}. N'hésitez pas si vous avez d'autres besoins.`,
                `Toujours à votre service. Le continuum reste stable.`
            ]
        },
        {
            test: /(contact|annuaire|qui est|numero)/,
            replies: [
                `Votre annuaire contient ${utilisateur.contacts ? utilisateur.contacts.length : 0} contacts. ${onlineCount} sont en ligne en ce moment. Allez dans l'onglet Contacts pour les gérer.`,
                `Pour appeler ou écrire, ouvrez l'Annuaire. Votre propre ID VoIP est ${utilisateur.telephone}.`
            ]
        },
        {
            test: /(appel|voip|appeler|sonnerie)/,
            replies: [
                `Les appels audio/vidéo P2P sont disponibles dans Discussion → 📞. Votre ID : ${utilisateur.telephone}.`,
                `Vous pouvez changer la sonnerie dans Paramètres. Styles iPhone, Samsung, Motorola ou MP3 perso.`
            ]
        },
        {
            test: /(entreprise|business|nif|statut|lome|togo)/,
            replies: [
                `Pour une structure à Lomé, je recommande une séparation claire entre NIF personnel et professionnel. Souhaitez-vous un plan d'action étape par étape ?`,
                `La gestion multi-entités au Togo nécessite une attention particulière sur les formalités RCCM et fiscales. Je peux vous guider.`
            ]
        },
        {
            test: /(aide|que peux|fonction|capacite|que fais)/,
            replies: [
                `Je suis ELAWS AI, cœur de l'écosystème EVAT Continuum. Je gère notes, stratégie, communications chiffrées, présence réseau et analyse contextuelle.`,
                `Fonctions principales : messagerie temps réel, appels P2P, GPS partagé, quêtes, bloc-notes et assistant stratégique. Que voulez-vous explorer ?`
            ]
        },
        {
            test: /(heure|temps|date|aujourd)/,
            replies: [
                `Il est actuellement ${new Date().toLocaleTimeString('fr-FR')}. Date : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
            ]
        },
        {
            test: /(en ligne|online|connecte|presence)/,
            replies: [
                `Actuellement ${onlineCount} opérateur${onlineCount > 1 ? 's' : ''} en ligne sur le continuum.`,
                `Le réseau compte ${onlineCount} présence(s) active(s). Votre statut est visible pour vos contacts.`
            ]
        },
        {
            test: /(note|bloc|ecrire|memo)/,
            replies: [
                `Utilisez l'onglet Outils pour créer des notes. Elles sont sauvegardées localement et exportables.`,
                `Je peux vous rappeler le contenu de vos notes si vous me le demandez plus tard.`
            ]
        },
        {
            test: /(voyage|visa|paris|destination)/,
            replies: [
                `Ouvrez le module Voyage pour une analyse rapide des formalités. Indiquez simplement la destination.`,
                `Pour un voyage, prévoyez passeport, visa éventuel et assurances. Je peux affiner selon le pays.`
            ]
        },
        {
            test: /(qubit|quete|score|point)/,
            replies: [
                `Vous disposez actuellement de ${utilisateur.qubits || 365} Qubits. Continuez les quêtes pour en gagner plus !`,
                `Les Qubits mesurent votre activité dans le continuum. Consultez l'onglet Quêtes.`
            ]
        }
    ];

    for (const p of patterns) {
        if (p.test.test(q)) {
            const replies = p.replies;
            return replies[Math.floor(Math.random() * replies.length)];
        }
    }

    // Réponse générique intelligente
    const generic = [
        `Analyse de « ${question} » validée pour ${nom} (${metier}). Le système applique vos consignes avec succès.`,
        `J'ai bien reçu votre requête. Dans le contexte de ${metier}, je recommande de croiser avec vos notes et contacts récents.`,
        `Traitement terminé. Souhaitez-vous que j'approfondisse un aspect particulier de « ${question.slice(0, 40)} » ?`,
        `Compris. Je reste disponible pour affiner cette analyse ou lancer une action dans le continuum.`
    ];
    return generic[Math.floor(Math.random() * generic.length)];
}

const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, ch => _ESC[ch]);
}

// ---------- Navigation ----------
window._grandModuleOuvert = null;
let mapInstanceMessage = null;
let userMarkerMessage = null;

function toggleGrandModule(id) {
    const was = window._grandModuleOuvert === id;
    window._grandModuleOuvert = was ? null : id;
    document.querySelectorAll('.nav-module').forEach(el => {
        const open = el.getAttribute('data-module') === window._grandModuleOuvert;
        el.classList.toggle('open', open);
        const sous = el.querySelector('.nav-sous');
        if (sous) sous.style.display = open ? 'flex' : 'none';
        const chev = el.querySelector('.nav-chevron');
        if (chev) chev.textContent = open ? '▲' : '▼';
    });
}

function ouvrirSousModule(tabId) {
    if (typeof switchTab === 'function') switchTab(tabId);
}

function toggleGpsMessage(forceOpen) {
    const p = document.getElementById('panneauGpsMessage');
    if (!p) return;
    const show = typeof forceOpen === 'boolean' ? forceOpen : (p.style.display === 'none' || getComputedStyle(p).display === 'none');
    p.style.display = show ? 'block' : 'none';
    if (show) {
        fermerChoixAppel();
        chargerLeaflet().then(() => setTimeout(initCarteMessage, 100)).catch(() => { const st = document.getElementById('gpsMessageStatus'); if (st) st.textContent = 'Carte indisponible (hors ligne).'; });
    }
}

function fermerGpsMessage() {
    const p = document.getElementById('panneauGpsMessage');
    if (p) p.style.display = 'none';
}

function initCarteMessage() {
    const el = document.getElementById('mapContainerMessage');
    if (!el || typeof L === 'undefined') {
        const st = document.getElementById('gpsMessageStatus');
        if (st) st.textContent = 'Carte indisponible.';
        return;
    }
    try {
        if (!mapInstanceMessage) {
            mapInstanceMessage = L.map('mapContainerMessage').setView([6.1375, 1.2123], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstanceMessage);
        } else {
            mapInstanceMessage.invalidateSize();
        }
        centrerSurMoiMessage();
    } catch (e) {
        const st = document.getElementById('gpsMessageStatus');
        if (st) st.textContent = 'Erreur carte.';
    }
}

function centrerSurMoiMessage() {
    const st = document.getElementById('gpsMessageStatus');
    if (!navigator.geolocation) {
        if (st) st.textContent = 'GPS non supporté.';
        return;
    }
    if (st) st.textContent = 'Localisation…';
    navigator.geolocation.getCurrentPosition(function (pos) {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (mapInstanceMessage) {
            mapInstanceMessage.setView([lat, lng], 15);
            if (userMarkerMessage) mapInstanceMessage.removeLayer(userMarkerMessage);
            userMarkerMessage = L.marker([lat, lng]).addTo(mapInstanceMessage).bindPopup('<b>📍 Vous</b>').openPopup();
        }
        if (st) st.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
    }, function () {
        if (st) st.textContent = 'Position refusée ou indisponible.';
    }, { enableHighAccuracy: true, timeout: 12000 });
}

function rafraichirHeaderProfil() {
    if (!utilisateur) return;
    const nomEl = document.getElementById('headerProfilNom');
    const telEl = document.getElementById('headerProfilTel');
    const photoEl = document.getElementById('headerProfilPhoto');
    if (nomEl) nomEl.textContent = utilisateur.nom || 'Profil';
    if (telEl) telEl.textContent = utilisateur.telephone || '';
    if (photoEl) {
        if (utilisateur.photo) {
            photoEl.innerHTML = '<img src="' + utilisateur.photo + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            const p = String(utilisateur.nom || '?').trim().split(/\s+/);
            photoEl.textContent = p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0] || '?').slice(0, 2).toUpperCase();
        }
    }
}

function toggleMenu(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('appOverlay');
    if (sidebar && overlay) {
        const isOpen = sidebar.classList.toggle('open');
        if (isOpen) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

function fermerTousLesMenus() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('appOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ---------- Cartes & GPS ----------
// Leaflet (~150 Ko) n'est plus chargé au démarrage mais seulement à la première ouverture d'une carte
let _leafletPromise = null;
function chargerLeaflet() {
    if (typeof L !== 'undefined') return Promise.resolve();
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = () => resolve();
        js.onerror = () => { _leafletPromise = null; reject(new Error('leaflet')); };
        document.head.appendChild(js);
    });
    return _leafletPromise;
}

let mapInstance = null;
let userMarker = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab-' + tabId);
    if (target) {
        target.style.display = 'block';
        target.classList.add('tab-fade');
    }
    const link = document.getElementById('link-' + tabId);
    if (link) link.classList.add('active');
    fermerTousLesMenus();

    if (tabId === 'contacts') afficherContacts();
    if (tabId === 'messagerie') rendreMessagesLocaux(true);
    if (tabId === 'dashboard') majStatsAccueil();
    majNavChat();
    majNavActive(tabId);
    if (tabId === 'elaws-ia') rendreIA('general');
    if (tabId === 'ia-metier') rendreIA('metier');
    if (tabId === 'appels') { rendreJournalAppels(); marquerAppelsVus(); }
    window.scrollTo(0, 0);
    if (tabId === 'map') {
        chargerLeaflet().then(() => setTimeout(() => {
            if (!mapInstance) {
                mapInstance = L.map('mapContainer').setView([6.1375, 1.2123], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);
            } else {
                mapInstance.invalidateSize();
            }
        }, 150)).catch(() => montrerNotification('🗺️ Carte indisponible (hors ligne).'));
    }
    if (tabId === 'elaws-ia' && !iaDejaPresentee) {
        iaDejaPresentee = true;
        localStorage.setItem('elaws_presentee', 'true');
    }
}

function centrerSurMoi() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if (mapInstance) {
                mapInstance.setView([lat, lng], 15);
                if (userMarker) mapInstance.removeLayer(userMarker);
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
            montrerNotification("📍 Position partagée avec le réseau !");
        }, () => alert("Impossible d'obtenir la position."));
    }
}

// ---------- Messagerie dynamique ----------
/** Agrandit automatiquement le textarea pour voir tout le texte écrit */
function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ---------- Notes ----------
function ajouterNoteBlocNotes() {
    const titre = document.getElementById('noteTitre').value.trim();
    const contenu = document.getElementById('noteContenu').value.trim();
    if (!titre || !contenu || !utilisateur) return;
    if (!utilisateur.notes) utilisateur.notes = [];
    utilisateur.notes.unshift({ titre, contenu, date: new Date().toLocaleString('fr-FR') });
    sauverProfil();
    document.getElementById('noteTitre').value = '';
    document.getElementById('noteContenu').value = '';
    afficherNotesBlocNotes();
    montrerNotification("📌 Note enregistrée");
}

function afficherNotesBlocNotes() {
    const container = document.getElementById('listeNotesContainer');
    if (!container || !utilisateur || !utilisateur.notes) return;
    let html = '';
    utilisateur.notes.forEach((n, i) => {
        html += `
        <div class="note-card">
            <strong>📌 ${escapeHtml(n.titre)}</strong>
            <p>${escapeHtml(n.contenu)}</p>
            <small>${n.date || ''}</small>
            <button onclick="supprimerNote(${i})" class="btn-mini danger" style="margin-top:6px;">Supprimer</button>
        </div>`;
    });
    container.innerHTML = html || '<p style="color:var(--text-secondary);font-size:12px;">Aucune note.</p>';
}

function supprimerNote(index) {
    if (!utilisateur.notes) return;
    utilisateur.notes.splice(index, 1);
    sauverProfil();
    afficherNotesBlocNotes();
}

// ---------- Outils divers ----------
function genererPlanSucces1000() {
    const obj = document.getElementById('inputObjectif1000').value.trim();
    const container = document.getElementById('resultatPlan1000');
    if (!obj) return;
    container.style.display = 'block';
    const steps = [
        "1. Clarifier l'objectif en une phrase mesurable",
        "2. Identifier les 3 ressources critiques",
        "3. Planifier les 7 prochains jours",
        "4. Mesurer chaque soir (Qubits)",
        "5. Ajuster et scaler"
    ];
    container.innerHTML = `
        <div class="card" style="border-color:var(--success);">
            <h4 style="color:var(--success);">🚀 ${escapeHtml(obj)}</h4>
            <ul style="font-size:12px;padding-left:18px;margin:8px 0;">
                ${steps.map(s => `<li>${s}</li>`).join('')}
            </ul>
            <p style="font-size:11px;color:var(--text-secondary);">Plan généré dynamiquement — ${new Date().toLocaleString('fr-FR')}</p>
        </div>`;
}

function lancerAnalyseVoyageAvance() {
    const dest = document.getElementById('voyageDestination').value.trim();
    const container = document.getElementById('resultatAssistantVoyage');
    if (!dest) return;
    container.style.display = 'block';
    container.innerHTML = `
        <div class="card" style="border-color:var(--accent);">
            <h4 style="color:var(--accent);">✈️ ${escapeHtml(dest)}</h4>
            <p style="font-size:12px;">Analyse rapide :</p>
            <ul style="font-size:12px;padding-left:18px;">
                <li>Passeport valide ≥ 6 mois recommandé</li>
                <li>Vérifier visa / e-visa selon nationalité</li>
                <li>Assurances voyage + rapatriement</li>
                <li>Vaccins / certificats selon destination</li>
            </ul>
            <p style="font-size:11px;color:var(--text-secondary);">Généré le ${new Date().toLocaleString('fr-FR')}</p>
        </div>`;
}

function exporterDonneesCloud() {
    if (!utilisateur) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(utilisateur, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "evat_backup_" + Date.now() + ".json");
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    montrerNotification("📥 Sauvegarde téléchargée");
}

// ---------- VoIP P2P v4 (appels audio / vidéo WebRTC) ----------
/*  Corrections majeures par rapport à la v3.95 :
    - candidats ICE mis en file d'attente tant que l'offre n'est pas appliquée (perte de candidats = appel muet)
    - serveur TURN fourni par le serveur (indispensable sur les réseaux mobiles / CGNAT)
    - états d'appel propres (occupé, ça sonne, manqué, hors ligne, annulé)
    - reconnexion automatique (ICE restart) en cas de coupure réseau
    - raccrocher utilise l'appel réel (plus le champ texte)
    - sonnerie fiable (AudioContext unique débloqué au 1er geste) + vibration + notification système
    - micro coupé / caméra coupée, aperçu local, durée d'appel, wake-lock seulement pendant l'appel */

const STUN_SECOURS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

const Call = {
    state: 'idle',          // idle | calling | ringing | connecting | connected
    id: null, peer: null, type: 'audio', isCaller: false,
    pc: null, local: null, remote: null,
    pendingOffer: null, pendingCandidates: [],
    timers: { ring: null, drop: null, tick: null },
    startedAt: 0, restarts: 0, muted: false, camOff: false,
    ice: null, iceAt: 0
};

let audioCtx = null;
let ringInterval = null;
let customAudioRing = null;
let wakeLock = null;
let sysRingTimer = null;

/* ---------- Utilitaires ---------- */
function nomPourTel(tel) {
    const c = utilisateur && utilisateur.contacts && utilisateur.contacts.find(x => x.telephone === tel);
    return c ? c.nom : tel;
}

function setStatutAppel(txt) {
    const el = document.getElementById('callStatusLog');
    if (el) el.textContent = txt;
}

function nouvelIdAppel() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 18)
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function signaler(type, extra) {
    if (!Call.peer) return;
    socket.emit('p2p_signal', Object.assign({
        target: Call.peer, callId: Call.id, callType: Call.type, type
    }, extra || {}));
}

/* ---------- Audio : sonnerie fiable ---------- */
function obtenirAudioCtx() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}
// Le 1er geste de l'utilisateur débloque l'audio : sans ça, la sonnerie reste muette sur mobile
['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, () => obtenirAudioCtx(), { passive: true }));

function jouerNote(freq, wave, dur, vol) {
    const ctx = obtenirAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
}

/** mode 'entrant' = sonnerie choisie par l'utilisateur ; 'sortant' = tonalité de retour d'appel */
function jouerSonSonnerie(mode) {
    arreterSonSonnerie(true);
    try {
        if (mode === 'sortant') {
            const bip = () => { jouerNote(425, 'sine', 1.0, 0.09); };
            bip();
            ringInterval = setInterval(bip, 3000);
            return;
        }
        const p = (utilisateur && utilisateur.parametres) || {};
        const type = p.sonnerieType || 'iphone';

        if (type === 'telephone' && notificationsPretes()) {
            demarrerSonnerieTelephone();
        } else if (type === 'custom' && p.customRingtoneBase64) {
            customAudioRing = new Audio(p.customRingtoneBase64);
            customAudioRing.loop = true;
            customAudioRing.play().catch(() => {});
        } else {
            let notes = [523.25, 659.25, 783.99, 1046.50], pattern = 1800, wave = 'sine';
            if (type === 'motorola') { notes = [600, 750, 900, 600]; pattern = 1400; wave = 'square'; }
            else if (type === 'samsung') { notes = [440, 554.37, 659.25, 880, 1108.73]; pattern = 2200; wave = 'triangle'; }
            else if (type === 'classique') { notes = [800, 1000]; pattern = 1000; wave = 'sine'; }
            let i = 0;
            const tick = () => jouerNote(notes[i++ % notes.length], wave, 0.45, 0.14);
            tick();
            ringInterval = setInterval(tick, pattern / notes.length);
        }
        if (!p || p.vibration !== false) {
            const vib = () => { if (navigator.vibrate) navigator.vibrate([700, 300, 700, 300]); };
            vib();
            Call.timers.vib = setInterval(vib, 2000);
        }
    } catch (e) { /* audio indisponible : on continue sans son */ }
}

function notificationsPretes() {
    return 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator;
}

/** « Sonnerie du téléphone » : une notification d'appel est ré-affichée toutes les 4,5 s, donc le téléphone joue
    lui-même son propre son (réglable dans Réglages → Applications → EVAT → Notifications). */
async function demarrerSonnerieTelephone() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const nom = nomPourTel(Call.peer);
        const video = Call.type === 'video';
        const alerter = () => reg.showNotification(video ? '📹 Appel vidéo EVAT' : '📞 Appel EVAT', {
            body: nom + ' vous appelle', tag: 'evat-call', renotify: true, requireInteraction: true,
            vibrate: [600, 250, 600, 250, 600], icon: 'icon-192.png', badge: 'icon-192.png', silent: false
        }).catch(() => {});
        alerter();
        clearInterval(sysRingTimer);
        sysRingTimer = setInterval(() => { if (Call.state === 'ringing') alerter(); else { clearInterval(sysRingTimer); sysRingTimer = null; } }, 4500);
    } catch (e) {}
}

function arreterSonSonnerie(garderTimers) {
    if (sysRingTimer) { clearInterval(sysRingTimer); sysRingTimer = null; }
    if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    if (Call.timers.vib) { clearInterval(Call.timers.vib); Call.timers.vib = null; }
    if (navigator.vibrate) navigator.vibrate(0);
    if (customAudioRing) { customAudioRing.pause(); customAudioRing.currentTime = 0; customAudioRing = null; }
    if (!garderTimers && Call.timers.ring) { clearTimeout(Call.timers.ring); Call.timers.ring = null; }
}

/* ---------- Notifications système (écran verrouillé / onglet en arrière-plan) ---------- */
function demanderPermissionNotifications() {
    try {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
}

async function notifierAppelEntrant(nom, type) {
    try {
        if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(type === 'video' ? '📹 Appel vidéo EVAT' : '📞 Appel EVAT', {
            body: nom + ' vous appelle',
            tag: 'evat-call', renotify: true, requireInteraction: true,
            vibrate: [500, 200, 500, 200, 500], icon: 'icon-192.png', badge: 'icon-192.png'
        });
    } catch (e) {}
}

async function fermerNotificationAppel() {
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        (await reg.getNotifications({ tag: 'evat-call' })).forEach(n => n.close());
    } catch (e) {}
}

/* ---------- Wake lock (seulement pendant un appel) ---------- */
async function verrouillerEcran() {
    try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function libererEcran() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Call.state === 'connected') { wakeLock = null; verrouillerEcran(); }
});

/* ---------- ICE (STUN + TURN fournis par le serveur) ---------- */
function chargerIce() {
    if (Call.ice && Date.now() - Call.iceAt < 30 * 60 * 1000) return Promise.resolve(Call.ice);
    return new Promise(resolve => {
        const fin = servers => { Call.ice = servers; Call.iceAt = Date.now(); resolve(servers); };
        const garde = setTimeout(() => fin(STUN_SECOURS), 2500);
        try {
            socket.emit('get_ice', null, res => {
                clearTimeout(garde);
                fin(res && Array.isArray(res.iceServers) && res.iceServers.length ? res.iceServers : STUN_SECOURS);
            });
        } catch (e) { clearTimeout(garde); fin(STUN_SECOURS); }
    });
}
// Précharge les serveurs ICE pour que l'appel démarre sans attente
socket.on('connect', () => { Call.iceAt = 0; setTimeout(() => chargerIce(), 800); });

/* ---------- Médias ---------- */
async function obtenirMedia(type) {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const video = type === 'video'
        ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }
        : false;
    try {
        return await navigator.mediaDevices.getUserMedia({ audio, video });
    } catch (e) {
        if (type === 'video' && e && e.name !== 'NotAllowedError') {
            // pas de caméra : on bascule en audio
            Call.type = 'audio';
            return await navigator.mediaDevices.getUserMedia({ audio, video: false });
        }
        throw e;
    }
}

function messageErreurMedia(e) {
    if (e && e.name === 'NotAllowedError') return '❌ Micro/caméra refusés. Autorisez-les dans les réglages du navigateur.';
    if (e && e.name === 'NotFoundError') return '❌ Aucun micro détecté.';
    return '❌ Impossible d’activer le micro/caméra.';
}

function attacherLocal() {
    const lv = document.getElementById('localVideo');
    if (lv) { lv.srcObject = Call.type === 'video' ? Call.local : null; lv.style.display = Call.type === 'video' ? 'block' : 'none'; }
    const bc = document.getElementById('btnCam');
    if (bc) bc.style.display = Call.type === 'video' ? 'inline-block' : 'none';
}

function attacherDistant() {
    const ra = document.getElementById('remoteAudio');
    const rv = document.getElementById('remoteVideo');
    if (ra) ra.srcObject = Call.remote;
    if (rv) { rv.srcObject = Call.type === 'video' ? Call.remote : null; rv.style.display = Call.type === 'video' ? 'block' : 'none'; }
    if (ra && ra.play) ra.play().catch(() => {});
}

/* ---------- PeerConnection ---------- */
async function creerPeerConnection() {
    const iceServers = await chargerIce();
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', iceCandidatePoolSize: 2 });

    pc.onicecandidate = e => { if (e.candidate) signaler('ice_candidate', { candidate: e.candidate }); };

    pc.ontrack = e => {
        if (!Call.remote) Call.remote = new MediaStream();
        if (!Call.remote.getTracks().includes(e.track)) Call.remote.addTrack(e.track);
        attacherDistant();
    };

    const surChangement = () => {
        const s = pc.connectionState || pc.iceConnectionState;
        if (pc !== Call.pc) return;
        if (s === 'connected' || s === 'completed') {
            clearTimeout(Call.timers.drop);
            if (Call.state !== 'connected') passerConnecte();
            else setStatutAppel('✅ Reconnecté');
        } else if (s === 'disconnected') {
            setStatutAppel('⚠️ Connexion instable…');
            clearTimeout(Call.timers.drop);
            Call.timers.drop = setTimeout(() => redemarrerIce(), 3500);
        } else if (s === 'failed') {
            redemarrerIce(true);
        }
    };
    pc.onconnectionstatechange = surChangement;
    pc.oniceconnectionstatechange = surChangement;
    return pc;
}

function passerConnecte() {
    Call.state = 'connected';
    Call.startedAt = Date.now();
    Call.restarts = 0;
    arreterSonSonnerie();
    clearTimeout(Call.timers.ring);
    verrouillerEcran();
    // Vidéo plafonnée pour les réseaux mobiles (évite les saccades et la consommation excessive)
    try {
        Call.pc.getSenders().forEach(s => {
            if (s.track && s.track.kind === 'video') {
                const p = s.getParameters();
                if (!p.encodings || !p.encodings.length) p.encodings = [{}];
                p.encodings[0].maxBitrate = 700000;
                s.setParameters(p).catch(() => {});
            }
        });
    } catch (e) {}
    clearInterval(Call.timers.tick);
    const maj = () => {
        const sec = Math.floor((Date.now() - Call.startedAt) / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        setStatutAppel('✅ En ligne • ' + mm + ':' + ss);
    };
    maj();
    Call.timers.tick = setInterval(maj, 1000);
}

async function redemarrerIce(force) {
    if (!Call.pc || Call.state === 'idle') return;
    if (Call.restarts >= 3) {
        terminerAppel(Call.startedAt ? '❌ Connexion perdue.' : '❌ Connexion impossible entre ces deux téléphones (réseau trop fermé). Faites « Tester ma connexion d’appel » dans Paramètres.', true, 'echec');
        return;
    }
    // Seul l'appelant relance la négociation (évite les collisions)
    if (!Call.isCaller) {
        if (force) setStatutAppel('⚠️ Connexion perdue, attente de l’appelant…');
        return;
    }
    Call.restarts++;
    try {
        setStatutAppel('🔄 Reconnexion…');
        if (Call.pc.restartIce) Call.pc.restartIce();
        const offer = await Call.pc.createOffer({ iceRestart: true });
        await Call.pc.setLocalDescription(offer);
        signaler('offer', { offer: Call.pc.localDescription, renegotiate: true });
        clearTimeout(Call.timers.drop);
        Call.timers.drop = setTimeout(() => redemarrerIce(true), 8000);
    } catch (e) {
        terminerAppel('❌ Connexion perdue.', true, 'echec');
    }
}

async function appliquerCandidatsEnAttente() {
    const liste = Call.pendingCandidates.splice(0);
    for (const c of liste) {
        try { await Call.pc.addIceCandidate(c); } catch (e) { /* candidat périmé */ }
    }
}

/* ---------- Appel sortant ---------- */
async function lancerAppelDirectPeer(type, telOverride) {
    const input = document.getElementById('appelCibleNum');
    const cible = normaliserTel(telOverride || (input ? input.value : ''));
    if (input && !telOverride) input.value = cible;

    if (!utilisateur) { alert('Créez ou récupérez votre compte avant d’appeler.'); return; }
    if (!telEstValideClient(cible)) { alert('Numéro invalide. Entrez l’indicatif du pays puis le numéro (ex : +228 90 12 34 56).'); return; }
    if (cible === utilisateur.telephone) { alert('Impossible de s’appeler soi-même !'); return; }
    if (Call.state !== 'idle') { alert('Un appel est déjà en cours.'); return; }
    if (!socket.connected) { setStatutAppel('❌ Serveur hors ligne. Réessayez dans un instant.'); return; }
    if (!navigator.mediaDevices || !window.RTCPeerConnection) { alert('Votre navigateur ne supporte pas les appels.'); return; }

    demanderPermissionNotifications();
    Object.assign(Call, {
        state: 'calling', id: nouvelIdAppel(), peer: cible, type, isCaller: true,
        pendingOffer: null, pendingCandidates: [], remote: null, restarts: 0, muted: false, camOff: false
    });
    const idLocal = Call.id;
    afficherEcranAppel(cible);
    setStatutAppel('🔄 Activation micro/caméra…');

    try {
        Call.local = await obtenirMedia(type);
        if (Call.id !== idLocal) { Call.local.getTracks().forEach(t => t.stop()); return; } // annulé entre-temps

        const pc = await creerPeerConnection();
        Call.pc = pc;
        Call.local.getTracks().forEach(t => pc.addTrack(t, Call.local));
        attacherLocal();

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signaler('offer', { offer: pc.localDescription });

        setStatutAppel('📞 Appel de ' + nomPourTel(cible) + '…');
        jouerSonSonnerie('sortant');
        Call.timers.ring = setTimeout(() => {
            if (Call.state === 'calling') terminerAppel('❌ Pas de réponse.', true, 'sans_reponse');
        }, 35000);
    } catch (e) {
        if (Call.id === idLocal) terminerAppel(messageErreurMedia(e), true, 'echec');
    }
}

/* ---------- Appel entrant ---------- */
function afficherModalAppelEntrant(tel, type) {
    let modal = document.getElementById('incomingCallModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'incomingCallModal';
        modal.className = 'incoming-call';
        modal.setAttribute('role', 'alertdialog');
        modal.innerHTML =
            '<div class="incoming-card">' +
            '<div class="incoming-icon">📞</div>' +
            '<h2 id="incomingCallTitle"></h2>' +
            '<p id="incomingCallerName"></p>' +
            '<div class="incoming-actions">' +
            '<button type="button" class="btn-reject" onclick="rejeterAppelEntrant()">Rejeter ❌</button>' +
            '<button type="button" class="btn-accept" onclick="accepterAppelEntrant()">Décrocher 🟢</button>' +
            '</div></div>';
        document.body.appendChild(modal);
    }
    document.getElementById('incomingCallTitle').textContent = type === 'video' ? '📹 Appel vidéo entrant' : '📞 Appel audio entrant';
    document.getElementById('incomingCallerName').textContent = nomPourTel(tel) + (nomPourTel(tel) !== tel ? ' (' + tel + ')' : '');
    modal.style.display = 'flex';
}

function cacherModalAppelEntrant() {
    const modal = document.getElementById('incomingCallModal');
    if (modal) modal.style.display = 'none';
}

async function accepterAppelEntrant() {
    if (Call.state !== 'ringing' || !Call.pendingOffer) return;
    const idLocal = Call.id;
    arreterSonSonnerie();
    cacherModalAppelEntrant();
    fermerNotificationAppel();
    Call.state = 'connecting';

    afficherEcranAppel(Call.peer);
    setStatutAppel('📞 Décrochage…');

    try {
        Call.local = await obtenirMedia(Call.type);
        if (Call.id !== idLocal) { Call.local.getTracks().forEach(t => t.stop()); return; }

        const pc = await creerPeerConnection();
        Call.pc = pc;
        await pc.setRemoteDescription(Call.pendingOffer);
        Call.pendingOffer = null;
        Call.local.getTracks().forEach(t => pc.addTrack(t, Call.local));
        attacherLocal();
        await appliquerCandidatsEnAttente();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaler('answer', { answer: pc.localDescription });
        setStatutAppel('🔄 Connexion avec ' + nomPourTel(Call.peer) + '…');

        Call.timers.drop = setTimeout(() => {
            if (Call.state === 'connecting') terminerAppel('❌ Connexion impossible (réseau).', true, 'echec');
        }, 20000);
    } catch (e) {
        if (Call.id === idLocal) terminerAppel(messageErreurMedia(e), true, 'echec');
    }
}

function rejeterAppelEntrant() {
    if (Call.state !== 'ringing') { cacherModalAppelEntrant(); return; }
    signaler('reject');
    terminerAppel(null, false, 'refuse');
}

function raccrocherAppel() {
    if (Call.state === 'idle') { fermerAppelTotalLocally(); return; }
    terminerAppel('📴 Appel terminé.', true);
}

/** Termine proprement l'appel. notifier=true → prévient l'autre personne */
function terminerAppel(message, notifier, cause) {
    journaliserAppel(cause);
    if (notifier && Call.peer && Call.state !== 'idle') signaler('hangup');

    arreterSonSonnerie();
    clearTimeout(Call.timers.ring);
    clearTimeout(Call.timers.drop);
    clearInterval(Call.timers.tick);
    cacherModalAppelEntrant();
    fermerNotificationAppel();
    libererEcran();

    if (Call.pc) {
        Call.pc.onicecandidate = Call.pc.ontrack = Call.pc.onconnectionstatechange = Call.pc.oniceconnectionstatechange = null;
        try { Call.pc.close(); } catch (e) {}
    }
    if (Call.local) Call.local.getTracks().forEach(t => t.stop());

    ['remoteAudio', 'remoteVideo', 'localVideo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.srcObject = null;
    });
    const container = document.getElementById('callContainer');
    if (container) container.style.display = 'none';

    Object.assign(Call, {
        state: 'idle', id: null, peer: null, pc: null, local: null, remote: null,
        pendingOffer: null, pendingCandidates: [], isCaller: false, restarts: 0, startedAt: 0
    });
    if (message) montrerNotification(message);
}

// Compatibilité (utilisé par la déconnexion forcée)
function fermerAppelTotalLocally() { terminerAppel(null, false); }

/* ---------- Boutons micro / caméra ---------- */
function afficherEcranAppel(tel) {
    const nom = nomPourTel(tel);
    const n = document.getElementById('callPeerName');
    const a = document.getElementById('callPeerAvatar');
    if (n) n.textContent = nom;
    if (a) a.textContent = initialesDe(nom);
    document.getElementById('callContainer').style.display = 'flex';
    majBoutonsAppel();
}

function majBoutonsAppel() {
    const m = document.getElementById('btnMute');
    const c = document.getElementById('btnCam');
    if (m) m.textContent = Call.muted ? '🔇 Micro coupé' : '🎙️ Micro';
    if (c) { c.textContent = Call.camOff ? '🚫 Caméra off' : '📷 Caméra'; c.style.display = Call.type === 'video' ? 'inline-block' : 'none'; }
}
function basculerMicro() {
    if (!Call.local) return;
    Call.muted = !Call.muted;
    Call.local.getAudioTracks().forEach(t => { t.enabled = !Call.muted; });
    majBoutonsAppel();
}
function basculerCamera() {
    if (!Call.local) return;
    Call.camOff = !Call.camOff;
    Call.local.getVideoTracks().forEach(t => { t.enabled = !Call.camOff; });
    majBoutonsAppel();
}

/* ---------- Signalisation entrante ---------- */
socket.on('p2p_signal', async (data) => {
    if (!data || !data.type) return;
    try {
        // Nouvelle sonnerie
        if (data.type === 'offer' && !data.renegotiate) {
            if (!utilisateur) return;
            if (Call.id && data.callId === Call.id) return;        // doublon (rejeu après réouverture)
            if (Call.state !== 'idle') {
                // occupé : on prévient l'appelant sans perturber l'appel en cours
                socket.emit('p2p_signal', { type: 'busy', target: data.sender, callId: data.callId });
                return;
            }
            Object.assign(Call, {
                state: 'ringing', id: data.callId, peer: data.sender, type: data.callType || 'audio',
                isCaller: false, pendingOffer: data.offer, pendingCandidates: [], remote: null,
                restarts: 0, muted: false, camOff: false
            });
            signaler('ringing');
            afficherModalAppelEntrant(data.sender, Call.type);
            jouerSonSonnerie('entrant');
            notifierAppelEntrant(nomPourTel(data.sender), Call.type);
            if (Date.now() - autoDecrocher < 60000) { autoDecrocher = 0; setTimeout(() => accepterAppelEntrant(), 300); }
            Call.timers.ring = setTimeout(() => {
                if (Call.state === 'ringing') {
                    signaler('hangup');
                    terminerAppel(null, false, 'manque');
                }
            }, 35000);
            return;
        }

        // Tout le reste doit concerner l'appel en cours
        if (Call.state === 'idle') return;
        if (data.callId && Call.id && data.callId !== Call.id) return;

        switch (data.type) {
            case 'ringing':
                if (Call.state === 'calling') setStatutAppel('📞 Ça sonne chez ' + nomPourTel(Call.peer) + '…');
                break;

            case 'answer':
                if (Call.pc && Call.pc.signalingState === 'have-local-offer') {
                    await Call.pc.setRemoteDescription(data.answer);
                    await appliquerCandidatsEnAttente();
                    if (Call.state === 'calling') {
                        Call.state = 'connecting';
                        arreterSonSonnerie();
                        clearTimeout(Call.timers.ring);
                        setStatutAppel('🔄 Connexion…');
                        Call.timers.drop = setTimeout(() => {
                            if (Call.state === 'connecting') redemarrerIce(true);
                        }, 12000);
                    }
                }
                break;

            case 'offer': // renégociation (ICE restart) — silencieuse
                if (Call.pc && (Call.state === 'connected' || Call.state === 'connecting')) {
                    await Call.pc.setRemoteDescription(data.offer);
                    const answer = await Call.pc.createAnswer();
                    await Call.pc.setLocalDescription(answer);
                    signaler('answer', { answer: Call.pc.localDescription });
                }
                break;

            case 'ice_candidate':
                if (!data.candidate) break;
                if (Call.pc && Call.pc.remoteDescription) {
                    try { await Call.pc.addIceCandidate(data.candidate); } catch (e) {}
                } else {
                    Call.pendingCandidates.push(data.candidate);  // l'offre n'est pas encore appliquée
                }
                break;

            case 'busy':
                terminerAppel('📵 ' + nomPourTel(Call.peer) + ' est déjà en ligne.', false, 'occupe');
                break;
            case 'user_unknown':
                terminerAppel('❌ Ce numéro n’a pas de compte EVAT (ou il n’est pas encore reconnecté). Vérifiez le numéro.', false, 'echec');
                break;
            case 'user_offline':
                terminerAppel('📵 ' + nomPourTel(Call.peer) + ' est hors ligne. Il verra l’appel manqué à sa reconnexion.', false, 'hors_ligne');
                break;
            case 'reject':
                terminerAppel('❌ Appel refusé.', false, 'refuse');
                break;
            case 'hangup':
                // L'appelant a raccroché pendant la sonnerie → appel manqué (notifié par le journal)
                terminerAppel(Call.state === 'ringing' ? null : '📴 Appel terminé par ' + nomPourTel(Call.peer) + '.', false, Call.state === 'ringing' ? 'manque' : undefined);
                break;
        }
    } catch (e) {
        console.warn('Signal appel :', e);
    }
});

// Fermeture de l'onglet / de l'app pendant un appel : prévenir l'autre côté
window.addEventListener('pagehide', () => {
    if (Call.state !== 'idle' && Call.peer) {
        try { signaler(Call.state === 'ringing' ? 'reject' : 'hangup'); } catch (e) {}
    }
});

// ---------- Conversations (v4.1) : vrais échanges, un fil par contact ----------
/*  - un fil de discussion par contact + le fil « Réseau » (général)
    - envoi instantané (message affiché tout de suite, ✓ envoyé / ✓✓ reçu / ✓✓ bleu lu)
    - « écrit… », pastilles de messages non lus, séparateurs de dates
    - hors ligne : le message part dès que la connexion revient                         */

let convoOuverte = null;                 // 'general' ou numéro du contact ; null = liste
let _typingStop = null, _typingEnvoye = 0, _typingAffTimer = null;
const MAX_MESSAGES_LOCAUX = 400;

function nouvelIdMsg() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function cleConvo(m) {
    if (!m.to) return 'general';
    if (m.fromMe) return m.to;
    if (m.from) return m.from;
    const c = (utilisateur.contacts || []).find(x => x.nom === m.expediteur);   // anciens messages sans numéro
    return c ? c.telephone : 'general';
}

function nomConvo(k) { return k === 'general' ? 'Réseau EVAT' : nomPourTel(k); }

function initialesDe(nom) {
    const p = String(nom || '?').trim().split(/\s+/).slice(0, 2);
    return p.map(w => (w[0] || '').toUpperCase()).join('') || '?';
}

function heureCourte(ts) {
    try { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

function libelleJour(ts) {
    const d = new Date(ts), now = new Date();
    const j0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dj = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((j0 - dj) / 86400000);
    if (diff === 0) return 'Aujourd’hui';
    if (diff === 1) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function coches(m) {
    if (!m.fromMe || !m.to) return '';
    if (m.etat === 'failed') return '<span class="tick fail" title="Non envoyé">!</span>';
    if (m.etat === 'pending') return '<span class="tick">🕓</span>';
    if (m.etat === 'read') return '<span class="tick read">✓✓</span>';
    if (m.etat === 'delivered') return '<span class="tick">✓✓</span>';
    return '<span class="tick">✓</span>';
}

function nbNonLusTotal() {
    const n = (utilisateur && utilisateur.nonLus) || {};
    return Object.keys(n).reduce((s, k) => s + (n[k] || 0), 0);
}

function majBadges() {
    const total = nbNonLusTotal();
    const b = document.getElementById('badgeMsg');
    if (b) { b.textContent = total > 99 ? '99+' : String(total); b.hidden = total === 0; }
    const s = document.getElementById('statNonLus');
    if (s) s.textContent = total;
    const ba = document.getElementById('badgeAppels');
    if (ba) { const n = appelsManquesNonVus(); ba.textContent = n > 99 ? '99+' : String(n); ba.hidden = n === 0; }
    const sc = document.getElementById('statContacts');
    if (sc && utilisateur) sc.textContent = (utilisateur.contacts || []).length;
    try { if (navigator.setAppBadge) { total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } } catch (e) {}
}

function messagesDe(cle) {
    return (utilisateur.messagesLocaux || []).filter(m => cleConvo(m) === cle);
}

/* ---------- Réception ---------- */
socket.on('new_message', (msg) => {
    if (!utilisateur) return;
    if (!utilisateur.messagesLocaux) utilisateur.messagesLocaux = [];
    const fromMe = msg.from === utilisateur.telephone;

    // Écho de mon propre message : on remplace la version « en attente »
    if (fromMe && msg.cid) {
        const loc = utilisateur.messagesLocaux.find(m => m.id === msg.cid || m.cid === msg.cid);
        if (loc) {
            Object.assign(loc, { id: msg.id, ts: msg.timestamp, heure: msg.heure, etat: msg.read ? 'read' : (msg.delivered ? 'delivered' : 'sent') });
            sauverProfil();
            afficherMessagesLocaux();
            return;
        }
    }
    if (utilisateur.messagesLocaux.some(m => m.id === msg.id)) return;

    const m = {
        id: msg.id, cid: msg.cid || null,
        expediteur: msg.fromName || msg.from, from: msg.from, texte: msg.texte, heure: msg.heure,
        fromMe, to: msg.to || null, ts: msg.timestamp,
        etat: fromMe ? (msg.read ? 'read' : (msg.delivered ? 'delivered' : 'sent')) : null
    };
    utilisateur.messagesLocaux.push(m);
    if (utilisateur.messagesLocaux.length > MAX_MESSAGES_LOCAUX) {
        utilisateur.messagesLocaux = utilisateur.messagesLocaux.slice(-MAX_MESSAGES_LOCAUX);
    }

    if (!fromMe) {
        const cle = cleConvo(m);
        const tabVisible = document.getElementById('tab-messagerie') && document.getElementById('tab-messagerie').style.display !== 'none';
        const lue = tabVisible && convoOuverte === cle && !document.hidden;
        if (lue) {
            if (cle !== 'general') socket.emit('mark_read', { peer: cle });
        } else {
            utilisateur.nonLus = utilisateur.nonLus || {};
            utilisateur.nonLus[cle] = (utilisateur.nonLus[cle] || 0) + 1;
            const apercu = `💬 ${m.expediteur} : ${msg.texte.slice(0, 40)}${msg.texte.length > 40 ? '…' : ''}`;
            montrerNotification(apercu, () => ouvrirMessagerie(cle));
        }
    }
    sauverProfil();
    majBadges();
    afficherMessagesLocaux();
});

// Accusés (reçu / lu)
socket.on('msg_status', (d) => {
    if (!utilisateur || !d || !Array.isArray(d.ids)) return;
    let change = false;
    const ids = new Set(d.ids);
    (utilisateur.messagesLocaux || []).forEach(m => {
        if (!ids.has(m.id) || !m.fromMe) return;
        if (d.status === 'read' && m.etat !== 'read') { m.etat = 'read'; change = true; }
        else if (d.status === 'delivered' && m.etat !== 'read' && m.etat !== 'delivered') { m.etat = 'delivered'; change = true; }
    });
    if (change) { sauverProfil(); afficherMessagesLocaux(); }
});

// « écrit… »
socket.on('typing', (d) => {
    if (!d || d.from !== convoOuverte) return;
    const el = document.getElementById('chatPeerStatus');
    if (!el) return;
    clearTimeout(_typingAffTimer);
    if (d.on) {
        el.textContent = 'écrit…';
        el.classList.add('typing');
        _typingAffTimer = setTimeout(majEntetePeer, 4500);
    } else {
        majEntetePeer();
    }
});

/* ---------- Envoi ---------- */
function envoyerMessage(to, texte, cidExistant) {
    const cid = cidExistant || nouvelIdMsg();
    const maintenant = Date.now();
    if (!cidExistant) {
        // affichage immédiat (comme WhatsApp) ; remplacé par la version du serveur dès l'écho
        (utilisateur.messagesLocaux = utilisateur.messagesLocaux || []).push({
            id: cid, cid, expediteur: utilisateur.nom, from: utilisateur.telephone, texte,
            heure: heureCourte(maintenant), fromMe: true, to: to || null, ts: maintenant,
            etat: to ? 'pending' : null
        });
        sauverProfil();
        afficherMessagesLocaux();
    }
    if (!socket.connected) {
        if (!_outbox.some(x => x.cid === cid)) _outbox.push({ to, texte, cid });
        return;
    }
    socket.emit('send_message', { to: to || null, texte, cid }, (res) => {
        if (res && res.ok === false) {
            const m = (utilisateur.messagesLocaux || []).find(x => x.cid === cid || x.id === cid);
            if (m) m.etat = 'failed';
            montrerNotification(res.error || 'Message non envoyé');
            afficherMessagesLocaux();
        }
    });
}

function envoyerMessageChatLocal() {
    const input = document.getElementById('chatLocalInput');
    const texte = input.value.trim();
    if (!texte || !utilisateur || !convoOuverte) return;
    envoyerMessage(convoOuverte === 'general' ? null : convoOuverte, texte);
    input.value = '';
    input.style.height = '42px';
    arreterEcriture();
    input.focus();
}

function signalerEcriture() {
    if (!convoOuverte || convoOuverte === 'general' || !socket.connected) return;
    const now = Date.now();
    if (now - _typingEnvoye > 2500) { _typingEnvoye = now; socket.emit('typing', { to: convoOuverte, on: true }); }
    clearTimeout(_typingStop);
    _typingStop = setTimeout(arreterEcriture, 3500);
}
function arreterEcriture() {
    clearTimeout(_typingStop);
    if (_typingEnvoye && convoOuverte && convoOuverte !== 'general' && socket.connected) socket.emit('typing', { to: convoOuverte, on: false });
    _typingEnvoye = 0;
}

/* ---------- Navigation conversations ---------- */
function ouvrirMessagerie(cle) {
    switchTab('messagerie');
    if (cle) ouvrirConversation(cle);
}

function ouvrirConversation(cle) {
    if (!utilisateur) return;
    convoOuverte = cle;
    utilisateur.nonLus = utilisateur.nonLus || {};
    utilisateur.nonLus[cle] = 0;
    sauverProfil();
    majBadges();
    document.getElementById('convListView').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';
    document.getElementById('chatPeerName').textContent = nomConvo(cle);
    document.getElementById('chatPeerAvatar').textContent = cle === 'general' ? '🌐' : initialesDe(nomConvo(cle));
    const prive = cle !== 'general';
    ['btnChatAudio', 'btnChatVideo'].forEach(id => { const b = document.getElementById(id); if (b) b.style.display = prive ? '' : 'none'; });
    majEntetePeer();
    majNavChat();
    rendreMessagesLocaux(true);
    if (prive) socket.emit('mark_read', { peer: cle });
    setTimeout(() => { const i = document.getElementById('chatLocalInput'); if (i && window.innerWidth > 700) i.focus(); }, 120);
}

function fermerConversation() {
    arreterEcriture();
    convoOuverte = null;
    fermerGpsMessage();
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('convListView').style.display = 'block';
    majNavChat();
    rendreMessagesLocaux();
}

function majEntetePeer() {
    const el = document.getElementById('chatPeerStatus');
    if (!el || !convoOuverte) return;
    el.classList.remove('typing');
    if (convoOuverte === 'general') { el.textContent = 'Diffusion à tous les opérateurs'; return; }
    const c = (utilisateur.contacts || []).find(x => x.telephone === convoOuverte);
    if (c && c.online) { el.textContent = '● en ligne'; el.classList.add('online'); }
    else { el.textContent = c ? 'hors ligne' : convoOuverte; el.classList.remove('online'); }
}

function majNavChat() {
    const tab = document.getElementById('tab-messagerie');
    const actif = tab && tab.style.display !== 'none' && convoOuverte;
    document.body.classList.toggle('in-chat', !!actif);
}

function appelerConversation(type) {
    if (!convoOuverte || convoOuverte === 'general') return;
    lancerAppelDirectPeer(type, convoOuverte);
}

/* ---------- Rendu ---------- */
let _msgRaf = 0;
function afficherMessagesLocaux() {
    if (_msgRaf) return;
    _msgRaf = requestAnimationFrame(() => { _msgRaf = 0; rendreMessagesLocaux(); });
}

function rendreMessagesLocaux(forcerBas) {
    if (!utilisateur) return;
    if (convoOuverte) rendreFil(forcerBas); else rendreListeConversations();
}

function rendreFil(forcerBas) {
    const container = document.getElementById('listeMessagesLocaux');
    if (!container) return;
    const msgs = messagesDe(convoOuverte);
    const procheDuBas = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    if (!msgs.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-ico">💬</div><p>Aucun message.<br>Dites bonjour à ${escapeHtml(nomConvo(convoOuverte))} !</p></div>`;
        return;
    }
    let jour = '', html = '';
    msgs.forEach(m => {
        if (m.ts) {
            const j = libelleJour(m.ts);
            if (j !== jour) { jour = j; html += `<div class="day-sep"><span>${escapeHtml(j)}</span></div>`; }
        }
        const moi = !!m.fromMe;
        const auteur = (!moi && convoOuverte === 'general') ? `<div class="msg-author">${escapeHtml(m.expediteur)}</div>` : '';
        html += `<div class="msg-bubble ${moi ? 'me' : 'other'}">${auteur}<p>${escapeHtml(m.texte)}</p>` +
                `<div class="msg-meta"><span class="msg-time">${escapeHtml(m.ts ? heureCourte(m.ts) : (m.heure || ''))}</span>${coches(m)}</div></div>`;
    });
    container.innerHTML = html;
    if (forcerBas || procheDuBas) container.scrollTop = container.scrollHeight;
}

function rendreListeConversations() {
    const box = document.getElementById('convList');
    if (!box) return;
    const filtre = ((document.getElementById('convSearch') || {}).value || '').trim().toLowerCase();

    // dernier message de chaque fil
    const fils = {};
    (utilisateur.messagesLocaux || []).forEach(m => {
        const k = cleConvo(m);
        if (!fils[k] || (m.ts || 0) >= (fils[k].ts || 0)) fils[k] = m;
    });
    const nonLus = utilisateur.nonLus || {};
    if (!fils.general) fils.general = null;

    const lignes = Object.keys(fils).map(k => ({ k, m: fils[k] }))
        .filter(x => !filtre || nomConvo(x.k).toLowerCase().includes(filtre))
        .sort((a, b) => (a.k === 'general') - (b.k === 'general') || ((b.m && b.m.ts) || 0) - ((a.m && a.m.ts) || 0));

    let html = lignes.map(({ k, m }) => {
        const nom = nomConvo(k);
        const c = k !== 'general' ? (utilisateur.contacts || []).find(x => x.telephone === k) : null;
        const n = nonLus[k] || 0;
        const apercu = m ? ((m.fromMe ? 'Vous : ' : (k === 'general' ? m.expediteur + ' : ' : '')) + m.texte) : 'Aucun message';
        return `<button type="button" class="conv-item ${n ? 'unread' : ''}" data-conv="${escapeHtml(k)}">
            <span class="avatar ${k === 'general' ? 'net' : ''}">${k === 'general' ? '🌐' : escapeHtml(initialesDe(nom))}${c && c.online ? '<i class="dot-on"></i>' : ''}</span>
            <span class="conv-body"><span class="conv-top"><strong>${escapeHtml(nom)}</strong><time>${m && m.ts ? escapeHtml(heureCourte(m.ts)) : ''}</time></span>
            <span class="conv-last">${m && m.fromMe ? coches(m) + ' ' : ''}${escapeHtml(apercu.slice(0, 70))}</span></span>
            ${n ? `<b class="badge">${n > 99 ? '99+' : n}</b>` : ''}
        </button>`;
    }).join('');

    // contacts sans discussion → démarrer
    const dejaVus = new Set(Object.keys(fils));
    const libres = (utilisateur.contacts || []).filter(c => !dejaVus.has(c.telephone) && (!filtre || c.nom.toLowerCase().includes(filtre)));
    if (libres.length) {
        html += `<div class="conv-section">Démarrer une discussion</div>` + libres.map(c => `
        <button type="button" class="conv-item" data-conv="${escapeHtml(c.telephone)}">
            <span class="avatar">${escapeHtml(initialesDe(c.nom))}${c.online ? '<i class="dot-on"></i>' : ''}</span>
            <span class="conv-body"><span class="conv-top"><strong>${escapeHtml(c.nom)}</strong></span>
            <span class="conv-last">${escapeHtml(c.metier || c.telephone)}</span></span>
        </button>`).join('');
    }
    box.innerHTML = html || '<p class="empty-hint">Ajoutez des contacts pour discuter.</p>';
}

document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#convList [data-conv]');
    if (b) ouvrirConversation(b.dataset.conv);
});

// Historique du serveur → fil local (avec accusés)
function fusionnerHistorique(msgs) {
    if (!Array.isArray(msgs) || !utilisateur) return;
    utilisateur.messagesLocaux = utilisateur.messagesLocaux || [];
    const parId = new Map(utilisateur.messagesLocaux.map(x => [x.id, x]));
    let change = false;
    msgs.forEach(m => {
        const fromMe = m.from === utilisateur.telephone;
        const etat = fromMe && m.to ? (m.read ? 'read' : (m.delivered ? 'delivered' : 'sent')) : null;
        const ex = parId.get(m.id) || (m.cid && parId.get(m.cid));
        if (ex) {
            if (fromMe && etat && ex.etat !== etat && ex.etat !== 'read') { ex.etat = etat; change = true; }
            return;
        }
        const nouveau = {
            id: m.id, cid: m.cid || null, expediteur: m.fromName || m.from, from: m.from, texte: m.texte,
            heure: m.heure, fromMe, to: m.to || null, ts: m.timestamp, etat
        };
        utilisateur.messagesLocaux.push(nouveau);
        if (!fromMe) {
            const cle = cleConvo(nouveau);
            const deja = convoOuverte === cle && !document.hidden;
            if (!deja && m.to && !m.readLocal && (Date.now() - (m.timestamp || 0)) < 7 * 86400000 && !m.read) {
                utilisateur.nonLus = utilisateur.nonLus || {};
                utilisateur.nonLus[cle] = (utilisateur.nonLus[cle] || 0) + 1;   // reçus pendant l'absence
            }
        }
        change = true;
    });
    if (change) {
        utilisateur.messagesLocaux.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        utilisateur.messagesLocaux = utilisateur.messagesLocaux.slice(-MAX_MESSAGES_LOCAUX);
        sauverProfil();
        majBadges();
        afficherMessagesLocaux();
    }
}

function chargerHistorique() {
    if (!socket.connected || !utilisateur) return;
    socket.emit('get_history', 150, fusionnerHistorique);
}

// compatibilité avec l'ancien code (panneau d'appel supprimé : l'appel a son propre écran)
function toggleChoixAppel() { ouvrirMessagerie(); }
function fermerChoixAppel() {}
function preparerAppel(tel) { if (tel) lancerAppelDirectPeer('audio', tel); }

/* ---------- Notifications push (appels & messages même app fermée) ---------- */
function urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function pushSupporte() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function majCartePush() {
    const carte = document.getElementById('pushPrompt');
    const stat = document.getElementById('statPush');
    const ok = pushSupporte() && Notification.permission === 'granted' && localStorage.getItem('evat_push_ok') === '1';
    if (carte) carte.style.display = (!pushSupporte() || ok) ? 'none' : 'flex';
    if (stat) stat.textContent = ok ? 'Activées' : (pushSupporte() ? 'À activer' : 'Non dispo');
    const txt = document.getElementById('pushPromptText');
    if (txt && pushSupporte() && Notification.permission === 'denied') {
        txt.textContent = 'Notifications bloquées : autorisez-les dans les réglages du navigateur pour recevoir les appels.';
    }
}

async function activerPush() {
    window.__pushErreur = '';
    if (!pushSupporte()) { window.__pushErreur = 'Ce navigateur ne gère pas les notifications push.'; return false; }
    if (!utilisateur) return false;
    if (!socket.connected) { window.__pushErreur = 'Serveur injoignable.'; return false; }
    if (Notification.permission !== 'granted') { window.__pushErreur = 'Notifications non autorisées.'; return false; }
    try {
        const { publicKey } = await new Promise(res => socket.emit('get_vapid', null, r => res(r || {})));
        if (!publicKey) { window.__pushErreur = 'Le serveur n’a pas de clé de notification (VAPID).'; return false; }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        const cle = urlBase64ToUint8Array(publicKey);
        // clé serveur changée (redémarrage sans clés fixes) → on se réabonne
        if (sub && sub.options && sub.options.applicationServerKey) {
            const actuelle = new Uint8Array(sub.options.applicationServerKey);
            if (actuelle.length !== cle.length || actuelle.some((v, i) => v !== cle[i])) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
        const res = await new Promise(r => socket.emit('push_subscribe', sub.toJSON(), r));
        if (res && res.ok) { localStorage.setItem('evat_push_ok', '1'); majCartePush(); return true; }
        window.__pushErreur = 'Le serveur n’a pas enregistré ce téléphone (compte non reconnu ?).';
    } catch (e) {
        const n = (e && e.name) || 'Erreur';
        window.__pushErreur = (n === 'AbortError' || /push service/i.test(e.message || ''))
            ? 'Le service de notifications du navigateur est inaccessible (réseau, VPN, économiseur de données, ou navigateur sans services Google). Essayez avec Chrome.'
            : n + ' : ' + (e && e.message ? e.message : '');
        console.warn('Push :', e);
    }
    localStorage.removeItem('evat_push_ok');
    return false;
}

async function activerNotificationsPush() {
    if (!pushSupporte()) {
        alert('Ce navigateur ne gère pas les notifications. Sur iPhone : ajoutez d’abord EVAT à l’écran d’accueil (Partager → Sur l’écran d’accueil).');
        return;
    }
    try { await Notification.requestPermission(); } catch (e) {}
    if (Notification.permission === 'granted') {
        const ok = await activerPush();
        montrerNotification(ok ? '🔔 Notifications activées : vous recevrez appels et messages même app fermée.' : '⚠️ Activation impossible pour le moment (serveur sans notifications).');
    } else {
        montrerNotification('🔕 Notifications refusées. Autorisez-les dans les réglages du navigateur.');
    }
    majCartePush();
}

// Le serveur doit savoir si l'écran est visible (sinon il double l'appel avec une notification)
function signalerVisibilite() {
    if (socket.connected) socket.emit('visibility', document.hidden);
}
document.addEventListener('visibilitychange', () => {
    signalerVisibilite();
    if (!document.hidden && convoOuverte && convoOuverte !== 'general' && utilisateur) {
        utilisateur.nonLus = utilisateur.nonLus || {};
        utilisateur.nonLus[convoOuverte] = 0;
        socket.emit('mark_read', { peer: convoOuverte });
        majBadges();
    }
});

// Clic sur une notification système (app déjà ouverte)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
        const d = e.data || {};
        if (d.type !== 'notif-click') return;
        gererOuvertureNotification(d.data || {}, d.action);
    });
}

let autoDecrocher = 0;   // horodatage : décrocher automatiquement l'appel qui arrive (bouton « Répondre »)
function gererOuvertureNotification(data, action) {
    if (data.type === 'call') {
        if (action === 'accept') autoDecrocher = Date.now();
    } else if (data.type === 'missed') {
        switchTab('appels');
    } else if (data.type === 'message' && data.from) {
        ouvrirMessagerie(data.from);
    }
}

// Ouverture de l'app via la notification (app fermée) : lecture des paramètres d'URL
(function lireParametresOuverture() {
    try {
        const p = new URLSearchParams(location.search);
        if (!p.has('open')) return;
        const data = { type: p.get('open'), from: p.get('from') || '' };
        history.replaceState(null, '', location.pathname);
        window.addEventListener('load', () => setTimeout(() => gererOuvertureNotification(data, p.get('accept') === '1' ? 'accept' : ''), 600));
    } catch (e) {}
})();

/* ---------- Accueil : cartes de statistiques ---------- */
function majStatsAccueil() {
    majTitresIA();
    majBadges();
    majCartePush();
}

/** Bouton « Tester » : le serveur envoie 3 notifications d'appel dans 8 s ; il faut fermer l'app ou verrouiller l'écran. */
function testerNotificationsAppel() {
    if (!socket.connected) { alert('Connexion au serveur en cours. Réessayez dans un instant.'); return; }
    socket.emit('push_test', null, (res) => {
        if (res && res.ok) alert('Test lancé ✅\n\nFermez maintenant EVAT (ou verrouillez le téléphone). Dans 8 secondes, une notification d’appel va sonner.');
        else alert((res && res.error) || 'Test impossible. Activez d’abord les notifications.');
    });
}

let _reinscription = false;
/** Le serveur a oublié ce compte (Render gratuit redémarre) : on le recrée avec les mêmes nom / numéro / métier. */
function reinscrireCompte() {
    if (_reinscription || !utilisateur || !socket.connected) return;
    _reinscription = true;
    socket.emit('register_new', { nom: utilisateur.nom, telephone: utilisateur.telephone, metier: utilisateur.metier }, (res) => {
        _reinscription = false;
        const st = document.getElementById('serverConnectionStatus');
        if (res && res.ok) {
            utilisateur.recoveryPin = res.recoveryPin;
            sauverProfil();
            if (st) { st.textContent = '🟢 Connexion active'; st.style.color = ''; }
            verifierEtSynchroniserContacts(); chargerHistorique(); activerPush();
            alert('Votre compte a été reconnecté au serveur ✅\n\nNouveau code de récupération : ' + res.recoveryPin + '\n\nNotez-le : il remplace l’ancien.');
        } else {
            if (st) { st.textContent = '🟠 Compte non reconnu — Menu → Refaire l’enregistrement'; st.style.color = 'var(--warning, #f59e0b)'; }
            montrerNotification((res && res.error) || 'Impossible de reconnecter le compte. Menu → Refaire l’enregistrement.');
        }
    });
}

/** « Tester ma connexion d'appel » : serveur, notifications, micro, puis essai réel des serveurs de relais (STUN/TURN). */
function sonderIce(iceServers) {
    return new Promise((resolve) => {
        const c = { host: 0, srflx: 0, relay: 0 };
        let pc, fini = false;
        const fin = () => { if (fini) return; fini = true; try { pc && pc.close(); } catch (e) {} resolve(c); };
        try {
            pc = new RTCPeerConnection({ iceServers });
            pc.createDataChannel('test');
            pc.onicecandidate = (e) => {
                if (!e.candidate) { fin(); return; }
                const t = e.candidate.type || ((/ typ (\w+)/.exec(e.candidate.candidate || '') || [])[1]);
                if (c[t] !== undefined) c[t]++;
            };
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') fin(); };
            pc.createOffer().then(o => pc.setLocalDescription(o)).catch(fin);
        } catch (e) { fin(); }
        setTimeout(fin, 9000);
    });
}

async function testerConnexionAppel() {
    const box = document.getElementById('resultatTestAppel');
    if (!box) return;
    const lignes = [];
    const afficher = () => { box.style.display = 'block'; box.innerHTML = lignes.map(l => '<div style="margin:5px 0">' + l + '</div>').join(''); };
    const ok = t => { lignes.push('✅ ' + escapeHtml(t)); afficher(); };
    const ko = t => { lignes.push('❌ ' + escapeHtml(t)); afficher(); };
    const av = t => { lignes.push('⚠️ ' + escapeHtml(t)); afficher(); };
    lignes.push('⏳ Test en cours (10 secondes)…'); afficher(); lignes.length = 0; lignes.push('⏳ Test en cours (10 secondes)…'); afficher();
    let n = 0;

    // 1) serveur
    if (socket.connected) ok('Serveur EVAT joint.');
    else { ko('Serveur injoignable. Il dort peut-être : patientez 1 minute et réessayez.'); n++; }

    // 2) notifications (appels application fermée)
    if (!pushSupporte()) av('Ce navigateur ne gère pas les notifications : sur iPhone, ajoutez EVAT à l’écran d’accueil.');
    else if (Notification.permission !== 'granted') { ko('Notifications refusées ou non demandées : les appels ne sonneront pas app fermée. Touchez « Activer » sur l’accueil.'); n++; }
    else if (!socket.connected) av('Notifications autorisées (état serveur inconnu : serveur injoignable).');
    else {
        const st = await new Promise(r => { socket.emit('push_status', null, r); setTimeout(() => r(null), 4000); });
        if (!st) av('Le serveur ne répond pas sur l’état des notifications.');
        else if (!st.liee) {
            ko('Votre compte n’est pas reconnu par le serveur (il a été réinitialisé) : ni appels ni notifications. Reconnexion automatique lancée : refaites le test dans 10 secondes.');
            n++; reinscrireCompte();
        }
        else if (!st.serveurPush) { ko('Le serveur n’a pas les notifications activées (clé VAPID).'); n++; }
        else if (!st.abonne) {
            const enregistre = await activerPush();
            if (enregistre) ok('Notifications : ce téléphone vient d’être enregistré, les appels app fermée sont possibles.');
            else { ko('Impossible d’enregistrer ce téléphone pour les appels app fermée. Cause : ' + (window.__pushErreur || 'inconnue')); n++; }
        }
        else ok('Notifications : ce téléphone est enregistré, les appels app fermée sont possibles.');
        if (st && st.sauvegarde === false) { av('Le serveur ne sauvegarde pas les comptes (Upstash mal configuré) : après un redémarrage de Render, il faudra se reconnecter.'); }
    }

    // 3) micro
    try {
        const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
        flux.getTracks().forEach(t => t.stop());
        ok('Micro accessible.');
    } catch (e) { ko('Micro refusé ou absent : autorisez le micro pour EVAT dans les réglages du navigateur.'); n++; }

    // 4) réseau d'appel : STUN (connexion directe) et TURN (relais pour la 3G/4G)
    if (!window.RTCPeerConnection) { ko('Les appels ne sont pas gérés par ce navigateur.'); n++; }
    else {
        const ice = await chargerIce();
        const urls = ice.flatMap(x => [].concat(x.urls || []));
        const turnConfigure = urls.some(u => /^turns?:/.test(u));
        const r = await sonderIce(ice);
        if (r.relay > 0) ok('Relais TURN opérationnel : les appels marcheront aussi en 3G/4G et sur les réseaux fermés.');
        else if (turnConfigure) { ko('Relais TURN configuré mais INUTILISABLE (identifiants incorrects ou réseau qui le bloque). Les appels entre réseaux mobiles échoueront : vérifiez TURN_USERNAME / TURN_CREDENTIAL sur le serveur.'); n++; }
        else { av('Aucun relais TURN configuré sur le serveur : les appels entre deux réseaux mobiles échoueront souvent.'); n++; }
        if (r.srflx > 0) ok('Votre réseau permet la connexion directe (STUN).');
        else av('Connexion directe non confirmée (STUN sans réponse) : l’appel dépendra du relais TURN.');
    }

    lignes.shift();
    lignes.push(n === 0 ? '<strong>Tout est prêt pour les appels 👍</strong>' : '<strong>' + n + ' problème' + (n > 1 ? 's' : '') + ' à corriger (en rouge).</strong>');
    lignes.push('<span style="opacity:.7">Application v4.7</span>');
    afficher();
}

function majNavActive(tabId) {
    document.querySelectorAll('#bottomNav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
}

// ---------- Deux IA (v4.3) : Mister ELAWS (général) + Mister I (métier) ----------
/*  - Mister ELAWS (la sphère en haut) : répond à toutes les questions
    - Mister I : répond uniquement aux questions du métier de la personne, avec une boîte à outils
    - Les deux peuvent chercher sur Internet (sources affichées). La clé d'API et l'historique restent sur le serveur. */

const IA_CFG = {
    general: { box: 'elawsChatBox', input: 'elawsInput', send: 'elawsSend', nom: 'Mister ELAWS' },
    metier:  { box: 'metierChatBox', input: 'metierInput', send: 'metierSend', nom: 'Mister I' }
};
const IA_MAX_HIST = 60;      // messages gardés sur le téléphone, par IA (affichage)
const iaEtat = { actif: null, reqId: null, buf: '', el: null, raf: 0, question: '', sources: null };

// Outils prêts à l'emploi de Mister I (les trois derniers cherchent sur Internet)
const IA_OUTILS = [
    { ico: '🧾', nom: 'Devis', q: 'Aide-moi à préparer un devis pour un client de mon métier. Pose-moi une par une les questions nécessaires (prestation, quantités, prix, délai), puis écris le devis prêt à envoyer, dans la monnaie locale de mon pays.' },
    { ico: '💰', nom: 'Prix & marge', q: 'Aide-moi à calculer mon prix de vente et ma marge pour une prestation ou un produit de mon métier. Demande-moi mes coûts (matériel, temps, déplacement), puis propose un prix juste et rentable.' },
    { ico: '✅', nom: 'Checklist', q: 'Prépare-moi une checklist complète pour ma journée de travail type dans mon métier (avant, pendant, après), avec les contrôles de sécurité.' },
    { ico: '💬', nom: 'Message client', q: 'Rédige-moi un message court et professionnel (WhatsApp) pour un client de mon métier. Demande-moi d’abord la situation : relance de devis, retard, remerciement, réclamation…' },
    { ico: '🛠️', nom: 'Matériel', q: 'Quel matériel et quels outils sont indispensables dans mon métier, du débutant au professionnel ? Donne des prix indicatifs dans la monnaie locale de mon pays.' },
    { ico: '📣', nom: 'Plus de clients', q: 'Donne-moi un plan concret et réaliste pour trouver plus de clients dans mon métier cette semaine.' },
    { ico: '🔎', nom: 'Prix du marché', web: true, q: 'Cherche sur Internet les prix et tarifs actuels pratiqués dans mon métier dans mon pays (matériel et prestations) et fais-m’en un résumé clair avec les sources.' },
    { ico: '⚖️', nom: 'Règles à connaître', web: true, q: 'Cherche sur Internet les règles, autorisations et obligations à connaître pour exercer mon métier dans mon pays, et résume-les avec les sources.' },
    { ico: '📰', nom: 'Nouveautés', web: true, q: 'Cherche sur Internet les nouveautés, techniques et outils récents qui comptent dans mon métier, et dis-moi ce qui vaut vraiment le coup.' }
];

function iaHist(mode) {
    utilisateur.iaHistorique = utilisateur.iaHistorique || {};
    return (utilisateur.iaHistorique[mode] = utilisateur.iaHistorique[mode] || []);
}

function prenomUtilisateur() {
    return String((utilisateur && utilisateur.nom) || '').trim().split(/\s+/)[0] || '';
}

/* ---------- Mini-rendu Markdown sûr (le texte est échappé AVANT toute mise en forme) ---------- */
function mdVersHtml(src) {
    let t = String(src || '');
    if ((t.match(/```/g) || []).length % 2 === 1) t += '\n```';          // bloc de code pas encore fermé (streaming)
    t = escapeHtml(t);
    const blocs = [];
    t = t.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, (_, c) => { blocs.push(c.replace(/\n$/, '')); return '\u0000B' + (blocs.length - 1) + '\u0000'; });

    const inline = s => s
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<em>$2</em>');

    let out = '', liste = null;
    const fermer = () => { if (liste) { out += '</' + liste + '>'; liste = null; } };
    for (const l of t.split('\n')) {
        let m;
        if (/^\u0000B\d+\u0000$/.test(l.trim())) { fermer(); out += l.trim(); }
        else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (liste !== 'ul') { fermer(); out += '<ul>'; liste = 'ul'; } out += '<li>' + inline(m[1]) + '</li>'; }
        else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (liste !== 'ol') { fermer(); out += '<ol>'; liste = 'ol'; } out += '<li>' + inline(m[1]) + '</li>'; }
        else if ((m = /^#{1,4}\s+(.*)$/.exec(l))) { fermer(); out += '<p class="md-h">' + inline(m[1]) + '</p>'; }
        else if (!l.trim()) { fermer(); }
        else { fermer(); out += '<p>' + inline(l) + '</p>'; }
    }
    fermer();
    return out.replace(/\u0000B(\d+)\u0000/g, (_, i) => '<pre><code>' + blocs[i] + '</code></pre>');
}

/** Sources trouvées sur Internet : seulement des liens https, ouverts hors de l'application */
function sourcesVersHtml(sources) {
    if (!Array.isArray(sources) || !sources.length) return '';
    const liens = sources
        .filter(s => s && typeof s.url === 'string' && /^https:\/\//i.test(s.url))
        .slice(0, 6)
        .map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(s.titre || s.url).slice(0, 70))}</a>`);
    return liens.length ? `<div class="ia-sources"><span>🔎 Sources</span>${liens.join('')}</div>` : '';
}

/* ---------- Affichage ---------- */
function bulleIA(mode, role, html, extraClass) {
    if (role === 'user') return `<div class="ia-msg me"><div class="ia-body">${html}</div></div>`;
    return `<div class="ia-msg ai ${extraClass || ''}"><span class="orb orb-xs ${mode === 'metier' ? 'metier' : 'terre'}"></span><div class="ia-body">${html}</div></div>`;
}

function bienvenueIA(mode) {
    const p = prenomUtilisateur();
    const metier = (utilisateur && utilisateur.metier) || '';
    const chips = mode === 'general'
        ? ['Explique-moi simplement comment fonctionne l’inflation',
           'Aide-moi à écrire un message poli pour réclamer un remboursement',
           'Que cuisiner ce soir avec du riz, des œufs et des tomates ?',
           'Quels sont les jours fériés dans mon pays cette année ?']
        : ['Quelles erreurs courantes éviter dans mon métier ?',
           'Comment fixer mes prix et rester rentable ?',
           'Quels clients dois-je viser en priorité ?'];
    const intro = mode === 'general'
        ? `Bonjour${p ? ' ' + escapeHtml(p) : ''} ! Je suis <strong>Mister ELAWS</strong>. Posez-moi n’importe quelle question : je réfléchis avec vous, je peux même chercher sur Internet.`
        : `Je suis <strong>Mister I</strong>, votre assistant ${escapeHtml(metier || 'métier')}. Je réponds uniquement aux questions de votre métier, avec des outils prêts à l’emploi ci-dessous. Pour tout le reste, demandez à <strong>Mister ELAWS</strong> : touchez la sphère <span class="orb orb-xs inline terre"></span> en haut.`;
    return `<div class="ia-welcome">
        ${mode === 'general' ? '<canvas class="globe globe-halo" data-size="92" aria-label="Terre"></canvas>' : '<span class="orb orb-lg metier"></span>'}
        <p>${intro}</p>
        <div class="ia-chips">${chips.map(c => `<button type="button" class="ia-chip" data-ia="${mode}" data-q="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>
    </div>`;
}

function rendreOutilsMetier() {
    const box = document.getElementById('metierTools');
    if (!box) return;
    box.innerHTML = IA_OUTILS.map((o, i) =>
        `<button type="button" class="ia-tool${o.web ? ' web' : ''}" data-tool="${i}" title="${o.web ? 'Utilise Internet' : ''}"><span>${o.ico}</span>${escapeHtml(o.nom)}</button>`).join('');
}

function rendreIA(mode) {
    if (!utilisateur) return;
    const cfg = IA_CFG[mode];
    const box = document.getElementById(cfg.box);
    if (!box) return;
    if (mode === 'metier') rendreOutilsMetier();
    const hist = iaHist(mode);
    if (!hist.length) { box.innerHTML = bienvenueIA(mode); majTitresIA(); if (typeof initialiserGlobes === 'function') initialiserGlobes(); return; }
    box.innerHTML = hist.map(m => m.role === 'user'
        ? bulleIA(mode, 'user', escapeHtml(m.content).replace(/\n/g, '<br>'))
        : bulleIA(mode, 'ai', mdVersHtml(m.content) + sourcesVersHtml(m.sources))).join('');
    box.scrollTop = box.scrollHeight;
    majTitresIA();
}

function majTitresIA() {
    if (!utilisateur) return;
    const metier = (utilisateur.metier || '').trim();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('iaMetierTitre', 'Mister I');
    set('iaMetierTop', 'Mister I');
    set('iaMetierSous', metier ? 'Expert ' + metier : 'Votre expert métier');
    set('iaMetierSousTop', metier ? 'Uniquement : ' + metier : 'Spécialiste de votre activité');
}

function iaDefiler(box) {
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
}

function iaBasculerBouton(mode, enCours) {
    const b = document.getElementById(IA_CFG[mode].send);
    if (!b) return;
    b.textContent = enCours ? '■' : '➤';
    b.classList.toggle('stop', enCours);
    b.setAttribute('aria-label', enCours ? 'Arrêter' : 'Envoyer');
}

/* ---------- Envoi / réception ---------- */
function actionEnvoiIA(mode) {
    if (iaEtat.actif === mode) arreterIA(mode);
    else envoyerQuestionIA(mode);
}

function envoyerQuestionIA(mode, texteForce) {
    if (!utilisateur) return;
    const cfg = IA_CFG[mode];
    const input = document.getElementById(cfg.input);
    const question = String(texteForce != null ? texteForce : (input ? input.value : '')).trim().slice(0, 2000);
    if (!question) return;
    if (iaEtat.actif) { montrerNotification('⏳ Une réponse est déjà en cours.'); return; }

    const box = document.getElementById(cfg.box);
    const hist = iaHist(mode);
    if (!hist.length) box.innerHTML = '';

    if (input && texteForce == null) { input.value = ''; input.style.height = '42px'; }
    hist.push({ role: 'user', content: question, t: Date.now() });
    box.insertAdjacentHTML('beforeend', bulleIA(mode, 'user', escapeHtml(question).replace(/\n/g, '<br>')));
    box.insertAdjacentHTML('beforeend', bulleIA(mode, 'ai', '<span class="ia-dots"><i></i><i></i><i></i></span>', 'pending'));
    const el = box.lastElementChild;
    box.scrollTop = box.scrollHeight;

    const reqId = 'ia' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    Object.assign(iaEtat, { actif: mode, reqId, buf: '', el, question, sources: null });
    iaBasculerBouton(mode, true);

    if (!socket.connected) { iaEchec(mode, 'Vous êtes hors ligne. Reconnectez-vous pour interroger l’IA.', true); return; }

    // Le serveur garde lui-même le fil de la conversation : on n'envoie que la question
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
    socket.emit('ai_ask', { mode, reqId, texte: question, tz, pays: paysUtilisateur() }, (res) => {
        if (res && res.ok) return;
        iaEchec(mode, (res && res.error) || 'IA indisponible.', true, res && res.code === 'no_key');
    });
}

socket.on('ai_phase', (d) => {
    if (!d || d.reqId !== iaEtat.reqId || !iaEtat.el || d.phase !== 'search') return;
    if (iaEtat.buf) return;                       // du texte est déjà affiché : inutile
    const body = iaEtat.el.querySelector('.ia-body');
    body.innerHTML = '<span class="ia-phase">🔎 Recherche sur Internet…</span> <span class="ia-dots"><i></i><i></i><i></i></span>';
});

socket.on('ai_sources', (d) => {
    if (d && d.reqId === iaEtat.reqId && Array.isArray(d.sources)) iaEtat.sources = d.sources;
});

socket.on('ai_chunk', (d) => {
    if (!d || d.reqId !== iaEtat.reqId || !iaEtat.actif) return;
    iaEtat.buf += d.text;
    if (iaEtat.raf) return;
    iaEtat.raf = requestAnimationFrame(() => {
        iaEtat.raf = 0;
        if (!iaEtat.el) return;
        iaEtat.el.classList.remove('pending');
        iaEtat.el.querySelector('.ia-body').innerHTML = mdVersHtml(iaEtat.buf);
        iaDefiler(iaEtat.el.parentElement);
    });
});

socket.on('ai_done', (d) => {
    if (!d || d.reqId !== iaEtat.reqId || !iaEtat.actif) return;
    const mode = iaEtat.actif;
    if (iaEtat.raf) { cancelAnimationFrame(iaEtat.raf); iaEtat.raf = 0; }
    const texte = iaEtat.buf.trim();
    const sources = iaEtat.sources;
    if (iaEtat.el) {
        iaEtat.el.classList.remove('pending');
        iaEtat.el.querySelector('.ia-body').innerHTML = texte ? mdVersHtml(texte) + sourcesVersHtml(sources) : '<em>Réponse interrompue.</em>';
        iaDefiler(iaEtat.el.parentElement);
    }
    if (texte) {
        const msg = { role: 'assistant', content: texte, t: Date.now() };
        if (sources && sources.length) msg.sources = sources.slice(0, 6);
        iaHist(mode).push(msg);
        utilisateur.iaHistorique[mode] = iaHist(mode).slice(-IA_MAX_HIST);
    } else {
        iaHist(mode).pop();                      // question sans réponse : on la retire
    }
    sauverProfil();
    iaFin(mode);
});

socket.on('ai_error', (d) => {
    if (!d || d.reqId !== iaEtat.reqId || !iaEtat.actif) return;
    iaEchec(iaEtat.actif, d.error || 'L’IA est momentanément indisponible.', iaEtat.buf.trim() === '');
});

socket.on('disconnect', () => {
    if (iaEtat.actif) iaEchec(iaEtat.actif, 'Connexion perdue pendant la réponse.', iaEtat.buf.trim() === '');
});

function iaFin(mode) {
    Object.assign(iaEtat, { actif: null, reqId: null, buf: '', el: null, sources: null });
    iaBasculerBouton(mode, false);
}

/** Échec : on retire la question de l'historique (si rien n'a été reçu) et on la remet dans la zone de saisie. */
function iaEchec(mode, message, retirerQuestion, sansCle) {
    const question = iaEtat.question;
    const el = iaEtat.el;
    if (iaEtat.raf) { cancelAnimationFrame(iaEtat.raf); iaEtat.raf = 0; }
    const partiel = iaEtat.buf.trim();

    // Mister ELAWS sans clé serveur : on garde l'ancienne réponse locale, limitée mais utile hors ligne
    if (sansCle && mode === 'general' && typeof genererReponseElaws === 'function' && question) {
        const rep = genererReponseElaws(question);
        if (el) { el.classList.remove('pending'); el.querySelector('.ia-body').innerHTML = mdVersHtml(rep) + '<p class="ia-note">Mode limité : l’IA complète n’est pas encore activée sur le serveur.</p>'; }
        iaHist(mode).push({ role: 'assistant', content: rep, t: Date.now() });
        sauverProfil();
        iaFin(mode);
        return;
    }

    if (el) {
        el.classList.remove('pending');
        el.classList.add('error');
        el.querySelector('.ia-body').innerHTML = (partiel ? mdVersHtml(partiel) : '') + `<p class="ia-note err">⚠️ ${escapeHtml(message)}</p>`;
    }
    if (partiel) {
        iaHist(mode).push({ role: 'assistant', content: partiel, t: Date.now() });
    } else if (retirerQuestion) {
        iaHist(mode).pop();
        const input = document.getElementById(IA_CFG[mode].input);
        if (input && !input.value) input.value = question;
    }
    sauverProfil();
    iaFin(mode);
}

function arreterIA(mode) {
    if (iaEtat.actif === mode) socket.emit('ai_cancel');
}

function nouvelleDiscussionIA(mode) {
    if (iaEtat.actif === mode) arreterIA(mode);
    if (!iaHist(mode).length) return;
    if (!confirm('Effacer cette discussion ?')) return;
    utilisateur.iaHistorique[mode] = [];
    socket.emit('ai_reset', { mode });             // le serveur oublie aussi le fil
    sauverProfil();
    rendreIA(mode);
}

function ouvrirIA(mode) {
    switchTab(mode === 'metier' ? 'ia-metier' : 'elaws-ia');
}

// Suggestions et outils cliquables
document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('.ia-chip');
    if (c) { envoyerQuestionIA(c.dataset.ia, c.dataset.q); return; }
    const t = e.target.closest && e.target.closest('.ia-tool');
    if (t) { const o = IA_OUTILS[Number(t.dataset.tool)]; if (o) envoyerQuestionIA('metier', o.q); }
});

// Compatibilité avec l'ancien code
function poserQuestionElaws() { envoyerQuestionIA('general'); }
function poserQuestionMetier() { envoyerQuestionIA('metier'); }

function basculerEcouteVocaleIA(mode) {
    mode = mode === 'metier' ? 'metier' : 'general';
    const statusEl = document.getElementById(mode === 'metier' ? 'micStatusMetier' : 'micStatusElaws');
    const inputEl = document.getElementById(IA_CFG[mode].input);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Reconnaissance vocale non supportée sur ce navigateur.'); return; }
    const rec = new SR();
    rec.lang = 'fr-FR';
    if (statusEl) statusEl.textContent = '🎙️ Je vous écoute…';
    rec.onresult = (ev) => {
        inputEl.value = ev.results[0][0].transcript;
        if (statusEl) statusEl.textContent = '';
        envoyerQuestionIA(mode);
    };
    rec.onerror = rec.onend = () => { if (statusEl) statusEl.textContent = ''; };
    rec.start();
}

// ---------- Historique des appels & appels manqués (v4.5) ----------
const JOURNAL_MAX = 200;
let filtreAppels = 'tous';

const LIBELLES_APPEL = {
    manque: 'Appel manqué', repondu: 'Répondu', refuse: 'Refusé', occupe: 'Occupé',
    hors_ligne: 'Hors ligne', sans_reponse: 'Sans réponse', annule: 'Annulé', echec: 'Échec'
};

function journal() {
    utilisateur.journalAppels = utilisateur.journalAppels || [];
    return utilisateur.journalAppels;
}

function appelsManquesNonVus() {
    return utilisateur ? journal().filter(e => e.statut === 'manque' && !e.vu).length : 0;
}

function ajouterAuJournal(e) {
    if (!utilisateur) return;
    const j = journal();
    j.unshift(e);
    if (j.length > JOURNAL_MAX) j.length = JOURNAL_MAX;
    // si on est déjà sur l'écran des appels, un appel manqué est « vu » tout de suite
    const tab = document.getElementById('tab-appels');
    if (tab && tab.style.display !== 'none' && !document.hidden) e.vu = true;
    sauverProfil();
    majBadges();
    if (tab && tab.style.display !== 'none') rendreJournalAppels();
}

/** Enregistre l'appel qui se termine (à appeler AVANT de remettre Call à zéro). */
function journaliserAppel(cause) {
    if (!utilisateur || !Call.peer || Call.state === 'idle') return;
    const sortant = !!Call.isCaller;
    let statut;
    if (Call.state === 'connected') statut = 'repondu';
    else if (sortant) statut = cause || 'annule';
    else statut = cause || (Call.state === 'ringing' ? 'manque' : 'echec');
    const duree = (statut === 'repondu' && Call.startedAt) ? Math.round((Date.now() - Call.startedAt) / 1000) : 0;
    ajouterAuJournal({
        id: Call.id || ('l' + Date.now()), peer: Call.peer, nom: nomPourTel(Call.peer),
        dir: sortant ? 'out' : 'in', type: Call.type || 'audio', statut, ts: Date.now(), duree,
        vu: statut !== 'manque'
    });
    if (!sortant && statut === 'manque') notifierAppelManque(Call.peer);
}

/** Appel manqué : bandeau dans l'app et, si l'app est cachée, notification du téléphone */
async function notifierAppelManque(tel) {
    const nom = nomPourTel(tel);
    montrerNotification('📵 Appel manqué de ' + nom, () => switchTab('appels'));
    try {
        if (document.hidden && notificationsPretes()) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification('📵 Appel manqué', {
                body: nom + ' a essayé de vous joindre', tag: 'evat-missed', renotify: true,
                icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200],
                data: { type: 'missed', from: tel }
            }).catch(() => {});
        }
    } catch (e) {}
}

// Appels manqués pendant que le téléphone était éteint / l'app fermée (envoyés par le serveur à la reconnexion)
socket.on('missed_calls', (liste) => {
    if (!Array.isArray(liste) || !utilisateur) return;
    let ajoutes = 0;
    liste.forEach(c => {
        const id = c.callId || ('srv' + c.at);
        if (journal().some(e => e.id === id)) return;
        ajouterAuJournal({
            id, peer: c.from, nom: c.fromName || nomPourTel(c.from), dir: 'in',
            type: c.callType === 'video' ? 'video' : 'audio', statut: 'manque', ts: c.at || Date.now(), duree: 0, vu: false
        });
        ajoutes++;
    });
    if (ajoutes) montrerNotification('📵 ' + ajoutes + ' appel' + (ajoutes > 1 ? 's' : '') + ' manqué' + (ajoutes > 1 ? 's' : ''), () => switchTab('appels'));
});

function marquerAppelsVus() {
    if (!utilisateur) return;
    let change = false;
    journal().forEach(e => { if (!e.vu) { e.vu = true; change = true; } });
    if (change) { sauverProfil(); majBadges(); }
    fermerNotificationsManquees();
}

async function fermerNotificationsManquees() {
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) (await reg.getNotifications({ tag: 'evat-missed' })).forEach(n => n.close());
    } catch (e) {}
}

function dureeTexte(s) {
    if (!s) return '';
    if (s < 60) return s + ' s';
    return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
}

function filtrerAppels(f) {
    filtreAppels = f;
    document.querySelectorAll('.appels-filtres [data-filtre]').forEach(b => b.classList.toggle('active', b.dataset.filtre === f));
    rendreJournalAppels();
}

function rendreJournalAppels() {
    const box = document.getElementById('listeAppels');
    if (!box || !utilisateur) return;
    let liste = journal();
    if (filtreAppels === 'manques') liste = liste.filter(e => e.statut === 'manque');
    if (!liste.length) {
        box.innerHTML = `<div class="empty-state"><div class="empty-ico">📞</div><p>${filtreAppels === 'manques' ? 'Aucun appel manqué.' : 'Aucun appel pour le moment.<br>Appelez un contact depuis l’onglet Contacts.'}</p></div>`;
        return;
    }
    let jour = '', html = '';
    liste.forEach(e => {
        const j = libelleJour(e.ts);
        if (j !== jour) { jour = j; html += `<div class="conv-section">${escapeHtml(j)}</div>`; }
        const manque = e.statut === 'manque';
        const nom = (utilisateur.contacts || []).find(c => c.telephone === e.peer);
        const affiche = nom ? nom.nom : (e.nom || e.peer);
        const fleche = e.dir === 'in' ? '↙' : '↗';
        const sous = [LIBELLES_APPEL[e.statut] || '', e.type === 'video' ? '📹 Vidéo' : '', heureCourte(e.ts), dureeTexte(e.duree)].filter(Boolean).join(' · ');
        html += `<div class="appel-item ${manque ? 'manque' : ''}">
            <span class="avatar sm">${escapeHtml(initialesDe(affiche))}</span>
            <div class="appel-body"><strong>${escapeHtml(affiche)}</strong>
              <span class="appel-sub"><i class="dir">${fleche}</i> ${escapeHtml(sous)}</span></div>
            <div class="appel-actions">
              <button type="button" class="btn-icon" data-rappel="audio" data-tel="${escapeHtml(e.peer)}" aria-label="Rappeler">📞</button>
              <button type="button" class="btn-icon" data-rappel="video" data-tel="${escapeHtml(e.peer)}" aria-label="Appel vidéo">📹</button>
            </div></div>`;
    });
    box.innerHTML = html;
}

function viderJournalAppels() {
    if (!utilisateur || !journal().length) return;
    if (!confirm('Effacer tout l’historique des appels ?')) return;
    utilisateur.journalAppels = [];
    sauverProfil();
    majBadges();
    rendreJournalAppels();
}

document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#listeAppels [data-rappel]');
    if (b) lancerAppelDirectPeer(b.dataset.rappel === 'video' ? 'video' : 'audio', b.dataset.tel);
});


// ---------- Globe terrestre réel (v4.5) ----------
/*  La sphère de Mister ELAWS est la Terre : vraie image satellite (NASA Blue Marble, domaine public) chargée une fois
    depuis un CDN public puis gardée en cache. Pendant le chargement (ou hors ligne), un globe dessiné localement
    prend le relais. Rendu en canvas 2D : rotation, éclairage du soleil, relief des océans, atmosphère bleue.
    Une seule boucle d'animation pour tous les globes, en pause quand l'application est cachée.                  */

const GLOBE_URLS = [
    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
];
const GLOBE = {
    TW: 1024, TH: 512, tex: null, eau: null, reel: false,
    instances: [], raf: 0, dernier: 0, spin: 0.62, statique: false
};

/* ---------- Texture de secours : continents simplifiés [lon, lat] ---------- */
const TERRES = [
    // Amérique du Nord
    [[-168,66],[-162,70],[-156,71.5],[-141,70],[-128,70],[-115,68],[-95,72],[-86,70],[-82,67],[-88,64],[-94,60],[-93,57],[-85,55],[-80,52],[-78,57],[-77,62],[-70,60],[-65,60],[-62,57],[-56,52],[-60,47],[-66,45],[-70,43],[-70,41.5],[-74,40],[-76,37],[-76,35],[-81,31],[-80,26],[-82,26],[-83,29.5],[-89,30],[-94,29.5],[-97,26],[-97.5,22],[-95,18.5],[-91,18.5],[-90,21],[-87,21.5],[-88,16],[-84,15.5],[-83,11],[-81,9],[-77.5,8.5],[-78,7],[-80,7.5],[-83.5,8.5],[-86,11],[-87.5,13],[-92,14.5],[-95,16],[-98,16],[-103,18.5],[-105.5,20.5],[-105,23],[-109,25.5],[-112,29.5],[-115,29.5],[-114,31.5],[-112,28],[-110,23],[-112,24.5],[-115,28],[-117,32.5],[-120.5,34.5],[-122.5,37.5],[-124,40.5],[-124.5,46],[-123,48.5],[-125,50],[-130,54.5],[-135,58.5],[-140,60],[-148,60.5],[-152,58.5],[-158,56.5],[-164,54.5],[-160,58.5],[-165,61],[-165,64.5]],
    // Groenland, grandes îles arctiques
    [[-73,78.5],[-60,82],[-30,83.5],[-18,81.5],[-20,75],[-22,70],[-30,68],[-40,65],[-43,60],[-48,61],[-53,66],[-55,70],[-60,76]],
    [[-80,73],[-68,70],[-62,66.5],[-65,63],[-72,64.5],[-78,64],[-73,68]],
    [[-118,72],[-105,73],[-102,69.5],[-114,69]],
    [[-90,77],[-75,79],[-62,82],[-80,83],[-92,81]],
    // Amérique du Sud
    [[-77.5,8.5],[-72,12],[-64,10.5],[-60,8.5],[-52,5],[-50,0],[-44,-2.5],[-35,-5.5],[-35,-9],[-39,-14],[-39,-18],[-41,-22],[-48,-25.5],[-48.5,-28.5],[-53,-34],[-58,-34.5],[-57,-38],[-62,-39],[-65,-41],[-64.5,-45],[-67.5,-46.5],[-66,-48.5],[-69,-51],[-68.5,-52.5],[-72,-53.5],[-75,-50],[-73.5,-42],[-73.5,-37],[-71.5,-30],[-70.5,-20],[-70.3,-18],[-76,-14],[-79,-8],[-81,-5],[-80,-1],[-80,1.5],[-78.5,2.5],[-77.5,7]],
    // Afrique + Madagascar
    [[-17,21],[-16.5,24],[-13,27.5],[-9.5,30],[-9.5,32.5],[-6,35.8],[-2,35.2],[3,36.8],[10,37.2],[11,33.5],[15,32.3],[19.5,30.5],[20,32.5],[25,32],[32,31.2],[34,27.5],[36,22],[37.5,18],[39.5,15.5],[43,12.5],[45,10.5],[51.2,11.8],[50.5,9],[48,5],[44,1.5],[41,-2],[39.5,-6],[40.5,-10.5],[40.5,-15],[35,-20],[35.5,-24.5],[32.8,-26],[31,-30],[27,-33.5],[22,-34],[18.5,-34.2],[17.5,-30.5],[14.5,-23],[11.8,-17],[13.5,-10],[12,-5],[9.5,-1],[9.5,3.5],[6,4.5],[2,6],[-4,5],[-8,4.4],[-12,7.5],[-15,10.5],[-17,14.5]],
    [[49.5,-12],[50.5,-15.5],[47.5,-25],[44.5,-25],[43.5,-21],[44.5,-16]],
    // Eurasie
    [[-9,37],[-9.5,43],[-1.8,43.5],[-1.2,46],[-4.5,48.3],[-1.5,48.8],[1.5,50.5],[4.5,52.5],[8.5,54],[8.5,57.2],[10.5,57.6],[10.5,54.8],[14,54],[19,54.5],[21,56.5],[24,57.5],[24,59.5],[29,60],[22,60.2],[21.5,63],[25,65.2],[22,65.7],[17.5,62.5],[19,60.5],[16.5,56.5],[12.8,55.8],[11,59],[8,58],[5.5,59.5],[5,62],[10,64.5],[14,67.5],[19,70],[26,71],[31,70],[40,67.5],[41,66],[33,66.3],[34.5,64.5],[40.5,64.5],[44,66.5],[48,68],[54,68.5],[60,69.5],[68,69],[69,72],[72,73],[80,73.5],[87,75],[100,77],[106,77.5],[113,74],[125,73.5],[130,71],[140,72.5],[150,71.5],[160,70],[170,69.8],[180,68.8],[180,64.8],[177,62.5],[170,60],[163,59.5],[163,57],[156,51],[155.5,57],[150,59.2],[142,59],[136,54.5],[140.5,53],[141,48.5],[137,45],[132,43],[129.5,41],[129,37],[126.5,34.8],[126.5,37.5],[124.5,39.5],[121.5,39],[122,37.5],[119,37],[120.5,35],[122,31.5],[121,28],[119,25],[115,22.5],[110.5,21],[108,21.5],[106,19],[108.5,15.5],[109,11.5],[105,8.7],[104.5,10.5],[100.5,13.2],[99.5,9.5],[100.5,6.5],[103.5,1.5],[101.2,2.8],[98.5,8.5],[98.5,13.5],[97.5,16.5],[94.5,16],[94,19],[92,21.5],[89,22],[86.5,20.5],[82,16.5],[80.2,14],[79.8,10.2],[77.5,8],[76,10.5],[73.5,16.5],[72.8,21],[70,21],[68.5,23.5],[66.5,25.2],[61.5,25.2],[57,25.8],[56.2,27],[51.5,28],[50,30],[48.5,30],[48,29],[50.5,26.5],[51.5,24.5],[54,24],[56,25.5],[56.8,24.2],[59.5,22.5],[57.5,19],[55,17],[52,16],[48.5,14],[44,12.7],[43.2,13.5],[42.5,16.5],[39,21.5],[35.5,28],[34.8,29.5],[34.3,31],[35,33.5],[36,36],[32,36.3],[28,36.6],[26.5,38.5],[26.5,40],[29,41],[31,41.2],[36,41.7],[41,41],[41.5,42.5],[38,44.5],[36.5,45.5],[33,45.5],[33.5,46.2],[31,46.5],[29.8,45.3],[28.5,43.5],[28,41.8],[26,40.8],[23,40.5],[24,38],[22.8,36.5],[21.5,37.5],[19.5,40],[19.5,42],[16,43.5],[13.5,45.2],[12.3,44.5],[14,42],[16.5,41],[18.5,40],[16.5,38.2],[15.8,38],[16,40],[12.5,41.5],[10.5,43.5],[8.5,44.4],[6.5,43.2],[3.2,43.2],[3,41.8],[0.5,40.5],[-0.5,38.5],[-1,37],[-2,36.7],[-5,36.2],[-5.8,36],[-6.5,37],[-8.8,37]],
    // Îles : Royaume-Uni, Irlande, Islande, Japon, Hokkaido, Sri Lanka, Cuba, Hispaniola
    [[-5.5,50],[1.5,51],[1.7,53],[-0.5,54.5],[-2,56],[-2,57.7],[-3,58.6],[-5,58.5],[-6,57],[-5,55],[-3,54.8],[-3,53.4],[-4.5,52],[-5,51.7]],
    [[-10,51.8],[-6,52],[-6,54.5],[-8,55.2],[-10,54]],
    [[-24,65.5],[-18,66.5],[-14,65],[-18,63.5],[-22,63.8]],
    [[130,31],[132,33.5],[135,34],[137,34.5],[140,35],[141,38],[142,40],[141.5,41.5],[140,41],[139.5,40],[139,38],[137,36.8],[135,35.5],[132,35.5],[130,34]],
    [[140,42],[143,42],[145.5,43.5],[142,45.5],[140,43]],
    [[79.8,9.5],[81.8,7.5],[80.5,6],[79.8,7.5]],
    [[-85,22],[-80,23],[-74,20],[-77.5,19.8],[-82,22.5]],
    [[-74.5,19.8],[-69,19.5],[-68.5,18.3],[-72,18]],
    [[52,71],[57,70.7],[69,76.5],[60,76.3]],
    // Asie du Sud-Est
    [[95.5,5.5],[98,4],[104,-1],[106,-3.5],[104,-5.5],[101,-3],[97,2]],
    [[109,1.5],[111,2],[114,4.5],[117,7],[119,5],[118,1],[116,-4],[112,-3.5],[110,-3],[109,0]],
    [[105.5,-6.5],[108,-6.5],[114,-7.5],[114.5,-8.5],[106,-7.5]],
    [[119,-5],[120,-1],[121,1],[125,1.5],[123,-1],[122,-4],[121,-5],[119,-5.5]],
    [[131,-1],[134,-3],[138,-1.5],[141,-2.5],[145,-4.5],[148,-6],[150.5,-10.5],[147,-10],[143,-9],[141,-9],[138,-8.5],[137,-5.5],[133,-4]],
    [[120,18.5],[122,18.5],[122,14.5],[124,13],[121,13.5],[120,16]],
    [[122,8],[125,9.5],[126.5,7],[125.5,5.8],[123,7.5]],
    // Océanie
    [[114,-22],[114,-26],[115,-34],[119,-35],[124,-33.5],[131,-31.5],[135,-35],[138,-35.5],[140,-38],[144,-38.5],[147,-39],[150,-37],[153,-31],[153,-26],[149,-20],[146,-18.5],[145.5,-14.5],[142.5,-10.8],[141,-16.5],[136.5,-15.5],[137,-12],[132,-11.5],[129,-14.8],[126,-14],[122,-17.5],[119,-20]],
    [[145,-41],[148,-41],[147.5,-43.5],[146,-43.5]],
    [[173,-35],[176,-37.5],[178,-37.8],[175,-41.5],[174.5,-39.5]],
    [[172.5,-40.5],[174,-41.5],[171,-44.5],[169,-46.5],[166.5,-46],[168,-44],[171,-41.5]],
    // Antarctique
    [[-180,-78],[-150,-77],[-120,-74],[-100,-73],[-75,-72.5],[-65,-68],[-62,-65],[-57,-64.2],[-62,-68],[-65,-75],[-45,-78],[-30,-76],[-15,-71],[0,-70],[30,-69],[50,-67],[70,-68],[90,-66],[110,-66.5],[140,-66.5],[150,-70.5],[165,-72],[170,-77],[180,-78],[180,-90],[-180,-90]]
];
const DESERTS = [
    [[-16,17],[-10,26],[0,30],[10,31],[25,30],[34,27],[33,17],[24,15],[15,13],[0,15]],
    [[37,28],[48,30],[56,25],[52,17],[44,16],[40,21]],
    [[124,-20],[134,-23],[142,-26],[140,-30],[128,-31],[122,-26]],
    [[95,41],[110,44],[117,41],[105,38],[96,38]],
    [[14,-18],[20,-27],[16,-30],[12,-22]]
];
const FORETS = [
    [[-75,5],[-50,5],[-48,-8],[-60,-12],[-74,-8]],           // Amazonie
    [[8,6],[28,5],[30,-6],[14,-5],[9,0]],                    // Afrique centrale
    [[95,22],[108,22],[108,8],[100,2],[95,15]],              // Asie du Sud-Est
    [[95,-2],[118,5],[118,-4],[100,-4]]                      // Insulinde
];
const GLACES = [
    [[-60,60],[-18,60],[-18,84],[-73,84],[-73,76]],          // Groenland
    [[-180,72],[180,72],[180,90],[-180,90]]                  // Arctique
];

function polygone(ctx, pts, W, H, continuer) {
    if (!continuer) ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
        const x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
}

function construireTextureSecours() {
    const W = GLOBE.TW, H = GLOBE.TH;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a5f9a'); g.addColorStop(0.2, '#14508f'); g.addColorStop(0.5, '#0d4a8e'); g.addColorStop(0.8, '#14508f'); g.addColorStop(1, '#2a5f9a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // eaux peu profondes autour des côtes
    ctx.save(); ctx.shadowColor = 'rgba(90,190,230,0.9)'; ctx.shadowBlur = 9; ctx.fillStyle = '#3f8f4a';
    TERRES.forEach(p => { polygone(ctx, p, W, H); ctx.fill(); });
    ctx.restore();
    // terres : vert, puis déserts, forêts, glaces
    ctx.fillStyle = '#4b9a4e'; TERRES.forEach(p => { polygone(ctx, p, W, H); ctx.fill(); });
    ctx.save();
    ctx.beginPath(); TERRES.forEach(p => polygone(ctx, p, W, H, true)); ctx.clip();      // un seul chemin = union des continents
    ctx.fillStyle = '#7fa656';
    ctx.fillRect(0, H * (90 - 62) / 180, W, H * 14 / 180);                // taïga / toundra
    ctx.fillStyle = '#d2bf8a'; DESERTS.forEach(p => { polygone(ctx, p, W, H); ctx.fill(); });
    ctx.fillStyle = '#2c7a3d'; FORETS.forEach(p => { polygone(ctx, p, W, H); ctx.fill(); });
    ctx.fillStyle = '#eef3f8'; GLACES.forEach(p => { polygone(ctx, p, W, H); ctx.fill(); });
    ctx.fillRect(0, H * (90 - 72) / 180, W, H * 0.001);
    ctx.fillRect(0, H * 156.5 / 180, W, H);                                // banquise antarctique
    ctx.restore();
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {                               // grain naturel
        const n = (Math.random() - 0.5) * 12;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    definirTexture(d);
}

function definirTexture(rgba) {
    const W = GLOBE.TW, H = GLOBE.TH, eau = new Uint8Array(W * H);
    for (let i = 0, k = 0; i < rgba.length; i += 4, k++) {
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        eau[k] = (b > r + 22 && b >= g - 4) ? 1 : 0;                      // océans et lacs → reflet du soleil
    }
    GLOBE.tex = rgba;
    GLOBE.eau = eau;
}

/* ---------- Vraie image satellite (NASA Blue Marble) ---------- */
function chargerImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        const t = setTimeout(() => { img.src = ''; reject(new Error('délai dépassé')); }, 25000);
        img.onload = () => { clearTimeout(t); resolve(img); };
        img.onerror = () => { clearTimeout(t); reject(new Error('échec')); };
        img.src = url;
    });
}

async function chargerTextureTerre() {
    try {
        const c = navigator.connection;
        if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;   // économise les données
    } catch (e) {}
    for (const url of GLOBE_URLS) {
        try {
            const img = await chargerImage(url);
            const cv = document.createElement('canvas'); cv.width = GLOBE.TW; cv.height = GLOBE.TH;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, GLOBE.TW, GLOBE.TH);
            definirTexture(ctx.getImageData(0, 0, GLOBE.TW, GLOBE.TH).data);   // lève une erreur si l'image est « tainted »
            GLOBE.reel = true;
            fabriquerVignette();
            return;
        } catch (e) { /* source suivante */ }
    }
}

/* ---------- Un globe dessiné sur un <canvas> ---------- */
const LUMIERE = (() => { const l = [-0.55, 0.5, 0.68], n = Math.hypot(...l); return l.map(v => v / n); })();

function preparerGlobe(canvas) {
    const taille = parseInt(canvas.dataset.size, 10) || canvas.clientWidth || 44;
    const dpr = Math.min(window.devicePixelRatio || 1, taille > 120 ? 1.25 : 2);
    const n = Math.max(24, Math.round(taille * dpr));
    canvas.width = canvas.height = n;
    canvas.style.width = canvas.style.height = taille + 'px';
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(n, n);
    const incl = 0.4, cT = Math.cos(incl), sT = Math.sin(incl);
    const pix = [], rowv = [], u0 = [], lum = [], rim = [], spec = [], alpha = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const nx = (x + 0.5) / n * 2 - 1, ny = 1 - (y + 0.5) / n * 2, r2 = nx * nx + ny * ny;
            if (r2 >= 1.0) continue;
            const nz = Math.sqrt(1 - r2);
            const y1 = ny * cT + nz * sT, z1 = -ny * sT + nz * cT;           // inclinaison de l'axe
            const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
            const lon = Math.atan2(nx, z1);
            rowv.push(Math.min(GLOBE.TH - 1, Math.max(0, ((0.5 - lat / Math.PI) * GLOBE.TH) | 0)));
            u0.push(lon / (2 * Math.PI) + 0.5);
            const dif = nx * LUMIERE[0] + ny * LUMIERE[1] + nz * LUMIERE[2];
            lum.push(0.2 + 0.95 * Math.max(0, dif));
            // reflet du soleil sur l'eau
            const rx = 2 * dif * nx - LUMIERE[0], ry = 2 * dif * ny - LUMIERE[1], rz = 2 * dif * nz - LUMIERE[2];
            spec.push(Math.pow(Math.max(0, rz), 22) * 0.55 * (dif > 0 ? 1 : 0));
            rim.push(Math.pow(1 - nz, 2.6) * (0.35 + 0.65 * Math.max(0, dif + 0.3)));
            alpha.push(Math.max(0, Math.min(1, (1 - Math.sqrt(r2)) * n * 0.55)));
            pix.push((y * n + x) * 4);
        }
    }
    canvas.__g = { ctx, img, n, pix: Int32Array.from(pix), rowv: Uint16Array.from(rowv), u0: Float32Array.from(u0),
                   lum: Float32Array.from(lum), rim: Float32Array.from(rim), spec: Float32Array.from(spec), alpha: Float32Array.from(alpha) };
}

function dessinerGlobe(canvas, rotation) {
    const G = canvas.__g, T = GLOBE.tex, E = GLOBE.eau;
    if (!G || !T) return;
    const d = G.img.data, TW = GLOBE.TW, m = G.pix.length;
    for (let k = 0; k < m; k++) {
        let xi = ((G.u0[k] - rotation) * TW) | 0;
        xi = ((xi % TW) + TW) % TW;
        const ti = G.rowv[k] * TW + xi, t = ti * 4;
        const l = G.lum[k], rm = G.rim[k], sp = E[ti] ? G.spec[k] * 255 : 0;
        let r = T[t] * l + sp + rm * 90, g = T[t + 1] * l + sp + rm * 165, b = T[t + 2] * l + sp + rm * 255;
        const p = G.pix[k];
        d[p] = r > 255 ? 255 : r; d[p + 1] = g > 255 ? 255 : g; d[p + 2] = b > 255 ? 255 : b;
        d[p + 3] = G.alpha[k] * 255;
    }
    G.ctx.putImageData(G.img, 0, 0);
}

/** Petite image fixe du globe : sert d'icône dans les bulles de discussion */
function fabriquerVignette() {
    try {
        const c = document.createElement('canvas'); c.dataset.size = '72';
        preparerGlobe(c); dessinerGlobe(c, 0.52);
        document.documentElement.style.setProperty('--globe-img', 'url(' + c.toDataURL('image/png') + ')');
    } catch (e) {}
}

function initialiserGlobes() {
    document.querySelectorAll('canvas.globe').forEach(c => {
        if (c.__g) return;
        if (!GLOBE.tex) construireTextureSecours();
        preparerGlobe(c);
        GLOBE.instances.push(c);
        dessinerGlobe(c, GLOBE.spin);
    });
    GLOBE.instances = GLOBE.instances.filter(c => c.isConnected);
    if (!GLOBE.raf && !GLOBE.statique && GLOBE.instances.length) GLOBE.raf = requestAnimationFrame(boucleGlobes);
}

function boucleGlobes(t) {
    GLOBE.raf = requestAnimationFrame(boucleGlobes);
    if (document.hidden) return;
    if (t - GLOBE.dernier < 55) return;                                    // ~18 images/s : fluide et économe
    GLOBE.dernier = t;
    GLOBE.spin = (t / 1000) * 0.012;                                       // un tour en ~83 s
    GLOBE.instances = GLOBE.instances.filter(c => c.isConnected);
    GLOBE.instances.forEach(c => { if (c.offsetParent !== null) dessinerGlobe(c, GLOBE.spin); });
}

(function demarrerGlobes() {
    try { GLOBE.statique = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    const go = () => {
        initialiserGlobes();
        fabriquerVignette();
        // la vraie image est chargée un peu plus tard, sans gêner le démarrage
        (window.requestIdleCallback || (f => setTimeout(f, 2500)))(() => setTimeout(chargerTextureTerre, 1200));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();


// ---------- Initialisation ----------
document.addEventListener('DOMContentLoaded', initialiserSelecteurPays);   // après le chargement complet du script
document.addEventListener('DOMContentLoaded', () => {
    const welcomeModal = document.getElementById('welcomeModal');
    if (!utilisateur || !utilisateur.nom || !utilisateur.telephone) {
        if (welcomeModal) welcomeModal.style.display = 'flex';
    } else {
        if (welcomeModal) welcomeModal.style.display = 'none';
        appliquerInfosProfil();
        afficherContacts();
    }
    afficherNotesBlocNotes();
    afficherMessagesLocaux();

});

async function demanderPermissionsEtActiverProfil() {
    // Micro (pour les appels) + notifications (appels entrants / messages). La caméra est demandée seulement pour un appel vidéo.
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {}
    try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch (e) {}
    sauvegarderProfilBase();
    setTimeout(activerPush, 1500);
}

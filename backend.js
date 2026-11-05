'use strict';
/* backend.js : branche l'interface existante sur Supabase.
   Chargé APRÈS app.js et api.js, avec window.CANTINE_CONFIG défini (voir config.js).
   Principe : l'interface lit un cache local (S) rempli depuis la base ; chaque action
   appelle le serveur, puis recharge le cache et réaffiche. */
(function () {
  if (!BACKEND) return;
  const sb = API.sb;

  /* ---------- traductions ---------- */
  const PAYMAP = { paid: 'payé', due: 'à payer', refund_due: 'à rembourser', refunded: 'remboursé', void: 'à payer', pending: 'en attente', verify: 'à vérifier' };
  const ms = (t) => new Date(t).getTime();
  const fr = (e) => {
    const m = String((e && e.message) || e || '');
    if (/Invalid login/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
    if (/expired or is invalid|invalid.*(token|otp)/i.test(m)) return 'Code incorrect ou expiré. Redemandez un code.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if (/sms|twilio|provider/i.test(m)) return 'Envoi du SMS impossible pour le moment. Réessayez plus tard.';
    if (/already (been )?registered/i.test(m)) return 'Un compte existe déjà avec ce numéro. Connectez-vous.';
    if (/duplicate key/i.test(m)) return 'Cet élément existe déjà (numéro ou identifiant déjà utilisé).';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau.';
    if (/row-level security|permission denied/i.test(m)) return 'Votre compte n\'a pas ce droit.';
    return m || 'Une erreur est survenue.';
  };

  /* ---------- conversion base de données vers l'interface ---------- */
  const mapDish = (d) => ({ id: d.id, name: d.name, cat: d.category, price: d.price, desc: d.description, allergens: d.allergens || [], veg: d.veg, badge: d.badge || '', active: d.active, photo: d.photo_url || '' });
  const mapOrder = (o) => {
    const pm = S.settings.payments.find((p) => p.id === o.method);
    return {
      id: o.id, num: o.num, at: ms(o.created_at), name: o.name, phone: o.phone,
      pickupDate: o.pickup_date, pickupTime: String(o.pickup_time).slice(0, 5),
      items: (o.order_items || []).map((i) => ({ id: i.dish_id || 'formule', name: i.name, price: i.price, qty: i.qty })),
      subtotal: o.subtotal, credit: o.credit_used, due: o.due, method: o.method, ref: o.customer_ref || '',
      methodLabel: o.method === 'credit' ? 'Crédit client' : (pm ? pm.label : o.method),
      payStatus: PAYMAP[o.pay_status] || o.pay_status, status: o.status, clientId: o.client_id, note: o.note || '',
      history: (o.order_events || []).slice().sort((a, b) => a.id - b.id).map((e) => ({ s: e.status, at: ms(e.created_at), by: e.by_name })),
    };
  };
  const mapMoves = (rows) => rows.map((m) => ({ at: ms(m.created_at), delta: m.delta, motif: m.reason, by: m.by_name }));

  /* ---------- chargement du cache ---------- */
  const skeleton = () => ({ v: 1, seq: 0, settings: { name: 'Cantine', tagline: '', address: '', phone: '', email: '', style: 'nature', hours: {}, prepMin: 20, slot: 15, payments: [] },
    dishes: [], menuDuJour: { items: [], formulePrice: 0 }, orders: [], clients: [], users: [], stock: [], news: [], log: [] });

  const q = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data || []; };
  const one = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };

  async function refresh() {
    const N = skeleton();
    const [st, pm, di, md, nw] = await Promise.all([
      one(sb.from('settings').select('*').eq('id', 1).single()),
      q(sb.from('payment_methods').select('*').order('sort')),
      q(sb.from('dishes').select('*').order('category').order('name')),
      one(sb.from('menu_du_jour').select('*').eq('id', 1).single()),
      q(sb.from('news').select('*').order('created_at', { ascending: false })),
    ]);
    N.settings = { name: st.name, tagline: st.tagline, address: st.address, phone: st.phone, email: st.email || '', style: st.style,
      hours: st.hours || {}, legal: st.legal || {}, prepMin: st.prep_min, slot: st.slot_min, slotCap: st.slot_capacity || 0, notifyEmail: !!st.notify_email,
      payments: pm.filter((p) => p.id !== 'credit').map((p) => ({ id: p.id, label: p.label, kind: p.kind, hint: p.hint || '', details: p.details || {}, on: p.enabled })) };
    N.dishes = di.map(mapDish);
    N.menuDuJour = { items: md.dish_ids || [], formulePrice: md.formule_price };
    N.news = nw.map((n) => ({ id: n.id, title: n.title, body: n.body, at: ms(n.created_at), pinned: n.pinned, published: n.published }));
    S = N;   // les pages publiques peuvent déjà s'afficher

    const { data: { session } } = await sb.auth.getSession();
    const me = session ? await API.myProfile() : null;
    if (me && me.active) {                                   // ----- équipe
      ls.set('cantine-staff', me.id); ls.del('cantine-client');
      const since = new Date(Date.now() - 8 * 864e5).toISOString();
      const [or, stk, cl, mv, us, lg] = await Promise.all([
        q(sb.from('orders').select('*, order_items(*), order_events(*)').gte('created_at', since).order('created_at', { ascending: false })),
        q(sb.from('stock_items').select('*').order('name')),
        q(sb.from('clients').select('*').order('name')),
        q(sb.from('credit_movements').select('*').order('created_at', { ascending: false }).limit(500)),
        q(sb.from('profiles').select('*').order('created_at')),
        q(sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(120)),
      ]);
      N.orders = or.map(mapOrder);
      N.stock = stk.map((s) => ({ id: s.id, name: s.name, unit: s.unit, qty: Number(s.qty), min: Number(s.min_qty) }));
      N.clients = cl.map((c) => ({ id: c.id, name: c.name, phone: c.phone, pass: 'x', credit: c.credit,
        history: mapMoves(mv.filter((m) => m.client_id === c.id).reverse()) }));
      N.users = us.map((u) => ({ id: u.id, name: u.full_name, login: u.login, role: u.role, rights: u.rights || [], photo: u.photo_url || '', active: u.active, code: '' }));
      N.log = lg.map((l) => ({ at: ms(l.created_at), by: l.by_name, text: l.text }));
    } else if (session) {                                    // ----- client connecté
      const c = await API.myClient();
      if (c) {
        ls.set('cantine-client', c.id); ls.del('cantine-staff');
        N.clients = [{ id: c.id, name: c.name, phone: c.phone, pass: 'x', credit: c.credit, history: mapMoves(c.moves.slice().reverse()) }];
        N.orders = c.orders.map((o) => mapOrder({ ...o, order_events: [] }));
      } else { ls.del('cantine-client'); ls.del('cantine-staff'); }
    } else { ls.del('cantine-client'); ls.del('cantine-staff'); }
    S = N;
  }

  const run = async (fn, o = {}) => {
    try { await fn(); if (o.close) closeModal(); await refresh(); render(); if (o.ok) toast(o.ok, 'ok'); return true; }
    catch (e) { if (o.err) setErr(o.err, fr(e)); else toast(fr(e), 'bad'); return false; }
  };
  const toFile = async (dataUrl, name) => { const b = await (await fetch(dataUrl)).blob(); return new File([b], name, { type: b.type || 'image/jpeg' }); };

  /* ---------- suivi de commande (invité ou client) ---------- */
  const mineMap = () => { try { return JSON.parse(ls.get('cantine-mine2') || '{}'); } catch (e) { return {}; } };
  const rememberOrder = (num, ph) => { const m = mineMap(); m[num] = ph; ls.set('cantine-mine2', JSON.stringify(m)); };
  const trackCache = {};
  const mapTrack = (t, ph) => ({
    id: t.num, num: t.num, at: ms(t.created_at), name: t.name, phone: ph, status: t.status, payStatus: PAYMAP[t.pay_status] || t.pay_status,
    pickupDate: t.pickup_date, pickupTime: String(t.pickup_time).slice(0, 5), items: t.items.map((i) => ({ id: 'x', name: i.name, price: i.price, qty: i.qty })),
    subtotal: t.subtotal, credit: t.credit_used, due: t.due, history: [],
    methodLabel: t.method === 'credit' ? 'Crédit client' : ((S.settings.payments.find((p) => p.id === t.method) || {}).label || t.method),
  });
  async function loadTrack(num, ph) {
    const before = trackCache[num] && trackCache[num].ok ? trackCache[num].o.status + '|' + trackCache[num].o.payStatus : '';
    try { const t = await API.trackOrder(num, ph); trackCache[num] = t ? { ok: true, o: mapTrack(t, ph) } : { ok: false }; }
    catch (e) { trackCache[num] = { ok: false, err: fr(e) }; }
    const r = route(), after = trackCache[num].ok ? trackCache[num].o.status + '|' + trackCache[num].o.payStatus : '';
    if (isTyping() || modalOpen()) return;
    if (r.p[0] === 'suivi' && r.p[1] === num) render();
    else if (r.p[0] !== 'admin' && before !== after) render();          // la barre « commande en cours » change d'état
  }
  const phoneFor = (num) => mineMap()[num] || (client() && client().phone);
  const lookupPage = pageTrack;
  pageTrack = function (num) {
    if (!num) return lookupPage();
    const ph = phoneFor(num);
    if (!ph) return shell(`<section class="wrap pagehead" style="max-width:560px"><h1>Commande ${esc(num)}</h1><p class="lead">Confirmez votre numéro de téléphone pour l'afficher.</p>
      <form class="panel" style="margin-top:22px" data-form="lookup"><input type="hidden" name="num" value="${esc(num)}"><div class="field"><label for="l-ph">Téléphone</label><input class="input" id="l-ph" name="phone" type="tel" required></div><p class="err" role="alert" id="lkErr"></p><button class="btn" type="submit">Afficher</button></form></section>`);
    const c = trackCache[num];
    if (!c) { loadTrack(num, ph); return shell('<section class="wrap pagehead"><p class="lead">Chargement de votre commande…</p></section>'); }
    if (!c.ok) return shell(`<section class="wrap pagehead"><h1>Commande introuvable</h1><p class="lead">${esc(c.err || 'Vérifiez le numéro et le téléphone.')} <a href="#/suivi">Réessayer</a></p></section>`);
    return shell(trackView(c.o));
  };
  /* dernière commande passée sur cet appareil : alimente la barre « Ma commande en cours » */
  const latestNum = () => Object.keys(mineMap()).sort((a, b) => (+b.replace(/\D/g, '')) - (+a.replace(/\D/g, '')))[0] || '';
  currentOrderInfo = function () {
    const num = latestNum(); if (!num) return null;
    const c = trackCache[num]; if (!c || !c.ok) return null;
    return { num, status: c.o.status, payStatus: c.o.payStatus, pickupTime: c.o.pickupTime };
  };
  const pollLatest = () => {
    const num = latestNum(); if (!num) return;
    const c = trackCache[num];
    if (c && c.ok && (c.o.status === 'done' || c.o.status === 'cancelled')) return;
    const ph = phoneFor(num); if (ph) loadTrack(num, ph);
  };
  setTimeout(pollLatest, 1500);
  setInterval(() => {                                       // le suivi se met à jour tout seul
    const r = route();
    if (r.p[0] === 'suivi' && r.p[1]) { const ph = phoneFor(r.p[1]); if (ph) loadTrack(r.p[1], ph); }
    else if (r.p[0] !== 'admin') pollLatest();
  }, 15000);

  /* occupation des créneaux de retrait : lue au moment de choisir l'heure */
  const checkoutBase = pageCheckout; let slotAt = 0, slotBusy = false;
  pageCheckout = function () {
    if (!slotBusy && Date.now() - slotAt > 20000 && (S.settings.slotCap || 0) > 0) {
      slotBusy = true;
      const from = dkey(Date.now()), to = dkey(Date.now() + 6 * DAY);
      API.slotUsage(from, to).then((rows) => { slotUse = {}; rows.forEach((x) => { slotUse[x.pickup_date + ' ' + String(x.pickup_time).slice(0, 5)] = +x.n; }); })
        .catch(() => {}).finally(() => { slotAt = Date.now(); slotBusy = false; if (route().p[0] === 'commande' && !isTyping() && !modalOpen()) { captureDraft(); render(); } });
    }
    return checkoutBase();
  };

  /* ---------- temps réel (équipe) ---------- */
  let live = false; const known = {};
  const remember = () => S.orders.forEach((o) => { known[o.id] = o.status; });
  function startLive() {
    if (live || !staff() || !can('commandes')) return;
    live = true;
    API.onOrders(async () => {
      try {
        await refresh();
        const fresh = S.orders.filter((o) => o.status === 'new' && (known[o.id] === undefined || known[o.id] === 'awaiting'));
        remember();
        if (fresh.length) { toast(fresh.length > 1 ? fresh.length + ' nouvelles commandes' : 'Nouvelle commande reçue', 'ok'); beep(); notifyNew(fresh.length); }
        if (!modalOpen() && !isTyping()) render();
      } catch (e) { /* la prochaine mise à jour réessaiera */ }
    });
  }

  /* ---------- actions : remplacent les versions locales ---------- */
  save = function () {};                                    // plus de sauvegarde locale des données
  Object.assign(ACT, {
    clientAnon(el) {
      if (!need(isAdmin())) return; const id = el.dataset.id;
      askConfirm('Anonymiser ce client ? Son nom et son numéro seront remplacés dans le compte et dans ses commandes. Cette action est définitive.', 'Anonymiser', () => run(async () => { const r = await sb.rpc('anonymize_client', { p_client: id }); if (r.error) throw new Error(r.error.message); }, { ok: 'Client anonymisé' }), true);
    },
    otpReset() { ui.otpPhone = ''; render(); },
    async otpResend() { try { await API.sendOtp(ui.otpPhone); toast('Nouveau code envoyé', 'ok'); } catch (e) { toast(fr(e), 'bad'); } },
    async slogout() { await API.signOut(); await refresh(); location.hash = '#/admin'; render(); },
    async clogout() { await API.signOut(); await refresh(); render(); },
    async advance(el) {
      const o = S.orders.find((x) => x.id === el.dataset.id); if (!o || !need(can('commandes'))) return;
      run(() => API.setStatus(o.id, NEXT[o.status][0]));
    },
    async setStatus(el) {
      if (!need(can('commandes'))) return;
      const ok = await run(() => API.setStatus(el.dataset.id, el.dataset.v));
      const o = S.orders.find((x) => x.id === el.dataset.id); if (ok && o) orderModal(o);
    },
    async markPaid(el) { if (!need(can('commandes'))) return; await run(() => API.markPaid(el.dataset.id)); const o = S.orders.find((x) => x.id === el.dataset.id); if (o) orderModal(o); },
    async refundCredit(el) { if (!need(can('credits'))) return; await run(() => API.refundToCredit(el.dataset.id), { ok: 'Remboursé en crédit' }); const o = S.orders.find((x) => x.id === el.dataset.id); if (o) orderModal(o); },
    dishDelete(el) { const d = dish(el.dataset.id); if (!d) return; askConfirm('Supprimer « ' + d.name + ' » définitivement ? Vous pouvez aussi le désactiver.', 'Supprimer', () => run(() => API.deleteDish(d.id), { ok: 'Plat supprimé' }), true); },
    async stk(el) {
      if (!need(can('stocks'))) return; const s = S.stock.find((x) => x.id === el.dataset.id); if (!s) return;
      run(() => API.saveStock({ id: s.id, qty: Math.max(0, Math.round((s.qty + +el.dataset.v) * 10) / 10) }));
    },
    stockDelete(el) { const s = S.stock.find((x) => x.id === el.dataset.id); if (!s) return; askConfirm('Supprimer « ' + s.name + ' » des stocks ?', 'Supprimer', () => run(() => API.deleteStock(s.id)), true); },
    newsDelete(el) { const n = S.news.find((x) => x.id === el.dataset.id); if (!n) return; askConfirm('Supprimer l\'actualité « ' + n.title + ' » ?', 'Supprimer', () => run(() => API.deleteNews(n.id)), true); },
    userDelete(el) { const u = S.users.find((x) => x.id === el.dataset.id); if (!u || u.role === 'admin' || u.id === staff().id) return; askConfirm('Supprimer le compte de ' + u.name + ' ?', 'Supprimer', () => run(() => API.adminUsers({ action: 'delete', id: u.id }), { close: true }), true); },
    async style(el) { if (need(isAdmin())) run(() => API.saveIdentityAndStyle({ style: el.dataset.v })); },
    resetDemo() { toast('Non disponible en mode production.', 'bad'); },
    async payNow(el) {
      try { toast('Ouverture du paiement…'); location.href = await API.startPayment(el.dataset.id, phoneFor(el.dataset.id)); }
      catch (e) { toast(fr(e), 'bad'); }
    },
    cancelMine(el) {
      const num = el.dataset.id, ph = phoneFor(num);
      askConfirm('Annuler la commande ' + num + ' ?', 'Annuler la commande', async () => {
        try { await API.cancelMyOrder(num, ph); delete trackCache[num]; await refresh(); render(); toast('Commande annulée', 'ok'); }
        catch (e) { toast(fr(e), 'bad'); }
      }, true);
    },
  });

  Object.assign(CHG, {
    async dishActive(el) { if (!need(can('menus'))) { el.checked = !el.checked; return; } run(() => API.saveDish({ id: el.dataset.id, active: el.checked })); },
    async notifyEmail(el) { if (!need(isAdmin())) { el.checked = !el.checked; return; } run(() => API.saveIdentityAndStyle({ notify_email: el.checked })); },
    async payToggle(el) { if (!need(isAdmin())) { el.checked = !el.checked; return; } run(() => API.togglePayment(el.dataset.id, el.checked)); },
  });

  Object.assign(FORMS, {
    /* --- public --- */
    async checkout(f) {
      const fd = new FormData(f), fail = (m) => { setErr('coErr', m); const e = $('#coErr'); if (e) e.scrollIntoView({ block: 'center' }); return false; };
      const lines = cartLines(); if (!lines.length) return fail('Votre panier est vide.');
      const name = String(fd.get('name') || '').trim(), phone = normPhone(fd.get('phone'));
      if (!name) return fail('Indiquez votre nom.');
      if (phone.length !== 8) return fail('Le téléphone doit comporter 8 chiffres.');
      const op = pickupOptions().find((x) => x.key === fd.get('day')), time = fd.get('time');
      if (!op || !op.slots.includes(time)) return fail('Choisissez un créneau de retrait valide.');
      if (slotFull(op.key, time)) return fail('Ce créneau est complet : choisissez une autre heure.');
      const pm = payById(fd.get('method')); if (!pm || !pm.on) return fail('Choisissez un moyen de paiement.');
      const email = String(fd.get('email') || '').trim().toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Adresse e-mail invalide.');
      if (!fd.get('cgv')) return fail('Cochez l\'acceptation des conditions de vente et de la politique de confidentialité.');
      if (pm.kind === 'manual' && (cartTotal() - creditApplied()) > 0 && String(fd.get('ref') || '').replace(/\s/g, '').length < 6) return fail('Saisissez la référence de la transaction reçue par SMS après votre paiement.');
      setErr('coErr', '');
      const btn = $('#payBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
      try {
        const res = await API.placeOrder({ name, phone, date: op.key, time: time + ':00', items: cart.items.map((i) => ({ id: i.id, qty: i.qty })),
          method: pm.id, note: String(fd.get('note') || '').trim(), useCredit: !!fd.get('useCredit'), reference: String(fd.get('ref') || ''), email });
        rememberOrder(res.num, phone); cart.items = []; saveCart(); ui.draft = {};
        if (res.status === 'awaiting') {
          openModal(`<div class="center" style="padding:10px"><div class="spin"></div><h2 style="margin-bottom:8px">Redirection vers le paiement</h2><p class="muted">Vous allez régler ${money(res.due)} sur la page sécurisée du prestataire.</p></div>`, { lock: true, nofocus: true, label: 'Redirection vers le paiement' });
          try { location.href = await API.startPayment(res.num, phone); return; }
          catch (e) { closeModal(); toast('Paiement indisponible pour le moment. Réessayez depuis la page de suivi.', 'bad'); }
        }
        await refresh(); location.hash = '#/suivi/' + res.num; render();
        if (res.status !== 'awaiting') { if (typeof soundOk==='function') soundOk(); if (typeof confetti==='function') confetti(); toast('Commande envoyée. Merci !', 'ok'); } else if (typeof soundOk==='function') soundOk();
      } catch (e) { if (btn) { btn.disabled = false; btn.textContent = payBtnLabel(); } fail(fr(e)); }
    },
    async lookup(f) {
      const fd = new FormData(f), num = String(fd.get('num') || '').trim().toUpperCase(), ph = normPhone(fd.get('phone'));
      try {
        const t = await API.trackOrder(num, ph);
        if (!t) return setErr('lkErr', 'Aucune commande ne correspond à ce numéro et ce téléphone.');
        rememberOrder(num, ph); delete trackCache[num]; location.hash = '#/suivi/' + num; render();
      } catch (e) { setErr('lkErr', fr(e)); }
    },
    async otpSend(f) {
      const fd = new FormData(f), ph = normPhone(fd.get('phone'));
      if (ph.length !== 8) return setErr('acErr', 'Le téléphone doit comporter 8 chiffres.');
      try { await API.sendOtp(ph); ui.otpPhone = ph; ui.otpName = String(fd.get('name') || '').trim(); render(); toast('Code envoyé par SMS', 'ok'); }
      catch (e) { setErr('acErr', fr(e)); }
    },
    async otpVerify(f) {
      const code = String(new FormData(f).get('code') || '').replace(/\s/g, '');
      if (code.length < 4) return setErr('acErr', 'Saisissez le code reçu par SMS.');
      try { await API.verifyOtp(ui.otpPhone, code, ui.otpName); ui.otpPhone = ''; ui.otpName = ''; await refresh(); render(); toast('Connecté', 'ok'); }
      catch (e) { setErr('acErr', fr(e)); }
    },

    /* --- équipe --- */
    async slogin(f) {
      const fd = new FormData(f);
      try { await API.staffSignIn(String(fd.get('login')), String(fd.get('code'))); await refresh(); location.hash = '#/admin'; render(); startLive(); remember(); }
      catch (e) { setErr('slErr', fr(e)); }
    },
    async dish(f) {
      if (!need(can('menus'))) return;
      const fd = new FormData(f), id = f.dataset.id, name = String(fd.get('name') || '').trim(), price = Math.round(+fd.get('price'));
      if (!name || !(price >= 0)) return setErr('fErr', 'Indiquez un nom et un prix valides.');
      if (price % 5 !== 0) return setErr('fErr', 'Le prix doit être un multiple de 5 FCFA.');
      await run(async () => {
        const d = { name, category: fd.get('cat'), price, description: String(fd.get('desc') || '').trim(), allergens: fd.getAll('al'), veg: !!fd.get('veg'), badge: fd.get('badge'), active: !!fd.get('active') };
        if (id) d.id = id;
        if (tmpPhoto !== undefined) d.photo_url = tmpPhoto ? await API.uploadPhoto('dishes', await toFile(tmpPhoto, 'photo.jpg'), 'dishes') : null;
        await API.saveDish(d);
      }, { close: true, ok: 'Plat enregistré', err: 'fErr' });
    },
    async menuDuJour(f) {
      if (!need(can('menus'))) return; const fd = new FormData(f), p = Math.max(0, Math.round(+fd.get('formule') || 0));
      if (p % 5 !== 0) return toast('Le prix de la formule doit être un multiple de 5.', 'bad');
      run(() => API.saveMenuDuJour(fd.getAll('items'), p), { ok: 'Menu du jour enregistré' });
    },
    async stock(f) {
      if (!need(can('stocks'))) return; const fd = new FormData(f), id = f.dataset.id, name = String(fd.get('name') || '').trim(); if (!name) return;
      const s = { name, unit: fd.get('unit'), qty: +fd.get('qty') || 0, min_qty: +fd.get('min') || 0 }; if (id) s.id = id;
      run(() => API.saveStock(s), { close: true });
    },
    async credit(f, e) {
      if (!need(can('credits'))) return; const fd = new FormData(f), id = f.dataset.id, amt = Math.round(+fd.get('amount')), sub = e.submitter && e.submitter.value === 'sub';
      if (!(amt > 0)) return setErr('kErr', 'Indiquez un montant supérieur à 0.');
      const ok = await run(() => API.adjustCredit(id, sub ? -amt : amt, fd.get('motif')), { err: 'kErr', ok: 'Crédit mis à jour' });
      const c = S.clients.find((x) => x.id === id); if (ok && c) creditModal(c);
    },
    async clientNew(f) {
      if (!need(can('credits'))) return; const fd = new FormData(f), name = String(fd.get('name') || '').trim(), ph = normPhone(fd.get('phone'));
      if (!name || ph.length !== 8) return setErr('nErr', 'Indiquez un nom et un téléphone à 8 chiffres.');
      let id; const ok = await run(async () => { id = await API.createClient(name, ph); }, { err: 'nErr', close: true });
      const c = S.clients.find((x) => x.id === id); if (ok && c) creditModal(c);
    },
    async news(f) {
      if (!need(can('actualites'))) return; const fd = new FormData(f), id = f.dataset.id;
      const n = { title: String(fd.get('title')).trim(), body: String(fd.get('body')).trim(), pinned: !!fd.get('pinned'), published: !!fd.get('published') }; if (id) n.id = id;
      run(() => API.saveNews(n), { close: true, ok: 'Actualité enregistrée' });
    },
    async user(f) {
      if (!need(isAdmin())) return; const fd = new FormData(f), id = f.dataset.id, name = String(fd.get('name') || '').trim(), login = String(fd.get('login') || '').trim(), code = String(fd.get('code') || '');
      if (!name || !login) return setErr('uErr', 'Indiquez un nom et un identifiant.');
      if (!id && code.length < 6) return setErr('uErr', 'Le code d\'accès doit contenir au moins 6 caractères.');
      if (code && code.length < 6) return setErr('uErr', 'Le code d\'accès doit contenir au moins 6 caractères.');
      const u = id && S.users.find((x) => x.id === id);
      await run(async () => {
        if (!id) await API.adminUsers({ action: 'create', name, login, code, role: fd.get('role'), rights: fd.getAll('rights') });
        else if (u.role === 'admin') { if (code) await API.adminUsers({ action: 'update', id, code }); if (id === staff().id && name !== u.name) await API.updateMyProfile(name, null); }
        else await API.adminUsers({ action: 'update', id, name, role: fd.get('role'), rights: fd.getAll('rights'), active: !!fd.get('active'), code: code || undefined });
      }, { close: true, ok: 'Compte enregistré', err: 'uErr' });
    },
    async payDetails(f) {
      if (!need(isAdmin())) return; const fd = new FormData(f), id = f.dataset.id, g = (k) => String(fd.get(k) || '').trim();
      if (!g('merchant')) return toast('Indiquez le code ou le numéro marchand.', 'bad');
      run(async () => { const r = await sb.from('payment_methods').update({ details: { merchant: g('merchant'), name: g('name'), steps: g('steps') } }).eq('id', id); if (r.error) throw new Error(r.error.message); }, { ok: 'Informations de paiement enregistrées' });
    },
    async legal(f) {
      if (!need(isAdmin())) return; const fd = new FormData(f), g = (k) => String(fd.get(k) || '').trim(), r = g('retention');
      run(() => API.saveIdentityAndStyle({ legal: { company: g('company'), form: g('form'), nif: g('nif'), rccm: g('rccm'), director: g('director'), host: g('host'), contact: g('contact'), retention: r ? Math.max(1, Math.round(+r)) : '' } }), { ok: 'Informations légales enregistrées' });
    },
    async identity(f) { if (!need(isAdmin())) return; const fd = new FormData(f); run(() => API.saveIdentityAndStyle({ name: String(fd.get('name')).trim(), tagline: String(fd.get('tagline') || '').trim() }), { ok: 'Identité enregistrée' }); },
    async contact(f) {
      if (!need(isAdmin() || staff().role === 'gerant')) return; const fd = new FormData(f), s = S.settings;
      run(() => API.saveContact({ address: String(fd.get('address')).trim(), phone: String(fd.get('phone')).trim(), email: String(fd.get('email') || '').trim() || null, hours: s.hours, prep_min: s.prepMin, slot_min: s.slot }), { ok: 'Coordonnées enregistrées' });
    },
    async hours(f) {
      if (!need(isAdmin() || staff().role === 'gerant')) return; const fd = new FormData(f), h = {};
      for (let d = 0; d < 7; d++) {
        if (fd.get('o' + d)) { const a = fd.get('f' + d), b = fd.get('t' + d); if (!a || !b || toMin(a) >= toMin(b)) return toast('Vérifiez les horaires de ' + DAYNAMES[d] + ' : l\'ouverture doit précéder la fermeture.', 'bad'); h[d] = [a, b]; } else h[d] = null;
      }
      const s = S.settings;
      const cap = Math.max(0, Math.min(200, Math.round(+fd.get('cap') || 0)));
      run(async () => { await API.saveContact({ address: s.address, phone: s.phone, email: s.email || null, hours: h, prep_min: Math.max(5, +fd.get('prep') || 20), slot_min: +fd.get('slot') || 15 }); await API.setSlotCapacity(cap); }, { ok: 'Horaires enregistrés' });
    },
    async payAdd(f) {
      if (!need(isAdmin())) return; const l = String(new FormData(f).get('label') || '').trim(); if (!l) return;
      run(async () => { const r = await sb.from('payment_methods').insert({ id: 'p' + uid(), label: l, kind: 'momo', hint: 'Paiement mobile', enabled: true, sort: 50 }); if (r.error) throw new Error(r.error.message); });
    },
    async profile(f) {
      const u = staff(), fd = new FormData(f), name = String(fd.get('name') || '').trim(), code = String(fd.get('code') || ''); if (!name) return;
      if (code && code.length < 6) return toast('Le code doit contenir au moins 6 caractères.', 'bad');
      await run(async () => {
        const url = tmpPhoto ? await API.uploadPhoto('avatars', await toFile(tmpPhoto, 'avatar.jpg'), u.id) : null;
        await API.updateMyProfile(name, url);
        if (code) { const r = await sb.auth.updateUser({ password: code }); if (r.error) throw new Error(r.error.message); }
        tmpPhoto = undefined;
      }, { ok: 'Profil enregistré' });
    },
  });

  /* ---------- démarrage ---------- */
  S = skeleton();
  const waitScreen = (n) => { $('#app').innerHTML = `<div class="wrap" style="padding:80px 20px"><p class="lead">Chargement…${n > 1 ? ' nouvelle tentative (' + n + ')' : ''}</p></div>`; };
  const failScreen = (e) => {
    $('#app').innerHTML = `<div class="wrap" style="padding:60px 20px"><h1 style="font-size:2rem">Service momentanément indisponible</h1><p class="lead">${esc(fr(e))}</p><p class="muted small">Détail technique : ${esc(String((e && e.message) || e))}</p><button class="btn" id="retryBoot" style="margin-top:14px">Réessayer</button></div>`;
    const bt = $('#retryBoot'); if (bt) bt.onclick = boot;
  };
  // Quelques minutes après une mise à jour de la base, ou sur un réseau instable, le serveur peut répondre « indisponible »
  // pendant un instant : on réessaie automatiquement avant d'afficher une erreur.
  async function boot() {
    let last;
    for (let n = 1; n <= 5; n++) {
      waitScreen(n);
      try { await refresh(); render(); remember(); startLive(); return; }
      catch (e) { last = e; if (n < 5) await new Promise((r) => setTimeout(r, 1500 * n)); }
    }
    failScreen(last);
  }
  boot();
  document.addEventListener('visibilitychange', () => {       // au retour sur l'onglet, données à jour
    if (document.visibilityState === 'visible' && !modalOpen() && !isTyping()) refresh().then(render).catch(() => {});
  });
})();

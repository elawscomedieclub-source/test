// api.js : tout ce que le site peut demander au backend, en un seul endroit.
// Charger avant le reste du site :
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
//   <script>window.CANTINE_CONFIG = { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' }</script>
//   <script src="api.js"></script>
// La clé "anon" est publique par conception : la sécurité repose sur les règles RLS du schéma.

(() => {
  if (!window.CANTINE_CONFIG || !window.supabase) return;   // sans configuration : le site tourne en mode démonstration
  const { url, anonKey } = window.CANTINE_CONFIG;
  const sb = supabase.createClient(url, anonKey);
  const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const phoneKey = (p) => String(p || '').replace(/\D/g, '').replace(/^228(?=\d{8}$)/, '');
  const staffMail = (login) => `${login.trim().toLowerCase()}@staff.cantine.local`;
  const clientMail = (phone) => `${phoneKey(phone)}@clients.cantine.local`;

  window.API = {
    sb,

    /* ---------- lecture publique ---------- */
    async loadPublic() {
      const [settings, pay, dishes, mdj, news] = await Promise.all([
        sb.from('settings').select('*').eq('id', 1).single(),
        sb.from('payment_methods').select('*').eq('enabled', true).order('sort'),
        sb.from('dishes').select('*').eq('active', true).order('category').order('name'),
        sb.from('menu_du_jour').select('*').eq('id', 1).single(),
        sb.from('news').select('*').eq('published', true).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      return { settings: unwrap(settings), payments: unwrap(pay), dishes: unwrap(dishes), menuDuJour: unwrap(mdj), news: unwrap(news) };
    },

    /* ---------- commande ---------- */
    // items : [{ id: '<uuid>' | 'formule', qty }]  (aucun prix : le serveur les relit)
    async placeOrder({ name, phone, date, time, items, method, note, useCredit, reference, email }) {
      return unwrap(await sb.rpc('place_order', {
        p_name: name, p_phone: phone, p_pickup_date: date, p_pickup_time: time,
        p_items: items, p_method: method, p_note: note || '', p_use_credit: !!useCredit, p_reference: reference || '', p_email: email || '',
      }));
    },
    // Paiement en ligne : renvoie l'adresse de la page CinetPay (à ouvrir : location.href = payment_url)
    async startPayment(num, phone) {
      const { data, error } = await sb.functions.invoke('payment-init', { body: { num, phone } });
      if (error) throw new Error(error.message);
      return data.payment_url;
    },
    async trackOrder(num, phone) { return unwrap(await sb.rpc('track_order', { p_num: num, p_phone: phone })); },
    async cancelMyOrder(num, phone) { unwrap(await sb.rpc('cancel_order_client', { p_num: num, p_phone: phone })); },

    /* ---------- compte client : connexion par code SMS (aucun mot de passe) ---------- */
    async sendOtp(phone) {
      unwrap(await sb.auth.signInWithOtp({ phone: '+228' + phoneKey(phone), options: { channel: 'sms' } }));
    },
    async verifyOtp(phone, code, name) {
      unwrap(await sb.auth.verifyOtp({ phone: '+228' + phoneKey(phone), token: String(code).trim(), type: 'sms' }));
      return unwrap(await sb.rpc('claim_client', { p_name: name || '' }));   // le numéro vient du compte vérifié
    },
    async myClient() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const c = unwrap(await sb.from('clients').select('*').eq('auth_id', user.id).maybeSingle());
      if (!c) return null;
      const orders = unwrap(await sb.from('orders').select('*, order_items(*)').eq('client_id', c.id).order('created_at', { ascending: false }));
      const moves = unwrap(await sb.from('credit_movements').select('*').eq('client_id', c.id).order('created_at', { ascending: false }).limit(20));
      return { ...c, orders, moves };
    },
    signOut() { return sb.auth.signOut(); },

    /* ---------- équipe ---------- */
    async staffSignIn(login, code) {
      unwrap(await sb.auth.signInWithPassword({ email: staffMail(login), password: code }));
      const { data: { user } } = await sb.auth.getUser();
      const me = unwrap(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
      if (!me || !me.active) { await sb.auth.signOut(); throw new Error('Compte désactivé ou inconnu'); }
      return me;
    },
    myProfile: async () => {
      const { data: { user } } = await sb.auth.getUser();
      return user ? unwrap(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()) : null;
    },
    adminUsers: async (body) => {                       // action: create | update | delete
      const { data, error } = await sb.functions.invoke('admin-users', { body });
      if (error) throw new Error(error.message);
      return data;
    },
    listTeam: async () => unwrap(await sb.from('profiles').select('*').order('created_at')),

    /* ---------- commandes (équipe) ---------- */
    listOrders: async (sinceISO) => unwrap(await sb.from('orders')
      .select('*, order_items(*), order_events(*)').gte('created_at', sinceISO).order('created_at', { ascending: false })),
    setStatus: async (id, status) => unwrap(await sb.rpc('set_order_status', { p_order: id, p_status: status })),
    markPaid: async (id) => unwrap(await sb.rpc('mark_order_paid', { p_order: id })),
    refundToCredit: async (id) => unwrap(await sb.rpc('refund_to_credit', { p_order: id })),
    // Temps réel : la cuisine voit les nouvelles commandes sans recharger la page
    onOrders(cb) {
      return sb.channel('orders-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cb)
        .subscribe();
    },

    /* ---------- plats, menu du jour, stocks, actualités ---------- */
    saveDish: async (d) => unwrap(await (d.id ? sb.from('dishes').update(d).eq('id', d.id) : sb.from('dishes').insert(d)).select().single()),
    deleteDish: async (id) => unwrap(await sb.from('dishes').delete().eq('id', id)),
    saveMenuDuJour: async (dish_ids, formule_price) => unwrap(await sb.from('menu_du_jour').update({ dish_ids, formule_price }).eq('id', 1)),
    async uploadPhoto(bucket, file, folder) {            // bucket : 'dishes' | 'avatars' (folder = id utilisateur)
      const path = `${folder || 'p'}/${Date.now()}-${file.name.replace(/[^\w.]+/g, '_')}`;
      unwrap(await sb.storage.from(bucket).upload(path, file, { upsert: true }));
      return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
    listStock: async () => unwrap(await sb.from('stock_items').select('*').order('name')),
    saveStock: async (s) => unwrap(await (s.id ? sb.from('stock_items').update({ ...s, updated_at: new Date().toISOString() }).eq('id', s.id) : sb.from('stock_items').insert(s)).select().single()),
    deleteStock: async (id) => unwrap(await sb.from('stock_items').delete().eq('id', id)),
    listNews: async () => unwrap(await sb.from('news').select('*').order('created_at', { ascending: false })),
    saveNews: async (n) => unwrap(await (n.id ? sb.from('news').update(n).eq('id', n.id) : sb.from('news').insert(n)).select().single()),
    deleteNews: async (id) => unwrap(await sb.from('news').delete().eq('id', id)),

    /* ---------- crédits clients ---------- */
    listClients: async () => unwrap(await sb.from('clients').select('*').order('name')),
    clientMoves: async (id) => unwrap(await sb.from('credit_movements').select('*').eq('client_id', id).order('created_at', { ascending: false })),
    adjustCredit: async (id, delta, reason) => unwrap(await sb.rpc('adjust_credit', { p_client: id, p_delta: delta, p_reason: reason })),
    createClient: async (name, phone) => unwrap(await sb.rpc('create_client_staff', { p_name: name, p_phone: phone })),

    /* ---------- paramètres et statistiques ---------- */
    saveIdentityAndStyle: async (patch) => unwrap(await sb.from('settings').update(patch).eq('id', 1)),   // admin : name, tagline, style
    saveContact: async (s) => unwrap(await sb.rpc('update_contact', { p_address: s.address, p_phone: s.phone, p_email: s.email, p_hours: s.hours, p_prep: s.prep_min, p_slot: s.slot_min })),
    togglePayment: async (id, enabled) => unwrap(await sb.from('payment_methods').update({ enabled }).eq('id', id)),
    slotUsage: async (from, to) => unwrap(await sb.rpc('slot_usage', { p_from: from, p_to: to })),
    setSlotCapacity: async (n) => unwrap(await sb.rpc('set_slot_capacity', { p_cap: n })),
    topDishes: async (sinceISO) => unwrap(await sb.rpc('top_dishes', { p_from: sinceISO })),
    activity: async () => unwrap(await sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(120)),
    updateMyProfile: async (name, photoUrl) => unwrap(await sb.rpc('update_my_profile', { p_name: name, p_photo: photoUrl || null })),
  };
})();

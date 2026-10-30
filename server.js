const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const registeredUsers = new Map();

function nettoyerTel(tel) {
    if(!tel) return '';
    return tel.replace(/\s+/g, '').trim();
}

io.on('connection', (socket) => {
    console.log('Un opérateur s\'est connecté:', socket.id);

    socket.on('register_user', (data) => {
        if(data && data.telephone) {
            const cleanTel = nettoyerTel(data.telephone);
            registeredUsers.set(cleanTel, {
                nom: data.nom,
                metier: data.metier,
                socketId: socket.id
            });
            console.log(`Utilisateur enregistré : ${data.nom} (${cleanTel}) - Socket: ${socket.id}`);
            
            socket.broadcast.emit('contact_registered', {
                nom: data.nom,
                telephone: cleanTel,
                metier: data.metier
            });
        }
    });

    socket.on('query_contacts', (telephones, callback) => {
        const resultats = [];
        if(Array.isArray(telephones)) {
            telephones.forEach(tel => {
                const cleanTel = nettoyerTel(tel);
                if(registeredUsers.has(cleanTel)) {
                    const usr = registeredUsers.get(cleanTel);
                    resultats.push({ telephone: cleanTel, metier: usr.metier, nom: usr.nom });
                }
            });
        }
        if(typeof callback === 'function') {
            callback(resultats);
        }
    });

    socket.on('p2p_signal', (data) => {
        if(data && data.target) {
            const cleanTarget = nettoyerTel(data.target);
            const targetUser = registeredUsers.get(cleanTarget);
            if(targetUser && targetUser.socketId) {
                io.to(targetUser.socketId).emit('p2p_signal', data);
                console.log(`Signal P2P (${data.type}) acheminé de ${data.sender} vers ${cleanTarget}`);
            } else {
                console.log(`Échec signal P2P : destinataire ${cleanTarget} introuvable ou non connecté.`);
            }
        }
    });

    socket.on('signal', (data) => {
        socket.broadcast.emit('signal', data);
    });

    
    socket.on('ai_query', async (data, callback) => {
        try {
            const question = data?.question || '';
            const nom = data?.nom || 'toi';
            const systemPrompt = `Tu es ELAWS. Réponds comme un humain intelligent et direct. Ne répète jamais la question. Pas de formules du type "j'ai bien reçu". Va à l'essentiel, dans la langue de l'utilisateur. L'utilisateur s'appelle ${nom}.`;
            const res = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: question }
                    ],
                    model: 'openai'
                })
            });
            if (res.ok) {
                const text = await res.text();
                if (typeof callback === 'function') callback({ reponse: (text || '').trim() });
            } else if (typeof callback === 'function') callback({ reponse: null });
        } catch (err) {
            console.log('AI proxy error:', err.message);
            if (typeof callback === 'function') callback({ reponse: null });
        }
    });

    socket.on('disconnect', () => {
        console.log('Un opérateur s\'est déconnecté:', socket.id);
        for (let [tel, val] of registeredUsers.entries()) {
            if (val.socketId === socket.id) {
                registeredUsers.delete(tel);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur de signalisation EVAT actif sur le port ${PORT}`);
});

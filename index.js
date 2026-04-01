const { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http'); // For the Keep-Alive server

// 🛡️ CONFIGURATION
const myNumber = process.env.PHONE_NUMBER; 
const PORT = process.env.PORT || 3000;

// 1. KEEP-ALIVE SERVER (Prevents the panel from sleeping)
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is Running');
}).listen(PORT, () => {
    console.log(`🚀 Keep-alive server listening on port ${PORT}`);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    // 🔑 PAIRING CODE LOGIC
    if (!sock.authState.creds.registered) {
        if (!myNumber) {
            console.error("❌ PHONE_NUMBER variable missing in Panel!");
            process.exit(1);
        }
        setTimeout(async () => {
            let code = await sock.requestPairingCode(myNumber.replace(/[^0-9]/g, ''));
            console.log(`\n💎 PAIRING CODE: ${code}\n`);
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    // 🛡️ ANTI-BAN REPLY LOGIC
    const safeReply = async (jid, text) => {
        await delay(Math.floor(Math.random() * 2000) + 1500); // Human pause
        await sock.sendPresenceUpdate('composing', jid); // Typing...
        await delay(Math.min(text.length * 40, 3000)); // Typing speed
        await sock.sendMessage(jid, { text });
        await sock.sendPresenceUpdate('paused', jid);
    };

    // MESSAGE LISTENER
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe || type !== 'notify') return;

        const remoteJid = m.key.remoteJid;
        const msgText = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase();

        if (msgText === '.ping') {
            await safeReply(remoteJid, 'Pong! 🏓 Bot is active.');
        }
        
        if (msgText === '.hi') {
            await safeReply(remoteJid, 'Hello! I am your custom WhatsApp bot. How can I help you today?');
        }
    });

    // CONNECTION HANDLER
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
        }
    });
}

startBot();

const { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const http = require('http');
const readline = require('readline'); // Added for terminal input

// 🛡️ CONFIGURATION
const PORT = process.env.PORT || 3000;

// Setup terminal interface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// 1. KEEP-ALIVE SERVER
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
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Important for pairing
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    // 🔑 PAIRING CODE LOGIC (Updated to ask you)
    if (!sock.authState.creds.registered) {
        let phoneNumber = process.env.PHONE_NUMBER;

        if (!phoneNumber) {
            console.log("\n⚠️ PHONE_NUMBER not found in Panel settings.");
            phoneNumber = await question('👉 Please type your WhatsApp number (e.g., 2348012345678): ');
        }

        // Wait a few seconds for the connection to stabilize
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                console.log(`\n💎 YOUR PAIRING CODE: ${code}\n`);
                console.log("Go to WhatsApp > Linked Devices > Link with Phone Number to enter it.");
            } catch (err) {
                console.error("❌ Failed to get pairing code. Restarting...", err);
                process.exit(1);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    // 🛡️ ANTI-BAN REPLY LOGIC
    const safeReply = async (jid, text) => {
        await delay(Math.floor(Math.random() * 2000) + 1500); 
        await sock.sendPresenceUpdate('composing', jid); 
        await delay(Math.min(text.length * 40, 3000)); 
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

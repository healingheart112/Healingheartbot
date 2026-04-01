const { 
    makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestBaileysVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

// Setup for terminal input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // We disable QR because we want the CODE
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"] // Required for pairing code to work
    });

    // --- THE PAIRING CODE LOGIC ---
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('Enter your WhatsApp number with Country Code (e.g., 2348012345678): ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n🔥 YOUR PAIRING CODE: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Connected Successfully!');
        }
    });

    // Basic Command Listener
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;
        const msgText = m.message.conversation || m.message.extendedTextMessage?.text;

        if (msgText === '.menu') {
            await sock.sendMessage(m.key.remoteJid, { text: 'Bot Active! 🤖\nCommands: .ping, .hi' });
        }
    });
}

startBot();


const {
    REST,
    Routes
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    throw new Error(
        'TOKEN, CLIENT_ID veya GUILD_ID .env dosyasında eksik!'
    );
}

const commands = [];

const foldersPath = path.join(__dirname, 'commands');

if (!fs.existsSync(foldersPath)) {
    throw new Error('commands klasörü bulunamadı!');
}

const commandFiles = fs.readdirSync(foldersPath)
    .filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    try {
        const filePath = path.join(foldersPath, file);
        const command = require(filePath);

        if (command.data && command.execute) {
            commands.push(command.data.toJSON());

            console.log(
                `[BAŞARILI] ${command.data.name} yüklendi.`
            );
        } else {
            console.log(`[UYARI] ${file} geçerli bir komut değil.`);
        }

    } catch (error) {
        console.error(`[HATA] ${file}:`, error);
        process.exit(1);
    }
}

const rest = new REST({
    version: '10'
}).setToken(TOKEN);

(async () => {
    try {
        console.log(
            `Toplam ${commands.length} komut yükleniyor...`
        );

        const data = await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log(`✅ ${data.length} komut başarıyla yüklendi!`);

    } catch (error) {
        console.error('❌ Komut yükleme hatası:', error);
    }
})();

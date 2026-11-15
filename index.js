const fs = require('node:fs');
const path = require('node:path');

const {
    Client,
    Collection,
    GatewayIntentBits,
    ActivityType,
    REST,
    Routes
} = require('discord.js');

require('dotenv').config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = '1569754441098199100';

// Bot durumu: "OH | Ordu-yu Hümayun oynuyor" + görünürlük: Boşta
const DURUM_YAZISI = 'OH | Ordu-yu Hümayun';
const DURUM_GORUNURLUK = 'idle'; // online, idle, dnd, invisible

if (!TOKEN || !CLIENT_ID) {
    throw new Error('TOKEN veya CLIENT_ID .env dosyasında bulunamadı!');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    presence: {
        status: DURUM_GORUNURLUK,
        activities: [
            {
                name: DURUM_YAZISI,
                type: ActivityType.Playing
            }
        ]
    }
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
    throw new Error('commands klasörü bulunamadı!');
}

const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));

        if (!command.data || !command.execute) {
            console.log(`[UYARI] ${file} geçerli bir komut değil.`);
            continue;
        }

        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
        console.log(`[BAŞARILI] ${command.data.name} yüklendi.`);

    } catch (error) {
        console.error(`[HATA] ${file} yüklenemedi:`, error);
        process.exit(1);
    }
}

function durumAyarla() {
    client.user.setPresence({
        status: DURUM_GORUNURLUK,
        activities: [
            {
                name: DURUM_YAZISI,
                type: ActivityType.Playing
            }
        ]
    });
}

client.once('ready', async () => {
    console.log('--------------------------------');
    console.log(`Bot: ${client.user.tag}`);
    console.log(`Bot ID: ${client.user.id}`);
    console.log('Durum: Aktif');
    console.log('--------------------------------');

    // Durumu bot hazır olunca tekrar gönder (daha garanti)
    durumAyarla();
    console.log(`Durum ayarlandı: ${DURUM_GORUNURLUK} | ${DURUM_YAZISI}`);

    // Discord bazen ilk durumu yok sayabiliyor, birkaç saniye sonra tekrar gönder
    setTimeout(durumAyarla, 5000);

    // Arada bir tekrar gönder, durum kaybolmasın
    setInterval(durumAyarla, 10 * 60 * 1000);

    try {
        console.log('Slash komutları yükleniyor...');
        const rest = new REST({ version: '10' }).setToken(TOKEN);

        // Eski global komutları temizle
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

        // Sunucu komutlarını güncelle
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log('✅ Slash komutları başarıyla senkronize edildi!');
    } catch (error) {
        console.error('❌ Komut senkronizasyon hatası:', error);
    }
});

client.on('interactionCreate', async interaction => {
    const command = client.commands.get(interaction.commandName);

    // Komut bulunamazsa sessiz kalma, haber ver
    if (!command) {
        console.error(`[UYARI] Komut bulunamadı: ${interaction.commandName}`);
        try {
            if (interaction.isAutocomplete()) {
                await interaction.respond([]);
            } else if (interaction.isRepliable()) {
                await interaction.reply({
                    content: '❌ Bu komut artık geçerli değil.',
                    ephemeral: true
                });
            }
        } catch (err) {
            console.error('[YANIT HATASI]', err);
        }
        return;
    }

    if (interaction.isAutocomplete()) {
        try {
            if (command.autocomplete) {
                await command.autocomplete(interaction);
            } else {
                await interaction.respond([]);
            }
        } catch (error) {
            console.error('[AUTOCOMPLETE HATASI]', error);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('[KOMUT HATASI]', error);

        const errorMsg = {
            content: '❌ Komut çalıştırılırken bir hata oluştu!',
            ephemeral: true
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(errorMsg);
            } else {
                await interaction.reply(errorMsg);
            }
        } catch (replyError) {
            console.error('[YANIT HATASI]', replyError);
        }
    }
});

process.on('unhandledRejection', err => {
    console.error('[YAKALANMAMIŞ HATA]', err);
});

client.login(TOKEN).catch(error => {
    console.error('❌ Bot giriş hatası:', error);
});
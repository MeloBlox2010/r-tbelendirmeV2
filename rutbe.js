const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const noblox = require('noblox.js');
const fs = require('node:fs');
const path = require('node:path');

// groups.json proje ana klasöründe olmalı
const groupData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'groups.json'), 'utf8')
);

// Rütbeleri küçükten büyüğe sırala
const siraliRutbeler = groupData.ranks
    .map(r => ({ name: r.name, rank: Number(r.rank) }))
    .sort((a, b) => a.rank - b.rank);

const GROUP_ID = 270566447;

// Komutu kullanabilmek için Roblox grubunda en az bu rütbede olmak gerekir
const YETKILI_RUTBE = Number(process.env.YETKILI_ROBLOX_RUTBE) || 115;

const RENK_YESIL = 0x34cfaf; // tik emojisinin rengi
const RENK_KIRMIZI = 0xff2d5d; // çarpı emojisinin rengi
const RENK_LOG = 0x2b2d31; // log embed'i (koyu, çizgi belli olmaz)

// Emojiler (doğrudan koda yazıldı, .env'ye gerek yok)
const EMOJI_BASARI = '<:basarili:1570525552333426849>';
const EMOJI_HATA = '<:basarisiz:1571233929913049088>';
const EMOJI_KAYIT = '<:kayit_tik:1571235331569623050>';

let robloxReady = false;
let botUserId = null;

function hataEmbed(mesaj) {
    return new EmbedBuilder()
        .setColor(RENK_KIRMIZI)
        .setDescription(`# ${EMOJI_HATA} İşlem Başarısız\n\n${mesaj}`);
}

function basariEmbed({ mod, kullaniciAdi, kullaniciId, rutbe, sebep }) {
    const baslik = {
        terfi: 'Rütbe Terfi Edildi',
        tenzil: 'Rütbe Düşürüldü',
        degistir: 'Rütbe Değiştirildi'
    }[mod];

    return new EmbedBuilder()
        .setColor(RENK_YESIL)
        .setDescription(
            `# ${EMOJI_BASARI} ${baslik}\n\n` +
            `**${kullaniciAdi}** (${kullaniciId}) isimli kişiye\n` +
            `**${rutbe.name} (${rutbe.rank})** rütbesi başarıyla verildi.\n\n` +
            `Sebep: ${sebep}`
        );
}

// Kayıt (log) kanalına giden embed
function logEmbedOlustur({ mod, yonetici, kullaniciAdi, kullaniciId, eskiRutbe, yeniRutbe, sebep }) {
    const baslik = {
        terfi: 'RÜTBE TERFİ EDİLDİ!',
        tenzil: 'RÜTBE DÜŞÜRÜLDÜ!',
        degistir: 'RÜTBE DEĞİŞTİRİLDİ!'
    }[mod];

    const fiil = {
        terfi: 'terfi ettirdi',
        tenzil: 'düşürdü',
        degistir: 'değiştirdi'
    }[mod];

    return new EmbedBuilder()
        .setColor(RENK_LOG)
        .setDescription(
            `# ${EMOJI_KAYIT} ${baslik}\n\n` +
            `**${yonetici.ad}** (${yonetici.id}), **${kullaniciAdi}** (${kullaniciId}) isimli kişinin ` +
            `rütbesini **${eskiRutbe.name} (${eskiRutbe.rank})** rütbesinden ` +
            `**${yeniRutbe.name} (${yeniRutbe.rank})** rütbesine ${fiil}.\n\n` +
            `Sebep: ${sebep}`
        );
}

async function robloxGiris() {
    if (robloxReady) return;

    const me = await noblox.setCookie(process.env.ROBLOX_COOKIE);
    botUserId = me.UserID ?? me.id ?? me.userId;

    if (!botUserId) {
        throw new Error('Bot hesabının ID bilgisi alınamadı.');
    }

    robloxReady = true;
}

// Komutu kullanan kişinin SUNUCU TAKMA ADINDAN Roblox hesabını bulur.
// Takma ad, Roblox kullanıcı adıyla aynı olmalı ve kişi grupta olmalı.
async function yoneticiRobloxBul(member) {
    const ad = String(member.nickname || '').trim();

    if (!ad) return null;

    try {
        const id = await noblox.getIdFromUsername(ad);
        if (!id) return null;

        const rutbe = await noblox.getRankInGroup(GROUP_ID, id);
        if (rutbe > 0) {
            return { id, ad, rutbe };
        }
    } catch {
        // bu isim Roblox'ta yok
    }

    return null;
}

async function logGonder(interaction, embed) {
    const kanalId = process.env.LOG_KANAL_ID;
    if (!kanalId) return;
    try {
        const kanal = await interaction.client.channels.fetch(kanalId);
        if (kanal) await kanal.send({ embeds: [embed] });
    } catch (err) {
        console.error('[LOG HATASI]', err.message);
    }
}

async function islemYap(interaction, mod) {
    await interaction.deferReply();

    const hata = mesaj => interaction.editReply({ embeds: [hataEmbed(mesaj)] });

    try {
        if (!process.env.ROBLOX_COOKIE) {
            return hata('`ROBLOX_COOKIE` .env dosyasında bulunamadı!');
        }

        const targetUser = interaction.options.getString('kullanici').trim();
        const sebep = interaction.options.getString('sebep').trim();

        if (!sebep) {
            return hata('Sebep boş bırakılamaz.');
        }

        // Roblox girişi
        try {
            await robloxGiris();
        } catch (err) {
            robloxReady = false;
            console.error('[ROBLOX GİRİŞ HATASI]', err);
            return hata('Roblox hesabına giriş yapılamadı. Çerez (cookie) geçersiz olabilir.');
        }

        // Komutu kullanan kişinin Roblox rütbesini sunucu takma adından bul
        const yonetici = await yoneticiRobloxBul(interaction.member);

        if (!yonetici) {
            return hata(
                'Roblox hesabın bulunamadı. Bu sunucudaki **takma adın**, ' +
                'gruptaki Roblox kullanıcı adınla aynı olmalı.'
            );
        }

        if (yonetici.rutbe < YETKILI_RUTBE) {
            return hata(
                `Bu komutu kullanmak için grupta en az **${YETKILI_RUTBE}** rütbesinde olmalısın.`
            );
        }

        const yoneticiRutbeAdi =
            siraliRutbeler.find(r => r.rank === yonetici.rutbe)?.name || `Rütbe ${yonetici.rutbe}`;

        // Kullanıcıyı bul
        let userId;
        try {
            userId = await noblox.getIdFromUsername(targetUser);
        } catch {
            userId = null;
        }
        if (!userId) {
            return hata('Roblox kullanıcısı bulunamadı!');
        }

        // Kullanıcının gerçek Roblox adı
        let robloxAdi = targetUser;
        try {
            robloxAdi = await noblox.getUsernameFromId(userId);
        } catch {
            // bulunamazsa yazılan isim kullanılır
        }

        // Mevcut rütbe
        const currentRank = await noblox.getRankInGroup(GROUP_ID, userId);
        if (currentRank === 0) {
            return hata('Bu kullanıcı grupta değil.');
        }
        const currentRankName =
            siraliRutbeler.find(r => r.rank === currentRank)?.name || `Rütbe ${currentRank}`;

        // Kendi rütbenden yüksek birine işlem yapamazsın
        if (currentRank > yonetici.rutbe) {
            return hata(
                `**${robloxAdi}** (${currentRankName}) senden yüksek rütbede, ona işlem yapamazsın.`
            );
        }

        // Hedef rütbeyi belirle
        let selectedRank;

        if (mod === 'terfi') {
            selectedRank = siraliRutbeler.find(r => r.rank > currentRank);
            if (!selectedRank) {
                return hata(`**${currentRankName}** zaten listedeki en yüksek rütbe, terfi verilemez.`);
            }
        } else if (mod === 'tenzil') {
            const altRutbeler = siraliRutbeler.filter(r => r.rank < currentRank);
            selectedRank = altRutbeler[altRutbeler.length - 1];
            if (!selectedRank) {
                return hata(`**${currentRankName}** zaten listedeki en düşük rütbe, tenzil edilemez.`);
            }
        } else {
            const secilen = Number(interaction.options.getString('rütbe'));
            selectedRank = siraliRutbeler.find(r => r.rank === secilen);
            if (!selectedRank) {
                return hata('Geçersiz rütbe seçildi!');
            }
            if (selectedRank.rank === currentRank) {
                return hata(`Kullanıcı zaten **${currentRankName}** rütbesinde.`);
            }
        }

        const newRank = selectedRank.rank;

        // Kendi rütbene kadar verebilirsin, daha yükseğini veremezsin
        if (newRank > yonetici.rutbe) {
            return hata(
                `Kendi rütbenden (**${yoneticiRutbeAdi}**) yüksek bir rütbe veremezsin. ` +
                `En fazla **${yoneticiRutbeAdi}** rütbesine kadar verebilirsin.`
            );
        }

        // Güvenlik sınırı: .env içinde MIN_RUTBE varsa, bu rütbenin
        // altına düşürülemez ve altındakilere dokunulamaz.
        const minRutbe = Number(process.env.MIN_RUTBE);
        if (minRutbe && (newRank < minRutbe || currentRank < minRutbe)) {
            return hata('Bu rütbe aralığında işlem yapma izni yok.');
        }

        // Botun rütbesi, hem mevcut hem yeni rütbeden yüksek olmalı
        const botRank = await noblox.getRankInGroup(GROUP_ID, botUserId);
        if (botRank <= newRank || botRank <= currentRank) {
            return hata('Botun rütbesi bu işlem için yeterli değil.');
        }

        // Rütbeyi değiştir
        await noblox.setRank(GROUP_ID, userId, newRank);

        const embed = basariEmbed({
            mod,
            kullaniciAdi: robloxAdi,
            kullaniciId: userId,
            rutbe: selectedRank,
            sebep
        });

        await interaction.editReply({ embeds: [embed] });

        // Kayıt kanalına giden embed
        const logEmbed = logEmbedOlustur({
            mod,
            yonetici,
            kullaniciAdi: robloxAdi,
            kullaniciId: userId,
            eskiRutbe: { name: currentRankName, rank: currentRank },
            yeniRutbe: selectedRank,
            sebep
        });

        await logGonder(interaction, logEmbed);

    } catch (error) {
        console.error(`[RÜTBE ${mod.toUpperCase()} HATASI]`, error);
        try {
            await interaction.editReply({
                embeds: [hataEmbed(`Hata oluştu: ${error.message}`)]
            });
        } catch (e) {
            console.error('[YANIT HATASI]', e);
        }
    }
}

// Rütbe listesi: Acemi Er'den başlayıp yukarı doğru sıralanır
async function otomatikTamamla(interaction) {
    try {
        const focused = interaction.options.getFocused().toLowerCase();
        const filtered = siraliRutbeler
            .filter(r => r.rank > 0 && r.name.toLowerCase().includes(focused))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(r => ({ name: r.name, value: String(r.rank) }))
        );
    } catch (error) {
        console.error('[AUTOCOMPLETE HATASI]', error);
        if (!interaction.responded) {
            await interaction.respond([]).catch(() => {});
        }
    }
}

function komutOlustur({ ad, aciklama, rutbeAciklama, mod }) {
    const builder = new SlashCommandBuilder()
        .setName(ad)
        .setDescription(aciklama)
        .addStringOption(o =>
            o.setName('kullanici')
                .setDescription('Roblox kullanıcı adı')
                .setRequired(true)
        );

    // Rütbe seçimi sadece "değiştir" komutunda var
    if (mod === 'degistir') {
        builder.addStringOption(o =>
            o.setName('rütbe')
                .setDescription(rutbeAciklama)
                .setRequired(true)
                .setAutocomplete(true)
        );
    }

    // Sebep zorunlu
    builder.addStringOption(o =>
        o.setName('sebep')
            .setDescription('İşlemin sebebi')
            .setRequired(true)
            .setMaxLength(200)
    );

    return {
        data: builder,
        autocomplete: otomatikTamamla,
        execute: interaction => islemYap(interaction, mod)
    };
}

module.exports = { komutOlustur };
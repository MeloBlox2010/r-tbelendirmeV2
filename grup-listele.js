const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');

// Bizim grubumuz, listede en üstte gösterilir
const ANA_GRUP_ID = 270566447;

const RENK_YESIL = 0x34cfaf; // tik emojisinin rengi
const RENK_KIRMIZI = 0xff2d5d; // çarpı emojisinin rengi

// Emojiler (doğrudan koda yazıldı, .env'ye gerek yok)
const EMOJI_HATA = '<:basarisiz:1571233929913049088>';
const EMOJI_GRUP = '<:grup_listele:1571238621011251220>';

function hataEmbed(mesaj) {
    return new EmbedBuilder()
        .setColor(RENK_KIRMIZI)
        .setDescription(`# ${EMOJI_HATA} İşlem Başarısız\n\n${mesaj}`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('grup-listele')
        .setDescription('Bir Roblox kullanıcısının üye olduğu grupları ve rütbelerini gösterir.')
        .addStringOption(o =>
            o.setName('kullanici')
                .setDescription('Roblox kullanıcı adı')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const kullaniciAdi = interaction.options.getString('kullanici').trim();

            // Kullanıcıyı bul
            let userId;
            try {
                userId = await noblox.getIdFromUsername(kullaniciAdi);
            } catch {
                userId = null;
            }

            if (!userId) {
                return interaction.editReply({
                    embeds: [hataEmbed('Roblox kullanıcısı bulunamadı!')]
                });
            }

            const gercekAd = await noblox.getUsernameFromId(userId).catch(() => kullaniciAdi);

            // Kullanıcının üye olduğu gruplar
            const hamGruplar = await noblox.getGroups(userId);

            const gruplar = (hamGruplar || []).map(g => ({
                id: Number(g.Id ?? g.id ?? g.group?.id),
                ad: String(g.Name ?? g.name ?? g.group?.name ?? 'Bilinmeyen Grup'),
                rutbeNo: Number(g.Rank ?? g.role?.rank ?? 0),
                rutbeAdi: String(g.Role ?? g.role?.name ?? 'Bilinmiyor')
            }));

            if (gruplar.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(RENK_YESIL)
                            .setDescription(
                                `# ${EMOJI_GRUP} Grup Listesi\n\n` +
                                `**${gercekAd}** (${userId}) hiçbir gruba üye değil.`
                            )
                    ]
                });
            }

            // Bizim grup en üstte, diğerleri rütbeye göre yüksekten düşüğe
            gruplar.sort((a, b) => {
                if (a.id === ANA_GRUP_ID) return -1;
                if (b.id === ANA_GRUP_ID) return 1;
                return b.rutbeNo - a.rutbeNo;
            });

            const baslik =
                `# ${EMOJI_GRUP} Grup Listesi\n\n` +
                `**${gercekAd}** (${userId}) toplam **${gruplar.length}** gruba üye.\n\n`;

            // Discord embed açıklaması en fazla 4096 karakter olabilir
            const LIMIT = 3800;
            let govde = '';
            let gosterilen = 0;

            for (const g of gruplar) {
                const satir = `**${g.ad}**\n└ ${g.rutbeAdi} (${g.rutbeNo})\n`;
                if (baslik.length + govde.length + satir.length > LIMIT) break;
                govde += satir;
                gosterilen++;
            }

            if (gosterilen < gruplar.length) {
                govde += `\n...ve ${gruplar.length - gosterilen} grup daha.`;
            }

            const embed = new EmbedBuilder()
                .setColor(RENK_YESIL)
                .setDescription(baslik + govde);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[GRUP LİSTELE HATASI]', error);

            try {
                await interaction.editReply({
                    embeds: [hataEmbed(`Grup bilgisi alınamadı: ${error.message}`)]
                });
            } catch (e) {
                console.error('[YANIT HATASI]', e);
            }
        }
    }
};
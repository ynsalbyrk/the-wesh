# Wesh Discord System — Register botları

`register-1`, `register-2` ve `register-3`, birbirinden bağımsız kayıt ses odalarını yönetir. Üye hangi odaya girerse yalnızca o odaya atanmış bot sese katılır.

## İlk ayar

1. Discord'da **Ayarlar → Gelişmiş → Geliştirici Modu** seçeneğini aç.
2. Her register botunun `config.js` dosyasına kendi ses odası, komut kanalı ve rol ID'lerini gir.
3. Proje kökündeki `.env` dosyasına tokenları ekle:

```env
REGISTER1_TOKEN=birinci_bot_tokeni
REGISTER2_TOKEN=ikinci_bot_tokeni
REGISTER3_TOKEN=ucuncu_bot_tokeni
```

4. Discord Developer Portal'da her üç bot için **Server Members Intent** ve **Message Content Intent** seçeneklerini etkinleştir.
5. Bot rollerini sunucudaki `Kayıtsız`, `Üye`, `Erkek` ve `Kadın` rollerinin üstüne taşı. Botlarda şu izinler bulunmalı: Kanalları Görüntüle, Bağlan, Konuş, Mesaj Gönder, Rolleri Yönet ve Takma Adları Yönet.

## Çalıştırma

Tüm register botlarını tek terminalde başlat:

```powershell
npm run registers
```

Kapatmak için aynı terminalde `Ctrl+C` kullan. Tek bot için `npm run register1`, `npm run register2` veya `npm run register3` komutları kullanılabilir.

## Kayıt komutları

Kayıt yetkilisi, ilgili üyeyi botun kendi kayıt ses odasındayken etiketler:

```text
!erkek @üye İsim Yaş
!kadın @üye İsim Yaş
!isim @üye Yeni İsim Yaş
```

`!erkek` ve `!kadın`, üyeden Kayıtsız rolünü kaldırır, Üye ve uygun cinsiyet rolünü ekler, takma adı günceller ve log kanalına kayıt gönderir. Komutlar yalnızca ayarlanmış komut kanalında ve `staffRoleId` rolüne sahip yetkililer tarafından kullanılabilir.

> `config.js` içindeki örnek ID metinlerini gerçek Discord ID'leriyle değiştirmeden botu çalıştırma.

## General 1: aktivite, görev ve moderasyon

`general-1`, mesaj, ses, davet ve kayıt hareketlerini puanlayarak rütbe sistemini besler. Geçici bot yanıtları bir dakika sonra silinir; puan, görev, moderasyon ve denetim verileri `data/` altında kalıcı tutulur.

### Üye komutları

```text
!istatistik [@üye]      Profil ve liderlik paneli
!gorevlerim             Kişisel günlük/haftalık görev merkezi
!oduller                Görev, bonus saatleri ve mağaza butonları
!rank [@üye]           Rütbe ilerleme bilgisi
!sunucu                 Sunucu aktivite özeti
!enler | !haftalık | !aylık
!uyarilarim             Kendi uyarı geçmişin
```

Görevler tamamlanınca ödül alma butonu coin ile birlikte rütbe puanı verir. Günlük görevler İstanbul saatinde, haftalık görevler Pazartesi yenilenir. Ses görevleri, anti-farm için aynı kanalda en az iki insan bulunduğu süre boyunca sayılır.

### Yetkili komutları

```text
!durum
!uyar @üye sebep
!uyarilar [@üye]
!timeout @üye 10m sebep
!untimeout @üye
!ban @üye sebep
!unban kullanici_id
!sil 1-100
```

`!timeout` için süre birimi `m`, `h` veya `d` olmalıdır; en fazla 28 gün verilebilir. Moderasyon işlemleri `data/general-1-audit.jsonl` dosyasına ve ayarlı log kanalına kaydedilir. Botta **Mesajları Yönet**, **Üyeleri Zaman Aşımına Alma** ve **Üyeleri Yasakla** izinleri; bot rolünün de hedef rollerin üstünde olması gerekir.

### Bakım

General 1; istatistik, görev, kayıt, moderasyon ve denetim dosyalarını günlük olarak `data/backups/` klasörüne yedekler. Sadece General 1'i başlatmak için:

```powershell
node bots/register/general-1/index.js
```

## Doğum tarihiyle kayıt

Kayıt botlarında yaşı elle yazmak yerine doğum tarihini `GG/AA/YYYY` biçiminde ekleyebilirsin:

```text
!erkek @üye Ahmet Yılmaz 14/05/2004
!kadın @üye Ayşe Demir 03/11/2001
```

Bot geçerli yaşı otomatik hesaplar, doğum tarihini kayıt geçmişine yazar ve General 1 bunu görev/üye verisine aktarır. General 1, doğum günü gelen üyeye adı tam olarak **Üye Doğum Günü** olan rolü verir ve doğum günü geçince rolü kaldırır. Bu rolün sunucuda oluşturulmuş ve General 1 bot rolünün altında olması gerekir.

## Security botları

- **Security 1:** `!kilit`, `!ac`, `!yavas 0-21600`, `!guvenliktemizle 1-100`
- **Security 2:** 10 saniyede 6 mesaj spamını algılar, mesajı siler ve 10 dakika timeout uygular.
- **Security 3:** 7 günden yeni hesapları 60 dakika timeout ile kontrol altında tutar.
- Tüm Security botlarında `!guvenlik` durum gösterir; yetkililer `!guvenliktimeout @üye 10m` kullanabilir.

Gelişmiş koruma dağılımı:

- **Security 1:** 60 saniyede 10 yeni üye algıladığında tüm yazı kanallarını raid kilidine alır. Yetkililer `!raidkilit` ve `!raidac` kullanabilir.
- **Security 2:** izinsiz Discord daveti, `blockedDomains` listesine girilen alan adları, `blockedWords` listesine girilen ifadeler, caps ve tekrar spamını siler. 15 dakika içindeki ikinci ihlalde 30 dakika timeout uygular.
- **Security 3:** 30 saniyede üç rol/kanal oluşturma-silme-değiştirme işlemi yapan whitelist dışı üyeyi 24 saat timeout'a alır ve raid kilidini devreye sokar.

Whitelist, her Security botunun `config.js` dosyasındaki `whitelistUserIds` ve `whitelistRoleIds` alanlarından yönetilir. Güvenilir yönetici rollerini yalnızca `whitelistRoleIds` içine ekleyin; boş bırakılan `blockedDomains` ve `blockedWords` listelerine de sunucunuza özel engelleri ekleyebilirsiniz.

Security 1 için **Kanalları Yönet** ve **Mesajları Yönet**; Security 2/3 için **Mesajları Yönet**, **Üyeleri Zaman Aşımına Alma** ve log kanalına mesaj gönderme izinleri gerekir. Bot rolleri, işlem uygulanacak üyelerin üstünde olmalıdır.

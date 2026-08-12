# 🎵 The Wêsh Music Bot

Groovy, Rhythm ve Lavalink özelliklerini birleştiren profesyonel Discord müzik botu.

## ✨ Özellikler

- ✅ YouTube müzik oynatma
- ✅ Müzik kuyruğu sistemi
- ✅ Şarkı/Kuyruk döngüsü
- ✅ Ses seviyesi kontrolü
- ✅ Kuyruk karışt scriptsırması
- ✅ Dinamik prefix sistemi
- ✅ Aktif bot paneli
- ✅ Şarkı geçmişi
- ✅ Önceki şarkıya geri dönme
- ✅ Gelişmiş embed tasarımları

## 🚀 Kurulum

### 1️⃣ Gerekli Yazılımlar
- **Python 3.8+** → [python.org](https://www.python.org)
- **FFmpeg** → [ffmpeg.org](https://ffmpeg.org/download.html)

#### FFmpeg Kurulumu:
**Windows:**
```bash
choco install ffmpeg
# veya manuel: https://ffmpeg.org/download.html
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

### 2️⃣ Python Paketlerini Yükle
```bash
pip install -r requirements.txt
```

### 3️⃣ Discord Bot Token Oluştur

1. [Discord Developer Portal](https://discord.com/developers/applications) aç
2. **"New Application"** tıkla
3. Bot'a bir isim ver
4. Solda **"Bot"** seçeneğine tıkla
5. **"Add Bot"** tıkla
6. **"TOKEN"** bölümünden **"Copy"** tıkla
7. `music_bot.py` dosyasında bu satırı bul:
   ```python
   TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"
   ```
8. Token'ı yapıştır:
   ```python
   TOKEN = "YOUR_ACTUAL_TOKEN_HERE"
   ```

### 4️⃣ Bot'u Sunucuya Ekle

1. Developer Portal'da bot seçili iken **"OAuth2"** git
2. **"URL Generator"** tıkla
3. **Scopes** kısmında: `bot` seçini
4. **Permissions** kısmında: `Administrator` seçini
5. Oluşan linki tarayıcıda aç
6. Sunucunu seç ve yetkilendir

### 5️⃣ Bot'u Çalıştır

```bash
python music_bot.py
```

Bot konsölde şu mesajı göstermeli:
```
✅ Bot <@BOT_ID> olarak giriş yaptı!
📊 1 sunucuya bağlı
```

## 📋 Komutlar

### ▶️ Oynatma Komutları
| Komut | Takma Ad | Açıklama |
|-------|----------|----------|
| `!oynat [şarkı]` | play, p | Şarkı çalar |
| `!durdur` | pause, ps | Müzik oynatmayı durdur |
| `!devam` | resume, rs | Durdurulan müziği devam ettir |
| `!atla` | skip, s, next | Şarkıyı atla |
| `!geri` | previous, prev, back | Önceki şarkıya geri dön |

### 📋 Kuyruk Komutları
| Komut | Takma Ad | Açıklama |
|-------|----------|----------|
| `!kuyruk` | queue, q | Müzik kuyruğunu göster |
| `!şimdikçal` | nowplaying, np, current | Şimdi çalan şarkıyı göster |
| `!sil [numara]` | remove, rm | Kuyruktan şarkı sil |
| `!karış` | shuffle, sf | Kuyruğu karıştır |
| `!temizle` | clear, clr | Kuyruğu temizle |

### 🎚️ Ayar Komutları
| Komut | Takma Ad | Açıklama |
|-------|----------|----------|
| `!ses [0-100]` | volume, v | Ses seviyesini ayarla |
| `!döngü [şarkı/kuyruk/kapat]` | loop, lp | Döngü modunu ayarla |
| `!setprefix [prefix]` | prefix | Bot prefix'ini değiştir |

### 📊 Diğer Komutlar
| Komut | Takma Ad | Açıklama |
|-------|----------|----------|
| `!panel` | status, bots | Aktif botlar panelini göster |
| `!ayır` | disconnect, leave, dc, stop | Ses kanalından ayrıl |
| `!yardım` | help, h | Komut listesini göster |
| `!hakkında` | about, info | Bot hakkında bilgi |

## 💡 Kullanım Örnekleri

**Şarkı çal:**
```
!oynat Despacito
```

**Kuyruğu göster:**
```
!kuyruk
```

**Şarkıyı atla:**
```
!atla
```

**Şarkı döngüsünü aç:**
```
!döngü şarkı
```

**Ses seviyesini 75% yap:**
```
!ses 75
```

**Prefix'i değiştir:**
```
!setprefix $
```

## ⚙️ Sorun Giderme

### Bot gelmez:
- ✅ Token doğru mu?
- ✅ FFmpeg yüklü mü?
- ✅ Bot'un gerekli yetkileri var mı?

### Müzik çalmaz:
- ✅ Sesli kanala katıldın mı?
- ✅ İnternet bağlantın stabil mi?
- ✅ YouTube linki doğru mu?

### Prefix komutları çalışmaz:
- ✅ Doğru sunucuda mısın?
- ✅ Yeni prefix'i kullanıyor musun?

## 📞 Destek

Hata veya önerilerin için issue açabilirsin.

## 📝 Lisans

MIT License - Özgürce kullan!

---

**Made with ❤️ by The Wêsh Team**

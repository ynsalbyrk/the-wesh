# 📦 The Wêsh Music Bot - Detaylı Kurulum Kılavuzu

## 💻 Sistem Gereksinimleri

- **Python**: 3.8 veya üzeri
- **FFmpeg**: En son sürüm
- **RAM**: Minimum 256 MB
- **İnternet**: Stabil bağlantı
- **İşletim Sistemi**: Windows, macOS, Linux

## 📥 Kurulum Adımları

### 1. Python Yükle

**Windows:**
- https://www.python.org/downloads/ aç
- "Download Python 3.x.x" tıkla
- Installer'ı çalıştır
- ✅ "Add Python to PATH" seçeneğini işaretle
- "Install Now" tıkla

**macOS:**
```bash
brew install python3
```

**Linux:**
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip
```

### 2. FFmpeg Yükle

**Windows (Chocolatey):**
```bash
choco install ffmpeg
```

**Windows (Manuel):**
- https://ffmpeg.org/download.html aç
- Windows build'i indir
- Klasöre çıkar ve PATH'e ekle

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

### 3. Bot Kodunu İndir

```bash
git clone https://github.com/ynsalbyrk/the-wesh.git
cd the-wesh
```

Eğer Git yüklü değilse:
- https://github.com/ynsalbyrk/the-wesh adresine git
- "Code" → "Download ZIP" tıkla
- Dosyaları çıkar

### 4. Python Paketlerini Yükle

```bash
pip install -r requirements.txt
```

Eğer hata alırsan:
```bash
pip install --upgrade pip
pip install discord.py yt-dlp PyNaCl
```

### 5. Discord Bot Token Al

1. https://discord.com/developers/applications aç
2. "New Application" tıkla
3. Bot'a "The Wêsh Music" adını ver
4. "Create" tıkla
5. Soldan "Bot" seç
6. "Add Bot" tıkla
7. "TOKEN" bölümünde "Copy" tıkla
8. Token'ı not et (paylaşma!)

### 6. Bot'u Yapılandır

`music_bot.py` dosyasını aç:

```python
TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"
```

Şu şekilde değiştir:

```python
TOKEN = "YOUR_ACTUAL_TOKEN_HERE"  # Token'i yapıştır
```

### 7. Bot Yetkilendirmesi

1. Developer Portal'da "OAuth2" git
2. "URL Generator" tıkla
3. **Scopes:**
   - ✅ bot
   - ✅ applications.commands

4. **Permissions:**
   - ✅ Administrator
   - veya manuel: Send Messages, Connect, Speak

5. Oluşan linki kopyala
6. Tarayıcıda aç ve bot'u sunucuya ekle

### 8. Bot'u Çalıştır

```bash
python music_bot.py
```

Terminalde şu mesajı görmemelisin:
```
✅ Bot The Wêsh#1234 olarak giriş yaptı!
📊 1 sunucuya bağlı
🚀 Bot başlatıldı ve komutları dinliyor...
```

## ✅ Test Etme

1. Discord'da bir sesli kanala katıl
2. Sunucuda `!oynat Despacito` yaz
3. Bot sesli kanala katılmalı ve müzik çalmalı

Eğer çalışmazsa [Sorun Giderme](#sorun-giderme) bölümüne bak.

## 🔧 Sorun Giderme

### Bot komutlara yanıt vermiyor
- ✅ Token doğru mu?
- ✅ Bot sunucuda mı?
- ✅ Bot yetkileri var mı?
- ✅ Prefix doğru mu?

### Müzik çalmıyor
- ✅ Sesli kanala katıldın mı?
- ✅ FFmpeg kurulu mu?
- ✅ İnternet stabil mi?
- ✅ YouTube erişebiliyor mu?

### FFmpeg hatası
```bash
# Windows
choco install ffmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg
```

### Token hatası
- Developer Portal'da token'i sıfırla
- Yeni token'i yapıştır
- Bot'u yeniden başlat

## 📱 Kullanmaya Başla

```
!oynat [şarkı adı]
!kuyruk
!atla
!durdur
!devam
!yardım
```

---

**Herhangi bir sorun? Issue aç veya README'yi oku!**

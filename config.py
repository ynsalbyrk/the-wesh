# The Wêsh Music Bot Configuration
# 🎵 Bot ayarları

# ============================================
# Discord Bot Token
# ============================================
# 1. https://discord.com/developers/applications aç
# 2. Bot'u seç
# 3. TOKEN'ı kopyala ve buraya yapıştır
DISCORD_TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"

# ============================================
# Bot Prefix
# ============================================
# Bot komutlarının önüne konulacak karakter
# Örnek: !oynat, $oynat, >oynat
DEFAULT_PREFIX = "!"

# ============================================
# YouTube-DL Ayarları
# ============================================
# Müzik kalitesi
AUDIO_QUALITY = "bestaudio/best"  # En iyi ses kalitesi

# Maksimum şarkı süresi (saniye)
MAX_SONG_DURATION = 3600  # 1 saat

# ============================================
# Ses Ayarları
# ============================================
DEFAULT_VOLUME = 50  # %50
MIN_VOLUME = 0      # %0
MAX_VOLUME = 100    # %100

# ============================================
# Kuyruk Ayarları
# ============================================
MAX_QUEUE_SIZE = 100  # Maksimum 100 şarkı
SONGS_PER_PAGE = 10   # Kuyruk sayfasında 10 şarkı

# ============================================
# Aktif Panel Ayarları
# ============================================
SHOW_ACTIVE_PANEL = True  # Paneli göster
PANEL_UPDATE_INTERVAL = 30  # 30 saniyede bir güncelle

# ============================================
# Bot Durumu
# ============================================
BOT_STATUS = "listening"  # listening, watching, playing
BOT_STATUS_TEXT = "!yardım | Müzik Botu"

# ============================================
# Logging (Hata kaydı)
# ============================================
LOG_ERRORS = True
LOG_FILE = "bot_errors.log"

# ============================================
# Özellik Ayarları
# ============================================
ENABLE_LOOP_QUEUE = True          # Kuyruk döngüsü
ENABLE_SHUFFLE = True              # Kuyruk karışt scriptsırması
ENABLE_HISTORY = True              # Geçmiş takibi
ENABLE_NOWPLAYING_UPDATE = True    # Şimdi çalan güncelleme
AUTO_DISCONNECT_EMPTY = True       # Boş kanaldan otomatik ayrıl

import discord
from discord.ext import commands
import yt_dlp
import asyncio
from collections import deque
import re
from datetime import datetime
import json
import os

# ============================================
# 🎵 THE WÊSH MUSIC BOT - FULL FEATURED
# Groovy + Rhythm + Lavalink Özelliklerini Birleştiren Bot
# ============================================

# Bot Setup
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

# Prefix Ayarları (Dinamik)
DEFAULT_PREFIX = "!"
PREFIXES = {}

def get_prefix(bot, message):
    if not message.guild:
        return DEFAULT_PREFIX
    guild_id = message.guild.id
    return PREFIXES.get(guild_id, DEFAULT_PREFIX)

bot = commands.Bot(command_prefix=get_prefix, intents=intents, help_command=None)

# ============================================
# YT-DLP Config
# ============================================
YDL_OPTIONS = {
    'format': 'bestaudio/best',
    'noplaylist': True,
    'default_search': 'ytsearch',
    'quiet': False,
    'no_warnings': False,
    'socket_timeout': 30,
}

FFMPEG_OPTIONS = {
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
    'options': '-vn -q:a 9',
}

# ============================================
# 📊 Aktif Panel Sistemi
# ============================================
class ActivePanel:
    def __init__(self):
        self.panels = {}  # {guild_id: message_id}
        self.bots_status = {}
    
    def update_bot_status(self, guild_id, bot_name, status):
        if guild_id not in self.bots_status:
            self.bots_status[guild_id] = {}
        self.bots_status[guild_id][bot_name] = status
    
    async def create_panel(self, ctx):
        """Aktif bot panelini oluştur"""
        embed = discord.Embed(
            title="🤖 Aktif Botlar",
            color=discord.Color.purple(),
            timestamp=datetime.now()
        )
        
        bots_info = self.bots_status.get(ctx.guild.id, {})
        
        for bot_name, status in bots_info.items():
            emoji = "🟢" if status else "🔴"
            embed.add_field(name=f"{emoji} {bot_name}", value="Aktif" if status else "İnaktif", inline=True)
        
        if not bots_info:
            embed.description = "Henüz bot bilgisi yok"
        
        message = await ctx.send(embed=embed)
        self.panels[ctx.guild.id] = message.id
        return message

active_panel = ActivePanel()

# ============================================
# 🎵 Müzik Sistemi
# ============================================
class Song:
    def __init__(self, data):
        self.title = data.get('title', 'Bilinmeyen')
        self.url = data.get('url', '')
        self.duration = data.get('duration', 0)
        self.thumbnail = data.get('thumbnail', '')
        self.uploader = data.get('uploader', 'Bilinmeyen')
        self.views = data.get('view_count', 0)
        self.likes = data.get('like_count', 0)
        self.release_date = data.get('release_date', 'Bilinmeyen')
        
    def __str__(self):
        return f"**{self.title}** - {self.uploader}"
    
    def get_duration(self):
        if self.duration == 0:
            return "🔴 LIVE"
        minutes, seconds = divmod(self.duration, 60)
        return f"{int(minutes)}:{int(seconds):02d}"
    
    def get_info_embed(self, playing=False):
        embed = discord.Embed(
            title="🎶 Şimdi Çalıyor" if playing else "➕ Kuyrukla Eklendi",
            description=f"**{self.title}**",
            color=discord.Color.blue() if playing else discord.Color.green(),
            timestamp=datetime.now()
        )
        embed.set_thumbnail(url=self.thumbnail)
        embed.add_field(name="👤 Sanatçı", value=self.uploader, inline=True)
        embed.add_field(name="⏱️ Süre", value=self.get_duration(), inline=True)
        embed.add_field(name="👁️ Görüntüleme", value=f"{self.views:,}", inline=True)
        embed.add_field(name="❤️ Beğeni", value=self.likes, inline=True)
        embed.add_field(name="📅 Yayın Tarihi", value=self.release_date, inline=True)
        
        return embed

class MusicQueue:
    def __init__(self):
        self.queue = deque()
        self.current_song = None
        self.is_playing = False
        self.loop = False  # Şarkı döngüsü
        self.loop_queue = False  # Kuyruk döngüsü
        self.volume = 50
        self.history = deque(maxlen=20)  # Son 20 şarkı
        
    def add(self, song):
        self.queue.append(song)
    
    def add_front(self, song):
        """Kuyruğun başına şarkı ekle"""
        self.queue.appendleft(song)
    
    def next(self):
        if self.loop and self.current_song:
            return self.current_song
        
        if self.current_song:
            self.history.append(self.current_song)
        
        if self.queue:
            self.current_song = self.queue.popleft()
            return self.current_song
        
        self.current_song = None
        return None
    
    def clear(self):
        self.queue.clear()
        self.current_song = None
    
    def shuffle(self):
        import random
        self.queue = deque(random.sample(list(self.queue), len(self.queue)))
    
    def remove(self, index):
        songs_list = list(self.queue)
        if 0 <= index < len(songs_list):
            removed = songs_list.pop(index)
            self.queue = deque(songs_list)
            return removed
        return None
    
    def get_total_duration(self):
        total = sum(song.duration for song in self.queue)
        hours, remainder = divmod(total, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{int(hours)}h {int(minutes)}m {int(seconds)}s"

class MusicPlayer:
    players = {}
    
    @classmethod
    def get_player(cls, guild_id):
        if guild_id not in cls.players:
            cls.players[guild_id] = MusicQueue()
        return cls.players[guild_id]

# ============================================
# 🔧 PREFIX KOMUTLARI
# ============================================
@bot.command(name="setprefix", aliases=["prefix"])
@commands.has_permissions(administrator=True)
async def set_prefix(ctx, new_prefix):
    """Bot prefix'ini değiştir"""
    PREFIXES[ctx.guild.id] = new_prefix
    embed = discord.Embed(
        title="✅ Prefix Değiştirildi",
        description=f"Yeni prefix: `{new_prefix}`",
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)

# ============================================
# 🎵 OYNATMA KOMUTLARI
# ============================================
@bot.command(name="oynat", aliases=["play", "p"])
async def play(ctx, *, query):
    """Şarkı çalar"""
    
    if not ctx.author.voice:
        embed = discord.Embed(
            title="❌ Hata",
            description="Önce sesli kanala katılmalısın!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    voice_client = ctx.voice_client
    if not voice_client:
        voice_client = await ctx.author.voice.channel.connect()
        active_panel.update_bot_status(ctx.guild.id, "The Wêsh Music", True)
    
    async with ctx.typing():
        try:
            with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
                info = ydl.extract_info(query, download=False)
                if 'entries' in info:
                    info = info['entries'][0]
                
                song = Song(info)
                player = MusicPlayer.get_player(ctx.guild.id)
                player.add(song)
                
                embed = song.get_info_embed(playing=False)
                await ctx.send(embed=embed)
                
                if not voice_client.is_playing():
                    await play_next(ctx, voice_client)
        
        except Exception as e:
            embed = discord.Embed(
                title="❌ Hata",
                description=f"Şarkı bulunamadı: {str(e)[:100]}",
                color=discord.Color.red()
            )
            await ctx.send(embed=embed)

async def play_next(ctx, voice_client):
    """Sonraki şarkıyı çal"""
    player = MusicPlayer.get_player(ctx.guild.id)
    song = player.next()
    
    if not song:
        player.is_playing = False
        return
    
    player.is_playing = True
    
    try:
        with yt_dlp.YoutubeDL(YDL_OPTIONS) as ydl:
            info = ydl.extract_info(song.url, download=False)
            url = info['url']
        
        audio_source = discord.FFmpegPCMAudio(url, **FFMPEG_OPTIONS)
        
        def after_playing(error):
            if error:
                print(f"Oynatma hatası: {error}")
            asyncio.run_coroutine_threadsafe(
                play_next(ctx, voice_client),
                bot.loop
            )
        
        voice_client.play(audio_source, after=after_playing)
        
        embed = song.get_info_embed(playing=True)
        await ctx.send(embed=embed)
    
    except Exception as e:
        print(f"Çalma hatası: {e}")
        await play_next(ctx, voice_client)

@bot.command(name="durdur", aliases=["pause", "ps"])
async def pause(ctx):
    """Müziği durdur"""
    if ctx.voice_client and ctx.voice_client.is_playing():
        ctx.voice_client.pause()
        embed = discord.Embed(
            title="⏸️ Durduruldu",
            description="Müzik oynatmayı durdurdum",
            color=discord.Color.orange()
        )
        await ctx.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ Hata",
            description="Şu anda müzik çalmıyor!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

@bot.command(name="devam", aliases=["resume", "rs"])
async def resume(ctx):
    """Müziği devam ettir"""
    if ctx.voice_client and ctx.voice_client.is_paused():
        ctx.voice_client.resume()
        embed = discord.Embed(
            title="▶️ Devam Ediyor",
            description="Müzik oynatmaya devam ediyor",
            color=discord.Color.green()
        )
        await ctx.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ Hata",
            description="Durdurulmuş müzik yok!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

@bot.command(name="atla", aliases=["skip", "s", "next"])
async def skip(ctx):
    """Şarkıyı atla"""
    if not ctx.voice_client or not ctx.voice_client.is_playing():
        embed = discord.Embed(
            title="❌ Hata",
            description="Şu anda müzik çalmıyor!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    player = MusicPlayer.get_player(ctx.guild.id)
    next_song = player.queue[0] if player.queue else None
    
    ctx.voice_client.stop()
    
    if next_song:
        embed = discord.Embed(
            title="⏭️ Atlandı",
            description=f"Sonraki: **{next_song.title}**",
            color=discord.Color.blue()
        )
    else:
        embed = discord.Embed(
            title="⏭️ Atlandı",
            description="Sonraki şarkı yok",
            color=discord.Color.blue()
        )
    
    await ctx.send(embed=embed)

@bot.command(name="geri", aliases=["previous", "prev", "back"])
async def previous(ctx):
    """Önceki şarkıya geri dön"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    if not player.history:
        embed = discord.Embed(
            title="❌ Hata",
            description="Geçmiş yok!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    prev_song = player.history.pop()
    player.add_front(player.current_song)
    player.current_song = prev_song
    
    if ctx.voice_client and ctx.voice_client.is_playing():
        ctx.voice_client.stop()
    
    embed = discord.Embed(
        title="⏮️ Önceki Şarkı",
        description=f"**{prev_song.title}**",
        color=discord.Color.blue()
    )
    embed.set_thumbnail(url=prev_song.thumbnail)
    await ctx.send(embed=embed)

# ============================================
# 📋 KUYRUK KOMUTLARI
# ============================================
@bot.command(name="kuyruk", aliases=["queue", "q"])
async def queue(ctx, page: int = 1):
    """Müzik kuyruğunu göster"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    embed = discord.Embed(
        title="🎵 Şarkı Kuyruğu",
        color=discord.Color.purple(),
        timestamp=datetime.now()
    )
    
    if not player.queue and not player.current_song:
        embed.description = "Kuyruk boş!"
        await ctx.send(embed=embed)
        return
    
    per_page = 10
    start = (page - 1) * per_page
    end = start + per_page
    songs_list = list(player.queue)[start:end]
    
    description = ""
    if player.current_song:
        description += f"**▶️ Şimdi Çalıyor:**\n{player.current_song} - `{player.current_song.get_duration()}`\n\n"
    
    description += "**📋 Kuyruk:**\n"
    
    for i, song in enumerate(songs_list, start=start + 1):
        description += f"`{i}.` {song} - `{song.get_duration()}`\n"
    
    embed.description = description or "Kuyruk boş!"
    embed.add_field(name="⏱️ Toplam Süre", value=player.get_total_duration(), inline=True)
    embed.add_field(name="🎵 Toplam Şarkı", value=len(player.queue), inline=True)
    embed.set_footer(text=f"Sayfa: {page}")
    
    await ctx.send(embed=embed)

@bot.command(name="şimdikçal", aliases=["nowplaying", "np", "current"])
async def nowplaying(ctx):
    """Şimdi çalan şarkıyı göster"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    if not player.current_song:
        embed = discord.Embed(
            title="❌ Hata",
            description="Müzik çalmıyor!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    song = player.current_song
    embed = song.get_info_embed(playing=True)
    embed.add_field(name="📊 Kuyrukta Kalan", value=f"{len(player.queue)} şarkı", inline=True)
    embed.add_field(name="🔊 Ses Seviyesi", value=f"{player.volume}%", inline=True)
    
    await ctx.send(embed=embed)

@bot.command(name="sil", aliases=["remove", "rm"])
async def remove(ctx, index: int):
    """Kuyruktan şarkı sil"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    if not (0 < index <= len(player.queue)):
        embed = discord.Embed(
            title="❌ Hata",
            description=f"Geçersiz index! (1-{len(player.queue)})",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    removed = player.remove(index - 1)
    
    embed = discord.Embed(
        title="🗑️ Silindi",
        description=f"**{removed.title}** kuyruktan silindi",
        color=discord.Color.red()
    )
    await ctx.send(embed=embed)

# ============================================
# 🎚️ SES VE AYAR KOMUTLARI
# ============================================
@bot.command(name="ses", aliases=["volume", "v"])
async def volume(ctx, level: int = None):
    """Ses seviyesini ayarla (0-100)"""
    if level is None:
        player = MusicPlayer.get_player(ctx.guild.id)
        embed = discord.Embed(
            title="🔊 Ses Seviyesi",
            description=f"Mevcut ses: **{player.volume}%**",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return
    
    if not 0 <= level <= 100:
        embed = discord.Embed(
            title="❌ Hata",
            description="Ses seviyesi 0-100 arasında olmalı!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    player = MusicPlayer.get_player(ctx.guild.id)
    player.volume = level
    
    if ctx.voice_client and ctx.voice_client.source:
        ctx.voice_client.source.volume = level / 100
    
    embed = discord.Embed(
        title="🔊 Ses Ayarlandı",
        description=f"Ses seviyesi **{level}%** olarak ayarlandı",
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)

@bot.command(name="döngü", aliases=["loop", "lp"])
async def loop(ctx, mode: str = None):
    """Döngü modu: şarkı/kuyruk/kapat"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    if mode is None:
        status = "Şarkı Döngüsü" if player.loop else "Kuyruk Döngüsü" if player.loop_queue else "Kapalı"
        embed = discord.Embed(
            title="🔁 Döngü Modu",
            description=f"Mevcut: **{status}**",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return
    
    if mode.lower() == "şarkı":
        player.loop = True
        player.loop_queue = False
        embed = discord.Embed(
            title="🔁 Şarkı Döngüsü",
            description="Şarkı döngüsü AÇIK! (Aynı şarkı sürekli çalacak)",
            color=discord.Color.green()
        )
    elif mode.lower() == "kuyruk":
        player.loop = False
        player.loop_queue = True
        embed = discord.Embed(
            title="🔂 Kuyruk Döngüsü",
            description="Kuyruk döngüsü AÇIK! (Kuyruk bitince baştan çalacak)",
            color=discord.Color.green()
        )
    elif mode.lower() == "kapat":
        player.loop = False
        player.loop_queue = False
        embed = discord.Embed(
            title="⃠ Döngü Kapalı",
            description="Döngü modu kapatıldı",
            color=discord.Color.blue()
        )
    else:
        embed = discord.Embed(
            title="❌ Hata",
            description="Geçersiz mod! Şunu yazın: `şarkı`, `kuyruk` veya `kapat`",
            color=discord.Color.red()
        )
    
    await ctx.send(embed=embed)

@bot.command(name="karış", aliases=["shuffle", "sf"])
async def shuffle(ctx):
    """Kuyruğu karıştır"""
    player = MusicPlayer.get_player(ctx.guild.id)
    
    if not player.queue:
        embed = discord.Embed(
            title="❌ Hata",
            description="Kuyruk boş!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    player.shuffle()
    embed = discord.Embed(
        title="🔀 Karıştırıldı",
        description=f"{len(player.queue)} şarkı karıştırıldı",
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)

# ============================================
# 🗑️ TEMIZLE VE AYIR KOMUTLARI
# ============================================
@bot.command(name="temizle", aliases=["clear", "clr"])
async def clear(ctx):
    """Kuyruğu temizle"""
    player = MusicPlayer.get_player(ctx.guild.id)
    queue_size = len(player.queue)
    player.clear()
    
    embed = discord.Embed(
        title="🗑️ Kuyruk Temizlendi",
        description=f"{queue_size} şarkı kuyruğundan silindi",
        color=discord.Color.red()
    )
    await ctx.send(embed=embed)

@bot.command(name="ayır", aliases=["disconnect", "leave", "dc", "stop"])
async def disconnect(ctx):
    """Ses kanalından ayrıl"""
    if ctx.voice_client:
        player = MusicPlayer.get_player(ctx.guild.id)
        player.clear()
        await ctx.voice_client.disconnect()
        active_panel.update_bot_status(ctx.guild.id, "The Wêsh Music", False)
        
        embed = discord.Embed(
            title="👋 Ayrıldım",
            description="Ses kanalından ayrıldım",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
    else:
        embed = discord.Embed(
            title="❌ Hata",
            description="Ses kanalında değilim!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

# ============================================
# 📊 AKTIF PANEL
# ============================================
@bot.command(name="panel", aliases=["status", "bots"])
async def panel(ctx):
    """Aktif botlar panelini göster"""
    active_panel.update_bot_status(ctx.guild.id, "The Wêsh Music", True)
    await active_panel.create_panel(ctx)

# ============================================
# ℹ️ YARDıM KOMUTLARI
# ============================================
@bot.command(name="yardım", aliases=["help", "h"])
async def help_command(ctx):
    """Bot komutlarını göster"""
    prefix = PREFIXES.get(ctx.guild.id, DEFAULT_PREFIX) if ctx.guild else DEFAULT_PREFIX
    
    embed = discord.Embed(
        title="🎵 The Wêsh Music Bot - Komut Listesi",
        description=f"Prefix: `{prefix}`",
        color=discord.Color.purple(),
        timestamp=datetime.now()
    )
    
    commands_list = {
        "**▶️ Oynatma Komutları**": [
            f"`{prefix}oynat [şarkı]` - Şarkı çalar",
            f"`{prefix}durdur` - Müzik oynatmayı durdur",
            f"`{prefix}devam` - Durdurulan müziği devam ettir",
            f"`{prefix}atla` - Şarkıyı atla",
            f"`{prefix}geri` - Önceki şarkıya geri dön",
        ],
        "**📋 Kuyruk Komutları**": [
            f"`{prefix}kuyruk` - Müzik kuyruğunu göster",
            f"`{prefix}şimdikçal` - Şimdi çalan şarkıyı göster",
            f"`{prefix}sil [numara]` - Kuyruktan şarkı sil",
            f"`{prefix}karış` - Kuyruğu karıştır",
            f"`{prefix}temizle` - Kuyruğu temizle",
        ],
        "**🎚️ Ayar Komutları**": [
            f"`{prefix}ses [0-100]` - Ses seviyesini ayarla",
            f"`{prefix}döngü [şarkı/kuyruk/kapat]` - Döngü modunu ayarla",
            f"`{prefix}setprefix [prefix]` - Bot prefix'ini değiştir",
        ],
        "**📊 Diğer Komutlar**": [
            f"`{prefix}panel` - Aktif botlar panelini göster",
            f"`{prefix}ayır` - Ses kanalından ayrıl",
            f"`{prefix}yardım` - Bu mesajı göster",
        ]
    }
    
    for category, cmds in commands_list.items():
        embed.add_field(name=category, value="\n".join(cmds), inline=False)
    
    embed.set_footer(text="🎶 Groovy + Rhythm + Lavalink Birleşimi | The Wêsh Music")
    await ctx.send(embed=embed)

@bot.command(name="hakkında", aliases=["about", "info"])
async def about(ctx):
    """Bot hakkında bilgi"""
    embed = discord.Embed(
        title="🎵 The Wêsh Music Bot",
        description="Groovy, Rhythm ve Lavalink özelliklerini birleştiren profesyonel müzik botu",
        color=discord.Color.purple(),
        timestamp=datetime.now()
    )
    
    embed.add_field(name="✨ Özellikler", value=
        "• YouTube müzik desteği\n"
        "• Müzik kuyruğu sistemi\n"
        "• Şarkı/Kuyruk döngüsü\n"
        "• Ses seviyesi kontrolü\n"
        "• Kuyruk karışt scriptsırması\n"
        "• Dinamik prefix sistemi\n"
        "• Aktif bot paneli\n"
        "• Geçmiş takibi", inline=False
    )
    
    embed.add_field(name="👨‍💻 Geliştirici", value="The Wêsh Team", inline=True)
    embed.add_field(name="🌐 Dil", value="Türkçe", inline=True)
    
    embed.set_footer(text="Made with ❤️ for music lovers")
    await ctx.send(embed=embed)

# ============================================
# 🎯 BOT EVENTS
# ============================================
@bot.event
async def on_ready():
    print(f"✅ Bot {bot.user} olarak giriş yaptı!")
    print(f"📊 {len(bot.guilds)} sunucuya bağlı")
    
    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.listening,
            name="!yardım | Müzik Botu"
        )
    )

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.MissingRequiredArgument):
        embed = discord.Embed(
            title="❌ Hata",
            description="Yeterli argüman sağlanmadı!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.MissingPermissions):
        embed = discord.Embed(
            title="❌ Yetkilendirme Hatası",
            description="Bu komutu kullanmak için yeterli yetkiniz yok!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    elif isinstance(error, commands.CommandNotFound):
        pass
    else:
        print(f"Hata: {error}")

@bot.event
async def on_voice_state_update(member, before, after):
    """Ses kanalı değişikliğinde bot'u kontrol et"""
    if member.bot:
        return
    
    # Bot tek kaldığında ayrıl
    if after.channel:
        guild = member.guild
        voice_client = guild.voice_client
        
        if voice_client and voice_client.channel:
            members = [m for m in voice_client.channel.members if not m.bot]
            if not members:
                await voice_client.disconnect()

# ============================================
# 🚀 BOT ÇALIŞTIRMA
# ============================================
if __name__ == "__main__":
    TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"  # ⚠️ TOKEN'I BURAYA KOY
    
    try:
        bot.run(TOKEN)
    except Exception as e:
        print(f"❌ Bot başlatılamadı: {e}")
        print("🔧 Lütfen token'ı kontrol et ve bot'un Discord Developer Portal'da doğru şekilde ayarlandığından emin ol.")

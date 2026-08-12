#!/usr/bin/env python3
"""
🎵 The Wêsh Music Bot - Başlatıcı Script
Tüm gereksinimleri kontrol edip bot'u çalıştırır
"""

import os
import sys
import subprocess
import platform

def check_python_version():
    """Python versiyonunu kontrol et"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 veya daha yeni bir sürüm gerekli!")
        return False
    print(f"✅ Python {version.major}.{version.minor}.{version.micro} bulundu")
    return True

def check_ffmpeg():
    """FFmpeg'in yüklü olup olmadığını kontrol et"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        print("✅ FFmpeg kurulu")
        return True
    except:
        print("❌ FFmpeg bulunamadı!")
        print("\n📦 FFmpeg kurulumu:")
        if platform.system() == "Windows":
            print("  choco install ffmpeg")
            print("  veya https://ffmpeg.org/download.html")
        elif platform.system() == "Darwin":  # macOS
            print("  brew install ffmpeg")
        else:  # Linux
            print("  sudo apt-get install ffmpeg")
        return False

def install_requirements():
    """Gerekli paketleri yükle"""
    print("\n📦 Paketler yükleniyor...")
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'],
                      check=True, cwd=os.path.dirname(os.path.abspath(__file__)))
        print("✅ Paketler başarıyla yüklendi")
        return True
    except:
        print("❌ Paket kurulumu başarısız!")
        return False

def check_token():
    """Token'ı kontrol et"""
    try:
        with open('music_bot.py', 'r', encoding='utf-8') as f:
            content = f.read()
            if 'YOUR_DISCORD_BOT_TOKEN_HERE' in content:
                print("⚠️  TOKEN BELİRTİLMEMİŞ!")
                print("\n📝 Lütfen music_bot.py dosyasında:")
                print('   TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"')
                print("   satırını şu şekilde değiştir:")
                print('   TOKEN = "YOUR_ACTUAL_TOKEN_HERE"')
                print("\n🔗 https://discord.com/developers/applications adresinden token al")
                return False
            return True
    except:
        print("❌ music_bot.py dosyası bulunamadı!")
        return False

def main():
    print("=" * 50)
    print("🎵 The Wêsh Music Bot - Başlatıcı")
    print("=" * 50)
    
    # Python versiyonunu kontrol et
    if not check_python_version():
        sys.exit(1)
    
    # FFmpeg'i kontrol et
    if not check_ffmpeg():
        print("\n⚠️  FFmpeg olmadan bot çalışmayacak!")
        sys.exit(1)
    
    # Paketleri yükle
    if not install_requirements():
        sys.exit(1)
    
    # Token'ı kontrol et
    if not check_token():
        sys.exit(1)
    
    print("\n" + "=" * 50)
    print("✅ Tüm kontroller geçti!")
    print("=" * 50)
    print("\n🚀 Bot başlatılıyor...\n")
    
    # Bot'u çalıştır
    try:
        os.system('python music_bot.py')
    except KeyboardInterrupt:
        print("\n\n👋 Bot durduruldu")
        sys.exit(0)

if __name__ == "__main__":
    main()

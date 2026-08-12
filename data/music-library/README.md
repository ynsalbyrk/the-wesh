# Yerel muzik kutuphanesi

Bu klasore yalnizca Discord botunda yayinlama hakkina sahip oldugunuz tam sureli ses dosyalarini koyun. Desteklenen formatlar: MP3, OGG, OPUS, M4A, AAC, WAV, WEBM ve FLAC.

Bir parcanin tam sureli oynatilabilmesi icin dosyaya ek olarak `licenses.json` icinde acik bir bot-yayin izni kaydi olmalidir:

```json
{
  "tracks": [{
    "file": "Sanatci - Parca.mp3",
    "allowedForBotPlayback": true,
    "license": "CC BY 4.0 veya hak sahibinden yazili izin",
    "proofUrl": "https://lisans-kaniti.example/parca",
    "attribution": "Sanatci — Parca"
  }]
}
```

Dosyayi indirilebilir bulmak tek basina yayin izni vermez. `allowedForBotPlayback` degerini sadece lisans acikca Discord/cevrimici ses yayini izni veriyorsa `true` yapin.

# Pixel Date emotes v02 - gendered sets

v02 replaces v01's mixed set. There are two separate sets, **female (cute: bright, light, higher)** and **male (manly: deep, chesty, confident)**. Each set has all five emotes with 2 takes each. There are no gender-neutral takes. The duet-pick piano stingers are copied byte-for-byte from v01.

## Use
- Load `manifest.json`. Its `emotes.<female|male>.<emote>` entry is a list of takes.
- Pick the set that matches the character's gender. Choose a take at random and avoid repeating the previous one.
- Play `.ogg` (Opus) where supported and fall back to `.m4a` (Safari/iOS).

## Format and loudness (same as v01)
- Mono, 48 kHz. Opus 64 kbps VBR `.ogg` and AAC-LC 96 kbps `.m4a`.
- Every take is matched to -18.0 LUFS max momentary. The true-peak ceiling is -2.0 dBTP; the decoded maximum is -1.91 dBTP.
- Every take is under 1.0 s.
- Processing chain, unchanged from v01: declip → DC removal → tonal notch → declick → denoise (60%) → HP 70 Hz / LP 14 kHz → de-ess → trim at -45 dB → 6 ms fade-in and cos² fade-out → loudness match → look-ahead limiter → 24-bit WAV → encode.

## Sizes
- Opus: 162753 bytes in total, of which emotes are 144115 and duet pick is 18638.
- AAC: 233273 bytes in total.

## Chrome
- 44/44 files decode with `decodeAudioData` in headless Chrome 156.

## Takes
| file | gender | dur s | source | uploader | gender evidence | sound |
|---|---|---|---|---|---|---|
| giggle_f1 | female | 0.75 | [freesound 235165](https://freesound.org/people/Reitanna/sounds/235165/) | Reitanna | tags: female, girl | bright, high three-pulse "hehe-he" giggle that trails off (v01 giggle_1) |
| giggle_f2 | female | 0.37 | [freesound 343984](https://freesound.org/people/Reitanna/sounds/343984/) | Reitanna | tags: female, cute | tiny, quick "he-he-he!" - three crisp high pulses, pitch stepping up on the last |
| sigh_f1 | female | 0.77 | [freesound 621773](https://freesound.org/people/DarkNightPrincess/sounds/621773/) | DarkNightPrincess | title: "Female *Sigh*" | soft, light "haah~" sigh, gently voiced and drifting down - dreamy and quiet |
| sigh_f2 | female | 0.98 | [freesound 242690](https://freesound.org/people/Reitanna/sounds/242690/) | Reitanna | tags: female, woman | warm, voiced, slowly falling "haaah" sigh, long and melting |
| groan_f1 | female | 0.96 | [freesound 323190](https://freesound.org/people/Alivvie/sounds/323190/) | Alivvie | description: "When things don't go her way, she complains." | pouty, whiny complaint "muu~" - a sulky held note that drops at the end |
| groan_f2 | female | 0.80 | [freesound 241559](https://freesound.org/people/Reitanna/sounds/241559/) | Reitanna | tags: female | mid-high sulky "uurgh" - frustrated whine, no growl |
| aww_f1 | female | 0.78 | [freesound 241474](https://freesound.org/people/Reitanna/sounds/241474/) | Reitanna | tags: female | warm, genuine "aww" at something sweet, high start, falling (v01 aww_1) |
| aww_f2 | female | 0.95 | [freesound 235059](https://freesound.org/people/Reitanna/sounds/235059/) | Reitanna | tags: female | cooing, sing-song baby-talk "awww" (v01 aww_3) |
| gasp_f1 | female | 0.32 | [freesound 323707](https://freesound.org/people/Reitanna/sounds/323707/) | Reitanna | tags: female | delighted little "ooh!", pitch arcs up and down, very short (v01 gasp_1) |
| gasp_f2 | female | 0.92 | [freesound 621774](https://freesound.org/people/DarkNightPrincess/sounds/621774/) | DarkNightPrincess | title: "Cute Anime Girl Voice" | cute anime-girl "woah!" - high, bright, rising then bouncing down |
| giggle_m1 | male | 0.96 | [freesound 790713](https://freesound.org/people/WalliumVA/sounds/790713/) | WalliumVA | tags: male | low, chesty "heh-heh-heh" chuckle (median F0 ~131 Hz) |
| giggle_m2 | male | 0.91 | [freesound 643665](https://freesound.org/people/SnowFightStudios/sounds/643665/) | SnowFightStudios | title: "Various Chuckles_Male" | easy, deep four-pulse "huh-huh-huh-huh" chuckle (median F0 ~114 Hz) |
| sigh_m1 | male | 0.92 | [freesound 334061](https://freesound.org/people/garynoden/sounds/334061/) | garynoden | description: man, age 30-45 | deep, satisfied "aaahh" exhale, pitch sinking (v01 sigh_2) |
| sigh_m2 | male | 0.73 | [freesound 801137](https://freesound.org/people/Sadiquecat/sounds/801137/) | Sadiquecat | description: "mid-20s male" + tag Male | low relieved "ahhh" - deep voiced start into a breathy release |
| groan_m1 | male | 0.70 | [freesound 812302](https://freesound.org/people/Sadiquecat/sounds/812302/) | Sadiquecat | description: "mid-20s male" + tag Male | gruff, low mock-frustrated "aahhh" (v01 groan_2) |
| groan_m2 | male | 0.50 | [freesound 801012](https://freesound.org/people/Sadiquecat/sounds/801012/) | Sadiquecat | description: "mid-20s male" + tag Male | short, gruff annoyed "ughh", low and falling |
| aww_m1 | male | 0.50 | [freesound 801425](https://freesound.org/people/Sadiquecat/sounds/801425/) | Sadiquecat | description: "mid-20s male" + tag Male | warm, low affectionate "awwn" (v01 aww_2) |
| aww_m2 | male | 0.51 | [freesound 801431](https://freesound.org/people/Sadiquecat/sounds/801431/) | Sadiquecat | description: "mid-20s male" + tag Male | breathy-start, warm "h-awwn" - soft and low, lifting slightly at the end |
| gasp_m1 | male | 0.74 | [freesound 801213](https://freesound.org/people/Sadiquecat/sounds/801213/) | Sadiquecat | description: "mid-20s male" + tag Male | low, impressed "whoa-ahh", chesty and full |
| gasp_m2 | male | 0.78 | [freesound 436108](https://freesound.org/people/DrFortyseven/sounds/436108/) | DrFortyseven | title: "Oh! (Male)" | deep, intrigued "oh!" that lifts in pitch - interest piqued |

## Duet pick
`duetMatch_1` and `duetMiss_1` are unchanged from v01 (rendered piano, CC0 samples).

## Caveats
- The sources are Freesound HQ previews (OGG, ~128-192 kbps), because downloading originals needs a login. They are encoded down to 64k Opus, so the quality loss is not audible in practice but is noted here.
- The weakest emote is the female groan. No CC0 female "hmmph" exists from an uploader who states the gender, so it uses a pouty complaint and a sulky whine instead.

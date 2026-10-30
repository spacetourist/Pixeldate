# Café piano audio (pd_piano_v01): integration notes

There are six finished piano takes for the café piano. Each one is a complete performance with a written ending; none of them loop.

| id | title | composer | length | bpm (beat) | .ogg | .m4a |
|---|---|---|---|---|---|---|
| gymnopedie-1 | Gymnopédie No. 1 (abridged) | Satie | 78.17 s | 65 (quarter, 3/4) | 0.96 MB | 1.37 MB |
| clair-de-lune | Clair de lune (abridged) | Debussy | 90.99 s | 48 (dotted quarter, 9/8) | 1.14 MB | 1.59 MB |
| nocturne-op9-2 | Nocturne in E-flat, Op. 9 No. 2 (abridged) | Chopin | 76.65 s | 94 (eighth, 12/8) | 0.94 MB | 1.34 MB |
| steam-on-the-window | Steam on the Window | Original | 75.42 s | 70 (4/4 ballad) | 0.92 MB | 1.32 MB |
| sugar-cube-bossa | Sugar Cube Bossa | Original | 85.49 s | 112 (4/4 bossa) | 1.06 MB | 1.50 MB |
| moon-in-the-teacup | Moon in the Teacup | Original | 74.50 s | 108 (3/4 waltz) | 0.92 MB | 1.31 MB |

Totals: 5.9 MB for all .ogg files and 8.4 MB for all .m4a files. `manifest.json` holds the exact durations (seconds and samples), byte sizes, MIME strings and measured loudness.

## Format
- Mono, 48 kHz. Spatialise it in the engine (for example a Web Audio PannerNode at the piano's position).
- Primary file: Ogg Opus, about 96 kb/s VBR (`audio/ogg; codecs=opus`).
- Fallback file: AAC-LC in .m4a at 144 kb/s with faststart (`audio/mp4; codecs="mp4a.40.2"`), for Safari and iOS. It runs at 144k because ffmpeg's built-in AAC encoder put encoding glitches into loud transients at 112–128k.
- Choose the format with `audio.canPlayType(mime)`: use .ogg when the answer is not empty, otherwise .m4a.

## Loudness
- Every master is at **−16 LUFS integrated** (EBU R128), with a true peak of −1.7 dBTP before encoding.
- After encoding, the true peak is −1.3 to −1.5 dBTP for the .ogg files and −1.6 to −1.7 dBTP for the .m4a files, so every file is ≤ −1 dBTP. No samples clip.
- The pieces are already matched to each other, so play them at a fixed gain. Do not normalise them again at runtime.

## Lazy-load on pick
- Load only `manifest.json` (2 KB) when the scene starts. Fetch the audio file **only when a player picks a song**, using `fetch` → `decodeAudioData` or a streaming `<audio>`/MediaElementSource.
- A file is about 1 MB, which should be quick on most connections. Show a short "warming up" state on the piano while it loads. You can prefetch the item under the cursor or finger when the song menu opens.
- For sync, start playback at a shared server timestamp and seek every listener to `now − startedAt`. Use `durationSec` from the manifest to know when the take is finished.
- After a take ends, free the decoded buffer: about 15 MB of float PCM per piece at 48 kHz mono.

## Clean endings
- Every take starts about 60 ms before the first note.
- The ending is part of the performance: a held final chord, the pedal released by the "pianist", and the reverb tail. The file is trimmed once the tail falls below about −62 dBFS, then gets a 12 ms safety fade (5 ms fade-in at the start). No piece is cut off in the middle of a note.
- Do not crossfade or loop these files. If a player stops a song early, fade it out over about 300–500 ms in the engine.
- Decoded length in Chrome matches `durationSec` exactly for both formats. The Ogg container reports about 6 ms extra in ffprobe because of Opus pre-skip rounding, and decoders remove it.

## Verified
All of these were measured; nobody listened to the files.
- ffmpeg ebur128 gives the integrated loudness and true peak for the master, the .ogg and the .m4a of each piece.
- Headless Chrome 156 (Playwright) decoded all 12 files with `decodeAudioData`: mono, 48 kHz, durations as expected, and `canPlayType` returned "probably" for both MIME types.
- Note count rendered matches the note count arranged for every piece.
- An f0 check of each onset against the expected pitch found no wrong notes. The few "ambiguous" results are soft inner notes masked by the melody.
- In the originals, the accompaniment never crosses above the melody.

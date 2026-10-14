# Sniper shot

ユーザー添付「狙撃銃発射.mp3」から加工。
元音源SHA256: `3139c9383d91f5710e3cc55950f4ba91d05111205199d047e2681a5ebe6b2966`

- 48 kHz / PCM16 / モノラル / 1.800秒
- 45 Hzハイパス・14.5 kHzローパス
- 発射前3.625 msを除去。冒頭0.5 ms、末尾250 msをフェード
- ピーク−1.5 dBFS。ゲーム内ゲイン0.45に既存音量・距離減衰を適用

`tools/process-sniper-audio.py INPUT.mp3 --ffmpeg PATH_TO_FFMPEG`で再生成。
Pythonとnumpy、FFmpegが必要。WAVとローカル起動用JSを同時に更新する。

検証: `node client/tests/pistol-sample.cjs sniper`
試聴: `client/previews/sniper-audio.html`

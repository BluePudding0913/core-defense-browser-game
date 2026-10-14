# Sniper shot sequence

ユーザー添付「狙撃銃発射.mp3」から加工。
元音源SHA256: `3139c9383d91f5710e3cc55950f4ba91d05111205199d047e2681a5ebe6b2966`

- 48 kHz / PCM16 / モノラル / 1.800秒
- 45 Hzハイパス・14.5 kHzローパス
- 発射前3.625 msを除去。冒頭0.5 ms、末尾250 msをフェード
- ピーク−1.5 dBFS。ゲーム内ゲイン0.45に既存音量・距離減衰を適用

発砲後の機構音を同じWAVへミックス。銃声の最初の550 msは前回と同一。

| 音源 | 発砲からの開始 | 加工後の長さ | ピーク |
| --- | --- | --- | --- |
| 狙撃銃のボルトアクション.mp3 | 550 ms | 約739 ms | −10 dBFS |
| 大型狙撃銃の薬莢が落ちる2.mp3 | 900 ms | 約767 ms | −15 dBFS |

ボルトは100 Hz、薬莢は240 Hzのハイパス。ともに12.5 kHzローパス、
末尾無音を除去し、冒頭0.5 ms・末尾40 msをフェード。
ボルトの開閉の間隔、薬莢の跳ねる音を保ち、銃声より小さくする。
単独試聴・ミックス検証用にsniper_bolt.wavとsniper_casing.wavも保存。
ゲームは合成済みsniper_shot.wavだけを読み込み、1発につき1音枠で再生する。
既存の停止処理・ミュート・距離減衰は全体に適用される。

追加音源SHA256:
- ボルト: `968297e1f19b356dc6b23b96b080b5ee1deb734e801a4dcf98299e6d3eb97eca`
- 薬莢: `2a4b8283a2b18a9a3b9d6b98f04ad961df3340f80069800b107f821f29212a48`

`tools/process-sniper-audio.py SHOT.mp3 --bolt BOLT.mp3 --casing CASING.mp3 --ffmpeg PATH_TO_FFMPEG`で再生成。
Pythonとnumpy、FFmpegが必要。WAVとローカル起動用JSを同時に更新する。

検証: `node client/tests/pistol-sample.cjs sniper`
試聴: `client/previews/sniper-audio.html`

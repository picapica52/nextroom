# 見た目のルール

マシュマロ（淡い太線と、真下に落ちる淡い影でぷっくりさせる）。トークンは `packages/ui/src/styles/globals.css` にある。

- ライトテーマのみ。ダークテーマは持たない（`dark:` クラスは書かない）。
- 線は淡い紫。濃い紫（`foreground`）の線は使わない。
  - 面の外枠・ペインの区切り: `border-2`（色は `border` のまま）
  - 小さな部品（チェックボックス・ラジオ）や強調したい線: `border-border-strong`
  - 行どうしの細い区切り、ピルの線: `border-foreground/15`
- 浮いている物（ボタン、カード、ペイン）には真下の淡い影 `shadow-puff`（大きい物は `shadow-puff-lg`）を付ける。メニュー・ポップオーバー・ダイアログのように画面の上に重なる物だけ `shadow-float`（淡い影＋薄いぼかし）。
- パステルで塗った物は、その色の `-edge` を線に、`-shadow` を影に使う（例: `border-pastel-yellow-edge shadow-[0_3px_0_0_var(--pastel-yellow-shadow)]`）。
- 押せるボタンは、押したときに影が消えて、影の高さ（`translate-y-[3px]` など）だけ真下に沈む。押せないときは半透明にせず、破線の枠・影なし・地の色にする。
- スイッチは丸く、ON / OFF の文字を入れる。オンはライラックの地に黄のつまみ。
- 選択中の行（一覧・メニュー・パレット）は、黄の線（`border-pastel-yellow-edge`）付きの淡い黄。タブも淡い黄のピルで選ぶ。
- 状態は `Dot`（枠付きのピル）で見せる。進み具合は `Meter` で、実行中は `tone="running"`（斜線が流れる）、停止・エラーは `tone="stopped"`。
- 音声の再生は `AudioPlayer` を使い、ブラウザ標準のプレイヤーは出さない。
- ダイアログの背景はぼかさない。
- 色はパステルの平塗り: `pastel-yellow`（主要な操作・選択中のナビ）、`pastel-lilac`（自分の発言・副ボタン）、`pastel-mint`（オン）、`pastel-peach`（確認待ち）。`selected` は淡い黄で、一覧の選択行に使う。
- 文字色の `primary`（紫）はリンク・アイコン・進捗の色。塗りのボタンには使わない。
- 書体は M PLUS Rounded 1c。見出しは `font-extrabold`。

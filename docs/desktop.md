# デスクトップ

キャラクターごとに、画面のある Linux（Docker のコンテナ）を1台持たせる道具です。キャラクターはスクリーンショットを見ながらクリック・入力・キー操作で使い、ユーザーは同じ画面を見たり、操作を代わったりできます。

## 構成

- イメージ: `packages/api/desktop/`（Debian、Xvfb 1280x800、fluxbox、Chromium、xterm、xdotool、x11vnc、noVNC と websockify）。初めて使うときにアプリが `docker build` し、ファイルの中身から作ったタグ（`nextroom-desktop:<hash>`）を付けます。ファイルを変えると次に使うときに作り直します。
- コンテナ: `nextroom-desktop-<キャラクター ID>`。ワークスペースを `/workspace` に、ホームをボリューム `nextroom-desktop-home-<キャラクター ID>` にマウントします。ブラウザのログイン状態などはホームに残ります。メモリと CPU は「設定 → コンピューター」で変えられます。
- キャラクターの道具: `computer_observe`（スクリーンショット）と `computer_act`（クリック・入力・キー・スクロール・ドラッグ・ブラウザやターミナルを開く）。どちらも `docker exec` で xdotool と ImageMagick の `import` を動かします。スクリーンショットは画像としてモデルに渡し、会話の記録には残しません。画像を読めないモデルにはこの道具を渡しません。
- 画面の表示: コンテナの中の x11vnc を2つ（見るだけのものと、操作できるもの）websockify が noVNC で出します。アプリのサーバーが `/api/desktops/<id>/vnc/` でページと WebSocket を中継します（`desktopSocket`）。「操作を代わる」で操作できる方につなぎ直します。
- 15 分使われず、誰も画面を見ていないデスクトップは止めます。次に使うときにまた起動します。キャラクターを削除すると、コンテナとホームのボリュームも消します。

## 参考にした実装

Rakazo（Apache License 2.0）のコンピューター（`infra/sandboxes/computer`、`computer_observe` / `computer_act`）の構成を参考にし、コードはこのアプリに合わせて書き直しました。Rakazo にある、操作の貸し出し（リース）・画面 URL の暗号化・複数ディスプレイ・コンテナ内の制御サーバーは入れていません。

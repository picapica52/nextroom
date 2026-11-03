# Docker Compose

リポジトリ直下の `compose.yaml` で、サーバー（ビルド済みの画面も配信）をコンテナで起動できます。

```sh
docker compose up -d --build
```

- 画面: `http://127.0.0.1:8767`、同じネットワークのスマホからは `https://<PC の IP>:8768`
- データ（データベース・キャラクター・証明書・ダウンロードしたモデル）は、コンテナの `/data` にマウントした名前付きボリューム `data` に残ります。コンテナを作り直しても消えません（`docker compose down -v` で消えます）。
- API キーなどは、画面で入力するか `apps/server/.env` に書きます（あれば compose が読みます。書き換えたら `docker compose up -d` で作り直します）。
- 更新したら `docker compose up -d --build` でビルドし直します。

## ホストのサービスへの接続

コンテナの中の `127.0.0.1` はコンテナ自身なので、ホストで動かす OpenAI 互換 API（Ollama・LM Studio など）と speech.cpp のサーバーには `host.docker.internal` でつなぎます。イメージの既定値はこれに合わせてあります。

| 変数 | コンテナでの既定値 |
| --- | --- |
| `OPENAI_COMPATIBLE_BASE_URL` | `http://host.docker.internal:11434/v1` |
| `SPEECH_URL` | `http://host.docker.internal:8080` |

`apps/server/.env` や画面の設定で `127.0.0.1` を指定していると、こちらが優先されてつながらなくなります。

- Docker Desktop（Windows・macOS）では、ホストで `127.0.0.1` に待ち受けているサーバーにもそのまま届きます。
- Linux の Docker Engine では、ホストのサーバーがコンテナからの接続を受けるアドレス（`0.0.0.0` など）で待ち受けている必要があります。speech.cpp は 127.0.0.1 以外で待ち受けるとモデルの選択と Voice Clone の声の追加が使えないので、Linux ではホストで直接起動するほうが向いています。

## キャラクターのコンテナ

デスクトップと、ファイルとコマンドの「Docker」での実行は、ホストの Docker（`/var/run/docker.sock` をマウント）でキャラクターごとのコンテナを作ります。アプリのコンテナはホストの Docker を自由に操作できるので、信頼できる環境でだけ使ってください。

- ワークスペースは、データのボリューム（`nextroom-data`）から各コンテナにマウントします（`NEXTROOM_DOCKER_DATA_VOLUME`）。Docker Engine 26 以上が必要です。
- デスクトップのコンテナはネットワーク `nextroom` に入り、アプリはそこを通して画面を中継します（`NEXTROOM_DOCKER_NETWORK`）。

## コンテナの中で使えないもの

- ブラウザ（Chrome の操作）: コンテナに Chrome が入っていません。ブラウザでの作業はデスクトップを使ってください。
- HTTPS の証明書はコンテナの IP アドレスで作られるため、スマホではホストの IP アドレスとの不一致も含めて警告が出ます。許可して進んでください。

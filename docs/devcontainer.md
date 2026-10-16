# Dev Container

`.devcontainer/` に、開発用のコンテナの設定があります。VS Code の Dev Containers 拡張機能で「Reopen in Container」を選ぶと、次が入ったコンテナで開き、`bun install` まで済ませます。

- Bun（`package.json` の `packageManager` と同じ 1.4.2）
- Claude Code（`claude`）
- GitHub CLI（`gh`）

初回は、コンテナの中で `claude` と `gh auth login` でログインします。ログイン情報はボリューム（`character-agent-claude` と `character-agent-gh`）に残るので、コンテナを作り直しても消えません。

## ポート

| ポート | 用途 |
| --- | --- |
| 8767 | サーバー（HTTP） |
| 8768 | サーバー（HTTPS） |
| 5175 | 画面の開発サーバー（`bun run dev`） |

## コンテナの中で使えないもの

- speech.cpp のサーバーはホストで起動したままにし、`apps/server/.env` の `SPEECH_URL` を `http://host.docker.internal:8080` にします。
- ブラウザ（Chrome の操作）と Docker のサンドボックスの道具は、コンテナの中からは使えません。

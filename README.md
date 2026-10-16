# Nextroom

キャラクターと声で会話するためのローカル GUI です。音声合成には [Irodori-TTS](https://github.com/Aratako/Irodori-TTS) v4.1（Small / Small MF）、文字起こしには speech.cpp のカタログから選んだ日本語のモデルを使い、どちらも別に起動した [speech.cpp](https://github.com/nyosegawa/speech.cpp) のサーバー（`speech serve`）に HTTP で頼みます（Python は不要です）。参照音声（Voice Clone）の声づくりは、キャラクターの声の画面で行えます。

- **会話**: マイクで話しかけると、speech.cpp で文字起こし → OpenAI 互換 API（OpenRouter / Ollama / LM Studio など）または Claude（Anthropic API）の LLM に送信 → 返答を Irodori-TTS で読み上げ。返答は1文ずつ合成して順に再生するので、全文を待たずに話し始めます。会話画面はキャラクターの顔と字幕を中心に、プッシュトゥートークで聞き取ります。マイクのボタン（入力欄の外では Space キー）を押している間だけ録音し、離すと送信します。返答の読み上げ中に押すと読み上げを止めて話せます。文字でも話しかけられます。返答の声（モデル・話速・Voice Clone・キャプション）はキャラクターごとに指定できます。
- **キャラクター**: エージェントの人格になるキャラクターを、このアプリ独自の設定（世界観・プロフィール・見た目・性格・喋り方・部屋の様子・端末）と参考画像・返答の声つきで保存。キャラクターは自分の世界の自分の部屋にいて、そこに置いたビデオ通話の端末があなたの端末と突然つながった、という前提で話します。動きや表情、部屋の様子は `*…*` の地の文で詳しく書き（読み上げません）、道具はつながった端末を通して実際にあなたの PC で作業します（方針は [docs/direction.md](docs/direction.md)）。サイドバーの「キャラクターを作る」を押すと、すぐにキャラクターの設定が会話の上に開きます（設定も同じく会話の上に開きます）。新しい会話を始めるときに話し相手を選びます。書き出しは、表情や声のファイルも含めたこのアプリ用の zip です。
- **エージェント**: キャラクターは [Mastra](https://mastra.ai/) のエージェントとして動き、会話画面の「道具」か「設定 → 道具と権限」でオンにした道具を会話の中で使います。返答の下と会話の右パネルに道具の実行ステップが表示され、確認が必要な操作は入力欄の上で「許可 / この会話では常に許可 / 拒否」を聞いてから実行します。
  - **メモリー**: 会話の記憶は Mastra Memory（LibSQL）。ワーキングメモリー（ユーザーについてのメモをキャラクターが自分で更新）と、過去の会話から意味の近い発言を思い出す機能（埋め込みは EmbeddingGemma を Transformers.js でサーバーが CPU で行うので、GPU の処理中でも止まりません）。記憶はキャラクターごとに分かれ、キャラクター画面の「記憶」タブで見たり直したりできます。
  - **ブラウザ**: この PC の Chrome を [Stagehand](https://docs.stagehand.dev/)（@mastra/stagehand）で操作します。操作中の画面は会話の右パネルの「ブラウザ」に映り、パネルを広げるとクリックや入力で操作を引き継げます。
  - **ワークスペース**: キャラクターと Claude がファイルを読み書きする場所です。キャラクターごとに1つあり（`_data/characters/<id>/workspace/`）、会話の右パネルの「ファイル」で中身を見たり、ファイルを置いたりできます。
  - **ファイルとコマンド**: キャラクターのワークスペースで、ファイルを作ったりコマンドを実行したりします（Mastra Workspace）。実行は Docker のコンテナの中（おすすめ）か、この PC で直接（隔離なし）から選べます。
  - **Claude Agent SDK**: 手間のかかる作業を、キャラクターが Claude（@mastra/claude）に任せます。Claude もキャラクターのワークスペースで作業します。
- **声**: キャラクターの「声」タブで、実行先（speech.cpp の Irodori-TTS か ElevenLabs）とモデルをキャラクターごとに選びます。speech.cpp サーバーが読み込めるモデルは1つなので、違うモデルのキャラクターが話すときは先にモデルを読み込み直します。
  - **参照音声**: Voice Clone で使う音声を、キャラクターのフォルダ `_data/characters/<id>/voice/` にアップロードします（WAV 以外はブラウザで WAV にしてから送ります）。同じ画面でボイスファイル（音声を一覧の順に1つにつないだ WAV、合計120秒まで）を作ります。speech.cpp サーバーはこれを参照音声として受け取ります。音声を追加・削除したら、ボイスファイルを作り直します。手元の .wav や speech.cpp で作った .voice.gguf をそのまま読み込むこともできます。
  - **ElevenLabs**: アカウントの声から選ぶほか、キャラクターの参照音声からの複製（Instant Voice Clone）や、説明文からの作成（Voice Design）もこの画面で行えます。説明文は、会話の LLM がキャラクターの設定から考えることもできます。
- **設定**: speech.cpp サーバーの接続先（接続）、会話の LLM・文字起こし（会話）、エージェントの記憶と道具（エージェント）。文字起こしのモデルは「モデル」で、音声合成のモデルはキャラクターの声の画面で選ぶと、speech.cpp サーバーがダウンロードして読み込みます。記憶の検索と表情画像の背景透過のモデルは、初めて使うときに Transformers.js が `_data/transformers/` へ自動でダウンロードします。

## 必要なもの

- Windows（x64）・macOS（Apple Silicon）・Linux（x64）。動作確認: Windows + RTX 4070 Ti 12GB
  - speech.cpp のサーバーは自分で起動します（[docs/speech-server.md](docs/speech-server.md)）。[リリース](https://github.com/nyosegawa/speech.cpp/releases)から OS に合った版を取得します
  - Windows: Vulkan 版（GPU のドライバが必要）
  - macOS: Metal 版
  - Linux: Vulkan 版。Vulkan のローダー（`libvulkan.so.1`）がなければ CPU 版
- [Bun](https://bun.sh/) 1.4 以上、Git
- 会話用の LLM（OpenAI 互換 API、または Claude 用の Anthropic API キー）。エージェントの道具やワーキングメモリーを使うときは、ツール呼び出し（function calling）に対応したモデルが必要です
- 道具を使う場合のみ: ブラウザには Google Chrome、Docker のサンドボックスには Docker Desktop、Claude Agent SDK には Anthropic の API キー

## セットアップと起動

```powershell
.\setup.ps1           # 初回のみ: 依存パッケージのインストールと画面のビルド
.\start.ps1           # サーバーを起動し、http://127.0.0.1:8767 を開く
.\start.ps1 -Dev      # 画面・サーバーを開発モード（https://127.0.0.1:5175）で起動
```

「このシステムではスクリプトの実行が無効になっているため…」と出て実行できない場合は、PowerShell の実行ポリシーで止められています。次のどちらかで実行してください。

```powershell
# 自分のユーザーだけ、ローカルのスクリプトの実行を常に許可する（管理者権限は不要。一度だけでよい）
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# 設定を変えずに、その回だけ許可して実行する
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

macOS と Linux では、スクリプトの代わりに次を実行します。

```sh
bun install && bun run build  # 初回のみ
bun run start                 # サーバーを起動し、http://127.0.0.1:8767 を開く
bun run dev                   # 画面・サーバーを開発モード（https://127.0.0.1:5175）で起動
```

同じネットワークのスマホからは `https://<PC の IP>:8768`（開発モードでは `https://<PC の IP>:5175`）で開きます。ブラウザは HTTPS のページにしかマイクを使わせないため、サーバーが自己署名の証明書を作って HTTPS でも待ち受けます（`_data/tls`）。初めて開くときに出る「安全ではない」という警告を許可して進んでください。

接続先と API キー（OpenRouter・Anthropic・Exa・Composio・ElevenLabs・OpenAI 互換 API・speech.cpp）は `apps/server/.env` に書きます。項目と既定値は `apps/server/.env.schema` にあり、「設定 → 接続」で設定済みかどうかと接続を確かめられます。書き換えたあとはサーバーを起動し直してください。

```sh
# apps/server/.env の例
OPENROUTER_API_KEY=sk-or-...
OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:11434/v1
```

声で話すには、speech.cpp のサーバーを別に起動しておきます。次のようにモデルを渡さずに起動してから、「設定 → モデル」の Speech To Text と、キャラクターの声の画面でモデルを選びます（詳しくは [docs/speech-server.md](docs/speech-server.md)）。接続先の既定は `http://127.0.0.1:8080`（`.env` の `SPEECH_URL`）です。

```powershell
speech serve --open
```

## 構成

bun workspaces + Turborepo のモノレポです。`.\start.ps1` は turbo でサーバーを、`-Dev` では画面の開発サーバーも一緒に起動します。

```
apps/
  web/                React + Tailwind CSS v4（Vite）。画面はこれ1つ
    src/app/            エントリ・ルーティング
    src/features/       画面ごとの機能（chat / call / characters / agent / workspaces / settings）
    src/components/     画面をまたぐ部品
    src/hooks/          共通のクエリ（queries.ts）と、GPU ジョブ・再生（engine.ts）
  server/             Hono（Bun）: /api と、ビルド済み画面の配信。環境変数は varlock（.env.schema）
packages/
  api/                サーバー側の中身（apps/server が読み込む）
    src/routes/         /api 以下のルート（Hono。HTTP の入口だけ）
    src/mastra/         Mastra: エージェント（会話）、道具（tools/: ブラウザ・サンドボックス・Claude）、
                        メモリー、LLM の接続、IrodoriVoice、実行ステップと確認
    src/conversations/  会話モード（文字起こし → エージェント → 1文ずつ音声合成）
    src/characters/     キャラクター（保存・書き出し、表情、プロンプト組み立て）
    src/engine/         エンジン: speech.cpp サーバーのクライアント（音声合成・文字起こし）、
                        GPU ジョブのキュー、speech.cpp サーバーのモデル
    src/images/         画像生成のクライアント（OpenRouter）と、表情画像の背景透過（BiRefNet lite を Transformers.js で）
    src/settings/       設定（chat: 会話、agent: エージェント）
    src/lib/            データフォルダーのパス・JSON 保存・エラー・ジョブを1つずつ実行するキュー・子プロセス
  contracts/          画面とサーバーで共有する型と、リクエストを確かめる zod スキーマ
  ui/                 shadcn/ui（Base UI・nova）の部品とテーマ
  config/             共通の tsconfig
docs/                 見た目のルール
_data/                会話・キャラクター・設定（git 管理外）
  settings.json         設定（chat: 会話、agent: エージェント、discord: Discord bot）。接続先と API キーは apps/server/.env
  characters/<キャラクター>/  キャラクターと、その会話
    character.json        人物設定・声・表情の一覧
    reference.png         参考画像
    expressions/          表情画像
    voice/                参照音声とボイスファイル
    affinity.json         好感度
    chat.json             会話の作成・更新日時
    images/               会話の画像（添付・キャラクターが描いた絵）
    workspace/            ワークスペース（ファイルとコマンドの道具・Claude が作業する場所）
  agent/                エージェントの記憶と会話のメッセージ（memory.db）
  uploads/              アップロードの一時ファイル（1日で消える）
  transformers/         Transformers.js がダウンロードしたモデル
  tls/                  HTTPS の自己署名証明書
```

キャラクターの書き出しに入るのは、人物設定・参考画像・表情画像・声だけです（好感度・会話・記憶・ワークスペースは入りません）。キャラクターを削除すると、ワークスペースも消えます。記憶を消去しても、ワークスペースのファイルは残ります。

画面は Bun のサーバー（8767）だけにアクセスします。エンジンはサーバーの一部で、`/api/engine/*`（speech.cpp サーバーのモデル・GPU ジョブ）で使います。音声合成と文字起こしは、ユーザーが別に起動した speech.cpp サーバーに HTTP（OpenAI 互換の `/v1/audio/speech`・`/v1/audio/transcriptions`）で頼みます。Voice Clone の声は、初めて使うときにサーバーの `/speech/voices` へ送って加えます。

LLM の呼び出しは [Mastra](https://mastra.ai/) の Agent（会話の `characterAgent`）を通します。接続先は OpenAI 互換 API なら何でもよく、Claude を選ぶと Anthropic API（`@ai-sdk/anthropic`）を直接使います。URL・API キーは `apps/server/.env`、プロバイダー・モデルは「設定 → 返答モデル」の値が呼び出しごとに渡されます。

会話の1往復はサーバーのキューで1つずつ実行されます。speech.cpp に頼む処理（生成・文字起こし）とボイスファイル作成はエンジンのキューで1つずつ順番に実行されます。返答の途中で止めると、リクエストを切るので合成中の文も speech.cpp 側で止まります。

## エージェントの道具について

- 道具はすべて最初はオフです。会話画面の「道具」か「設定 → 道具と権限」でオンにしてください。
- 確認は、ブラウザの操作・コマンド実行・ファイルの書き込みや削除・Claude が使うツールごとに設定できます。確認待ちのあいだ返答は止まり、会話を止める（停止ボタン）と確認は「拒否」になります。
- Docker で実行するときはキャラクターごとにコンテナを作り、そのワークスペースを /workspace にマウントします。メモリ・CPU・制限時間・ネットワークの有無は設定で変えられます。「この PC で直接」は Windows では隔離されません。
- Claude Agent SDK はコンテナではなく、この PC 上で直接動きます。ワークスペースだけが境界なので、Bash は「確認なしで使ってよいツール」に入れないでください。認証は API キー（`.env` の `ANTHROPIC_API_KEY`）が初期値です。個人で使う場合は、「この PC の Claude Code のログイン」を選ぶと、Claude Code にログインしているサブスクリプションで動きます（先に `claude` で `/login` しておいてください）。このアプリを他の人に提供する形で、ログインでの利用を使わせることは Anthropic の規約で認められていません。
- ブラウザのページの読み取り（Stagehand）にも会話の LLM を使います。

## 補足

- LoRA と Large は speech.cpp が対応していないため使えません。
- 接続先と API キーは `apps/server/.env` から読み、画面には設定済みかどうかだけを返します。マイクの録音はブラウザ内で 16kHz WAV にしてから送るので、FFmpeg は不要です。長い録音は無音で区切ってから文字起こしします。
- 他人の声を複製する場合は、利用規約と本人の許諾を確認してください。各モデルのライセンスは Hugging Face のモデルカードを参照してください。

## チェック

```powershell
bun run check-types  # 全パッケージの型チェック
bun run check        # Biome（整形・lint）
```

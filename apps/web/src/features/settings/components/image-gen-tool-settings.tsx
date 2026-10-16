import type { AgentSettingsView } from "@nextroom/contracts";
import { Link } from "react-router-dom";

export function imageGenToolSummary(imageGen: AgentSettingsView["image_gen"]) {
	if (!imageGen.has_api_key)
		return "OpenRouter の API キーが未設定です（.env の OPENROUTER_API_KEY）";
	if (!imageGen.model) return "モデルが未設定です（設定 → モデル で選択）";
	return `${imageGen.model} で写真を作って送ります`;
}

/** What the photo tool does; its model is the one of 設定 → モデル. */
export function ImageGenToolSettings() {
	return (
		<p className="m-0 text-xs text-muted-foreground">
			キャラクターが自分の世界で撮った写真（自撮り・食事・景色など）を送ってきます。写真は
			<Link to="/settings/models">設定 → モデル</Link>
			の「画像の生成」のモデルで作り、キャラクターのアイコンや、会話に添付した画像（複数枚可）を参照します。キャラクターには自分のスマホで撮った写真として見えています。
		</p>
	);
}

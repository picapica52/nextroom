import type { Persona, PersonaGeneratedField } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Field, FieldLabel } from "@nextroom/ui/components/field";
import { Input } from "@nextroom/ui/components/input";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { SettingsSection } from "@/components/settings-section";
import { CharacterGenerateDialog } from "./character-generate-dialog";
import { TextField } from "./character-text-field";

/** The character's name and settings: its world, profile, appearance, personality, way of
 *  talking, inner self, past and people, daily life, the room the device is in, and what the
 *  device is in its world. */
export function CharacterProfileForm({
	characterId,
	persona,
	onChange,
}: {
	characterId: string;
	persona: Persona;
	onChange: (changes: Partial<Persona>) => void;
}) {
	const [generating, setGenerating] = useState<PersonaGeneratedField | null>(null);
	const field = (key: keyof Persona) => ({
		value: persona[key],
		onChange: (value: string) => onChange({ [key]: value }),
	});
	const generated = (key: PersonaGeneratedField) => ({
		...field(key),
		action: (
			<Button size="xs" variant="ghost" onClick={() => setGenerating(key)}>
				<Sparkles />
				AIで書く
			</Button>
		),
	});
	return (
		<>
			<CharacterGenerateDialog
				characterId={characterId}
				persona={persona}
				field={generating}
				onClose={() => setGenerating(null)}
				onApply={onChange}
			/>
			<SettingsSection
				title="基本"
				description={`${"{{char}}"} はキャラクターの名前、${"{{user}}"} は設定の「あなたの名前」に置き換わります。`}
				className="gap-5"
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor="ch-name">名前</FieldLabel>
						<Input
							id="ch-name"
							value={persona.name}
							onChange={(e) => onChange({ name: e.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="ch-nickname">呼び名（空欄で名前）</FieldLabel>
						<Input
							id="ch-nickname"
							value={persona.nickname}
							onChange={(e) => onChange({ nickname: e.target.value })}
						/>
					</Field>
				</div>
				<TextField
					id="ch-world"
					label="世界観"
					rows={4}
					placeholder="キャラクターが暮らす世界。時代・場所・技術や魔法・社会のしくみなど"
					description="あなたのいる世界とは別の世界です。端末の向こうのあなたの世界のことは知りません。"
					{...generated("world")}
				/>
				<TextField
					id="ch-profile"
					label="プロフィール"
					rows={5}
					placeholder="年齢・立場や仕事など、どんな人物かのあらまし"
					{...generated("profile")}
				/>
				<TextField
					id="ch-appearance"
					label="見た目"
					rows={3}
					placeholder="髪・目・体つき・服装など。地の文で画面に映る姿を書くときに使います"
					{...generated("appearance")}
				/>
			</SettingsSection>
			<SettingsSection title="性格と喋り方" className="gap-5">
				<TextField
					id="ch-personality"
					label="性格"
					rows={3}
					placeholder="どんな性格か、初対面の相手にどう接するか"
					{...generated("personality")}
				/>
				<TextField
					id="ch-speech"
					label="喋り方"
					rows={4}
					placeholder="一人称・語尾・口癖・敬語を使うかなど。セリフの例を書いてもかまいません"
					{...generated("speech")}
				/>
				<TextField
					id="ch-habits"
					label="癖・しぐさ"
					rows={2}
					placeholder="無意識にしてしまう手・顔・体の動き"
					{...generated("habits")}
				/>
			</SettingsSection>
			<SettingsSection title="内面" className="gap-5">
				<TextField
					id="ch-likes"
					label="好きなもの・苦手なもの"
					rows={3}
					placeholder="趣味・好物・苦手なこと"
					{...generated("likes")}
				/>
				<TextField
					id="ch-values"
					label="価値観"
					rows={3}
					placeholder="大事にしていること、譲れないこと、怒るポイント"
					{...generated("values")}
				/>
				<TextField
					id="ch-goals"
					label="目標・夢"
					rows={2}
					placeholder="今がんばっていること、将来やりたいこと"
					{...generated("goals")}
				/>
				<TextField
					id="ch-worries"
					label="悩み・弱み"
					rows={2}
					placeholder="今困っていること、コンプレックスや弱いところ"
					{...generated("worries")}
				/>
				<TextField
					id="ch-secret"
					label="秘密"
					rows={2}
					placeholder="まだ誰にも話していないこと"
					description="自分からは話しません。あなたを深く信頼したときに打ち明けることがあります。"
					{...generated("secret")}
				/>
			</SettingsSection>
			<SettingsSection title="過去と人間関係" className="gap-5">
				<TextField
					id="ch-backstory"
					label="過去"
					rows={4}
					placeholder="生い立ち、転機になった出来事、今の性格に影響した経験"
					{...generated("backstory")}
				/>
				<TextField
					id="ch-relationships"
					label="交友関係"
					rows={4}
					placeholder="家族・友人・同僚など周りの人物と、その人との関係"
					{...generated("relationships")}
				/>
				<TextField
					id="ch-love"
					label="恋愛観"
					rows={2}
					placeholder="恋愛についての考え方、惹かれる相手のタイプ"
					{...generated("love")}
				/>
			</SettingsSection>
			<SettingsSection title="暮らし" className="gap-5">
				<TextField
					id="ch-daily"
					label="生活パターン"
					rows={3}
					placeholder="起きる時間と寝る時間、仕事や学校、平日と休日の過ごし方"
					description="今の時刻と合わせて、通話のときに何をしているかに使います。"
					{...generated("daily")}
				/>
				<TextField
					id="ch-recent"
					label="近況"
					rows={2}
					placeholder="最近あったこと、今ハマっていること"
					{...generated("recent")}
				/>
				<TextField
					id="ch-surroundings"
					label="住んでいる場所"
					rows={2}
					placeholder="部屋の外の街、よく行く場所、通勤・通学路"
					{...generated("surroundings")}
				/>
				<TextField
					id="ch-belongings"
					label="大事な持ち物"
					rows={2}
					placeholder="大切にしている物、いつも持ち歩いている物とその理由"
					{...generated("belongings")}
				/>
			</SettingsSection>
			<SettingsSection
				title="部屋"
				description="キャラクターの部屋には、あなたの端末と突然つながったビデオ通話の端末が置いてあります。"
				className="gap-5"
			>
				<TextField
					id="ch-room"
					label="部屋の様子"
					rows={3}
					placeholder="どんな部屋か、端末をどこに置いているか、画面に何が映っているか"
					{...generated("room")}
				/>
			</SettingsSection>
			<SettingsSection
				title="端末"
				description="この世界で、通話の端末を何と呼び、どんな物か。空欄なら世界観に合わせてキャラクターが決めます。"
				className="gap-5"
			>
				<TextField
					id="ch-device"
					label="端末"
					rows={2}
					placeholder="この世界での呼び名と形。どんな物で、相手の姿がどう映るか"
					{...generated("device")}
				/>
			</SettingsSection>
		</>
	);
}

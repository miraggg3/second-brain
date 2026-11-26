// Feelings that can be picked next to the 1–5 mood, several per day.
// Labels are translated: "today.feel_<id>" in src/i18n/*/today.ts.

import { t, type Key } from "./i18n";

export const FEELINGS: { id: string; emoji: string }[] = [
  { id: "joy", emoji: "😊" },
  { id: "calm", emoji: "😌" },
  { id: "grateful", emoji: "🙏" },
  { id: "energy", emoji: "⚡" },
  { id: "love", emoji: "🥰" },
  { id: "confident", emoji: "😎" },
  { id: "inspired", emoji: "💡" },
  { id: "rested", emoji: "🛋️" },
  { id: "tired", emoji: "🥱" },
  { id: "stress", emoji: "😣" },
  { id: "anxious", emoji: "😰" },
  { id: "sad", emoji: "😢" },
  { id: "angry", emoji: "😠" },
  { id: "bored", emoji: "😑" },
  { id: "lonely", emoji: "🫥" },
  { id: "sick", emoji: "🤒" },
];

export const feelingLabel = (id: string) => t(`today.feel_${id}` as Key);
export const feelingEmoji = (id: string) => FEELINGS.find((f) => f.id === id)?.emoji ?? "";

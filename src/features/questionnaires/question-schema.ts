// @implements v2-17 問診テンプレートの質問スキーマ

export type QuestionType = "text" | "textarea" | "radio" | "checkbox" | "date" | "consent";

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
  required: boolean;
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "一行テキスト",
  textarea: "複数行テキスト",
  radio: "単一選択",
  checkbox: "複数選択",
  date: "日付",
  consent: "同意チェック",
};

/** 選択肢の入力が必要な質問タイプ(radio/checkbox) */
export function needsOptions(type: QuestionType): boolean {
  return type === "radio" || type === "checkbox";
}

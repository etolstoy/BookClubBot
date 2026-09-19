import type { Message } from "telegraf/types";

// Telegraf's Message types do not yet include Telegram's rich_message payload.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function joinText(parts: string[], separator = "\n"): string {
  return parts.filter(part => part.length > 0).join(separator);
}

function arrayText(
  value: unknown,
  extract: (item: unknown) => string,
  separator = "\n\n",
): string {
  if (!Array.isArray(value)) return "";
  return joinText(value.map(extract), separator);
}

function buttonText(value: unknown): string {
  return isObject(value) ? richText(value.text) : "";
}

function richText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return arrayText(value, richText, "");
  if (!isObject(value)) return "";

  switch (value.type) {
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
    case "spoiler":
    case "date_time":
    case "text_mention":
    case "subscript":
    case "superscript":
    case "marked":
    case "code":
    case "url":
    case "email_address":
    case "phone_number":
    case "bank_card_number":
    case "mention":
    case "hashtag":
    case "cashtag":
    case "bot_command":
    case "anchor_link":
    case "reference":
    case "reference_link":
      return richText(value.text);
    case "custom_emoji":
      return stringValue(value.alternative_text);
    case "mathematical_expression":
      return stringValue(value.expression);
    case "button":
      return buttonText(value.button);
    default:
      return "";
  }
}

function captionText(value: unknown): string {
  if (!isObject(value)) return "";
  return joinText([richText(value.text), richText(value.credit)], "\n\n");
}

function listItemText(value: unknown): string {
  if (!isObject(value)) return "";
  return joinText([stringValue(value.label), arrayText(value.blocks, blockText, "\n\n")], " ");
}

function tableRowText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  // Empty and invisible cells still occupy a column in the table.
  return value.map(cell => isObject(cell) ? richText(cell.text) : "").join("\t");
}

function blockText(value: unknown): string {
  if (!isObject(value)) return "";

  switch (value.type) {
    case "paragraph":
    case "heading":
    case "pre":
    case "footer":
      return richText(value.text);
    case "mathematical_expression":
      return stringValue(value.expression);
    case "blockquote":
      return joinText([arrayText(value.blocks, blockText, "\n\n"), richText(value.credit)], "\n\n");
    case "expandable_blockquote":
    case "pullquote":
      return joinText([richText(value.text), richText(value.credit)], "\n\n");
    case "list":
      return arrayText(value.items, listItemText);
    case "details":
      return joinText([richText(value.summary), arrayText(value.blocks, blockText, "\n\n")], "\n\n");
    case "table":
      return joinText([richText(value.caption), arrayText(value.cells, tableRowText, "\n")], "\n");
    case "collage":
    case "slideshow":
      return joinText([arrayText(value.blocks, blockText, "\n\n"), captionText(value.caption)], "\n\n");
    case "map":
    case "animation":
    case "audio":
    case "document":
    case "photo":
    case "video":
    case "voice_note":
      return captionText(value.caption);
    case "buttons":
      return arrayText(value.buttons, buttonText, "\t");
    default:
      return "";
  }
}

/** Extract visible message text, preserving inline spacing and block boundaries. */
export function getMessageText(message: Message): string | undefined {
  if ("text" in message) return message.text;
  if ("caption" in message && typeof message.caption === "string") return message.caption;
  if (!("rich_message" in message)) return undefined;

  const richMessage = message.rich_message;
  if (!isObject(richMessage)) return undefined;

  const text = arrayText(richMessage.blocks, blockText, "\n\n");
  return text.trim().length > 0 ? text : undefined;
}

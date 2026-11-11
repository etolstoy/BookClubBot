import type { Message, MessageEntity } from "telegraf/types";

export interface FormattedMessageText {
  text: string;
  entities: MessageEntity[];
}

function plainText(text = ""): FormattedMessageText {
  return { text, entities: [] };
}

function withEntity(
  content: FormattedMessageText,
  entity: MessageEntity,
): FormattedMessageText {
  if (!content.text) return content;
  return { text: content.text, entities: [entity, ...content.entities] };
}

// Telegraf's Message types do not yet include Telegram's rich_message payload.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function joinText(parts: FormattedMessageText[], separator = "\n"): FormattedMessageText {
  const result = plainText();
  for (const part of parts.filter(part => part.text.length > 0)) {
    if (result.text) result.text += separator;
    const offset = result.text.length;
    result.entities.push(...part.entities.map(entity => ({
      ...entity, offset: entity.offset + offset,
    })));
    result.text += part.text;
  }
  return result;
}

function arrayText(
  value: unknown,
  extract: (item: unknown) => FormattedMessageText,
  separator = "\n\n",
): FormattedMessageText {
  if (!Array.isArray(value)) return plainText();
  return joinText(value.map(extract), separator);
}

function buttonText(value: unknown): FormattedMessageText {
  return isObject(value) ? richText(value.text) : plainText();
}

function richText(value: unknown): FormattedMessageText {
  if (typeof value === "string") return plainText(value);
  if (Array.isArray(value)) return arrayText(value, richText, "");
  if (!isObject(value)) return plainText();

  switch (value.type) {
    case "bold":
    case "italic":
    case "underline":
    case "strikethrough":
    case "spoiler":
    case "code": {
      const content = richText(value.text);
      return withEntity(content, { type: value.type, offset: 0, length: content.text.length });
    }
    case "url": {
      const content = richText(value.text);
      return withEntity(content, {
        type: "text_link", offset: 0, length: content.text.length, url: stringValue(value.url),
      });
    }
    case "text_mention": {
      const content = richText(value.text);
      if (!isObject(value.user)) return content;
      return withEntity(content, {
        type: "text_mention", offset: 0, length: content.text.length,
        user: value.user as unknown as MessageEntity.TextMentionMessageEntity["user"],
      });
    }
    case "date_time":
    case "subscript":
    case "superscript":
    case "marked":
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
      // Standard emoji remain usable by bots without custom emoji permissions.
      return plainText(stringValue(value.alternative_text));
    case "mathematical_expression":
      return plainText(stringValue(value.expression));
    case "button":
      return buttonText(value.button);
    default:
      return plainText();
  }
}

function captionText(value: unknown): FormattedMessageText {
  if (!isObject(value)) return plainText();
  return joinText([richText(value.text), richText(value.credit)], "\n\n");
}

function listItemText(value: unknown): FormattedMessageText {
  if (!isObject(value)) return plainText();
  return joinText([plainText(stringValue(value.label)), arrayText(value.blocks, blockText, "\n\n")], " ");
}

function tableRowText(value: unknown): FormattedMessageText {
  if (!Array.isArray(value)) return plainText();
  // Empty and invisible cells still occupy a column in the table.
  return value.reduce<FormattedMessageText>((result, cell, index) => {
    if (index > 0) result.text += "\t";
    const content = isObject(cell) ? richText(cell.text) : plainText();
    result.entities.push(...content.entities.map(entity => ({
      ...entity, offset: entity.offset + result.text.length,
    })));
    result.text += content.text;
    return result;
  }, plainText());
}

function blockText(value: unknown): FormattedMessageText {
  if (!isObject(value)) return plainText();

  switch (value.type) {
    case "paragraph":
    case "heading":
    case "footer":
      return richText(value.text);
    case "pre": {
      const content = richText(value.text);
      return withEntity(content, {
        type: "pre", offset: 0, length: content.text.length,
        ...(typeof value.language === "string" ? { language: value.language } : {}),
      });
    }
    case "mathematical_expression":
      return plainText(stringValue(value.expression));
    case "blockquote": {
      const content = joinText([arrayText(value.blocks, blockText, "\n\n"), richText(value.credit)], "\n\n");
      return withEntity(content, { type: "blockquote", offset: 0, length: content.text.length });
    }
    case "expandable_blockquote": {
      const content = joinText([richText(value.text), richText(value.credit)], "\n\n");
      // Supported by Telegram, but absent from the installed Telegraf entity types.
      return withEntity(content, {
        type: "expandable_blockquote", offset: 0, length: content.text.length,
      } as unknown as MessageEntity);
    }
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
      return plainText();
  }
}

/** Extract visible message text, preserving inline spacing and block boundaries. */
export function getMessageText(message: Message): string | undefined {
  return getMessageTextWithEntities(message)?.text;
}

/** Preserve Telegram entities using UTF-16 offsets, matching JavaScript string indices. */
export function getMessageTextWithEntities(message: Message): FormattedMessageText | undefined {
  if ("text" in message) return { text: message.text, entities: message.entities ?? [] };
  if ("caption" in message && typeof message.caption === "string") {
    return { text: message.caption, entities: message.caption_entities ?? [] };
  }
  if (!("rich_message" in message)) return undefined;

  const richMessage = message.rich_message;
  if (!isObject(richMessage)) return undefined;

  const text = arrayText(richMessage.blocks, blockText, "\n\n");
  return text.text.trim().length > 0 ? text : undefined;
}

/** Keep formatting that intersects a review part, including spoilers crossing split boundaries. */
export function sliceMessageText(
  content: FormattedMessageText,
  start: number,
  end: number,
): FormattedMessageText {
  return {
    text: content.text.slice(start, end),
    entities: content.entities.flatMap(entity => {
      const entityStart = Math.max(start, entity.offset);
      const entityEnd = Math.min(end, entity.offset + entity.length);
      return entityStart < entityEnd
        ? [{ ...entity, offset: entityStart - start, length: entityEnd - entityStart }]
        : [];
    }),
  };
}

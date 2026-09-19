import { describe, expect, it } from "vitest";
import type { Message } from "telegraf/types";
import { getMessageText } from "../../src/lib/message-text.js";
function message(value: Record<string, unknown>): Message {
  return value as unknown as Message;
}

describe("getMessageText", () => {
  it("extracts a screenshot-shaped rich review with readable block boundaries", () => {
    const richMessage = {
      blocks: [
        { type: "photo", photo: [{ file_id: "cover", file_unique_id: "cover", width: 1, height: 1 }], caption: { text: "" } },
        { type: "heading", size: 2, text: "1984 — George Orwell" },
        { type: "paragraph", text: ["A ", { type: "bold", text: "powerful" }, " book."] },
        { type: "blockquote", blocks: [{ type: "paragraph", text: "Big Brother is watching you." }] },
        { type: "paragraph", text: { type: "hashtag", text: "#рецензия", hashtag: "рецензия" } },
      ],
    };

    expect(getMessageText(message({ rich_message: richMessage }))).toBe(
      "1984 — George Orwell\n\nA powerful book.\n\nBig Brother is watching you.\n\n#рецензия",
    );
  });

  it("renders inline entities and button labels while ignoring their metadata", () => {
    const richMessage = {
      blocks: [
        {
          type: "paragraph",
          text: [
            "Read ",
            { type: "url", text: "the article", url: "https://example.com/secret" },
            " ",
            { type: "custom_emoji", custom_emoji_id: "123", alternative_text: "📚" },
            " ",
            { type: "mathematical_expression", expression: "x^2 + y^2" },
            " ",
            { type: "button", button: { text: "Open", url: "https://example.com/button" } },
            { type: "anchor", name: "hidden-anchor" },
          ],
        },
        {
          type: "buttons",
          buttons: [
            { text: [{ type: "custom_emoji", custom_emoji_id: "456", alternative_text: "⭐" }, " Save"], callback_data: "save" },
            { text: "Cancel", callback_data: "cancel" },
          ],
        },
      ],
    };

    expect(getMessageText(message({ rich_message: richMessage }))).toBe(
      "Read the article 📚 x^2 + y^2 Open\n\n⭐ Save\tCancel",
    );
  });

  it("preserves nested containers, credits, list items, table cells, and media captions", () => {
    const richMessage = {
      blocks: [
        {
          type: "details",
          summary: "More",
          blocks: [
            {
              type: "list",
              items: [
                { label: "1.", blocks: [{ type: "paragraph", text: "First" }] },
                { label: "2.", blocks: [{ type: "paragraph", text: "Second" }] },
              ],
            },
            {
              type: "table",
              caption: "Scores",
              cells: [
                [
                  { text: "Book", align: "left", valign: "top" },
                  { text: "Score", align: "left", valign: "top" },
                ],
                [
                  { text: "Dune", align: "left", valign: "top" },
                  { text: "10", align: "left", valign: "top" },
                ],
              ],
            },
          ],
        },
        {
          type: "expandable_blockquote",
          text: "A hidden truth",
          credit: "— Narrator",
        },
        {
          type: "collage",
          blocks: [{ type: "photo", photo: [], caption: { text: "Cover" , credit: "© Artist" } }],
          caption: { text: "Gallery" , credit: "Source" },
        },
      ],
    };

    expect(getMessageText(message({ rich_message: richMessage }))).toBe(
      "More\n\n1. First\n\n2. Second\n\nScores\nBook\tScore\nDune\t10\n\nA hidden truth\n\n— Narrator\n\nCover\n\n© Artist\n\nGallery\n\nSource",
    );
  });

  it("keeps empty and invisible table cells in their original columns", () => {
    const richMessage = {
      blocks: [{
        type: "table",
        cells: [
          [
            { text: "Book", align: "left", valign: "top" },
            { text: "Positive", align: "left", valign: "top" },
            { text: "Neutral", align: "left", valign: "top" },
            { text: "Negative", align: "left", valign: "top" },
          ],
          [
            { text: "1984", align: "left", valign: "top" },
            { text: "", align: "left", valign: "top" },
            { align: "left", valign: "top" },
            { text: "Bleak", align: "left", valign: "top" },
          ],
        ],
      }],
    };

    expect(getMessageText(message({ rich_message: richMessage }))).toBe(
      "Book\tPositive\tNeutral\tNegative\n1984\t\t\tBleak",
    );
  });

  it("prefers legacy text, then caption, before rich content", () => {
    const richMessage = { blocks: [{ type: "paragraph", text: "rich" }] };
    expect(getMessageText(message({ text: "plain", caption: "caption", rich_message: richMessage }))).toBe("plain");
    expect(getMessageText(message({ caption: "caption", rich_message: richMessage }))).toBe("caption");
    expect(getMessageText(message({ rich_message: richMessage }))).toBe("rich");
  });

  it("returns undefined for empty or unsupported content", () => {
    expect(getMessageText(message({}))).toBeUndefined();
    expect(getMessageText(message({ caption: "" }))).toBe("");
    expect(getMessageText(message({ rich_message: { blocks: [] } }))).toBeUndefined();
    expect(getMessageText(message({ rich_message: { blocks: [{ type: "anchor", name: "only-metadata" }] } }))).toBeUndefined();
    expect(getMessageText(message({ rich_message: { blocks: [{ type: "unknown", text: "not visible" }] } }))).toBeUndefined();
  });
});

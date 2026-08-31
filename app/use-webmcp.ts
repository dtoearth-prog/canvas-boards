"use client";

import { useEffect, useRef } from "react";
import {
  addItems,
  createBoard,
  groupItems,
  listBoards,
  readBoard,
  searchItems,
  updateItem,
  type ActionResult,
  type BoardLike,
} from "@/app/webmcp-actions";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<string>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: ToolDefinition,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
    };
  }
}

const COLOUR_ENUM = ["yellow", "pink", "green", "blue", "purple", "white"];

/**
 * Registers this board workspace as a set of WebMCP tools.
 *
 * Tools are registered once, in the top-level document, using the imperative
 * API. ChatGPT's browser does not discover tools inside iframes and does not
 * support the declarative form API, so this shape runs in both browsers.
 *
 * Current state is read through a ref so tool handlers never close over a
 * stale copy of the boards.
 */
export function useWebMCP(
  boards: BoardLike[],
  setBoards: (next: BoardLike[]) => void,
  activeId: string | null,
) {
  const stateRef = useRef({ boards, activeId });
  const applyRef = useRef(setBoards);

  useEffect(() => {
    stateRef.current = { boards, activeId };
    applyRef.current = setBoards;
  });

  useEffect(() => {
    if (typeof document.modelContext?.registerTool !== "function") return;

    const controller = new AbortController();

    const run = (
      action: (boards: BoardLike[], input: never) => ActionResult,
    ) => async (input: Record<string, unknown>) => {
      const result = action(stateRef.current.boards, input as never);
      if (result.boards) applyRef.current(result.boards);
      return result.output;
    };

    const tools: ToolDefinition[] = [
      {
        name: "list-boards",
        description:
          "List every board in this workspace with its title and item count. Use this first to find which board to work on.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () =>
          listBoards(stateRef.current.boards, stateRef.current.activeId).output,
      },
      {
        name: "read-board",
        description:
          "Read everything on one board: its notes, tasks, links and columns, with each item's id. Use this before changing a board so you know what is already there.",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "The id of the board to read." },
          },
          required: ["boardId"],
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: run(readBoard),
      },
      {
        name: "search-items",
        description:
          "Search the text of every note, task and link across all boards. Returns matching items with the name of the board they are on.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "A word or short phrase to look for." },
          },
          required: ["query"],
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: run(searchItems),
      },
      {
        name: "create-board",
        description:
          "Create a new empty board with a title and an optional emoji icon. Returns the new board's id so items can be added to it.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "A short descriptive name for the board." },
            emoji: { type: "string", description: "One emoji to use as the board icon." },
          },
          required: ["title"],
        },
        execute: run(createBoard),
      },
      {
        name: "add-items",
        description:
          "Add one or more items to a board in a single call. Each item is a note, task, link or column heading. The board places them automatically.",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "The id of the board to add to." },
            items: {
              type: "array",
              description: "The items to add, in the order they should appear.",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["note", "task", "link", "column"],
                    description: "What kind of item this is.",
                  },
                  title: { type: "string", description: "The item's heading or task name." },
                  body: { type: "string", description: "Optional longer text for a note or link." },
                  url: { type: "string", description: "The web address, for a link item." },
                  colour: {
                    type: "string",
                    enum: COLOUR_ENUM,
                    description: "Optional colour name for the item.",
                  },
                },
                required: ["type", "title"],
              },
            },
          },
          required: ["boardId", "items"],
        },
        execute: run(addItems),
      },
      {
        name: "update-item",
        description:
          "Change one item's title, text or colour, or tick and untick a task. Send only the fields that should change.",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "The id of the board the item is on." },
            itemId: { type: "string", description: "The id of the item to change." },
            title: { type: "string", description: "A new heading for the item." },
            body: { type: "string", description: "New body text for the item." },
            colour: { type: "string", enum: COLOUR_ENUM, description: "A new colour name." },
            checked: { type: "boolean", description: "Whether a task is done." },
          },
          required: ["boardId", "itemId"],
        },
        execute: run(updateItem),
      },
      {
        name: "group-items",
        description:
          "Arrange items into labelled columns on a board. Give each group a heading and the ids of the items that belong in it. The board creates the columns and lays the items out.",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "The id of the board to arrange." },
            groups: {
              type: "array",
              description: "Up to five groups, each with a heading and the ids it contains.",
              items: {
                type: "object",
                properties: {
                  heading: { type: "string", description: "A short name for this group." },
                  itemIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "The ids of the items that belong in this group.",
                  },
                },
                required: ["heading", "itemIds"],
              },
            },
          },
          required: ["boardId", "groups"],
        },
        execute: run(groupItems),
      },
    ];

    for (const tool of tools) {
      document.modelContext
        .registerTool(tool, { signal: controller.signal })
        .catch(() => undefined);
    }

    return () => controller.abort();
  }, []);
}

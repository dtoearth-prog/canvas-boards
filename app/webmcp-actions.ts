/**
 * Pure logic for the WebMCP tools.
 *
 * These functions take the current boards and an input object, and return the
 * next boards plus a short text result for the agent. They touch no React and
 * no browser API, so they can be tested directly.
 *
 * Tool outputs are kept short on purpose: WebMCP guidance recommends a limit of
 * roughly 1.5K characters per tool result.
 */

export type BoardItem = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  title: string;
  body: string;
  color: string;
  checked?: boolean;
  url?: string;
  storage?: "local" | "cloud";
  fileName?: string;
  h?: number;
};

export type BoardLike = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  updated: number;
  starred: boolean;
  archived?: boolean;
  items: BoardItem[];
};

export type ActionResult = {
  boards?: BoardLike[];
  output: string;
};

const OUTPUT_LIMIT = 1500;
const MAX_GROUPS = 5;
const BODY_PREVIEW = 90;

const COLOURS: Record<string, string> = {
  yellow: "#fff3a8",
  pink: "#f8c9c0",
  green: "#dbead8",
  blue: "#cfe7f5",
  purple: "#e5dcf7",
  white: "#ffffff",
};

const TYPES: Record<string, string> = {
  note: "note",
  task: "todo",
  link: "link",
  column: "column",
};

const newId = () => Math.random().toString(36).slice(2, 10);
const clip = (text: string, limit = BODY_PREVIEW) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;
const cap = (text: string) =>
  text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT - 1)}…` : text;

/** Rough on-screen height of an item, so stacked cards never overlap. */
function rowHeight(item: BoardItem): number {
  const base = item.type === "todo" ? 78 : 96;
  const lines = item.body ? Math.ceil(item.body.length / 30) : 0;
  return base + lines * 20 + 14;
}

function findBoard(boards: BoardLike[], boardId: string) {
  return boards.find((board) => board.id === boardId);
}

function touch(board: BoardLike, items: BoardItem[]): BoardLike {
  return { ...board, items, updated: Date.now() };
}

function replaceBoard(boards: BoardLike[], next: BoardLike) {
  return boards.map((board) => (board.id === next.id ? next : board));
}

export function listBoards(boards: BoardLike[], activeId?: string | null): ActionResult {
  const active = boards.filter((board) => !board.archived);
  if (!active.length) {
    return { output: "This workspace has no boards yet. Use create-board to make one." };
  }
  const lines = active.map(
    (board) =>
      `${board.id} — "${board.title}" (${board.items.length} items)${
        board.id === activeId ? " — currently open" : ""
      }`,
  );
  return { output: cap(`${active.length} boards:\n${lines.join("\n")}`) };
}

export function readBoard(boards: BoardLike[], input: { boardId?: string }): ActionResult {
  const board = input.boardId ? findBoard(boards, input.boardId) : undefined;
  if (!board) {
    return { output: "No board with that id. Call list-boards to see the available boards." };
  }
  if (!board.items.length) {
    return { output: `Board "${board.title}" (${board.id}) is empty.` };
  }
  const lines = board.items.map((item) => {
    const label = item.type === "todo" ? (item.checked ? "task done" : "task") : item.type;
    const extra = item.type === "link" && item.url ? ` <${item.url}>` : "";
    const body = item.body ? ` — ${clip(item.body)}` : "";
    return `${item.id} [${label}] "${item.title}"${body}${extra}`;
  });
  const header = `Board "${board.title}" (${board.id}), ${board.items.length} items:`;
  let output = `${header}\n${lines.join("\n")}`;
  if (output.length > OUTPUT_LIMIT) {
    const kept: string[] = [];
    let size = header.length;
    for (const line of lines) {
      if (size + line.length + 60 > OUTPUT_LIMIT) break;
      kept.push(line);
      size += line.length + 1;
    }
    const remaining = board.items.length - kept.length;
    output = `${header}\n${kept.join("\n")}\n${remaining} more items — call search-items to find specific ones.`;
  }
  return { output: cap(output) };
}

export function searchItems(boards: BoardLike[], input: { query?: string }): ActionResult {
  const query = (input.query ?? "").trim().toLowerCase();
  if (!query) {
    return { output: "A search word is required. Provide a word or short phrase to look for." };
  }
  const hits: string[] = [];
  let total = 0;
  for (const board of boards) {
    for (const item of board.items) {
      const haystack = `${item.title} ${item.body} ${item.url ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) continue;
      total += 1;
      if (hits.length < 10) {
        hits.push(`${item.id} [${item.type}] "${clip(item.title, 60)}" on "${board.title}" (${board.id})`);
      }
    }
  }
  if (!total) {
    return { output: "Nothing matches that search. Try a shorter or more general word." };
  }
  const more = total > hits.length ? `\n${total - hits.length} more matches not shown.` : "";
  return { output: cap(`${total} matches:\n${hits.join("\n")}${more}`) };
}

export function createBoard(
  boards: BoardLike[],
  input: { title?: string; emoji?: string },
): ActionResult {
  const title = (input.title ?? "").trim();
  if (!title) {
    return { output: "A title is required. Give the board a short descriptive name." };
  }
  const board: BoardLike = {
    id: newId(),
    title,
    emoji: (input.emoji ?? "✨").slice(0, 4),
    color: "#7d6dba",
    updated: Date.now(),
    starred: false,
    items: [],
  };
  return {
    boards: [board, ...boards],
    output: `Created board "${title}" with id ${board.id}. Use add-items to put things on it.`,
  };
}

type IncomingItem = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  colour?: string;
};

export function addItems(
  boards: BoardLike[],
  input: { boardId?: string; items?: IncomingItem[] },
): ActionResult {
  const board = input.boardId ? findBoard(boards, input.boardId) : undefined;
  if (!board) {
    return { output: "Unknown board id. Call list-boards first." };
  }
  const incoming = Array.isArray(input.items) ? input.items : [];
  if (!incoming.length) {
    return { output: "No items were provided. Send at least one item with a type and a title." };
  }
  const bad = incoming.find((item) => !item.type || !TYPES[item.type] || !item.title?.trim());
  if (bad) {
    return {
      output:
        "Each item needs a title and a type of note, task, link or column. One item was missing or had an unknown type.",
    };
  }

  const created: BoardItem[] = incoming.map((item, index) => {
    const position = board.items.length + index;
    const type = TYPES[item.type as string];
    return {
      id: newId(),
      type,
      x: 120 + (position % 4) * 270,
      y: 130 + Math.floor(position / 4) * 180,
      w: type === "column" ? 285 : 250,
      title: item.title!.trim(),
      body: (item.body ?? "").trim(),
      color: COLOURS[item.colour ?? ""] ?? (type === "column" ? "#f4f2ed" : "#ffffff"),
      ...(type === "link" ? { url: item.url ?? "https://" } : {}),
    };
  });

  const next = touch(board, [...board.items, ...created]);
  return {
    boards: replaceBoard(boards, next),
    output: `Added ${created.length} items to "${board.title}". New ids: ${created
      .map((item) => item.id)
      .join(", ")}`,
  };
}

export function updateItem(
  boards: BoardLike[],
  input: {
    boardId?: string;
    itemId?: string;
    title?: string;
    body?: string;
    colour?: string;
    checked?: boolean;
  },
): ActionResult {
  const board = input.boardId ? findBoard(boards, input.boardId) : undefined;
  if (!board) {
    return { output: "Unknown board id. Call list-boards first." };
  }
  const item = board.items.find((candidate) => candidate.id === input.itemId);
  if (!item) {
    return { output: "No item with that id on that board. Call read-board to see current items." };
  }
  if (input.colour && !COLOURS[input.colour]) {
    return {
      output: "Unknown colour. Use one of: yellow, pink, green, blue, purple, white.",
    };
  }
  const patched: BoardItem = {
    ...item,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.colour ? { color: COLOURS[input.colour] } : {}),
    ...(input.checked !== undefined ? { checked: input.checked } : {}),
  };
  const next = touch(
    board,
    board.items.map((candidate) => (candidate.id === patched.id ? patched : candidate)),
  );
  return {
    boards: replaceBoard(boards, next),
    output: `Updated "${clip(patched.title, 60)}" on "${board.title}".`,
  };
}

export function groupItems(
  boards: BoardLike[],
  input: { boardId?: string; groups?: { heading?: string; itemIds?: string[] }[] },
): ActionResult {
  const board = input.boardId ? findBoard(boards, input.boardId) : undefined;
  if (!board) {
    return { output: "Unknown board id. Call list-boards first." };
  }
  const groups = Array.isArray(input.groups) ? input.groups : [];
  if (!groups.length) {
    return { output: "No groups were provided. Send each group a heading and the ids that belong in it." };
  }
  if (groups.length > MAX_GROUPS) {
    return { output: `That is too many groups for one board. Use ${MAX_GROUPS} groups or fewer.` };
  }
  const known = new Set(board.items.map((item) => item.id));
  const missing = groups
    .flatMap((group) => group.itemIds ?? [])
    .filter((id) => !known.has(id));
  if (missing.length) {
    return {
      output: `Some item ids are not on that board: ${missing
        .slice(0, 8)
        .join(", ")}. Call read-board for the current ids.`,
    };
  }
  const untitled = groups.find((group) => !group.heading?.trim());
  if (untitled) {
    return { output: "Every group needs a heading. Give each group a short name." };
  }

  const grouped = new Set(groups.flatMap((group) => group.itemIds ?? []));
  const columns: BoardItem[] = [];
  const placed: BoardItem[] = [];

  let tallestColumn = 520;

  groups.forEach((group, columnIndex) => {
    const x = 90 + columnIndex * 335;
    let y = 195;
    (group.itemIds ?? []).forEach((itemId) => {
      const item = board.items.find((candidate) => candidate.id === itemId)!;
      placed.push({ ...item, x: x + 25, y, w: 235 });
      y += rowHeight(item);
    });
    const height = Math.max(520, y - 110 + 30);
    tallestColumn = Math.max(tallestColumn, height);
    columns.push({
      id: newId(),
      type: "column",
      x,
      y: 110,
      w: 285,
      h: height,
      title: group.heading!.trim().toUpperCase(),
      body: "",
      color: "#f4f2ed",
    });
  });

  // Every column shares the tallest height so the board reads as a set.
  for (const column of columns) column.h = tallestColumn;

  const leftovers = board.items
    .filter((item) => !grouped.has(item.id) && item.type !== "column")
    .map((item, index) => ({
      ...item,
      x: 120 + (index % 4) * 270,
      y: 110 + tallestColumn + 40 + Math.floor(index / 4) * 120,
    }));

  const next = touch(board, [...columns, ...placed, ...leftovers]);
  return {
    boards: replaceBoard(boards, next),
    output: `Arranged "${board.title}" into ${groups.length} columns: ${groups
      .map((group) => group.heading!.trim())
      .join(", ")}. ${leftovers.length} ungrouped items were moved below.`,
  };
}

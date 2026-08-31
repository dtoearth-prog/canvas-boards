import assert from "node:assert/strict";
import test from "node:test";
import {
  addItems, createBoard, groupItems, listBoards, readBoard, searchItems, updateItem,
} from "../app/webmcp-actions.ts";

const item = (id, type, title, extra = {}) => ({
  id, type, x: 0, y: 0, w: 250, title, body: "", color: "#fff", ...extra,
});
const board = (id, title, items = []) => ({
  id, title, emoji: "✨", color: "#7d6dba", updated: 1, starred: false, items,
});
const base = () => [
  board("b1", "Fynbos video", [
    item("i1", "note", "Fire lilies", { body: "They only flower after a burn." }),
    item("i2", "todo", "Film the summit"),
    item("i3", "link", "Reference", { url: "https://example.com" }),
  ]),
  board("b2", "Idea bank"),
];

test("list-boards: empty workspace guides the agent", () => {
  assert.match(listBoards([]).output, /no boards yet.*create-board/i);
});

test("list-boards: lists boards and marks the open one", () => {
  const out = listBoards(base(), "b2").output;
  assert.match(out, /b1 — "Fynbos video" \(3 items\)/);
  assert.match(out, /b2 — "Idea bank" \(0 items\) — currently open/);
});

test("read-board: unknown id returns a recoverable error", () => {
  assert.match(readBoard(base(), { boardId: "nope" }).output, /call list-boards/i);
});

test("read-board: returns ids, types and a tasks's done state", () => {
  const out = readBoard(base(), { boardId: "b1" }).output;
  assert.match(out, /i1 \[note\] "Fire lilies"/);
  assert.match(out, /i2 \[task\] "Film the summit"/);
  assert.match(out, /<https:\/\/example\.com>/);
});

test("read-board: stays within the 1.5K output budget on a big board", () => {
  const many = Array.from({ length: 120 }, (_, n) =>
    item(`x${n}`, "note", `Item number ${n}`, { body: "z".repeat(300) }));
  const out = readBoard([board("big", "Huge", many)], { boardId: "big" }).output;
  assert.ok(out.length <= 1500, `output was ${out.length} characters`);
  assert.match(out, /more items/);
});

test("search-items: empty query, no match, and a hit", () => {
  assert.match(searchItems(base(), {}).output, /search word is required/i);
  assert.match(searchItems(base(), { query: "zzz" }).output, /Nothing matches/i);
  assert.match(searchItems(base(), { query: "fire" }).output, /i1 \[note\].*Fynbos video/);
});

test("search-items: caps at ten results and reports the total", () => {
  const many = Array.from({ length: 25 }, (_, n) => item(`s${n}`, "note", `hike ${n}`));
  const out = searchItems([board("b", "B", many)], { query: "hike" }).output;
  assert.match(out, /^25 matches:/);
  assert.match(out, /15 more matches not shown/);
});

test("create-board: requires a title, then creates one", () => {
  assert.match(createBoard(base(), {}).output, /title is required/i);
  const result = createBoard(base(), { title: "Fire regrowth" });
  assert.equal(result.boards.length, 3);
  assert.equal(result.boards[0].title, "Fire regrowth");
  assert.match(result.output, /Use add-items/);
});

test("add-items: rejects unknown board, empty list and bad type", () => {
  assert.match(addItems(base(), { boardId: "nope", items: [] }).output, /Unknown board id/);
  assert.match(addItems(base(), { boardId: "b1", items: [] }).output, /at least one item/i);
  assert.match(
    addItems(base(), { boardId: "b1", items: [{ type: "sticker", title: "x" }] }).output,
    /note, task, link or column/,
  );
  assert.match(
    addItems(base(), { boardId: "b1", items: [{ type: "note", title: "  " }] }).output,
    /note, task, link or column/,
  );
});

test("add-items: batches, maps types and colour names, and places items", () => {
  const result = addItems(base(), {
    boardId: "b1",
    items: [
      { type: "column", title: "THE BIG IDEA" },
      { type: "note", title: "Six years, one place", colour: "yellow" },
      { type: "task", title: "Pick the viewpoint" },
      { type: "link", title: "Ref", url: "https://x.dev" },
    ],
  });
  const added = result.boards[0].items.slice(3);
  assert.equal(added.length, 4);
  assert.deepEqual(added.map((i) => i.type), ["column", "note", "todo", "link"]);
  assert.equal(added[1].color, "#fff3a8");
  assert.equal(added[3].url, "https://x.dev");
  assert.notEqual(added[0].x, added[1].x, "items must not stack on one spot");
  assert.match(result.output, /Added 4 items/);
});

test("update-item: errors, colour validation, and ticking a task", () => {
  assert.match(updateItem(base(), { boardId: "nope", itemId: "i1" }).output, /Unknown board id/);
  assert.match(updateItem(base(), { boardId: "b1", itemId: "zz" }).output, /call read-board/i);
  assert.match(
    updateItem(base(), { boardId: "b1", itemId: "i1", colour: "turquoise" }).output,
    /yellow, pink, green, blue, purple, white/,
  );
  const done = updateItem(base(), { boardId: "b1", itemId: "i2", checked: true });
  assert.equal(done.boards[0].items[1].checked, true);
});

test("group-items: validates board, groups, count and ids", () => {
  assert.match(groupItems(base(), { boardId: "nope", groups: [] }).output, /Unknown board id/);
  assert.match(groupItems(base(), { boardId: "b1", groups: [] }).output, /No groups/);
  const six = Array.from({ length: 6 }, (_, n) => ({ heading: `G${n}`, itemIds: [] }));
  assert.match(groupItems(base(), { boardId: "b1", groups: six }).output, /5 groups or fewer/);
  assert.match(
    groupItems(base(), { boardId: "b1", groups: [{ heading: "A", itemIds: ["ghost"] }] }).output,
    /ghost.*call read-board/is,
  );
  assert.match(
    groupItems(base(), { boardId: "b1", groups: [{ heading: " ", itemIds: ["i1"] }] }).output,
    /needs a heading/,
  );
});

test("group-items: builds columns, lays items beneath, moves leftovers below", () => {
  const result = groupItems(base(), {
    boardId: "b1",
    groups: [
      { heading: "Can film this weekend", itemIds: ["i2"] },
      { heading: "Needs a trip", itemIds: ["i1"] },
    ],
  });
  const items = result.boards[0].items;
  const columns = items.filter((i) => i.type === "column");
  assert.equal(columns.length, 2);
  assert.equal(columns[0].title, "CAN FILM THIS WEEKEND");
  assert.notEqual(columns[0].x, columns[1].x, "columns must not overlap");
  const filmed = items.find((i) => i.id === "i2");
  assert.equal(filmed.x, columns[0].x + 25, "item sits under its column");
  assert.ok(filmed.y > columns[0].y, "item sits below its column heading");
  const leftover = items.find((i) => i.id === "i3");
  assert.ok(
    leftover.y > columns[0].y + columns[0].h,
    "ungrouped items move below the columns",
  );
  assert.match(result.output, /2 columns.*1 ungrouped/s);
});

test("no action ever exceeds the 1.5K output budget", () => {
  const outputs = [
    listBoards(base()).output,
    readBoard(base(), { boardId: "b1" }).output,
    searchItems(base(), { query: "e" }).output,
    createBoard(base(), { title: "T" }).output,
    addItems(base(), { boardId: "b1", items: [{ type: "note", title: "n" }] }).output,
    updateItem(base(), { boardId: "b1", itemId: "i1", title: "t" }).output,
    groupItems(base(), { boardId: "b1", groups: [{ heading: "H", itemIds: ["i1"] }] }).output,
  ];
  for (const out of outputs) assert.ok(out.length <= 1500);
});

test("group-items: taller cards get more room, so nothing overlaps", () => {
  const tall = item("t1", "note", "Long one", { body: "x".repeat(240) });
  const short = item("t2", "todo", "Quick task");
  const after = item("t3", "note", "Third");
  const result = groupItems([board("b", "B", [tall, short, after])], {
    boardId: "b",
    groups: [{ heading: "All", itemIds: ["t1", "t2", "t3"] }],
  });
  const items = result.boards[0].items;
  const y = (id) => items.find((i) => i.id === id).y;
  const gapAfterTall = y("t2") - y("t1");
  const gapAfterShort = y("t3") - y("t2");
  assert.ok(gapAfterTall > 200, `tall card needed room, got ${gapAfterTall}`);
  assert.ok(gapAfterShort < 120, `short task should be compact, got ${gapAfterShort}`);
});

test("group-items: columns grow tall enough to contain their items", () => {
const many = Array.from({ length: 8 }, (_, n) =>
item(`m${n}`, "note", `Note ${n}`, { body: "y".repeat(120) }));
const result = groupItems([board("b", "B", [...many, item("spare", "note", "Ungrouped")])], {
boardId: "b",
groups: [
{ heading: "Left", itemIds: many.slice(0, 6).map((i) => i.id) },
{ heading: "Right", itemIds: many.slice(6).map((i) => i.id) },
],
});
const items = result.boards[0].items;
const columns = items.filter((i) => i.type === "column");
const lowest = Math.max(...items.filter((i) => i.type !== "column" && i.id.startsWith("m")).map((i) => i.y));
assert.ok(columns[0].h > 520, "a full column must be taller than the minimum");
assert.equal(columns[0].h, columns[1].h, "columns share a height so the board reads as a set");
assert.ok(110 + columns[0].h > lowest, "the column must reach past its lowest item");
const spare = items.find((i) => i.id === "spare");
assert.ok(spare.y > 110 + columns[0].h, "ungrouped items sit below the columns");
});

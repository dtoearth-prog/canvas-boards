# Canvas Boards

**A board you build with your AI — and that both of you can read again next week.**

Live site: https://canvas-boards.dtoearth.chatgpt.site/

> **For judges:** the WebMCP tools require the ChatGPT desktop app's built-in browser
> (model GPT-5.6 Sol or Terra — Luna has WebMCP disabled), or Chrome 149+ with
> `chrome://flags/#enable-webmcp-testing` enabled. The site works normally in any
> browser; the agent tools only appear in those.

## What it is

A spatial canvas — notes, tasks, links, columns and files placed freely on a board.
WebMCP lets an agent work on that board alongside you.

The agent's output stops being a message and becomes an object: something that stays
where you put it, that you can move, edit, group and keep — and that the agent can
read back later.

Chat gives you answers you scroll past. This gives you a board you can move.

## The seven tools

| Tool | What the agent can do |
|---|---|
| `list-boards` | See which boards exist |
| `read-board` | Read one board's items and layout |
| `search-items` | Find text across every board |
| `create-board` | Start a new board |
| `add-items` | Add many notes, tasks, links or columns in one call |
| `update-item` | Edit an item, or tick a task |
| `group-items` | Arrange items into labelled columns |

`group-items` takes meaning, not coordinates: the agent says which items belong
together and what to call each group, and the application does the geometry —
measuring each card, sizing the columns to fit, growing the canvas to hold them.

`add-items` is batched, so a single call can populate an entire board.

Tools are registered with the imperative API in the top-level document. ChatGPT's
browser does not discover tools inside iframes and does not support the declarative
form API, so this runs in both browsers.

## What the agent deliberately cannot do

The agent can create, read and organise. It cannot delete your content. Notes, tasks,
links and files are never removed by an agent — only regrouped. Column headings are
structural labels and are replaced when a board is reorganised.

There is no confirmation API in the WebMCP specification yet, and our read tools
return user-generated content flagged `untrustedContentHint` — so a delete tool in
that context is a prompt-injection hazard we chose not to ship. Instead the agent
groups items it suggests removing, and the person removes them.

## Running it locally

Requires Node 22.13 or later.

    npm ci
    npm run dev

Tests:

    npm test

`.openai/hosting.json` declares the Cloudflare D1 and R2 bindings. The `project_id`
is replaced with a placeholder — substitute your own ChatGPT Sites project id to
deploy.

On macOS the packaged build script expects GNU tools; use `npx vite build` instead
of `npm run build`.

## Built with

Next.js 16, React 19, TypeScript, Vite, Cloudflare D1 and R2, deployed on ChatGPT
Sites. Authentication uses Sign in with ChatGPT, with every board scoped to the
signed-in user and anonymous visitors given their own isolated workspace.

## Licence

MIT — see [LICENSE](LICENSE).

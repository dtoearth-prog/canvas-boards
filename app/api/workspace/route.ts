import { env } from "cloudflare:workers";
import { getWorkspaceIdentity } from "@/app/workspace-key";

export async function GET(request: Request) {
  const identity = getWorkspaceIdentity(request);
  if (!identity) {
    return Response.json({ error: "A workspace key is required." }, { status: 400 });
  }

  const row = await env.DB.prepare(
    "SELECT data, updated_at FROM workspaces WHERE id = ?"
  ).bind(identity.key).first<{ data: string; updated_at: number }>();

  if (!row) {
    return Response.json({
      data: null,
      updatedAt: null,
      signedIn: identity.signedIn,
      email: identity.email,
    });
  }

  try {
    return Response.json({
      data: JSON.parse(row.data),
      updatedAt: row.updated_at,
      signedIn: identity.signedIn,
      email: identity.email,
    });
  } catch {
    return Response.json({ error: "Stored workspace data is invalid." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const identity = getWorkspaceIdentity(request);
  if (!identity) {
    return Response.json({ error: "A workspace key is required." }, { status: 400 });
  }

  const body = await request.json() as { data?: unknown };
  if (!Array.isArray(body.data)) {
    return Response.json({ error: "Workspace data must be an array." }, { status: 400 });
  }

  const serialized = JSON.stringify(body.data);
  if (serialized.length > 4_000_000) {
    return Response.json({ error: "Workspace metadata is too large." }, { status: 413 });
  }

  const updatedAt = Date.now();
  await env.DB.prepare(
    "INSERT INTO workspaces (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(identity.key, serialized, updatedAt).run();

  return Response.json({ saved: true, updatedAt });
}

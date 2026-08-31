import { env } from "cloudflare:workers";
import { getWorkspaceIdentity } from "@/app/workspace-key";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeName(name: string) {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "file"
  );
}

export async function POST(request: Request) {
  const identity = getWorkspaceIdentity(request);
  if (!identity) {
    return Response.json({ error: "A workspace key is required." }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });
  }

  const key = `uploads/${crypto.randomUUID()}-${safeName(file.name)}`;
  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalName: file.name, owner: identity.key },
  });

  return Response.json({
    key,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    url: `/api/files?key=${encodeURIComponent(key)}`,
  });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("uploads/")) {
    return Response.json({ error: "A valid file key is required." }, { status: 400 });
  }

  const object = await env.BUCKET.get(key);
  if (!object) return Response.json({ error: "File not found." }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set(
    "content-disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(object.customMetadata?.originalName || "file")}`
  );
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request) {
  const identity = getWorkspaceIdentity(request);
  if (!identity) {
    return Response.json({ error: "A workspace key is required." }, { status: 400 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("uploads/")) {
    return Response.json({ error: "A valid file key is required." }, { status: 400 });
  }

  const existing = await env.BUCKET.head(key);
  if (!existing) return Response.json({ deleted: true });

  const owner = existing.customMetadata?.owner;
  if (owner && owner !== identity.key) {
    return Response.json({ error: "That file belongs to someone else." }, { status: 403 });
  }

  await env.BUCKET.delete(key);
  return Response.json({ deleted: true });
}

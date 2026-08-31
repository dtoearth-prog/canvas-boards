/**
 * Resolves which workspace a request may read and write.
 *
 * Signed-in visitors are identified by the `oai-authenticated-user-email`
 * header that the ChatGPT Sites platform injects. That header is set by the
 * platform, never by the browser, so it cannot be forged by a client.
 *
 * Anonymous visitors supply their own random key, generated once per browser.
 * It is always namespaced under `anon:` so an anonymous caller can never reach
 * a signed-in user's workspace by sending a crafted value.
 */

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const CLIENT_KEY_HEADER = "x-canvas-workspace-key";
const CLIENT_KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export type WorkspaceIdentity = {
  key: string;
  signedIn: boolean;
  email: string | null;
};

export function getWorkspaceIdentity(request: Request): WorkspaceIdentity | null {
  const email = request.headers.get(USER_EMAIL_HEADER);
  if (email) {
    return { key: `user:${email.toLowerCase()}`, signedIn: true, email };
  }

  const clientKey = request.headers.get(CLIENT_KEY_HEADER);
  if (clientKey && CLIENT_KEY_PATTERN.test(clientKey)) {
    return { key: `anon:${clientKey}`, signedIn: false, email: null };
  }

  return null;
}

import { initUserTokenVerifier } from "@canva/app-middleware";

type CanvaIdentity = {
  userId: string;
  brandId: string;
};

const productionCanvaPanelOrigin = "https://app-aahogpzapay.canva-apps.com";

let verifier: ReturnType<typeof initUserTokenVerifier> | null = null;
let verifierAppId: string | null = null;

export async function verifyCanvaRequest(request: Request): Promise<CanvaIdentity | null> {
  const appId = process.env.CANVA_APP_ID?.trim();
  if (!appId) return null;

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  if (!verifier || verifierAppId !== appId) {
    verifier = initUserTokenVerifier({ appId });
    verifierAppId = appId;
  }

  try {
    const verified = await verifier.verify(token);
    if (!verified.userId || !verified.brandId) return null;
    return { userId: verified.userId, brandId: verified.brandId };
  } catch {
    return null;
  }
}

export function corsHeaders(request: Request) {
  const configuredOrigin = process.env.CANVA_APP_ORIGIN?.trim();
  const requestOrigin = request.headers.get("origin");
  const headers = new Headers({ Vary: "Origin" });
  const isAllowedOrigin =
    requestOrigin === configuredOrigin || requestOrigin === productionCanvaPanelOrigin;

  if (requestOrigin && isAllowedOrigin) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return headers;
}

export function jsonResponse(request: Request, data: unknown, init?: ResponseInit) {
  const headers = corsHeaders(request);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return Response.json(data, { ...init, headers });
}

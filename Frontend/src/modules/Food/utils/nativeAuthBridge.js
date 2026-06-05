const USER_AUTH_STORAGE_KEY = "user_auth_state_v1";

function hasFlutterBridge() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.flutter_inappwebview) &&
    typeof window.flutter_inappwebview.callHandler === "function"
  );
}

async function callFirstAvailableHandler(handlerNames = [], payload) {
  if (!hasFlutterBridge()) return null;

  for (const handlerName of handlerNames) {
    try {
      const result = await window.flutter_inappwebview.callHandler(handlerName, payload);
      return result;
    } catch {
      // Try the next supported handler name.
    }
  }

  return null;
}

function normalizeAuthPayload(payload = {}) {
  const module = String(payload?.module || "").trim();
  const accessToken = String(payload?.accessToken || "").trim();
  const refreshToken = String(payload?.refreshToken || "").trim();
  const authenticated = payload?.authenticated === true;
  const user =
    payload?.user && typeof payload.user === "object" && !Array.isArray(payload.user)
      ? payload.user
      : null;

  return {
    module,
    accessToken,
    refreshToken,
    authenticated,
    user,
    savedAt: payload?.savedAt || new Date().toISOString(),
  };
}

export function isNativeAuthBridgeAvailable() {
  return hasFlutterBridge();
}

export async function persistNativeAuthState(module, authState = {}) {
  const normalizedModule = String(module || "").trim();
  if (normalizedModule !== "user") return false;
  if (!hasFlutterBridge()) return false;

  const payload = normalizeAuthPayload({
    module: normalizedModule,
    ...authState,
  });

  await callFirstAvailableHandler(
    [
      "setAuthStorage",
      "saveAuthStorage",
      "persistAuthState",
      "persistAuthData",
      "saveUserSession",
    ],
    {
      key: USER_AUTH_STORAGE_KEY,
      module: normalizedModule,
      value: payload,
    }
  );

  return true;
}

export async function restoreNativeAuthState(module) {
  const normalizedModule = String(module || "").trim();
  if (normalizedModule !== "user") return null;
  if (!hasFlutterBridge()) return null;

  const result = await callFirstAvailableHandler(
    [
      "getAuthStorage",
      "loadAuthStorage",
      "restoreAuthState",
      "restoreAuthData",
      "getUserSession",
    ],
    {
      key: USER_AUTH_STORAGE_KEY,
      module: normalizedModule,
    }
  );

  const rawValue =
    result?.value && typeof result.value === "object"
      ? result.value
      : result && typeof result === "object"
        ? result
        : null;

  if (!rawValue) return null;

  const payload = normalizeAuthPayload(rawValue);
  if (!payload.module || payload.module !== normalizedModule) return null;
  if (!payload.accessToken) return null;

  return payload;
}

export async function clearNativeAuthState(module) {
  const normalizedModule = String(module || "").trim();
  if (normalizedModule !== "user") return false;
  if (!hasFlutterBridge()) return false;

  await callFirstAvailableHandler(
    [
      "clearAuthStorage",
      "removeAuthStorage",
      "clearAuthState",
      "removeUserSession",
    ],
    {
      key: USER_AUTH_STORAGE_KEY,
      module: normalizedModule,
    }
  );

  return true;
}

export function applyRestoredAuthState(module, authState = {}) {
  const normalizedModule = String(module || "").trim();
  if (normalizedModule !== "user") return false;

  const payload = normalizeAuthPayload({
    module: normalizedModule,
    ...authState,
  });

  if (!payload.accessToken) return false;

  try {
    localStorage.setItem(`${normalizedModule}_accessToken`, payload.accessToken);
    localStorage.setItem(`${normalizedModule}_authenticated`, payload.authenticated ? "true" : "false");
    localStorage.setItem("auth_customer", payload.accessToken);
    localStorage.setItem("accessToken", payload.accessToken);

    if (payload.refreshToken) {
      localStorage.setItem(`${normalizedModule}_refreshToken`, payload.refreshToken);
    }

    if (payload.user) {
      const serializedUser = JSON.stringify(payload.user);
      localStorage.setItem(`${normalizedModule}_user`, serializedUser);
      localStorage.setItem("user_user", serializedUser);
    }

    return true;
  } catch (error) {
    console.warn("Failed to apply restored native auth state:", error);
    return false;
  }
}

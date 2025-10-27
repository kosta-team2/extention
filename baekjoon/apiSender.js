// apiSender.js
// ------------------------------------------------------------
//  - 모든 서버 호출은 apiFetch() 사용 (Authorization 자동 부착)
//  - 401 이면 /ext/auth/refresh 로 새 Access 발급 → 원요청 재시도
//  - refresh 실패 시 로그인 탭 오픈 (JSP)
// ------------------------------------------------------------

export const API_BASE  = "https://localhost:8443";       // 컨텍스트 패스가 있다면 꼭 포함
export const LOGIN_URL = `${API_BASE}/auth/login.jsp`;   // JSP 로그인 페이지

const REFRESH_ENDPOINT = "/ext/auth/refresh";            // 서버와 약속한 refresh 경로

let refreshInFlight = null; // single-flight
let loginTabId = null;
let lastLoginOpenAt = 0;

// ---- Access 저장/조회 ----
export async function putAccess(token) {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.set({ accessToken: token });
}
export async function getAccess() {
  if (!chrome?.storage?.local) return "";
  const { accessToken } = await chrome.storage.local.get("accessToken");
  return accessToken || "";
}
export async function clearAccess() {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.remove("accessToken");
}

// ---- 로그인 탭 열기(중복 방지) ----
export function openLoginTab() {
  const now = Date.now();
  if (loginTabId) return;
  if (now - lastLoginOpenAt < 2000) return; // 2초 중복 방지
  lastLoginOpenAt = now;

  chrome.tabs.create({ url: LOGIN_URL, active: true }, (tab) => {
    if (tab?.id) loginTabId = tab.id;
  });
  chrome.tabs.onRemoved.addListener((tid) => {
    if (tid === loginTabId) loginTabId = null;
  });
}

// ---- 1회성 refresh ----
export async function refreshAccessOnce() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const r = await fetch(`${API_BASE}${REFRESH_ENDPOINT}`, {
        method: "POST",
        credentials: "include", // ★ 중요: Refresh HttpOnly 쿠키 자동 첨부
      });
      if (!r.ok) throw new Error(`refresh failed: ${r.status}`);
      const { accessToken } = await r.json();
      await putAccess(accessToken);
      return accessToken;
    })().finally(() => (refreshInFlight = null));
  }
  return refreshInFlight;
}

// ---- refresh 실패 시 로그인 유도 ----
export async function ensureAccessOrLogin() {
  try {
    return await refreshAccessOnce();
  } catch (e) {
    await clearAccess();
    openLoginTab();
    throw e;
  }
}

// ---- 공통 API 호출 래퍼 ----
export async function apiFetch(path, opts = {}) {
  const token = await getAccess();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (e) {
    // 네트워크 오류 → 한 번 refresh 폴백
    try {
      const newAccess = await ensureAccessOrLogin();
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
      return await fetch(`${API_BASE}${path}`, { ...opts, headers: retryHeaders });
    } catch {
      throw e;
    }
  }

  if (res.status !== 401) return res;

  // 401 → refresh → 재시도
  const newAccess = await ensureAccessOrLogin();
  const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
  return await fetch(`${API_BASE}${path}`, { ...opts, headers: retryHeaders });
}

// ---- solved.ac ----
export async function getSolvedAcMetadata(problemId) {
  try {
    const res = await fetch(`https://solved.ac/api/v3/problem/show?problemId=${problemId}`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return { level: 0, tags: [] };
  }
}

// background.js
// ------------------------------------------------------------
//  - 서버 전송은 반드시 apiFetch() 사용 (Authorization 자동/401→refresh)
// ------------------------------------------------------------
import { getSolvedAcMetadata, apiFetch, ensureAccessOrLogin, getAccess } from "./apiSender.js";

console.log("[BG] service worker up");

const tierNames = [
  "Unrated",
  "Bronze V","Bronze IV","Bronze III","Bronze II","Bronze I",
  "Silver V","Silver IV","Silver III","Silver II","Silver I",
  "Gold V","Gold IV","Gold III","Gold II","Gold I",
  "Platinum V","Platinum IV","Platinum III","Platinum II","Platinum I",
  "Diamond V","Diamond IV","Diamond III","Diamond II","Diamond I",
  "Ruby V","Ruby IV","Ruby III","Ruby II","Ruby I"
];

const problemStore = Object.create(null);
const pendingSource = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  // -------- 문제 메타 수집/저장 --------
  if (message?.type === "problemData") {
    (async () => {
      const p = message.data;
      const problemNum = Number(String(p.problemId || "").replace(/\D/g, ""));
      problemStore[String(problemNum)] = p;

      let tier = p.tier || "";
      let tags = Array.isArray(p.tags) ? p.tags.slice() : [];
      if (!tier || tags.length === 0) {
        try {
          const sm = await getSolvedAcMetadata(String(problemNum));
          if (!tier && typeof sm.level === "number" && tierNames[sm.level]) tier = tierNames[sm.level];
          if (tags.length === 0 && Array.isArray(sm.tags)) {
            tags = sm.tags.map(t => {
              const ko = (t.displayNames || []).find(d => d.language === "ko");
              return ko ? ko.name : (t.displayNames?.[0]?.name || "");
            });
          }
        } catch {}
      }

      const payload = {
        problemNum: problemNum,
        title: p.title || "",
        tier: tier || "Unrated",
        timeLimit: p.timeLimitRaw || "",
        memoryLimit: p.memoryLimitRaw || "",
        problemDesc: p.problem_description || "",
        problemInput: p.problem_input || "",
        problemOutput: p.problem_output || "",
        url: p.url || `https://www.acmicpc.net/problem/${problemNum}`,
        samples: Array.isArray(p.samples) ? p.samples.map(s => ({
          sampleIndex: Number(s.index ?? 0),
          input: s.input ?? "",
          output: s.output ?? ""
        })) : [],
        tags: tags.map(name => ({ name: String(name) }))
      };

      console.log("[BG] Problem payload", JSON.stringify(payload, null, 2));

      // (보호하지 않으면 굳이 토큰 불필요) — 필요 시 보호 엔드포인트로 바꾸세요.
      apiFetch(`/ext/problems/ingest`, { method: "POST", body: JSON.stringify(payload) })
        .then(res => console.log(`[BG] Problem ingest ${problemNum} →`, res.status))
        .catch(err => console.error("[BG] Problem ingest failed:", err));

      // (옵션) 현재 탭 콘솔로 전송
      const tabId = sender?.tab?.id;
      if (typeof tabId === "number") {
        chrome.tabs.sendMessage(tabId, { type: "logData", data: payload }, () => {
          if (chrome.runtime.lastError) {
            console.warn("[BG] logData no receiver:", chrome.runtime.lastError.message);
          }
        });
      }
    })();
    return;
  }

  // -------- 제출 수집/전송 --------
  if (message?.type === "submissionData") {
    const sub = { ...message.data, tabId: sender?.tab?.id };
    handleSubmission(sub).catch(() => {});
    return;
  }

  if (message?.type === "sourceCode") {
    const sid = String(message.submissionId || "");
    const entry = pendingSource.get(sid);
    if (entry) {
      entry.resolve(message.code || "");
      try { chrome.tabs.remove(entry.tabId, () => {}); } catch {}
      pendingSource.delete(sid);
    }
    return;
  }
});

async function handleSubmission(sub) {
  const pid = String(sub.problemId || "").replace(/\D/g, "");
  const cached = problemStore[pid];

  const problem = cached || {
    problemId: Number(pid),
    title: "",
    url: `https://www.acmicpc.net/problem/${pid}`,
    timeLimitRaw: "",
    memoryLimitRaw: "",
    problem_description: "",
    problem_input: "",
    problem_output: "",
    samples: [],
    tags: [],
    tier: ""
  };

  // 코드 수집
  let code = await tryDownloadCode(sub.submissionId);
  if (!code) code = await openSourceTabAndGetCode(sub.submissionId);

  // tier 보강
  let tier = problem.tier || "Unrated";
  try {
    const sm = await getSolvedAcMetadata(pid);
    if (typeof sm.level === "number" && tierNames[sm.level]) tier = tierNames[sm.level];
  } catch {}

  const payload = {
    problem: { problemNum: Number(pid) },
    submission: {
      submissionId: sub.submissionId,
      username: sub.username,
      problemId: Number(pid),
      verdict: sub.verdict,
      time: sub.time,
      memory: sub.memory,
      language: sub.language || "",
      codeLength: sub.codeLength || "",
      code: code || "",
      tier: tier
    }
  };

  console.log("[BG] 최종 제출 JSON:", payload);

  // ★ 제출은 보호 엔드포인트로 전송 (JWT 필수)
  try {
    await ensureAccessOrLogin();                       // access 확보(없으면 로그인)
    const acc = await getAccess();
    console.log("[BG] access present?", !!acc, acc?.slice(0, 16));
  } catch (e) {
    console.warn("[BG] 로그인 필요:", e.message);
    return; // 로그인 전이면 전송 보류(사용자 로그인 후 재시도 흐름 추천)
  }

  const res = await apiFetch(`/ext/submissions/ingest`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  console.log(`[BG] Submission ingest → ${res.status}`);
}

// ------- 소스 코드 수집 유틸 -------
async function tryDownloadCode(sid) {
  try {
    const r = await fetch(`https://www.acmicpc.net/source/download/${sid}`, { credentials: "include" });
    const t = await r.text();
    if (!/<!doctype html>|<html/i.test(t)) return (t || "").trim();
  } catch {}
  return "";
}

function openSourceTabAndGetCode(sid) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: `https://www.acmicpc.net/source/${sid}`, active: false }, (tab) => {
      if (!tab?.id) return resolve("");
      pendingSource.set(String(sid), { resolve, tabId: tab.id });
      setTimeout(() => {
        const entry = pendingSource.get(String(sid));
        if (entry) {
          entry.resolve("");
          try { chrome.tabs.remove(tab.id, () => {}); } catch {}
          pendingSource.delete(String(sid));
        }
      }, 8000);
    });
  });
}

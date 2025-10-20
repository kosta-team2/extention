import { getSolvedAcMetadata } from "./apiSender.js";

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

/**
 * 메시지 라우팅
 */
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "problemData") {
        (async () => {
            const p = message.data;
            const problemNum = Number(String(p.problemId || "").replace(/\D/g, ""));
            problemStore[String(problemNum)] = p;

            // tier/tags 보강: content에서 없으면 solved.ac로 보충
            let tier = p.tier || "";
            let tags = Array.isArray(p.tags) ? p.tags.slice() : [];
            if (!tier || tags.length === 0) {
                try {
                    const sm = await getSolvedAcMetadata(String(problemNum));
                    if (!tier && typeof sm.level === "number" && tierNames[sm.level]) {
                        tier = tierNames[sm.level];
                    }
                    if (tags.length === 0 && Array.isArray(sm.tags)) {
                        tags = sm.tags.map(t => {
                            const ko = (t.displayNames || []).find(d => d.language === "ko");
                            return ko ? ko.name : (t.displayNames?.[0]?.name || "");
                        });
                    }
                } catch {
                    // solved.ac 실패해도 진행
                }
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
                samples: Array.isArray(p.samples)
                    ? p.samples.map(s => ({
                        sampleIndex: Number(s.index ?? 0),
                        input: s.input ?? "",
                        output: s.output ?? ""
                    }))
                    : [],
                tags: tags.map(name => ({ name: String(name) }))
            };

            console.log('[BG] Problem payload', JSON.stringify(payload, null, 2));

            fetch(`http://localhost:8080/problems/${problemNum}/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            .then(res => console.log(`[BG] Problem ingest ${problemNum} →`, res.status))
            .catch(err => {
                console.error("[BG] Problem ingest failed:", err);
            });

            // (옵션) 현재 탭 콘솔에 로깅 (수신자 없으면 경고만)
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

/**
 * 제출 처리(2번 목표 확장 시 사용)
 */
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

    // 1) 코드 수집
    let code = await tryDownloadCode(sub.submissionId);
    if (!code) code = await openSourceTabAndGetCode(sub.submissionId);

    // 2) solved.ac 메타(가능하면)
    let tier = problem.tier || "Unrated";
    try {
        const sm = await getSolvedAcMetadata(pid);
        if (typeof sm.level === "number" && tierNames[sm.level]) {
            tier = tierNames[sm.level];
        }
    } catch {}

    // 3) 최종 payload(요청대로 problem은 problemNum만)
    const payload = {
        problem: {
            problemNum: Number(pid)
        },
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

    const tabId = sub.tabId;
    if (typeof tabId === "number") {
        chrome.tabs.sendMessage(tabId, { type: "logData", data: payload }, () => {
            if (chrome.runtime.lastError) {
                console.warn("[BG] logData no receiver:", chrome.runtime.lastError.message);
            }
        });
    }

    console.log("[BG] 최종 제출 JSON:", payload);

    // await sendPayloadToServer(payload); // JWT 준비되면 사용
}

/**
 * 소스 코드 다운로드 우선 시도
 */
async function tryDownloadCode(sid) {
    try {
        const r = await fetch(`https://www.acmicpc.net/source/download/${sid}`, { credentials: "include" });
        const t = await r.text();
        if (!/<!doctype html>|<html/i.test(t)) return (t || "").trim();
    } catch {}
    return "";
}

/**
 * 소스 페이지를 숨은 탭으로 열어 코드 추출
 */
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

/**
 * (참고) 제출 서버 전송 도우미 — JWT 연동 후 사용
 *
 * async function sendPayloadToServer(payload) {
 *     try {
 *         let token = "";
 *         try {
 *             const stored = await chrome.storage.local.get(['jwt']);
 *             token = stored.jwt || "";
 *         } catch {}
 *         const res = await fetch("http://localhost:8080/submissions/ingest", {
 *             method: "POST",
 *             headers: {
 *                 "Content-Type": "application/json",
 *                 ...(token ? { "Authorization": `Bearer ${token}` } : {})
 *             },
 *             body: JSON.stringify(payload)
 *         });
 *         console.log("Submission ingest response:", res.status);
 *     } catch (err) {
 *         console.error("Failed to send submission payload:", err);
 *     }
 * }
 */

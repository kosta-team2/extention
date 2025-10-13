import { getSolvedAcMetadata } from "./apiSender.js";

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
    if (message?.type === "problemData") {
        const p = message.data;
        problemStore[String(p.problemId)] = p;
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

async function handleSubmission(sub) {
    const pid = String(sub.problemId || "").replace(/\D/g, "");
    const problem = problemStore[pid] || {
        problemId: Number(pid),
        title: "",
        url: `https://www.acmicpc.net/problem/${pid}`,
        timeLimitRaw: "",
        memoryLimitRaw: "",
        problem_description: "",
        problem_input: "",
        problem_output: "",
        samples: []
    };

    // 1) 코드 수집: download 우선, 실패 시 숨은 탭 열어 DOM 추출
    let code = await tryDownloadCode(sub.submissionId);
    if (!code) code = await openSourceTabAndGetCode(sub.submissionId);

    // 2) solved.ac 메타(가능하면), 실패해도 진행
    let tier = "Unrated", tags = [];
    try {
        const sm = await getSolvedAcMetadata(pid);
        if (typeof sm.level === "number" && tierNames[sm.level]) tier = tierNames[sm.level];
        if (Array.isArray(sm.tags)) {
            tags = sm.tags.map(t => {
                const ko = (t.displayNames || []).find(d => d.language === "ko");
                return ko ? ko.name : (t.displayNames?.[0]?.name || "");
            });
        }
    } catch {}

    const payload = {
        problem: {
            problemId: problem.problemId,
            title: problem.title,
            url: problem.url,
            meta: {
                timeLimitRaw: problem.timeLimitRaw,
                memoryLimitRaw: problem.memoryLimitRaw
            },
            problem_description: problem.problem_description,
            problem_input: problem.problem_input,
            problem_output: problem.problem_output,
            samples: problem.samples || [],
            tier,
            tags
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
            code: code || ""
        }
    };

    // 페이지 콘솔에도 보이게
    if (sub.tabId) {
        try { chrome.tabs.sendMessage(sub.tabId, { type: "logData", data: payload }); } catch {}
    }
    // 서비스워커 콘솔
    console.log("[BG] 최종 JSON:", payload);

    // 나중에 전송이 필요할 때:
    // await sendPayloadToServer(payload);
}

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
                if (pendingSource.has(String(sid))) {
                    pendingSource.get(String(sid)).resolve("");
                    try { chrome.tabs.remove(tab.id, () => {}); } catch {}
                    pendingSource.delete(String(sid));
                }
            }, 8000);
        });
    });
}

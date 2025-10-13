(function () {
    if (!/acmicpc\.net\/status/.test(location.href)) return;

    const WAIT_RE = /(기다리는|채점)/;
    let observing = false;
    let sent = false;

    function pickFirstRow() {
        return document.querySelector("#status-table tbody tr, table#status-table tbody tr, table.table tbody tr");
    }

    function parseRow(tr) {
        const td = tr?.querySelectorAll("td");
        if (!td || td.length < 8) return null;

        const verdict = (td[3]?.innerText || "").trim();
        const submissionId = (td[0]?.innerText || "").trim();
        const username = (td[1]?.innerText || "").trim();
        const link = td[2]?.querySelector("a");
        const pidStr = link ? (new URL(link.href)).pathname.split("/").pop() : (td[2]?.innerText || "");
        const problemId = Number(String(pidStr).replace(/\D/g, "")) || null;
        const memory = (td[4]?.innerText || "").trim();
        const time = (td[5]?.innerText || "").trim();
        const language = (td[6]?.innerText || "").trim();
        const codeLength = (td[7]?.innerText || "").trim();

        return { submissionId, username, problemId, verdict, time, memory, language, codeLength };
    }

    function attachObserver() {
        if (observing || sent) return;

        const row = pickFirstRow();
        if (!row) return;

        const dataNow = parseRow(row);
        if (!dataNow) return;

        // 처음 로딩 시 '기다리는/채점'이 아니면 이전 제출일 가능성 → 스킵
        if (!WAIT_RE.test(dataNow.verdict)) return;

        const verdictCell = row.querySelector("td:nth-child(4)");
        if (!verdictCell) return;

        observing = true;

        const mo = new MutationObserver(() => {
            if (sent) return;
            const updated = parseRow(row);
            if (!updated) return;
            if (WAIT_RE.test(updated.verdict)) return; // 아직도 대기/채점

            // 최종 상태로 바뀌는 순간 1회 전송
            sent = true;
            chrome.runtime.sendMessage({ type: "submissionData", data: updated });
        });

        mo.observe(verdictCell, { childList: true, subtree: true, characterData: true });
    }

    // 관찰자 붙이기(행이 늦게 그려지는 경우 대비)
    const iv = setInterval(() => {
        if (sent) { clearInterval(iv); return; }
        attachObserver();
    }, 400);

    // background가 최종 JSON을 보내주면 페이지 콘솔에 출력
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "logData") {
            console.log("[FINAL PAYLOAD]", msg.data);
        }
    });
})();

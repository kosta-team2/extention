(function () {
    if (!/\/problem\/\d+$/.test(location.pathname)) return;

    // util이 있으면 사용
    const U = window.__bojUtil__;
    if (U && typeof U.extractProblemFromDom === "function") {
        const p = U.extractProblemFromDom();
        chrome.runtime.sendMessage({ type: "problemData", data: p });
        console.log("[problemContent] sent via util:", p);
        return;
    }

    // 없으면 폴백 파서(간단/견고)
    const problemNum = Number(location.pathname.split("/").pop());
    const $ = (sel) => document.querySelector(sel);
    const html = (el) => (el ? el.innerHTML.trim() : "");
    const txt  = (el) => (el ? el.innerText.trim()  : "");

    const title = txt($("#problem_title"));
    const desc  = html($("#problem_description"));
    const pin   = html($("#problem_input"));
    const pout  = html($("#problem_output"));

    // 시간/메모리 제한 추출(여러 마크업 대응)
    const infoText =
        txt(document.querySelector("#problem-info")) ||
        txt(document.querySelector(".problem-info")) ||
        "";
    const timeLimitRaw =
        (infoText.match(/시간\s*제한\s*[:：]?\s*([^\n]+)/)?.[1] || "").trim();
    const memoryLimitRaw =
        (infoText.match(/메모리\s*제한\s*[:：]?\s*([^\n]+)/)?.[1] || "").trim();

    // 샘플 I/O
    const ins  = Array.from(document.querySelectorAll('pre[id^="sample-input-"]'));
    const outs = Array.from(document.querySelectorAll('pre[id^="sample-output-"]'));
    const byNum = (id) => Number((id.match(/(\d+)$/) || [])[1] || 0);
    const outMap = new Map(outs.map(o => [byNum(o.id), o]));
    const samples = ins.map(i => {
        const n = byNum(i.id);
        const mate = outMap.get(n);
        return {
            index: n,
            input: i?.innerText ?? "",
            output: mate?.innerText ?? ""
        };
    });

    const payload = {
        problemId: problemNum,
        title,
        url: location.href,
        timeLimitRaw,
        memoryLimitRaw,
        problem_description: desc,
        problem_input: pin,
        problem_output: pout,
        samples,
        tags: [],   // tier/tags는 background에서 solved.ac로 보강
        tier: ""
    };

    chrome.runtime.sendMessage({ type: "problemData", data: payload });
    console.log("[problemContent] sent via fallback:", payload);
})();

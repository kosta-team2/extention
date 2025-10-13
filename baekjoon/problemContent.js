(function () {
    const U = window.__bojUtil__;
    if (!U) return;
    if (!/acmicpc\.net\/problem\/\d+/.test(location.href)) return;

    const p = U.extractProblemFromDom();
    const payload = {
        problemId: p.problemId,
        title: p.title,
        url: p.url,
        timeLimitRaw: p.timeLimitRaw,
        memoryLimitRaw: p.memoryLimitRaw,
        problem_description: p.problem_description,
        problem_input: p.problem_input,
        problem_output: p.problem_output,
        samples: p.samples
    };

    chrome.runtime.sendMessage({ type: "problemData", data: payload });
})();

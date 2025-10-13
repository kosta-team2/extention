(function () {
    if (!/acmicpc\.net\/source\/\d+/.test(location.href)) return;

    const sid = location.pathname.match(/\/source\/(\d+)/)?.[1] || "";

    function grabOnce() {
        const el = document.querySelector("textarea#source, #source, pre#source, pre code, #code, #code_area pre, .source-code pre");
        let code = el ? (("value" in el) ? el.value : el.textContent) : "";
        if (code && code.trim()) return code.trim();
        const cm = document.querySelector(".CodeMirror-code");
        if (cm) {
            const lines = [...cm.querySelectorAll(":scope > div > pre")].map(p => p.textContent || "");
            code = lines.join("\n");
        }
        return (code || "").trim();
    }

    let tries = 0;
    const maxTries = 30; // ~6초 (200ms 간격)
    const timer = setInterval(() => {
        tries++;
        const code = grabOnce();
        if (code) {
            clearInterval(timer);
            chrome.runtime.sendMessage({ type: "sourceCode", submissionId: sid, code });
        } else if (tries >= maxTries) {
            clearInterval(timer);
            chrome.runtime.sendMessage({ type: "sourceCode", submissionId: sid, code: "" });
        }
    }, 200);
})();

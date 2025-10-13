(function attachUtil() {
    const ORIGIN = "https://www.acmicpc.net";

    function parseMs(s = "") {
        const m = String(s).match(/([\d.]+)\s*ms/i);
        if (m) return Math.round(parseFloat(m[1]));
        const sec = String(s).match(/([\d.]+)\s*(?:s|초)/i);
        if (sec) return Math.round(parseFloat(sec[1]) * 1000);
        return null;
    }
    function parseKb(s = "") {
        const m = String(s).match(/([\d.,]+)\s*(KB|MB)/i);
        if (!m) return null;
        const n = parseFloat(m[1].replace(/,/g, ""));
        return (m[2].toUpperCase() === "MB") ? Math.round(n * 1024) : Math.round(n);
    }
    function onlyDigits(s = "") {
        const m = String(s).match(/\d+/);
        return m ? m[0] : "";
    }

    function extractProblemFromDom() {
        const pid = onlyDigits(location.pathname);
        const title = (document.querySelector("#problem_title, h1")?.textContent || "").trim();
        const url = `${ORIGIN}/problem/${pid}`;
        const desc = document.querySelector("#problem_description")?.innerHTML?.trim() || "";
        const pin  = document.querySelector("#problem_input")?.innerHTML?.trim() || "Empty";
        const pout = document.querySelector("#problem_output")?.innerHTML?.trim() || "Empty";

        let timeRaw = "", memRaw = "";
        const table = document.querySelector("#problem-info");
        if (table) {
            const ths = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
            const tds = [...table.querySelectorAll("tbody tr:first-child td")].map(td => td.textContent.trim());
            const getVal = (regex) => {
                const i = ths.findIndex(h => regex.test(h));
                return i >= 0 ? tds[i] : "";
            };
            timeRaw = getVal(/시간\s*제한|Time/i);
            memRaw  = getVal(/메모리\s*제한|Memory/i);
        } else {
            const txt = document.body.innerText;
            timeRaw = (txt.match(/시간\s*제한\s*[:：]?\s*([^\n]+)/)?.[1] || "").trim();
            memRaw  = (txt.match(/메모리\s*제한\s*[:：]?\s*([^\n]+)/)?.[1] || "").trim();
        }

        const samples = [];
        for (let i = 1; i <= 20; i++) {
            const iEl = document.getElementById(`sample-input-${i}`);
            const oEl = document.getElementById(`sample-output-${i}`);
            if (!iEl && !oEl) break;
            samples.push({
                index: i,
                input: (iEl?.textContent || "").replace(/\s+$/, ""),
                output: (oEl?.textContent || "").replace(/\s+$/, "")
            });
        }

        return {
            problemId: Number(pid),
            title,
            url,
            timeLimitRaw: timeRaw,
            memoryLimitRaw: memRaw,
            problem_description: desc,
            problem_input: pin,
            problem_output: pout,
            samples
        };
    }

    window.__bojUtil__ = { parseMs, parseKb, onlyDigits, extractProblemFromDom };
})();

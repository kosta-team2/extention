(function () {
    if (!/acmicpc\.net\/submit\/\d+\/\d+/.test(location.href)) return;

    const m = location.pathname.match(/\/submit\/(\d+)\/(\d+)/);
    if (!m) return;

    const pid = m[1];
    const sid = m[2];
    try {
        sessionStorage.setItem("boj:lastSubmitted", JSON.stringify({ pid, sid, t: Date.now() }));
    } catch {}
})();

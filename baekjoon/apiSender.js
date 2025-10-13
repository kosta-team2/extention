export async function getSolvedAcMetadata(problemId) {
    try {
        const res = await fetch(`https://solved.ac/api/v3/problem/show?problemId=${problemId}`);
        if (!res.ok) throw new Error(res.status);
        return await res.json();
    } catch {
        return { level: 0, tags: [] };
    }
}

// 나중에 서버 전송 붙일 자리
// export async function sendPayloadToServer(payload) {
//     const r = await fetch("http://localhost:8080/api/submissions", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload)
//     });
//     console.log("[API] POST status:", r.status);
// }

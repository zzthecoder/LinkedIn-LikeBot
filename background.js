const LEX = {
    great: 2,
    love: 3,
    awesome: 3,
    amazing: 3,
    good: 2,
    nice: 1,
    win: 2,
    improve: 1,
    bad: -2,
    worse: -3,
    worst: -3,
    sad: -2,
    angry: -2,
    hate: -3,
    fail: -2,
    layoffs: -2,
    congrats: 2,
    congratulations: 2,
    thrilled: 2,
    excited: 2,
    proud: 2,
    thank: 1
};

function simpleSentiment(text) {
    if (!text) return { label: 'neutral', score: 0 };

    const tokens = text
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    let score = 0;
    let hits = 0;
    for (const token of tokens) {
        if (LEX[token] !== undefined) {
            score += LEX[token];
            hits += 1;
        }
    }

    const norm = hits ? score / (3 * hits) : 0; // roughly -1..1
    const label = norm > 0.2 ? 'positive' : norm < -0.2 ? 'negative' : 'neutral';
    return { label, score: norm };
}

function isToxic(text) {
    if (!text) return false;
    const blacklist = ['idiot', 'moron', 'nazi', 'racist', 'hate'];
    const lower = text.toLowerCase();
    return blacklist.some(term => lower.includes(term));
}

function extractDetail(text) {
    if (!text) return '';
    const words = text.split(/\s+/).filter(word => word.length > 3).slice(0, 18);
    const detail = words.join(' ');
    return `Key takeaway: ${detail}${words.length === 18 ? '...' : ''}`.trim();
}

function draftComment(author, label, text) {
    const detail = extractDetail(text);
    const firstName = (author || '').split(' ')[0] || 'there';

    const templates = {
        positive: [
            `Love this, ${firstName}! ${detail}`,
            `Great insights, ${firstName}. ${detail}`
        ],
        neutral: [
            `Interesting angle, ${firstName}. ${detail}`,
            `Thanks for sharing, ${firstName}. ${detail}`
        ],
        negative: [
            `Appreciate the perspective, ${firstName}. Curious — what metrics did you use?`,
            `Thought-provoking point, ${firstName}. ${detail}`
        ]
    };

    const bucket = templates[label] || templates.neutral;
    let comment = bucket[Math.floor(Math.random() * bucket.length)];
    if (comment.length > 240) comment = `${comment.slice(0, 237)}...`;
    return comment;
}

async function remoteScore(text) {
    const { apiBase } = await chrome.storage.sync.get({ apiBase: '' });
    if (!apiBase) return null;

    try {
        const response = await fetch(`${apiBase}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('Remote scoring failed');
        return await response.json(); // expected { label, score }
    } catch (error) {
        console.warn('Remote score error:', error);
        return null;
    }
}

async function analyze(payload) {
    const { text, author } = payload;
    const remote = await remoteScore(text);
    const sentiment = remote || simpleSentiment(text);
    const toxic = isToxic(text);
    const like = !toxic;
    const wordCount = (text?.split(/\s+/).length) || 0;
    const comment = like && sentiment.score >= 0.6 && wordCount >= 15;
    const draft = comment ? draftComment(author, sentiment.label, text) : '';

    return { ...sentiment, toxic, like, comment, draft };
}

// Rate limiting - one like every 2 seconds
let lastActionAt = 0;
function canAct() {
    const now = Date.now();
    if (now - lastActionAt < 2000) return false;
    lastActionAt = now;
    return true;
}

async function recordLikedPost(postData) {
    const { likedPosts = [] } = await chrome.storage.local.get({ likedPosts: [] });

    const newPost = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        author: postData.author || 'Unknown',
        text: (postData.text || '').substring(0, 150) + (postData.text?.length > 150 ? '...' : ''),
        sentiment: postData.sentiment || 'neutral',
        score: postData.score || 0
    };

    likedPosts.unshift(newPost);
    if (likedPosts.length > 50) likedPosts.splice(50);

    await chrome.storage.local.set({ likedPosts });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        if (msg.type === 'ANALYZE_POST') {
            const result = await analyze(msg.payload);
            sendResponse({ data: result });
        } else if (msg.type === 'CAN_ACT') {
            sendResponse({ ok: canAct() });
        } else if (msg.type === 'RECORD_LIKE') {
            await recordLikedPost(msg.payload);
            sendResponse({ success: true });
        } else if (msg.type === 'GET_LIKED_POSTS') {
            const { likedPosts = [] } = await chrome.storage.local.get({ likedPosts: [] });
            sendResponse({ posts: likedPosts });
        } else if (msg.type === 'CLEAR_LIKED_POSTS') {
            await chrome.storage.local.set({ likedPosts: [] });
            sendResponse({ success: true });
        }
    })();

    return true; // keep the message channel open for async responses
});
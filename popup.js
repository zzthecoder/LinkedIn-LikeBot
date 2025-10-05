// Utility to execute a function inside the active tab's content script
async function executeInContentScript(func) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        console.error('No active tab found for executeInContentScript');
        return null;
    }

    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func
        });
        return result?.[0]?.result ?? null;
    } catch (error) {
        console.error('Script execution failed:', error);
        return null;
    }
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active from all tabs and content
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active to clicked tab and corresponding content
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
        
        // Load history when history tab is clicked
        if (tab.dataset.tab === 'history') {
            loadLikedPosts();
        }
        
        // Load learning stats when learning tab is clicked
        if (tab.dataset.tab === 'learning') {
            loadLearningStats();
        }
    });
});

// Start functionality
document.getElementById('start').addEventListener('click', async ()=>{
    await chrome.storage.local.set({ autoLikeStopped: false });
    
    const started = await executeInContentScript(() => {
        if (window.startAutoScanning) {
            console.log('🎬 Starting auto-scanning from popup button...');
            window.startAutoScanning();
            return true;
        }
        console.error('❌ startAutoScanning function not found!');
        return false;
    });

    if (started) {
        document.getElementById('status').textContent = 'Auto-like started! Scrolling & scanning...';
        document.getElementById('start').textContent = 'Running...';
        document.getElementById('start').disabled = true;
        document.getElementById('stop').disabled = false;
    } else {
        document.getElementById('status').textContent = 'Failed to start. Refresh LinkedIn and try again.';
    }
});

// Load and display liked posts
async function loadLikedPosts() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LIKED_POSTS' });
    const posts = response.posts || [];
    const container = document.getElementById('liked-posts');
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-state">No liked posts yet</div>';
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const timeAgo = getTimeAgo(new Date(post.timestamp));
        return `
            <div class="post-item ${post.sentiment}">
                <div class="post-meta">
                    <span class="post-author">${escapeHtml(post.author)}</span>
                    <span class="post-time">${timeAgo}</span>
                </div>
                <div class="post-text">${escapeHtml(post.text)}</div>
                <span class="post-sentiment">${post.sentiment} (${post.score.toFixed(2)})</span>
            </div>
        `;
    }).join('');
}

// Clear history
document.getElementById('clear-history').addEventListener('click', async () => {
    if (confirm('Clear all liked posts history?')) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LIKED_POSTS' });
        loadLikedPosts();
    }
});

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// Options button functionality
document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});


// Stop button functionality
document.getElementById('stop').addEventListener('click', async () => {
    await chrome.storage.local.set({ autoLikeStopped: true });
    
    await executeInContentScript(() => {
        if (window.stopAutoScroll) {
            window.stopAutoScroll();
        }
        const indicator = document.getElementById('lia-active-indicator');
        if (indicator) {
            indicator.remove();
        }
        console.log('🛑 Auto-like STOPPED by user');
        return true;
    });
    
    document.getElementById('status').textContent = 'Auto-like stopped. Refresh page to restart.';
    document.getElementById('stop').textContent = 'Stopped';
    document.getElementById('stop').disabled = true;
    document.getElementById('start').textContent = 'Start Auto-Like';
    document.getElementById('start').disabled = false;
});


// Load history on popup open
loadLikedPosts();

// Learning tab functionality
async function loadLearningStats() {
    const { learnedSelectors } = await chrome.storage.local.get({ learnedSelectors: null });
    
    if (!learnedSelectors) {
        document.getElementById('like-count').textContent = '0';
        document.getElementById('liked-count').textContent = '0';
        document.getElementById('repost-count').textContent = '0';
        return;
    }
    
    document.getElementById('like-count').textContent = learnedSelectors.likeButton?.length || 0;
    document.getElementById('liked-count').textContent = learnedSelectors.alreadyLikedIndicators?.length || 0;
    document.getElementById('repost-count').textContent = learnedSelectors.repostIndicators?.length || 0;
}

// Export learning data
document.getElementById('export-learning').addEventListener('click', async () => {
    const { learnedSelectors } = await chrome.storage.local.get({ learnedSelectors: null });
    
    if (!learnedSelectors || Object.keys(learnedSelectors).length === 0) {
        alert('No learning data to export yet. Use the extension first to build up learning data.');
        return;
    }
    
    const dataStr = JSON.stringify(learnedSelectors, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin-learning-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('✅ Learning data exported! Save this file to transfer to other profiles.');
});

// Import learning data
document.getElementById('import-learning').addEventListener('click', () => {
    document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importedData = JSON.parse(text);
        
        // Validate structure
        if (!importedData.likeButton || !Array.isArray(importedData.likeButton)) {
            alert('❌ Invalid learning data file. Please select a valid export file.');
            return;
        }
        
        // Merge with existing data
        const { learnedSelectors: existing } = await chrome.storage.local.get({ learnedSelectors: null });
        
        let merged = importedData;
        if (existing) {
            // Merge and combine success counts for duplicates
            merged = {
                likeButton: mergeSelectors(existing.likeButton || [], importedData.likeButton || []),
                commentButton: mergeSelectors(existing.commentButton || [], importedData.commentButton || []),
                alreadyLikedIndicators: mergeSelectors(existing.alreadyLikedIndicators || [], importedData.alreadyLikedIndicators || []),
                repostIndicators: mergeSelectors(existing.repostIndicators || [], importedData.repostIndicators || [])
            };
        }
        
        await chrome.storage.local.set({ learnedSelectors: merged });
        loadLearningStats();
        alert('✅ Learning data imported successfully! The extension is now smarter.');
    } catch (error) {
        alert('❌ Error importing file: ' + error.message);
    }
    
    // Reset file input
    e.target.value = '';
});

// Helper: Merge selector arrays
function mergeSelectors(existing, imported) {
    const map = new Map();
    
    // Add existing
    existing.forEach(item => {
        map.set(item.selector, item);
    });
    
    // Merge imported
    imported.forEach(item => {
        if (map.has(item.selector)) {
            const existing = map.get(item.selector);
            existing.successCount += item.successCount;
            existing.lastUsed = Math.max(existing.lastUsed, item.lastUsed);
        } else {
            map.set(item.selector, item);
        }
    });
    
    // Convert back to array and sort
    return Array.from(map.values())
        .sort((a, b) => b.successCount - a.successCount)
        .slice(0, 10); // Keep top 10
}

// Clear learning data
document.getElementById('clear-learning').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all learning data? This cannot be undone.')) {
        return;
    }
    
    await chrome.storage.local.remove('learnedSelectors');
    loadLearningStats();
    alert('✅ Learning data cleared. The extension will start learning from scratch.');
});

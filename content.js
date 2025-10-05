// Heuristics to find feed posts; LinkedIn's DOM changes often — update selectors as needed.
function findPosts() {
    const nodeSet = new Set();

    const selectors = [
        '.feed-shared-update-v2',
        '.feed-shared-update-v3',
        '[data-urn^="urn:li:activity:"]',
        'article[data-id^="urn:li:activity:"]',
        'div[data-id^="urn:li:activity:"]',
        'div[data-test-id="virality-feed-shared-update-card"]'
    ];

    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(node => nodeSet.add(node));
    });

    const posts = [];

    nodeSet.forEach(node => {
        const urn = node.getAttribute('data-urn') || node.getAttribute('data-id') || '';

        const isComment =
            urn.includes('comment') ||
            urn.includes('reply') ||
            node.closest('.comments-comment-item, .comment-thread, .comments-comment-entity, .comments-comments-list') ||
            node.classList.contains('comment');

        if (isComment) {
            return;
        }

        posts.push(node);
    });

    console.log(`📊 findPosts(): returning ${posts.length} candidate feed items`);
    return posts;
}
    
    
    function getPostText(node){
    // Try multiple selectors
    const cand = node.querySelector('[data-test-id="main-feed-activity-card__commentary"]')
    || node.querySelector('div.update-components-text')
    || node.querySelector('span.break-words')
    || node;
    const text = cand.innerText.trim();
    const author = (node.querySelector('span.update-components-actor__title')||node.querySelector('a.app-aware-link strong')||{}).innerText || '';
    return { text, author };
    }
    
    
    function ensureOverlay(node){
    if (node.__lia_overlay) return node.__lia_overlay;
    const box = document.createElement('div');
    box.className = 'lia-overlay';
    box.innerHTML = `
    <div class="lia-row">
    <span class="lia-chip lia-neutral">Analyzing…</span>
    <button class="lia-btn lia-primary lia-hide" data-act="like">Like</button>
    <button class="lia-btn lia-secondary lia-hide" data-act="comment">Copy Draft</button>
    </div>
    <div class="lia-draft lia-hide"></div>
    `;
    node.style.position = node.style.position || 'relative';
    node.appendChild(box);
    node.__lia_overlay = box;
    return box;
    }
    
    
    async function analyzeNode(node){
    // Double-check this isn't a comment before analyzing
    const isComment = 
        node.closest('.comments-comment-item') ||
        node.closest('.comment-thread') ||
        node.closest('.comments-comment-entity') ||
        node.classList.contains('comment') ||
        node.getAttribute('data-urn')?.includes('comment');
        
    if (isComment) {
        console.log('❌ Skipping comment node in analyzeNode:', node);
        return;
    }
    
    const { text, author } = getPostText(node);
    if (!text || text.length < 8) {
        console.log('❌ Skipping post with insufficient text:', text?.substring(0, 50));
        return;
    }
    
    console.log(`🔍 Analyzing post by ${author}: "${text.substring(0, 100)}..."`);
    
    const overlay = ensureOverlay(node);
    overlay.querySelector('.lia-chip').textContent = 'Analyzing…';
    
    
    const res = await chrome.runtime.sendMessage({ type:'ANALYZE_POST', payload:{ text, author }}).then(r=>r.data);
    if (!res) {
        console.log('❌ No analysis result received');
        return;
    }
    
    console.log(`📊 Analysis result: ${res.label} (${res.score.toFixed(2)}) - Like: ${res.like}, Toxic: ${res.toxic}`);
    
    const chip = overlay.querySelector('.lia-chip');
    chip.classList.remove('lia-neutral','lia-bad','lia-good');
    if (res.toxic) { 
        chip.textContent = 'Toxic — skip'; 
        chip.classList.add('lia-bad'); 
        console.log('🚫 Post marked as toxic, skipping');
        return; 
    }
    chip.textContent = `${res.label} (${res.score.toFixed(2)})`;
    chip.classList.add(res.label==='positive'?'lia-good':(res.label==='negative'?'lia-bad':'lia-neutral'));
    
    
    const likeBtn = overlay.querySelector('[data-act="like"]');
    const cmtBtn = overlay.querySelector('[data-act="comment"]');
    const draft = overlay.querySelector('.lia-draft');
    
    
    likeBtn.classList.toggle('lia-hide', !res.like);
    cmtBtn.classList.toggle('lia-hide', !res.comment);
    draft.classList.toggle('lia-hide', !res.comment);
    draft.textContent = res.draft || '';
    
    
    // Auto-like if conditions are met
    if (res.like) {
        const performAutoLike = async () => {
            // Check if auto-like has been stopped
            const { autoLikeStopped } = await chrome.storage.local.get({ autoLikeStopped: false });
            if (autoLikeStopped) {
                likeBtn.textContent = 'Stopped';
                console.log('Auto-like stopped by user');
                return;
            }
            
            // Check if auto-actions are enabled
            const { autoAct } = await chrome.storage.sync.get({ autoAct: true });
            if (!autoAct) {
                likeBtn.textContent = 'Manual Only';
                console.log('Auto-like disabled in settings');
                return;
            }
            
            const ok = await chrome.runtime.sendMessage({type:'CAN_ACT'}).then(r=>r.ok);
            if (!ok) {
                likeBtn.textContent = 'Waiting...';
                console.log('⏱️ Auto-like waiting for rate limit (5s between likes)');
                return;
            }
            
            // Check if post is already liked
            const alreadyLikedSelectors = [
                'button[aria-pressed="true"][aria-label*="Like"]',
                'button[aria-label*="Unlike"]',
                '.reactions-react-button[aria-pressed="true"]',
                'button.liked',
                'button.reactions-react-button--is-reacted'
            ];
            
            let alreadyLiked = false;
            for (const selector of alreadyLikedSelectors) {
                if (node.querySelector(selector)) {
                    alreadyLiked = true;
                    console.log(`⏭️ Post already liked (detected via: ${selector})`);
                    learnSelector('alreadyLikedIndicators', selector, true);
                    break;
                }
            }
            
            // Check if it's a repost
            const repostIndicators = [
                '[aria-label*="reposted this"]',
                '.feed-shared-actor__supplementary-actor-info',
                '[class*="repost"]',
                '.update-components-actor__supplementary-actor-info:has([aria-label*="reposted"])'
            ];
            
            let isRepost = false;
            for (const selector of repostIndicators) {
                if (node.querySelector(selector)) {
                    isRepost = true;
                    console.log(`🔄 Detected repost (via: ${selector})`);
                    learnSelector('repostIndicators', selector, true);
                    break;
                }
            }
            
            if (alreadyLiked) {
                likeBtn.textContent = '✓ Already Liked';
                likeBtn.style.backgroundColor = '#d1d5db';
                console.log('⏭️ Skipping already liked post');
                return;
            }
            
            // Use learned selectors first, then defaults
            const defaultSelectors = [
                'button[aria-label*="Like"]:not([aria-label*="Unlike"])',
                'button[data-control-name="like_toggle"]',
                '.social-actions-button[aria-label*="Like"]:not([aria-label*="Unlike"])',
                '.feed-shared-social-action-bar button[aria-label*="Like"]:not([aria-label*="Unlike"])',
                'button.feed-shared-social-action-bar__action-button[aria-label*="Like"]:not([aria-label*="Unlike"])',
                '.reactions-react-button[aria-label*="Like"]:not([aria-label*="Unlike"])',
                'button.reactions-react-button[aria-pressed="false"]'
            ];
            
            const selectors = getPrioritizedSelectors('likeButton', defaultSelectors);
            
            let likeButton = null;
            let usedSelector = '';
            
            // Try each selector with strict validation
            for (const selector of selectors) {
                const buttons = node.querySelectorAll(selector);
                for (const btn of buttons) {
                    // Strict validation for like buttons
                    const ariaLabel = btn.getAttribute('aria-label') || '';
                    const buttonText = btn.textContent?.toLowerCase() || '';
                    const isPressed = btn.getAttribute('aria-pressed') === 'true';
                    const isVisible = btn.offsetParent !== null;
                    
                    // Must contain "like" in aria-label or text, not be pressed, and be visible
                    const isLikeButton = (
                        ariaLabel.toLowerCase().includes('like') && 
                        !ariaLabel.toLowerCase().includes('unlike')
                    ) || (
                        buttonText.includes('like') && 
                        !buttonText.includes('unlike')
                    );
                    
                    // Additional check: look for thumbs up icon or like-related classes
                    const hasThumbsUp = btn.querySelector('svg[data-test-icon="thumbs-up-outline"], .like-icon, [class*="like"]') ||
                                       btn.innerHTML.includes('thumbs-up') ||
                                       btn.innerHTML.includes('like-icon');
                    
                    if (isLikeButton && !isPressed && isVisible && hasThumbsUp) {
                        likeButton = btn;
                        usedSelector = selector;
                        console.log(`✅ Found like button (selector: ${selector})`, {
                            ariaLabel,
                            isRepost,
                            learned: selectors.indexOf(selector) < (learnedSelectors.likeButton?.length || 0)
                        });
                        // Train the system on successful find
                        learnSelector('likeButton', selector, true);
                        break;
                    }
                }
                if (likeButton) break;
            }
            
            if (likeButton) {
                console.log('Attempting to click like button:', likeButton);
                console.log('Button attributes:', {
                    'aria-label': likeButton.getAttribute('aria-label'),
                    'aria-pressed': likeButton.getAttribute('aria-pressed'),
                    'data-control-name': likeButton.getAttribute('data-control-name'),
                    'class': likeButton.className,
                    'text': likeButton.textContent.trim()
                });

                likeButton.style.border = '2px solid lime';
                likeButton.style.backgroundColor = 'rgba(0,255,0,0.3)';
                setTimeout(() => {
                    likeButton.style.border = '';
                    likeButton.style.backgroundColor = '';
                }, 3000);

                let clickSucceeded = false;

                try {
                    likeButton.scrollIntoView({ behavior: 'instant', block: 'center' });
                    console.log('Attempting multiple click methods...');

                    likeButton.click();
                    console.log('✓ Method 1: Native click');

                    const clickableChildren = likeButton.querySelectorAll('*');
                    clickableChildren.forEach(child => child.click());
                    console.log(`✓ Method 2: Clicked ${clickableChildren.length} children`);

                    const originalPointerEvents = likeButton.style.pointerEvents;
                    likeButton.style.pointerEvents = 'auto';
                    likeButton.disabled = false;
                    likeButton.click();
                    likeButton.style.pointerEvents = originalPointerEvents;
                    console.log('✓ Method 3: Removed restrictions and clicked');

                    likeButton.setAttribute('aria-pressed', 'true');
                    likeButton.classList.add('active', 'liked', 'reactions-react-button--is-reacted');

                    const reactKey = Object.keys(likeButton).find(key => key.startsWith('__react'));
                    if (reactKey) {
                        const reactInstance = likeButton[reactKey];
                        if (reactInstance?.memoizedProps?.onClick) {
                            try {
                                reactInstance.memoizedProps.onClick({
                                    preventDefault: () => {},
                                    stopPropagation: () => {},
                                    target: likeButton,
                                    currentTarget: likeButton
                                });
                                console.log('✓ Method 4: React onClick triggered');
                            } catch (e) {
                                console.log('✗ React onClick failed:', e);
                            }
                        }
                    }

                    likeButton.focus();
                    likeButton.dispatchEvent(new KeyboardEvent('keydown', {
                        key: ' ',
                        code: 'Space',
                        keyCode: 32,
                        which: 32,
                        bubbles: true,
                        cancelable: true
                    }));
                    likeButton.dispatchEvent(new KeyboardEvent('keyup', {
                        key: ' ',
                        code: 'Space',
                        keyCode: 32,
                        which: 32,
                        bubbles: true,
                        cancelable: true
                    }));
                    console.log('✓ Method 5: Keyboard simulation');

                    const onclickAttr = likeButton.getAttribute('onclick');
                    if (onclickAttr) {
                        try {
                            eval(onclickAttr);
                            console.log('✓ Method 6: onclick attribute executed');
                        } catch (e) {
                            console.log('✗ onclick eval failed:', e);
                        }
                    }

                    console.log('All click methods attempted');

                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const isNowPressed = likeButton.getAttribute('aria-pressed') === 'true' ||
                                       likeButton.classList.contains('active') ||
                                       likeButton.classList.contains('liked');

                    if (isNowPressed) {
                        console.log('✓ Like button successfully activated');
                        likeBtn.textContent = '✓ Auto-Liked';
                        clickSucceeded = true;
                    } else {
                        console.log('⚠ Click sequence did not activate the button');
                        likeBtn.textContent = '? Clicked';
                    }

                    if (clickSucceeded) {
                        learnSelector('likeButton', usedSelector, true);
                        saveLearnedSelectors();

                        await chrome.runtime.sendMessage({
                            type: 'RECORD_LIKE',
                            payload: { author, text, sentiment: res.label, score: res.score }
                        });

                        likeBtn.disabled = true;
                    }
                } catch (error) {
                    console.error('❌ Error during like click workflow:', error);
                    likeBtn.textContent = 'Click Failed';
                    learnSelector('likeButton', usedSelector, false);
                }
            } else {
                console.log('No like button found in post');
                console.log('Post HTML:', node.outerHTML.substring(0, 500) + '...');
                likeBtn.textContent = 'No Like Button';
                learnSelector('likeButton', usedSelector, false);
            }
        };
        
        likeBtn.onclick = performAutoLike;
        
        // Auto-trigger the like immediately after analysis
        const delay = 500 + Math.random() * 1000; // Random delay 0.5-1.5 seconds
        console.log(`⏰ Scheduling auto-like in ${Math.round(delay/1000)}s for post by ${author}`);
        setTimeout(performAutoLike, delay);
        
    } else {
        likeBtn.onclick = ()=>{
            console.log('Post skipped - negative sentiment or toxic content');
            likeBtn.textContent = 'Skipped';
        };
    }
    
    
    cmtBtn.onclick = ()=>{
    if (!draft.textContent) return;
    // Copy to clipboard for manual paste
    navigator.clipboard.writeText(draft.textContent);
    alert('Draft copied to clipboard. Paste into the comment box.');
    };
    }
    
    
    let scanning = false;
let processedPosts = new Set();

// Auto-learning system - stores successful selectors
let learnedSelectors = {
    likeButton: [],
    commentButton: [],
    repostIndicators: [],
    alreadyLikedIndicators: []
};

// Load learned selectors from storage
async function loadLearnedSelectors() {
    const stored = await chrome.storage.local.get({ learnedSelectors: null });
    if (stored.learnedSelectors) {
        learnedSelectors = stored.learnedSelectors;
        console.log('📚 Loaded learned selectors:', learnedSelectors);
    }
}

// Save learned selectors to storage
async function saveLearnedSelectors() {
    await chrome.storage.local.set({ learnedSelectors });
    console.log('💾 Saved learned selectors');
}

// Train: Record successful selector
function learnSelector(type, selector, success = true) {
    const selectors = learnedSelectors[type];
    if (!selectors || !selector) return;

    let existing = selectors.find(s => s.selector === selector);
    if (!existing) {
        existing = {
            selector,
            successCount: 0,
            failureCount: 0,
            firstSeen: Date.now(),
            lastUsed: Date.now()
        };
        selectors.push(existing);
    }

    existing.lastUsed = Date.now();
    if (success) {
        existing.successCount += 1;
    } else {
        existing.failureCount = (existing.failureCount || 0) + 1;
        existing.successCount = Math.max(0, existing.successCount - 1);
    }

    selectors.sort((a, b) => {
        if (b.successCount === a.successCount) {
            return (a.failureCount || 0) - (b.failureCount || 0);
        }
        return b.successCount - a.successCount;
    });

    if (selectors.length > 10) {
        selectors.splice(10);
    }

    if (success || Math.random() < 0.1) {
        saveLearnedSelectors();
    }
}

// Get prioritized selectors (learned ones first)
function getPrioritizedSelectors(type, defaultSelectors) {
    const learned = learnedSelectors[type]?.map(s => s.selector) || [];
    const all = [...learned, ...defaultSelectors];
    // Remove duplicates
    return [...new Set(all)];
}

function scan(){
    if (scanning) {
        console.log('⏸️ Scan already in progress, skipping...');
        return;
    }
    scanning = true;
    
    console.log('🔍 Starting scan for posts...');
    const posts = findPosts();
    console.log(`Found ${posts.length} main posts to process`);
    
    let newPosts = 0;
    posts.forEach((node, index) => {
        // Use a more reliable unique identifier
        const postId = node.getAttribute('data-urn') || 
                      node.querySelector('[data-urn]')?.getAttribute('data-urn') || 
                      `post-${index}-${node.textContent?.substring(0, 50).replace(/\s+/g, '')}`;
        
        if (!processedPosts.has(postId)) {
            processedPosts.add(postId);
            node.__lia_seen = true;
            console.log(`📝 Processing new post ${index + 1}/${posts.length}:`, postId);
            analyzeNode(node);
            newPosts++;
        }
    });
    
    console.log(`✅ Scan complete. Processed ${newPosts} new posts out of ${posts.length} total. Waiting for next scan...`);
    scanning = false;
}

// Auto-scroll functionality
let autoScrollEnabled = false;
let autoScrollInterval = null;
let autoScrollCount = 0;

function startAutoScroll() {
    if (autoScrollEnabled) return;
    autoScrollEnabled = true;
    autoScrollCount = 0;

    const scrollAmount = 600;
    const scrollDelayMs = 5000; // 5 seconds between scrolls

    console.log(`🔽 Auto-scroll ENABLED - ${scrollAmount}px every ${scrollDelayMs / 1000}s (no safety cap)`);

    autoScrollInterval = setInterval(() => {
        if (!autoScrollEnabled) {
            stopAutoScroll();
            return;
        }

        const scrollHeight = document.documentElement.scrollHeight;
        const currentScroll = window.scrollY + window.innerHeight;

        if (currentScroll >= scrollHeight - 200) {
            console.log('📍 Reached bottom of page, scrolling back to top');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(scan, 1500);
        } else {
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            console.log(`⬇️ Auto-scroll #${autoScrollCount + 1} — position ${Math.round(currentScroll)}/${scrollHeight}`);
        }

        autoScrollCount += 1;
    }, scrollDelayMs);
}

function stopAutoScroll() {
    autoScrollEnabled = false;
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
        console.log('⏸️ Auto-scroll disabled');
    }
}

// More aggressive auto-scanning
function startAutoScanning() {
    console.log('🚀 AUTO-SCANNING SYSTEM STARTED');
    console.log('   - Auto-scroll: 600px every 15s (max 50 scrolls)');
    console.log('   - Auto-scan: Every 2 seconds');
    console.log('   - Like rate: 1 per 5 seconds (rate limited)');
    console.log('   - Auto-learning: ENABLED 🧠');
    console.log('   - Detects: Already liked, Reposts');
    console.log('   - Scroll detection: Active');
    
    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.id = 'lia-active-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#10b981;color:white;padding:8px 12px;border-radius:8px;font-size:12px;z-index:99999;box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:system-ui;';
    indicator.textContent = '✓ Auto-Like Active';
    document.body.appendChild(indicator);
    
    // Initial scan immediately
    setTimeout(scan, 500);
    
    // Start auto-scrolling
    startAutoScroll();
    
    // More aggressive scroll detection
    let scrollTimeout;
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const scrolledDown = currentScrollY > lastScrollY;
        lastScrollY = currentScrollY;
        
        clearTimeout(scrollTimeout);
        // Faster response when scrolling down (new posts)
        const delay = scrolledDown ? 500 : 1000;
        scrollTimeout = setTimeout(scan, delay);
    }, { passive: true });
    
    // Continuous scanning every 2 seconds
    setInterval(() => {
        console.log('⏰ Interval scan triggered');
        scan();
    }, 2000); // Every 2 seconds
    
    // Scan when page becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(scan, 1000);
        }
    });
    
    // Scan on window focus
    window.addEventListener('focus', () => {
        setTimeout(scan, 1000);
    });
    
    // Scan when DOM changes (new posts loaded)
    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (
                        node.classList?.contains('feed-shared-update-v2') ||
                        node.classList?.contains('feed-shared-update-v3') ||
                        node.querySelector?.('.feed-shared-update-v2, .feed-shared-update-v3')
                    )) {
                        shouldScan = true;
                    }
                });
            }
        });
        if (shouldScan) {
            console.log('🔄 New posts detected via DOM mutation, scanning...');
            setTimeout(scan, 2000);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Don't auto-start - wait for user to click "Start Auto-Like" button
console.log('═══════════════════════════════════════════════════');
console.log('🚀 LINKEDIN ASSISTANT CONTENT SCRIPT LOADED');
console.log('═══════════════════════════════════════════════════');
console.log('Page URL:', window.location.href);
console.log('Document Ready State:', document.readyState);

// Load learned selectors
loadLearnedSelectors().then(() => {
    console.log('🧠 Auto-learning system initialized');
    console.log('   - Like buttons learned:', learnedSelectors.likeButton?.length || 0);
    console.log('   - Already-liked indicators learned:', learnedSelectors.alreadyLikedIndicators?.length || 0);
    console.log('   - Repost indicators learned:', learnedSelectors.repostIndicators?.length || 0);
});

console.log('⏸️ Waiting for user to click "Start Auto-Like" button...');

// Make functions available globally for manual triggering and popup control
window.scan = scan;
window.stopAutoScroll = stopAutoScroll;
window.startAutoScanning = startAutoScanning;
// Global Application State
let poemData = null;
let currentChapterIdx = 0;
let currentFocusVerseIdx = 0;
let focusIntervalId = null;
let currentDrawerVerseNum = null;

// Progress State: maps verseNumber (1-based) to status: 0 (not started), 1 (partial), 2 (memorized)
let userProgress = {};

// View switcher
const views = ["dashboard-view", "browser-view", "focus-view", "quiz-view"];

// Helper to strip diacritics and normalize Arabic text for searching and checking quiz inputs
function normalizeArabic(text) {
    if (!text) return "";
    return text
        .replace(/[\u064B-\u065F\u0670]/g, "") // Remove diacritics
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()؟?،؛«»"']/g, "") // Remove punctuation
        .replace(/\s+/g, " ")
        .trim();
}

// Format number of verses
function formatCount(num, singular, dual, plural) {
    if (num === 1) return singular;
    if (num === 2) return dual;
    if (num >= 3 && num <= 10) return `${num} ${plural}`;
    return `${num} ${singular}`;
}

// Load data and initialize
document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    setupNavigation();
    setupBackupRestore();

    try {
        if (typeof poem_with_explanations_data !== "undefined") {
            poemData = poem_with_explanations_data;
        } else {
            const response = await fetch("poem_with_explanations.json");
            poemData = await response.json();
        }

        loadProgress();
        loadSRS();
        initDashboard();
        initBrowser();
        initFocusMode();
        initQuizMode();
        setupSearch();
    } catch (error) {
        console.error("Error loading data:", error);
        document.querySelectorAll(".loading-placeholder").forEach(el => {
            el.innerHTML = "<span class='text-danger'>حدث خطأ أثناء تحميل البيانات. يرجى إعادة المحاولة.</span>";
        });
    }
});

// Theme Management
function initTheme() {
    const themeToggle = document.getElementById("theme-toggle");
    const savedTheme = localStorage.getItem("theme") || "dark";

    if (savedTheme === "light") {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i><span>الوضع النهاري</span>';
    } else {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i><span>الوضع الليلي</span>';
    }

    themeToggle.addEventListener("click", () => {
        if (document.body.classList.contains("dark-theme")) {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i><span>الوضع النهاري</span>';
            localStorage.setItem("theme", "light");
        } else {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i><span>الوضع الليلي</span>';
            localStorage.setItem("theme", "dark");
        }
    });
}

// Navigation Logic
function setupNavigation() {
    const menuButtons = document.querySelectorAll(".menu-btn");
    menuButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            menuButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const target = btn.getAttribute("data-target");
            switchView(target);
        });
    });

    // Mobile sidebar toggle
    const menuToggle = document.getElementById("menu-toggle-mobile");
    const sidebar = document.querySelector(".sidebar");
    const sidebarOverlay = document.getElementById("sidebar-mobile-overlay");
    
    const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove("active-mobile");
        if (sidebarOverlay) sidebarOverlay.classList.remove("active");
    };

    if (menuToggle) {
        menuToggle.addEventListener("click", () => {
            if (sidebar) sidebar.classList.toggle("active-mobile");
            if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", closeSidebar);
    }

    // Also close sidebar on menu item clicks on mobile/tablet
    document.querySelectorAll(".menu-btn").forEach(btn => {
        btn.addEventListener("click", closeSidebar);
    });
}

function switchView(targetViewId) {
    views.forEach(v => {
        const el = document.getElementById(v);
        if (v === targetViewId) {
            el.classList.add("active");
            el.classList.remove("hidden");
        } else {
            el.classList.remove("active");
            el.classList.add("hidden");
        }
    });

    // Auto clear autoplay focus mode if switched away
    if (targetViewId !== "focus-view" && focusIntervalId) {
        stopFocusAutoplay();
    }
}

// LocalStorage Progress Management
function loadProgress() {
    const saved = localStorage.getItem("ashal_masalik_progress");
    if (saved) {
        try {
            userProgress = JSON.parse(saved);
        } catch (e) {
            userProgress = {};
        }
    }
    updateProgressUI();
}

function saveProgress() {
    localStorage.setItem("ashal_masalik_progress", JSON.stringify(userProgress));
    updateProgressUI();
}

function updateProgressUI() {
    let totalVerses = poemData ? poemData.total_verses : 1158;
    let memorized = 0;
    let partial = 0;

    for (let i = 1; i <= totalVerses; i++) {
        if (userProgress[i] === 2) memorized++;
        else if (userProgress[i] === 1) partial++;
    }

    const percent = totalVerses > 0 ? Math.round((memorized / totalVerses) * 100) : 0;

    // Header pill
    document.getElementById("user-progress-percent").innerText = `${percent}% من الحفظ`;

    // Dashboard Stats
    document.getElementById("total-memorized-count").innerText = memorized;
    document.getElementById("stat-fully-memorized").innerText = memorized;
    document.getElementById("stat-partially-memorized").innerText = partial;

    // Circular Progress
    document.getElementById("dashboard-progress-val").innerText = `${percent}%`;
    const circle = document.getElementById("dashboard-progress-circle");
    if (circle) {
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
}

// Spaced Repetition (SRS) Management
let userSRS = {};
const SRS_INTERVALS = [1, 3, 7, 14, 30, 60, 90];

function loadSRS() {
    const saved = localStorage.getItem("ashal_masalik_srs");
    if (saved) {
        try {
            userSRS = JSON.parse(saved);
        } catch (e) {
            userSRS = {};
        }
    } else {
        userSRS = {};
    }

    let updated = false;

    // Sync with userProgress
    if (poemData) {
        poemData.chapters.forEach(ch => {
            ch.verses.forEach(v => {
                const status = userProgress[v.number] || 0;
                if (status === 2) {
                    if (!userSRS[v.number]) {
                        userSRS[v.number] = {
                            interval: 1,
                            nextReviewDate: Date.now(), // Due immediately for first review!
                            lastReviewedDate: Date.now()
                        };
                        updated = true;
                    }
                } else {
                    if (userSRS[v.number]) {
                        delete userSRS[v.number];
                        updated = true;
                    }
                }
            });
        });
    }

    // Also clean up any keys in userSRS that don't belong to any valid verse number
    for (const vNum in userSRS) {
        const num = parseInt(vNum);
        if (!userProgress[num] || userProgress[num] !== 2) {
            delete userSRS[vNum];
            updated = true;
        }
    }

    if (updated) {
        saveSRS();
    }
    renderSRSBlock();
}

function saveSRS() {
    localStorage.setItem("ashal_masalik_srs", JSON.stringify(userSRS));
}

function updateSRSStateForVerse(verseNumber, status) {
    if (status === 2) {
        if (!userSRS[verseNumber]) {
            userSRS[verseNumber] = {
                interval: 1,
                nextReviewDate: Date.now(), // Due immediately!
                lastReviewedDate: Date.now()
            };
            saveSRS();
        }
    } else {
        if (userSRS[verseNumber]) {
            delete userSRS[verseNumber];
            saveSRS();
        }
    }
    renderSRSBlock();
}

function checkSRSDueVerses() {
    if (!poemData) return [];
    const due = [];
    const now = Date.now();
    poemData.chapters.forEach(ch => {
        ch.verses.forEach(v => {
            if (userProgress[v.number] === 2 && userSRS[v.number]) {
                if (userSRS[v.number].nextReviewDate <= now) {
                    due.push(v);
                }
            }
        });
    });
    return due.sort((a, b) => a.number - b.number);
}

function renderSRSBlock() {
    const container = document.getElementById("srs-card-container");
    if (!container) return;

    const due = checkSRSDueVerses();

    if (due.length === 0) {
        let totalMemorized = 0;
        if (poemData) {
            poemData.chapters.forEach(ch => {
                ch.verses.forEach(v => {
                    if (userProgress[v.number] === 2) totalMemorized++;
                });
            });
        }

        if (totalMemorized === 0) {
            container.innerHTML = `
                <div class="srs-header-title">لم تبدأ الحفظ بعد</div>
                <div class="srs-stat-lbl">ابدأ بحفظ بعض الأبيات وتحديد حالتها كـ "محفوظة" ليقوم نظام التكرار المتباعد بجدولتها تلقائياً.</div>
                <button class="srs-action-btn srs-btn-primary" onclick="document.getElementById('nav-browser').click();">تصفح المتن وابدأ الحفظ</button>
            `;
        } else {
            container.innerHTML = `
                <div class="srs-header-title">أنت على خير ما يرام! 🎉</div>
                <div class="srs-stat-lbl">لقد أكملت جميع المراجعات المستحقة لليوم. تابع حفظ المزيد من الأبيات لتثبيتها.</div>
                <button class="srs-action-btn srs-btn-primary" onclick="document.getElementById('nav-browser').click();">حفظ أبيات جديدة</button>
            `;
        }
    } else {
        container.innerHTML = `
            <div class="srs-header-title">حان وقت المراجعة وتثبيت الحفظ 📚</div>
            <div class="srs-stat-lbl">لديك <strong>${formatCount(due.length, "بيت", "بيتان", "أبيات")}</strong> تحتاج إلى مراجعة وتسميع اليوم.</div>
            <button class="srs-action-btn srs-btn-primary" id="start-srs-review-btn">ابدأ مراجعة الأبيات الآن</button>
        `;
        document.getElementById("start-srs-review-btn").onclick = () => {
            startSRSReviewSession(due);
        };
    }
}

let currentSRSSessionVerses = [];
let currentSRSIndex = 0;

function startSRSReviewSession(dueVerses) {
    currentSRSSessionVerses = dueVerses;
    currentSRSIndex = 0;
    renderSRSReviewCard();
}

function renderSRSReviewCard() {
    const container = document.getElementById("srs-card-container");
    if (!container) return;

    if (currentSRSIndex >= currentSRSSessionVerses.length) {
        container.innerHTML = `
            <div class="srs-header-title">تهانينا! اكتملت المراجعة 🌟</div>
            <div class="srs-stat-lbl">لقد راجعت جميع الأبيات المستحقة لليوم بنجاح وثبتّ حفظها. استمر في هذا الأداء الرائع!</div>
            <button class="srs-action-btn srs-btn-primary" id="srs-finish-btn">العودة للرئيسية</button>
        `;
        document.getElementById("srs-finish-btn").onclick = () => {
            loadSRS();
            initDashboard();
        };
        return;
    }

    const v = currentSRSSessionVerses[currentSRSIndex];
    const progressPercent = (currentSRSIndex / currentSRSSessionVerses.length) * 100;

    container.innerHTML = `
        <div class="srs-review-box">
            <div class="srs-progress-bar-container">
                <div class="srs-progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div style="font-size: 13px; color: var(--text-muted); font-family: var(--font-ui);">البيت ${v.number} (${currentSRSIndex + 1} من ${currentSRSSessionVerses.length})</div>
            
            <div class="srs-verse-display">
                <div class="srs-sadr-show">${v.sadr}</div>
                <div class="focus-verse-divider"><span class="divider-diamond"></span></div>
                <div class="srs-ajuz-show srs-blur" id="srs-ajuz-text">${v.ajuz}</div>
            </div>
            
            <div class="srs-btn-group" id="srs-action-group">
                <button class="srs-action-btn srs-btn-primary" id="srs-reveal-btn">أظهر الشطر الثاني للتحقق</button>
            </div>
        </div>
    `;

    document.getElementById("srs-reveal-btn").onclick = () => {
        document.getElementById("srs-ajuz-text").classList.remove("srs-blur");

        const actionGroup = document.getElementById("srs-action-group");
        actionGroup.innerHTML = `
            <button class="srs-action-btn srs-btn-easy" id="srs-easy-btn">سهل (زيادة وقت المراجعة)</button>
            <button class="srs-action-btn srs-btn-medium" id="srs-medium-btn">متوسط (نفس الفترة)</button>
            <button class="srs-action-btn srs-btn-forgot" id="srs-forgot-btn">صعب / نسيت (إعادة غداً)</button>
        `;

        document.getElementById("srs-easy-btn").onclick = () => rateSRS(v.number, "easy");
        document.getElementById("srs-medium-btn").onclick = () => rateSRS(v.number, "medium");
        document.getElementById("srs-forgot-btn").onclick = () => rateSRS(v.number, "forgot");
    };
}

function rateSRS(verseNumber, rating) {
    const item = userSRS[verseNumber];
    if (!item) return;

    let interval = item.interval || 1;

    if (rating === "easy") {
        const currentIdx = SRS_INTERVALS.indexOf(interval);
        if (currentIdx === -1) {
            interval = 3;
        } else if (currentIdx < SRS_INTERVALS.length - 1) {
            interval = SRS_INTERVALS[currentIdx + 1];
        } else {
            interval = 90;
        }
    } else if (rating === "medium") {
        interval = Math.max(1, interval);
    } else if (rating === "forgot") {
        interval = 1;
    }

    item.interval = interval;
    item.lastReviewedDate = Date.now();
    item.nextReviewDate = Date.now() + interval * 24 * 60 * 60 * 1000;

    saveSRS();

    currentSRSIndex++;
    renderSRSReviewCard();
}

// Dashboard View Initializer
function initDashboard() {
    const listContainer = document.getElementById("dashboard-chapters-list");
    listContainer.innerHTML = "";

    poemData.chapters.forEach((ch, idx) => {
        // Calculate chapter progress
        let chTotal = ch.verses.length;
        let chMemorized = 0;
        ch.verses.forEach(v => {
            if (userProgress[v.number] === 2) chMemorized++;
        });
        const percent = chTotal > 0 ? Math.round((chMemorized / chTotal) * 100) : 0;

        const item = document.createElement("div");
        item.className = "chapter-quick-item";
        item.innerHTML = `
            <span class="chapter-quick-item-title">${ch.title}</span>
            <div class="chapter-quick-item-progress">
                <span class="badge">${formatCount(chTotal, "بيت", "بيتان", "أبيات")}</span>
                <span class="progress-percent-lbl" style="color: ${percent === 100 ? 'var(--secondary)' : 'var(--text-secondary)'}">${percent}%</span>
            </div>
        `;
        item.addEventListener("click", () => {
            currentChapterIdx = idx;
            document.getElementById("nav-browser").click();
            loadBrowserChapter(idx);
        });
        listContainer.appendChild(item);
    });

    // Resume study logic: find first verse not fully memorized
    let resumeVerse = null;
    let resumeChIdx = 0;

    for (let i = 0; i < poemData.chapters.length; i++) {
        const ch = poemData.chapters[i];
        const unmet = ch.verses.find(v => (userProgress[v.number] || 0) < 2);
        if (unmet) {
            resumeVerse = unmet;
            resumeChIdx = i;
            break;
        }
    }

    if (!resumeVerse) {
        resumeVerse = poemData.chapters[0].verses[0];
    }

    document.getElementById("resume-chapter-title").innerText = poemData.chapters[resumeChIdx].title;
    document.getElementById("resume-verse-text").innerText = `${resumeVerse.sadr} ... ${resumeVerse.ajuz}`;
    document.getElementById("resume-verse-num").innerText = `البيت ${resumeVerse.number}`;

    document.getElementById("resume-btn").onclick = () => {
        currentChapterIdx = resumeChIdx;
        document.getElementById("nav-browser").click();
        loadBrowserChapter(resumeChIdx);
        // Highlight specific verse
        setTimeout(() => {
            const verseEl = document.querySelector(`[data-verse-num="${resumeVerse.number}"]`);
            if (verseEl) {
                verseEl.scrollIntoView({ behavior: "smooth", block: "center" });
                verseEl.click();
            }
        }, 300);
    };
}

// Poem Browser Initialization
let activeBrowserMask = "none"; // 'none', 'sadr', 'ajuz', 'random'
let showDiacritics = true;

function initBrowser() {
    const chaptersList = document.getElementById("browser-chapters-list");
    chaptersList.innerHTML = "";

    poemData.chapters.forEach((ch, idx) => {
        const btn = document.createElement("button");
        btn.className = `chapter-nav-btn ${idx === currentChapterIdx ? "active" : ""}`;
        btn.innerText = ch.title;
        btn.onclick = () => {
            document.querySelectorAll(".chapter-nav-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentChapterIdx = idx;
            loadBrowserChapter(idx);
        };
        chaptersList.appendChild(btn);
    });

    // Toolbar Actions
    const buttons = {
        "btn-reveal-all": "none",
        "btn-mask-sadr": "sadr",
        "btn-mask-ajuz": "ajuz",
        "btn-mask-random": "random"
    };

    Object.keys(buttons).forEach(btnId => {
        const btn = document.getElementById(btnId);
        btn.onclick = () => {
            document.querySelectorAll(".toolbar-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeBrowserMask = buttons[btnId];
            renderCurrentChapterVerses();
        };
    });

    // Diacritics toggle
    const diacriticsBtn = document.getElementById("btn-toggle-diacritics");
    diacriticsBtn.onclick = () => {
        showDiacritics = !showDiacritics;
        diacriticsBtn.classList.toggle("active", !showDiacritics);
        renderCurrentChapterVerses();
    };

    // Close explanations drawer
    document.getElementById("close-drawer-btn").onclick = closeDrawer;
    document.getElementById("explanations-drawer-overlay").onclick = closeDrawer;

    // Load initial chapter
    loadBrowserChapter(currentChapterIdx);
}

function loadBrowserChapter(idx) {
    const ch = poemData.chapters[idx];
    if (!ch) return;
    document.getElementById("current-browser-chapter").innerText = ch.title;

    if (ch.verses && ch.verses.length > 0) {
        const startNum = ch.verses[0].number;
        const endNum = ch.verses[ch.verses.length - 1].number;
        document.getElementById("chapter-verses-range").innerText = `الأبيات ${startNum} - ${endNum}`;
    } else {
        document.getElementById("chapter-verses-range").innerText = "لا توجد أبيات في هذا الباب";
    }

    renderCurrentChapterVerses();
}

// Clean diacritics temporarily for rendering
function removeTashkeel(text) {
    return text.replace(/[\u064B-\u065F\u0670]/g, "");
}

function applyMask(text, type) {
    if (type === "none") return text;
    if (type === "all") return `<span class="text-masked">${text}</span>`;

    if (type === "random") {
        const words = text.split(" ");
        const maskedWords = words.map(w => {
            // Mask roughly 40% of words randomly
            if (Math.random() < 0.4 && w.length > 2) {
                return `<span class="word-masked">${w}</span>`;
            }
            return w;
        });
        return maskedWords.join(" ");
    }
    return text;
}

function renderCurrentChapterVerses() {
    const container = document.getElementById("verses-container");
    container.innerHTML = "";

    const ch = poemData.chapters[currentChapterIdx];
    if (!ch || !ch.verses || ch.verses.length === 0) {
        container.innerHTML = "<div class='loading-placeholder'>لا توجد أبيات في هذا الباب.</div>";
        return;
    }

    ch.verses.forEach(v => {
        let sadrText = showDiacritics ? v.sadr : removeTashkeel(v.sadr);
        let ajuzText = showDiacritics ? v.ajuz : removeTashkeel(v.ajuz);

        // Apply masks
        if (activeBrowserMask === "sadr") {
            sadrText = applyMask(sadrText, "all");
        } else if (activeBrowserMask === "ajuz") {
            ajuzText = applyMask(ajuzText, "all");
        } else if (activeBrowserMask === "random") {
            sadrText = applyMask(sadrText, "random");
            ajuzText = applyMask(ajuzText, "random");
        }

        const item = document.createElement("div");
        item.className = "verse-item";
        item.setAttribute("data-verse-num", v.number);

        const status = userProgress[v.number] || 0;
        let statusBadgeClass = `status-badge status-${status}`;
        let statusBadgeText = status === 2 ? "محفوظ" : status === 1 ? "قيد الحفظ" : "غير محفوظ";

        item.innerHTML = `
            <div class="verse-number-col">${v.number}</div>
            <div class="verse-text-cols">
                <div class="sadr-col">${sadrText}</div>
                <div class="ajuz-col">${ajuzText}</div>
            </div>
            <div class="${statusBadgeClass}">${statusBadgeText}</div>
        `;

        const badge = item.querySelector(".status-badge");
        badge.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent opening the explanations drawer
            const currentStatus = userProgress[v.number] || 0;
            const nextStatus = (currentStatus + 1) % 3;

            userProgress[v.number] = nextStatus;
            saveProgress();
            updateSRSStateForVerse(v.number, nextStatus);

            badge.className = `status-badge status-${nextStatus}`;
            badge.innerText = nextStatus === 2 ? "محفوظ" : nextStatus === 1 ? "قيد الحفظ" : "غير محفوظ";

            initDashboard(); // Update stats
        });

        item.addEventListener("click", (e) => {
            // Click to reveal masked text or open drawer
            if (e.target.classList.contains("text-masked") || e.target.classList.contains("word-masked")) {
                e.target.classList.remove("text-masked", "word-masked");
                e.target.style.color = "inherit";
                return;
            }
            openExplanationsDrawer(v);
        });

        container.appendChild(item);
    });
}

function getNextVerse(currentVerseNumber) {
    if (!poemData) return null;
    let nextVerse = null;
    let foundCurrent = false;
    for (let i = 0; i < poemData.chapters.length; i++) {
        const ch = poemData.chapters[i];
        for (let j = 0; j < ch.verses.length; j++) {
            const v = ch.verses[j];
            if (foundCurrent) {
                nextVerse = v;
                return nextVerse;
            }
            if (v.number === currentVerseNumber) {
                foundCurrent = true;
            }
        }
    }
    return null;
}

function getPrevVerse(currentVerseNumber) {
    if (!poemData) return null;
    let prevVerse = null;
    for (let i = 0; i < poemData.chapters.length; i++) {
        const ch = poemData.chapters[i];
        for (let j = 0; j < ch.verses.length; j++) {
            const v = ch.verses[j];
            if (v.number === currentVerseNumber) {
                return prevVerse;
            }
            prevVerse = v;
        }
    }
    return null;
}

function getVerseByNumber(verseNumber) {
    if (!poemData) return null;
    for (let i = 0; i < poemData.chapters.length; i++) {
        const ch = poemData.chapters[i];
        for (let j = 0; j < ch.verses.length; j++) {
            const v = ch.verses[j];
            if (v.number === verseNumber) {
                return v;
            }
        }
    }
    return null;
}

function getFirstWord(text) {
    if (!text) return "";
    const cleanText = text.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()؟?،؛«»"']/g, "");
    const words = cleanText.split(/\s+/);
    return words[0] || "";
}

function getLastWord(text) {
    if (!text) return "";
    const cleanText = text.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()؟?،؛«»"']/g, "");
    const words = cleanText.split(/\s+/);
    return words[words.length - 1] || "";
}

function getFirstWords(text, count) {
    if (!text) return "";
    const cleanText = text.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()؟?،؛«»"']/g, "");
    const words = cleanText.split(/\s+/);
    return words.slice(0, count).join(" ");
}

function findSimilarVerses(currentVerse) {
    if (!poemData) return [];
    const currentNormalized = normalizeArabic(currentVerse.sadr);
    const currentFirstTwoWords = getFirstWords(currentNormalized, 2);
    if (!currentFirstTwoWords) return [];

    const matches = [];
    poemData.chapters.forEach(ch => {
        ch.verses.forEach(v => {
            if (v.number !== currentVerse.number) {
                const normalized = normalizeArabic(v.sadr);
                const firstTwoWords = getFirstWords(normalized, 2);
                if (firstTwoWords === currentFirstTwoWords) {
                    matches.push(v);
                }
            }
        });
    });
    return matches;
}

// Side Drawer Expanations Panel
function openExplanationsDrawer(verse) {
    currentDrawerVerseNum = verse.number;

    document.getElementById("drawer-verse-num").innerText = `البيت ${verse.number}`;
    document.getElementById("drawer-verse-sadr").innerText = verse.sadr;
    document.getElementById("drawer-verse-ajuz").innerText = verse.ajuz;

    // Nav Buttons setup
    const prevVerse = getPrevVerse(verse.number);
    const nextVerse = getNextVerse(verse.number);
    const prevBtn = document.getElementById("drawer-prev-btn");
    const nextBtn = document.getElementById("drawer-next-btn");

    if (prevVerse) {
        prevBtn.disabled = false;
        prevBtn.onclick = () => openExplanationsDrawer(prevVerse);
    } else {
        prevBtn.disabled = true;
    }

    if (nextVerse) {
        nextBtn.disabled = false;
        nextBtn.onclick = () => openExplanationsDrawer(nextVerse);
    } else {
        nextBtn.disabled = true;
    }

    // Status Buttons setup
    const currentStatus = userProgress[verse.number] || 0;
    document.querySelectorAll(".status-btn").forEach(btn => {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-status")) === currentStatus) {
            btn.classList.add("active");
        }

        btn.onclick = () => {
            const status = parseInt(btn.getAttribute("data-status"));
            userProgress[verse.number] = status;
            saveProgress();
            updateSRSStateForVerse(verse.number, status);

            document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Update browser row badge in-place to keep search/scroll state
            const row = document.querySelector(`.verse-item[data-verse-num="${verse.number}"]`);
            if (row) {
                const badge = row.querySelector(".status-badge");
                if (badge) {
                    badge.className = `status-badge status-${status}`;
                    badge.innerText = status === 2 ? "محفوظ" : status === 1 ? "قيد الحفظ" : "غير محفوظ";
                }
            }
            initDashboard(); // Update dashboard
        };
    });

    // Commentary Load
    document.getElementById("drawer-commentary-text").innerText = verse.commentary || "شرح هذا البيت متوفر في الأبواب المتعلقة به.";

    // Vocab Load
    const vocabList = document.getElementById("drawer-vocab-list");
    vocabList.innerHTML = "";
    if (verse.vocabulary && verse.vocabulary.length > 0) {
        verse.vocabulary.forEach(word => {
            const vitem = document.createElement("div");
            vitem.className = "vocab-item";
            vitem.innerHTML = `<strong>${word.word}</strong><span>${word.explanation}</span>`;
            vocabList.appendChild(vitem);
        });
    } else {
        vocabList.innerHTML = "<div class='loading-placeholder'>لا توجد كلمات صعبة في هذا البيت تحتاج لشرح خاص.</div>";
    }

    // Mnemonics Generation: provide helper rhymes and structural clues
    const mnemonicBox = document.getElementById("drawer-mnemonic-text");
    const similarVerses = findSimilarVerses(verse);

    const lastWordAjuz = getLastWord(verse.ajuz);
    const lastWordSadr = getLastWord(verse.sadr);

    let htmlContent = "";

    // 1. Rhyme information
    htmlContent += `
        <div class="mnemonic-section">
            <h5 style="margin: 0 0 8px 0; font-size:14px; font-weight:700; color:var(--primary);"><i class="fa-solid fa-music"></i> القافية والروي</h5>
            <p style="margin: 4px 0;">• ينتهي الصدر بـ: <strong style="color:var(--text-primary)">${lastWordSadr}</strong></p>
            <p style="margin: 4px 0;">• ينتهي البيت بـ: <strong style="color:var(--secondary)">${lastWordAjuz}</strong></p>
        </div>
    `;

    // 2. Transition link to next verse
    if (nextVerse) {
        const nextFirstWord = getFirstWord(nextVerse.sadr);
        htmlContent += `
            <div class="mnemonic-section" style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.05);">
                <h5 style="margin: 0 0 8px 0; font-size:14px; font-weight:700; color:var(--primary);"><i class="fa-solid fa-link"></i> رابط الانتقال للبيت التالي</h5>
                <p style="margin: 4px 0; line-height: 1.6;">اربط نهاية هذا البيت (<strong style="color:var(--secondary)">${lastWordAjuz}</strong>) بأول كلمة من البيت التالي (<strong style="color:var(--primary)">${nextFirstWord}</strong>):</p>
                <div style="background: rgba(194, 157, 91, 0.08); border: 1px solid rgba(194, 157, 91, 0.15); border-radius: var(--radius-sm); padding: 8px 12px; margin-top: 8px; text-align: center; font-size: 15px;">
                    <span style="color: var(--secondary); font-weight: 700;">${lastWordAjuz}</span>
                    <i class="fa-solid fa-circle-arrow-left" style="margin: 0 8px; color: var(--primary); font-size: 13px;"></i>
                    <span style="color: var(--primary); font-weight: 700;">${nextFirstWord}</span>
                </div>
                <div style="margin-top: 10px; font-size: 13px; color: var(--text-secondary);">
                    <strong>البيت التالي (${nextVerse.number}):</strong><br>
                    <span style="font-family: var(--font-poem); font-size:14px; color: var(--text-muted);">${nextVerse.sadr} ... ${nextVerse.ajuz}</span>
                </div>
            </div>
        `;
    } else {
        htmlContent += `
            <div class="mnemonic-section" style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.05); text-align: center; color: var(--secondary);">
                🎉 <strong>هذا هو البيت الأخير في المنظومة!</strong>
            </div>
        `;
    }

    // 3. Similar verses (Warning / المتشابهات)
    if (similarVerses.length > 0) {
        htmlContent += `
            <div class="mnemonic-section" style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.05); background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); padding: 10px;">
                <h5 style="margin: 0 0 6px 0; font-size:13px; font-weight:700; color:var(--red);"><i class="fa-solid fa-triangle-exclamation"></i> انتبه للمتشابهات اللفظية</h5>
                <p style="margin: 4px 0; font-size:13px; color: var(--text-secondary);">هناك أبيات أخرى تبدأ بنفس الكلمات، احذر الخلط بينها:</p>
                <ul style="margin: 6px 0 0 0; padding-right: 18px; font-size:13px; color: var(--text-muted); line-height: 1.5;">
        `;
        similarVerses.forEach(sv => {
            htmlContent += `<li><strong>البيت ${sv.number}:</strong> "${sv.sadr.split(" ").slice(0, 3).join(" ")}..."</li>`;
        });
        htmlContent += `
                </ul>
            </div>
        `;
    }

    mnemonicBox.innerHTML = htmlContent;

    // Show drawer
    document.getElementById("explanations-drawer").classList.add("active");
    document.getElementById("explanations-drawer-overlay").classList.add("active");
}

function closeDrawer() {
    document.getElementById("explanations-drawer").classList.remove("active");
    document.getElementById("explanations-drawer-overlay").classList.remove("active");
    currentDrawerVerseNum = null;
}

// Global Keyboard Shortcuts for Drawer Navigation & Status Cycling
window.addEventListener("keydown", (e) => {
    // If explanations drawer is not active, do nothing
    const drawer = document.getElementById("explanations-drawer");
    if (!drawer || !drawer.classList.contains("active")) {
        return;
    }

    // Ignore keyboard shortcuts if the user is typing in an input field or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
        return;
    }

    if (e.key === "Escape") {
        closeDrawer();
        e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key.toLowerCase() === "n") {
        // Next Verse (Arabic is RTL so ArrowLeft or ArrowDown is Next)
        if (currentDrawerVerseNum) {
            const nextVerse = getNextVerse(currentDrawerVerseNum);
            if (nextVerse) {
                openExplanationsDrawer(nextVerse);
                e.preventDefault();
            }
        }
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key.toLowerCase() === "p") {
        // Previous Verse (Arabic is RTL so ArrowRight or ArrowUp is Prev)
        if (currentDrawerVerseNum) {
            const prevVerse = getPrevVerse(currentDrawerVerseNum);
            if (prevVerse) {
                openExplanationsDrawer(prevVerse);
                e.preventDefault();
            }
        }
    } else if (["1", "2", "3", "١", "٢", "٣"].includes(e.key)) {
        // Change Status: 1/١ -> 0 (Not started), 2/٢ -> 1 (Partial), 3/٣ -> 2 (Memorized)
        if (currentDrawerVerseNum) {
            let status;
            if (e.key === "1" || e.key === "١") status = 0;
            else if (e.key === "2" || e.key === "٢") status = 1;
            else if (e.key === "3" || e.key === "٣") status = 2;

            userProgress[currentDrawerVerseNum] = status;
            saveProgress();
            updateSRSStateForVerse(currentDrawerVerseNum, status);

            // Update active status button in drawer UI
            document.querySelectorAll(".status-btn").forEach(btn => {
                btn.classList.remove("active");
                if (parseInt(btn.getAttribute("data-status")) === status) {
                    btn.classList.add("active");
                }
            });

            // Update browser list row badge in-place
            const row = document.querySelector(`.verse-item[data-verse-num="${currentDrawerVerseNum}"]`);
            if (row) {
                const badge = row.querySelector(".status-badge");
                if (badge) {
                    badge.className = `status-badge status-${status}`;
                    badge.innerText = status === 2 ? "محفوظ" : status === 1 ? "قيد الحفظ" : "غير محفوظ";
                }
            }
            initDashboard();
            e.preventDefault();
        }
    }
});

// Focus Mode Initialization
function initFocusMode() {
    const select = document.getElementById("focus-chapter-select");
    select.innerHTML = "";

    poemData.chapters.forEach((ch, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.innerText = ch.title;
        select.appendChild(opt);
    });

    select.onchange = () => {
        currentChapterIdx = parseInt(select.value);
        currentFocusVerseIdx = 0;
        updateFocusVerse();
        if (focusIntervalId) {
            stopFocusAutoplay();
            startFocusAutoplay();
        }
    };

    document.getElementById("focus-speed-select").onchange = () => {
        if (focusIntervalId) {
            stopFocusAutoplay();
            startFocusAutoplay();
        }
    };

    // Font controls
    const sizes = [24, 28, 32, 36, 40, 48];
    let activeSizeIdx = 5; // 48px

    document.getElementById("focus-font-inc").onclick = () => {
        if (activeSizeIdx < sizes.length - 1) {
            activeSizeIdx++;
            applyFocusFontSize(sizes[activeSizeIdx]);
        }
    };
    document.getElementById("focus-font-dec").onclick = () => {
        if (activeSizeIdx > 0) {
            activeSizeIdx--;
            applyFocusFontSize(sizes[activeSizeIdx]);
        }
    };

    function applyFocusFontSize(sz) {
        document.getElementById("focus-font-size-val").innerText = `${sz}px`;
        document.getElementById("focus-sadr").style.fontSize = `${sz}px`;
        document.getElementById("focus-ajuz").style.fontSize = `${sz}px`;
    }

    // Set initial size
    applyFocusFontSize(sizes[activeSizeIdx]);

    // Prev / Next actions
    document.getElementById("focus-prev-btn").onclick = () => {
        if (currentFocusVerseIdx > 0) {
            currentFocusVerseIdx--;
            updateFocusVerse();
        }
    };

    document.getElementById("focus-next-btn").onclick = () => {
        const ch = poemData.chapters[currentChapterIdx];
        if (currentFocusVerseIdx < ch.verses.length - 1) {
            currentFocusVerseIdx++;
            updateFocusVerse();
        }
    };

    // Masks inside focus
    const focusSadrEl = document.getElementById("focus-sadr");
    const focusAjuzEl = document.getElementById("focus-ajuz");

    document.getElementById("focus-hide-sadr").onclick = () => {
        resetFocusMasks();
        document.getElementById("focus-hide-sadr").classList.add("active");
        focusSadrEl.classList.add("text-blurred");
    };
    document.getElementById("focus-hide-ajuz").onclick = () => {
        resetFocusMasks();
        document.getElementById("focus-hide-ajuz").classList.add("active");
        focusAjuzEl.classList.add("text-blurred");
    };
    document.getElementById("focus-reveal").onclick = () => {
        resetFocusMasks();
        document.getElementById("focus-reveal").classList.add("active");
    };

    function resetFocusMasks() {
        document.querySelectorAll(".focus-masks button").forEach(b => b.classList.remove("active"));
        focusSadrEl.classList.remove("text-blurred");
        focusAjuzEl.classList.remove("text-blurred");
    }

    // Autoplay action
    const playBtn = document.getElementById("focus-play-btn");
    playBtn.onclick = () => {
        if (focusIntervalId) {
            stopFocusAutoplay();
        } else {
            startFocusAutoplay();
        }
    };

    updateFocusVerse();
}

function updateFocusVerse() {
    const ch = poemData.chapters[currentChapterIdx];
    const v = ch.verses[currentFocusVerseIdx];

    document.getElementById("focus-verse-num").innerText = `البيت ${v.number} (${currentFocusVerseIdx + 1} من ${ch.verses.length})`;
    document.getElementById("focus-sadr").innerText = v.sadr;
    document.getElementById("focus-ajuz").innerText = v.ajuz;

    document.getElementById("focus-commentary-text").innerText = v.commentary || "شرح هذا البيت متوفر في الأبواب المتعلقة به.";

    const vocabContainer = document.getElementById("focus-vocab-container");
    vocabContainer.innerHTML = "";

    if (v.vocabulary && v.vocabulary.length > 0) {
        v.vocabulary.forEach(word => {
            const badge = document.createElement("div");
            badge.className = "vocab-badge";
            badge.innerHTML = `<strong>${word.word}</strong>: ${word.explanation}`;
            vocabContainer.appendChild(badge);
        });
    } else {
        vocabContainer.innerHTML = "<div class='loading-placeholder'>لا توجد كلمات صعبة خاصة بهذا البيت.</div>";
    }

    // Enable/disable navigation buttons
    document.getElementById("focus-prev-btn").disabled = currentFocusVerseIdx === 0;
    document.getElementById("focus-next-btn").disabled = currentFocusVerseIdx === ch.verses.length - 1;
}

function startFocusAutoplay() {
    const speed = parseInt(document.getElementById("focus-speed-select").value);
    const playBtn = document.getElementById("focus-play-btn");
    playBtn.innerHTML = '<i class="fa-solid fa-pause"></i> إيقاف مؤقت';
    playBtn.classList.add("active");

    focusIntervalId = setInterval(() => {
        const ch = poemData.chapters[currentChapterIdx];
        if (currentFocusVerseIdx < ch.verses.length - 1) {
            currentFocusVerseIdx++;
            updateFocusVerse();
        } else {
            // Loop back to beginning of chapter
            currentFocusVerseIdx = 0;
            updateFocusVerse();
        }
    }, speed);
}

function stopFocusAutoplay() {
    clearInterval(focusIntervalId);
    focusIntervalId = null;
    const playBtn = document.getElementById("focus-play-btn");
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i> التشغيل التلقائي';
    playBtn.classList.remove("active");
}


// Quiz Mode Logic
let activeQuizQuestions = [];
let currentQuestionIndex = 0;
let quizScore = 0;
let quizConfig = {
    chapterIdx: "all",
    type: "complete-ajuz",
    count: 10
};

// Global variables for matching and ordering games
let currentMatchingVerses = [];
let matchedPairsCount = 0;
let selectedSadrEl = null;
let selectedAjuzEl = null;

let correctOrderingIds = [];
let currentOrderingVerses = [];


function initQuizMode() {
    const chSelect = document.getElementById("quiz-chapter-select");
    chSelect.innerHTML = '<option value="all">المنظومة كاملة</option>';

    poemData.chapters.forEach((ch, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.innerText = ch.title;
        chSelect.appendChild(opt);
    });

    document.getElementById("start-quiz-btn").onclick = startQuiz;

    // Submit / skip buttons inside quiz screen
    document.getElementById("quiz-submit-btn").onclick = handleSubmitAnswer;
    document.getElementById("quiz-skip-btn").onclick = handleSkipQuestion;

    // Results retry button
    document.getElementById("quiz-retry-btn").onclick = startQuiz;
    document.getElementById("quiz-back-setup-btn").onclick = () => {
        document.getElementById("quiz-results").classList.add("hidden");
        document.getElementById("quiz-setup").classList.remove("hidden");
    };
}

function startQuiz() {
    quizConfig.chapterIdx = document.getElementById("quiz-chapter-select").value;
    quizConfig.type = document.getElementById("quiz-type-select").value;
    quizConfig.count = parseInt(document.getElementById("quiz-question-count").value);

    // Pool of available verses for questions
    let versePool = [];
    if (quizConfig.chapterIdx === "all") {
        poemData.chapters.forEach(ch => {
            versePool = versePool.concat(ch.verses);
        });
    } else {
        const idx = parseInt(quizConfig.chapterIdx);
        versePool = poemData.chapters[idx].verses;
    }

    if (versePool.length < 4 && quizConfig.type === "match-lines") {
        alert("هذا الباب الفقهي يحتوي على عدد قليل جداً من الأبيات لإجراء اختبار التوصيل. يرجى اختيار باب آخر أو المنظومة كاملة.");
        return;
    }

    // Shuffle pool and slice question count
    const shuffled = [...versePool].sort(() => 0.5 - Math.random());
    activeQuizQuestions = shuffled.slice(0, Math.min(quizConfig.count, shuffled.length));

    currentQuestionIndex = 0;
    quizScore = 0;

    document.getElementById("quiz-setup").classList.add("hidden");
    document.getElementById("quiz-results").classList.add("hidden");
    document.getElementById("quiz-active").classList.remove("hidden");

    loadQuestion();
}

function loadQuestion() {
    const progress = (currentQuestionIndex / activeQuizQuestions.length) * 100;
    document.getElementById("quiz-progress-bar").style.width = `${progress}%`;
    document.getElementById("quiz-progress-text").innerText = `السؤال ${currentQuestionIndex + 1} من ${activeQuizQuestions.length}`;

    const verse = activeQuizQuestions[currentQuestionIndex];
    document.getElementById("quiz-question-num").innerText = `البيت ${verse.number}`;

    // Reset templates
    const optionsContainer = document.getElementById("quiz-options-container");
    optionsContainer.innerHTML = "";
    optionsContainer.classList.remove("hidden");

    const typingContainer = document.getElementById("quiz-typing-container");
    typingContainer.classList.add("hidden");
    document.getElementById("quiz-typing-input").value = "";

    const verseDisplay = document.getElementById("quiz-verse-display");
    verseDisplay.innerHTML = "";

    // Setup question based on type
    const submitBtn = document.getElementById("quiz-submit-btn");
    submitBtn.innerText = "تحقق من الإجابة";
    submitBtn.onclick = handleSubmitAnswer;

    if (quizConfig.type === "complete-ajuz") {
        document.getElementById("quiz-question-instruction").innerText = "أكمل الشطر الثاني (العجز) للبيت التالي:";

        verseDisplay.innerHTML = `
            <span class="part-sadr">${verse.sadr}</span>
            <span class="part-separator">...</span>
            <span class="part-ajuz text-blurred">؟ ؟ ؟</span>
        `;

        generateMultipleChoices(verse.ajuz, "ajuz");
    }
    else if (quizConfig.type === "complete-sadr") {
        document.getElementById("quiz-question-instruction").innerText = "أكمل الشطر الأول (الصدر) للبيت التالي:";

        verseDisplay.innerHTML = `
            <span class="part-sadr text-blurred">؟ ؟ ؟</span>
            <span class="part-separator">...</span>
            <span class="part-ajuz">${verse.ajuz}</span>
        `;

        generateMultipleChoices(verse.sadr, "sadr");
    }
    else if (quizConfig.type === "write-verse") {
        document.getElementById("quiz-question-instruction").innerText = "اكتب الشطر الثاني المفقود لهذا البيت:";

        verseDisplay.innerHTML = `
            <span class="part-sadr">${verse.sadr}</span>
            <span class="part-separator">...</span>
            <span class="part-ajuz text-blurred">؟ ؟ ؟</span>
        `;

        optionsContainer.classList.add("hidden");
        typingContainer.classList.remove("hidden");

        // Handle ENTER key in text field
        const typingInput = document.getElementById("quiz-typing-input");
        typingInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                handleSubmitAnswer();
            }
        };
    }
    else if (quizConfig.type === "match-lines") {
        document.getElementById("quiz-question-instruction").innerText = "صل كل شطر من الصدر بما يناسبه من العجز:";
        optionsContainer.innerHTML = "";
        verseDisplay.innerHTML = "";

        // Get 4 verses for matching
        let matchVerses = [verse];
        let pool = [];
        if (quizConfig.chapterIdx === "all") {
            poemData.chapters.forEach(ch => { pool = pool.concat(ch.verses); });
        } else {
            pool = poemData.chapters[parseInt(quizConfig.chapterIdx)].verses;
        }
        let poolFiltered = pool.filter(v => v.number !== verse.number);
        let shuffledPool = [...poolFiltered].sort(() => 0.5 - Math.random());
        matchVerses = matchVerses.concat(shuffledPool.slice(0, 3));
        matchVerses = matchVerses.sort(() => 0.5 - Math.random());

        currentMatchingVerses = matchVerses;
        matchedPairsCount = 0;
        selectedSadrEl = null;
        selectedAjuzEl = null;

        const matchGrid = document.createElement("div");
        matchGrid.className = "matching-container";
        matchGrid.innerHTML = `
            <div class="matching-column" id="sadr-column"></div>
            <div class="matching-column" id="ajuz-column"></div>
        `;
        optionsContainer.appendChild(matchGrid);

        const sadrCol = matchGrid.querySelector("#sadr-column");
        const ajuzCol = matchGrid.querySelector("#ajuz-column");

        const sadrVerses = [...matchVerses].sort(() => 0.5 - Math.random());
        const ajuzVerses = [...matchVerses].sort(() => 0.5 - Math.random());

        sadrVerses.forEach(mv => {
            const btn = document.createElement("button");
            btn.className = "match-btn sadr-match-btn";
            btn.innerText = mv.sadr;
            btn.setAttribute("data-verse-num", mv.number);
            btn.onclick = () => handleSadrClick(btn);
            sadrCol.appendChild(btn);
        });

        ajuzVerses.forEach(mv => {
            const btn = document.createElement("button");
            btn.className = "match-btn ajuz-match-btn";
            btn.innerText = mv.ajuz;
            btn.setAttribute("data-verse-num", mv.number);
            btn.onclick = () => handleAjuzClick(btn);
            ajuzCol.appendChild(btn);
        });

        submitBtn.innerText = "تجاوز السؤال";
        submitBtn.onclick = handleSkipQuestion;
    }
    else if (quizConfig.type === "order-verses") {
        document.getElementById("quiz-question-instruction").innerText = "رتب الأبيات التالية ترتيباً تصاعدياً صحيحاً حسب المنظومة:";
        optionsContainer.innerHTML = "";
        verseDisplay.innerHTML = "";

        let consecutive = [];
        let allVerses = [];
        poemData.chapters.forEach(ch => { allVerses = allVerses.concat(ch.verses); });

        let baseIdx = allVerses.findIndex(v => v.number === verse.number);
        if (baseIdx === -1) baseIdx = 0;
        if (baseIdx > allVerses.length - 4) {
            baseIdx = Math.max(0, allVerses.length - 4);
        }

        consecutive = allVerses.slice(baseIdx, baseIdx + 4);
        correctOrderingIds = consecutive.map(cv => cv.number);
        currentOrderingVerses = [...consecutive].sort(() => 0.5 - Math.random());

        renderOrderingList(optionsContainer);

        submitBtn.innerText = "تحقق من الإجابة";
        submitBtn.onclick = handleVerifyOrdering;
    }
}

function generateMultipleChoices(correctText, column) {
    const optionsContainer = document.getElementById("quiz-options-container");

    // Extract random false choices from the entire poem
    let pool = [];
    poemData.chapters.forEach(ch => {
        ch.verses.forEach(v => {
            const text = column === "sadr" ? v.sadr : v.ajuz;
            if (text !== correctText) pool.push(text);
        });
    });

    // Pick 3 unique random options
    const falseChoices = [...new Set(pool)].sort(() => 0.5 - Math.random()).slice(0, 3);
    const allOptions = [...falseChoices, correctText].sort(() => 0.5 - Math.random());

    allOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = () => {
            document.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
        };
        optionsContainer.appendChild(btn);
    });
}

function handleSubmitAnswer() {
    const verse = activeQuizQuestions[currentQuestionIndex];
    let isCorrect = false;

    if (quizConfig.type === "complete-ajuz" || quizConfig.type === "complete-sadr") {
        const selectedBtn = document.querySelector(".option-btn.selected");
        if (!selectedBtn) {
            alert("يرجى اختيار أحد الخيارات للإجابة أولاً.");
            return;
        }

        const correctText = quizConfig.type === "complete-ajuz" ? verse.ajuz : verse.sadr;
        const optionBtns = document.querySelectorAll(".option-btn");

        optionBtns.forEach(btn => {
            btn.disabled = true; // disable clicks
            if (btn.innerText === correctText) {
                btn.classList.add("correct");
            } else if (btn === selectedBtn) {
                btn.classList.add("incorrect");
            }
        });

        isCorrect = selectedBtn.innerText === correctText;
    }
    else if (quizConfig.type === "write-verse") {
        const typedText = document.getElementById("quiz-typing-input").value.trim();
        if (!typedText) {
            alert("يرجى كتابة الشطر المفقود أولاً.");
            return;
        }

        const correctText = verse.ajuz;
        const normTyped = normalizeArabic(typedText);
        const normCorrect = normalizeArabic(correctText);

        // Tolerant matching: check word overlap or lev distance
        isCorrect = normTyped === normCorrect;

        const verseDisplay = document.getElementById("quiz-verse-display");
        if (isCorrect) {
            verseDisplay.innerHTML = `
                <span class="part-sadr">${verse.sadr}</span>
                <span class="part-separator">...</span>
                <span class="part-ajuz text-success" style="color:var(--secondary)">${verse.ajuz}</span>
            `;
        } else {
            verseDisplay.innerHTML = `
                <span class="part-sadr">${verse.sadr}</span>
                <span class="part-separator">...</span>
                <span class="part-ajuz text-danger" style="color:var(--red); text-decoration:line-through;">${typedText}</span>
                <div style="margin-top: 10px; font-size:16px; color:var(--secondary);">الصحيح: ${verse.ajuz}</div>
            `;
        }
        document.getElementById("quiz-typing-container").classList.add("hidden");
    }

    if (isCorrect) quizScore++;

    // Change button action to NEXT
    const submitBtn = document.getElementById("quiz-submit-btn");
    submitBtn.innerText = "السؤال التالي";
    submitBtn.onclick = handleNextQuestion;
}

function handleSadrClick(btn) {
    if (btn.classList.contains("matched")) return;
    document.querySelectorAll(".sadr-match-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedSadrEl = btn;
    checkMatchSelection();
}

function handleAjuzClick(btn) {
    if (btn.classList.contains("matched")) return;
    document.querySelectorAll(".ajuz-match-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedAjuzEl = btn;
    checkMatchSelection();
}

function checkMatchSelection() {
    if (selectedSadrEl && selectedAjuzEl) {
        const num1 = selectedSadrEl.getAttribute("data-verse-num");
        const num2 = selectedAjuzEl.getAttribute("data-verse-num");

        const sEl = selectedSadrEl;
        const aEl = selectedAjuzEl;

        selectedSadrEl = null;
        selectedAjuzEl = null;

        if (num1 === num2) {
            sEl.classList.remove("selected");
            aEl.classList.remove("selected");
            sEl.classList.add("matched");
            aEl.classList.add("matched");
            sEl.disabled = true;
            aEl.disabled = true;
            matchedPairsCount++;

            if (matchedPairsCount === currentMatchingVerses.length) {
                quizScore++;
                const submitBtn = document.getElementById("quiz-submit-btn");
                submitBtn.innerText = "السؤال التالي";
                submitBtn.onclick = handleNextQuestion;

                const alertDiv = document.createElement("div");
                alertDiv.className = "alert alert-success mt-3 text-center";
                alertDiv.innerText = "أحسنت! تم التوصيل بشكل صحيح بالكامل. 🎉";
                document.getElementById("quiz-options-container").appendChild(alertDiv);
            }
        } else {
            sEl.classList.remove("selected");
            aEl.classList.remove("selected");
            sEl.classList.add("mismatched");
            aEl.classList.add("mismatched");

            setTimeout(() => {
                sEl.classList.remove("mismatched");
                aEl.classList.remove("mismatched");
            }, 800);
        }
    }
}

function renderOrderingList(container) {
    const list = document.createElement("div");
    list.className = "ordering-list";

    currentOrderingVerses.forEach((v, idx) => {
        const item = document.createElement("div");
        item.className = "ordering-item";
        item.innerHTML = `
            <span class="verse-text">${v.sadr} ... ${v.ajuz}</span>
            <div class="ordering-btns">
                <button class="order-btn up-btn" ${idx === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="order-btn down-btn" ${idx === currentOrderingVerses.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
            </div>
        `;

        item.querySelector(".up-btn").onclick = () => {
            if (idx > 0) {
                const temp = currentOrderingVerses[idx];
                currentOrderingVerses[idx] = currentOrderingVerses[idx - 1];
                currentOrderingVerses[idx - 1] = temp;
                renderOrderingList(container);
            }
        };

        item.querySelector(".down-btn").onclick = () => {
            if (idx < currentOrderingVerses.length - 1) {
                const temp = currentOrderingVerses[idx];
                currentOrderingVerses[idx] = currentOrderingVerses[idx + 1];
                currentOrderingVerses[idx + 1] = temp;
                renderOrderingList(container);
            }
        };

        list.appendChild(item);
    });

    container.innerHTML = "";
    container.appendChild(list);
}

function handleVerifyOrdering() {
    const userOrderIds = currentOrderingVerses.map(cv => cv.number);
    let isCorrect = true;
    for (let i = 0; i < correctOrderingIds.length; i++) {
        if (userOrderIds[i] !== correctOrderingIds[i]) {
            isCorrect = false;
            break;
        }
    }

    const items = document.querySelectorAll(".ordering-item");
    items.forEach((item, idx) => {
        const upBtn = item.querySelector(".up-btn");
        const downBtn = item.querySelector(".down-btn");
        if (upBtn) upBtn.disabled = true;
        if (downBtn) downBtn.disabled = true;

        if (userOrderIds[idx] === correctOrderingIds[idx]) {
            item.classList.add("correct");
        } else {
            item.classList.add("incorrect");
        }
    });

    if (isCorrect) {
        quizScore++;
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-success mt-3 text-center";
        alertDiv.innerText = "أحسنت! الترتيب صحيح تماماً. 🌟";
        document.getElementById("quiz-options-container").appendChild(alertDiv);
    } else {
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-danger mt-3 text-center";
        alertDiv.innerText = "الترتيب غير صحيح. انتبه للترتيب الصحيح للأبيات.";
        document.getElementById("quiz-options-container").appendChild(alertDiv);

        const correctList = document.createElement("div");
        correctList.className = "mt-3 p-3 bg-opacity-10 border border-success rounded text-success";
        correctList.innerHTML = "<strong>الترتيب الصحيح هو:</strong><ol>" +
            [...currentOrderingVerses].sort((a, b) => a.number - b.number).map(cv => `<li>${cv.sadr} ... ${cv.ajuz}</li>`).join("") +
            "</ol>";
        document.getElementById("quiz-options-container").appendChild(correctList);
    }

    const submitBtn = document.getElementById("quiz-submit-btn");
    submitBtn.innerText = "السؤال التالي";
    submitBtn.onclick = handleNextQuestion;
}

function handleSkipQuestion() {
    handleNextQuestion();
}


function handleNextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < activeQuizQuestions.length) {
        loadQuestion();
    } else {
        showQuizResults();
    }
}

function showQuizResults() {
    document.getElementById("quiz-active").classList.add("hidden");
    document.getElementById("quiz-results").classList.remove("hidden");

    const percent = Math.round((quizScore / activeQuizQuestions.length) * 100);
    document.getElementById("result-score-percent").innerText = `${percent}%`;
    document.getElementById("result-score-fraction").innerText = `لقد أجبت بشكل صحيح على ${quizScore} من أصل ${activeQuizQuestions.length} أسئلة`;

    const titleEl = document.getElementById("result-title");
    const bodyEl = document.getElementById("result-body-text");

    if (percent === 100) {
        titleEl.innerText = "حفظ وإتقان تام! 🎉";
        bodyEl.innerText = "ما شاء الله، إجاباتك كاملة وصحيحة 100%! لقد أتقنت هذا الباب الفقهي تماماً.";
    } else if (percent >= 80) {
        titleEl.innerText = "عمل متميز! 🌟";
        bodyEl.innerText = "أداء ممتاز جداً، لقد ضبطت معظم الأبيات والأحكام. القليل من المراجعة وتصل للضبط الكامل.";
    } else if (percent >= 50) {
        titleEl.innerText = "نتيجة جيدة! 👍";
        bodyEl.innerText = "أداء حسن، حافظ على المراجعة المنتظمة وتكرار الأبيات في وضع التركيز لتثبيت الحفظ.";
    } else {
        titleEl.innerText = "تحتاج لمزيد من المراجعة 📚";
        bodyEl.innerText = "لا تقلق، التكرار هو أساس الحفظ. جرب استخدام أدوات الإخفاء والتظليل وقراءة معاني الكلمات لتثبيت الأبيات.";
    }
}

// Global search function
function setupSearch() {
    const searchInput = document.getElementById("global-search");

    searchInput.addEventListener("input", () => {
        const query = normalizeArabic(searchInput.value.trim());
        if (!query) {
            // Restore current view
            renderCurrentChapterVerses();
            return;
        }

        // Show Browser View
        switchView("browser-view");
        document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
        document.getElementById("nav-browser").classList.add("active");

        // Perform search across all chapters
        const matches = [];
        poemData.chapters.forEach((ch, chIdx) => {
            ch.verses.forEach(v => {
                const normSadr = normalizeArabic(v.sadr);
                const normAjuz = normalizeArabic(v.ajuz);
                const normChapter = normalizeArabic(ch.title);

                if (normSadr.includes(query) || normAjuz.includes(query) || normChapter.includes(query)) {
                    matches.push({ verse: v, chapterTitle: ch.title, chapterIdx: chIdx });
                }
            });
        });

        // Render search results in the browser panel
        document.getElementById("current-browser-chapter").innerText = "نتائج البحث";
        document.getElementById("chapter-verses-range").innerText = `تم العثور على ${formatCount(matches.length, "بيت", "بيتان", "أبيات")}`;

        const container = document.getElementById("verses-container");
        container.innerHTML = "";

        if (matches.length === 0) {
            container.innerHTML = "<div class='loading-placeholder'>لم يتم العثور على نتائج مطابقة لبحثك. جرب كتابة كلمات أخرى.</div>";
            return;
        }

        matches.forEach(m => {
            const v = m.verse;
            const item = document.createElement("div");
            item.className = "verse-item";
            item.setAttribute("data-verse-num", v.number);

            const status = userProgress[v.number] || 0;
            let statusBadgeClass = `status-badge status-${status}`;
            let statusBadgeText = status === 2 ? "محفوظ" : status === 1 ? "قيد الحفظ" : "غير محفوظ";

            item.innerHTML = `
                <div class="verse-number-col">${v.number}</div>
                <div class="verse-text-cols">
                    <div class="sadr-col">${v.sadr}</div>
                    <div class="ajuz-col">${v.ajuz}</div>
                </div>
                <span class="badge" style="align-self:center; margin-left:10px;">${m.chapterTitle}</span>
                <div class="${statusBadgeClass}">${statusBadgeText}</div>
            `;

            const badge = item.querySelector(".status-badge");
            badge.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent opening the explanations drawer
                const currentStatus = userProgress[v.number] || 0;
                const nextStatus = (currentStatus + 1) % 3;

                userProgress[v.number] = nextStatus;
                saveProgress();
                updateSRSStateForVerse(v.number, nextStatus);

                badge.className = `status-badge status-${nextStatus}`;
                badge.innerText = nextStatus === 2 ? "محفوظ" : nextStatus === 1 ? "قيد الحفظ" : "غير محفوظ";

                initDashboard(); // Update stats
            });

            item.addEventListener("click", () => {
                openExplanationsDrawer(v);
            });

            container.appendChild(item);
        });
    });
}

// Backup & Restore Progress Data
function setupBackupRestore() {
    const backupBtn = document.getElementById("backup-btn");
    const restoreBtn = document.getElementById("restore-btn");
    const restoreInput = document.getElementById("restore-file-input");
    
    const drawerExportBtn = document.getElementById("export-progress-btn");
    const drawerImportBtn = document.getElementById("import-progress-btn");

    const onBackupClick = () => {
        exportProgressData();
    };

    const onRestoreClick = () => {
        if (restoreInput) restoreInput.click();
    };

    if (backupBtn) backupBtn.onclick = onBackupClick;
    if (drawerExportBtn) drawerExportBtn.onclick = onBackupClick;

    if (restoreBtn) restoreBtn.onclick = onRestoreClick;
    if (drawerImportBtn) drawerImportBtn.onclick = onRestoreClick;

    if (restoreInput) {
        restoreInput.onchange = (e) => {
            importProgressData(e);
        };
    }
}

function exportProgressData() {
    const backupData = {
        progress: userProgress,
        srs: userSRS
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("download", `ashal_masalik_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importProgressData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data && (data.progress || data.srs)) {
                if (data.progress) {
                    userProgress = data.progress;
                    localStorage.setItem("ashal_masalik_progress", JSON.stringify(userProgress));
                }
                if (data.srs) {
                    userSRS = data.srs;
                    localStorage.setItem("ashal_masalik_srs", JSON.stringify(userSRS));
                }
                
                alert("تم استيراد بيانات الحفظ والتقدم بنجاح! سيتم إعادة تحميل الصفحة الآن لتطبيق التغييرات.");
                window.location.reload();
            } else {
                alert("الملف غير صالح أو لا يحتوي على بيانات حفظ صحيحة.");
            }
        } catch (err) {
            alert("حدث خطأ أثناء قراءة الملف. يرجى التأكد من اختيار ملف النسخة الاحتياطية الصحيح.");
        }
    };
    reader.readAsText(file);
}

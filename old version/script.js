/* script.js */

// تجهيز البيانات
let currentSec = "";
const verses = versesData.map(v => {
    if(v.section) currentSec = v.section;
    return { ...v, sectionTitle: currentSec };
});

const versesArea = document.getElementById('verses-area');
const storageKey = 'ashal_almasalik_progress'; // لحفظ علامة "تم"
const countKey = 'ashal_almasalik_count';       // لحفظ العدد
let currentFocusIndex = 0;

// === معالجة النصوص (Vocab) ===
function processText(text, vocab) {
    if (!vocab) return text;
    let processedText = text;
    for (const [word, definition] of Object.entries(vocab)) {
        const regex = new RegExp(word, "g");
        processedText = processedText.replace(regex, `
            <span class="vocab-word" onclick="toggleTooltip(this, event)">
                ${word}
                <span class="tooltip-box">${definition}</span>
            </span>
        `);
    }
    return processedText;
}

// === الدالة الرئيسية لرسم الأبيات ===
function renderVerses() {
    versesArea.innerHTML = '';
    
    verses.forEach((verse, index) => {
        // العناوين
        if (verse.section) {
            const sectionTitle = document.createElement('h3');
            sectionTitle.className = 'section-header';
            sectionTitle.innerText = verse.section;
            versesArea.appendChild(sectionTitle);
        }

        // استرجاع الحالة والعدد
        const isChecked = localStorage.getItem(`${storageKey}_${verse.id}`) === 'true';
        const count = parseInt(localStorage.getItem(`${countKey}_${verse.id}`) || 0);
        
        // هل وصل للإتقان (20 تكرار)؟
        const isMastered = count >= 20 ? 'mastered' : '';

        const s1HTML = processText(verse.s1, verse.vocab);
        const s2HTML = processText(verse.s2, verse.vocab);

        const div = document.createElement('div');
        div.className = `verse-container ${isChecked ? 'saved' : ''}`;
        div.id = `verse-row-${index}`;
        
        div.innerHTML = `
            <div class="verse-num">${verse.id}</div>
            
            <div class="verse-content">
                <div class="shatr" onclick="toggleShatr(this)">${s1HTML}</div>
                <div class="shatr hidden" onclick="toggleShatr(this)">${s2HTML}</div>
            </div>

            <div class="check-container" style="display:flex; align-items:center;">
                <div class="counter-wrapper">
                    <div class="counter-box ${isMastered}">
                        <span class="count-display" id="count-disp-${verse.id}">${count}</span>
                        <button class="count-btn" onclick="changeCount(${verse.id}, 1)">+</button>
                    </div>
                </div>

                <input type="checkbox" ${isChecked ? 'checked' : ''} 
                       onchange="toggleDone(${verse.id}, this)"
                       style="margin-right: 15px;">
            </div>
        `;
        versesArea.appendChild(div);
    });
}

// === منطق العداد ===
function changeCount(id, amount) {
    const key = `${countKey}_${id}`;
    let currentCount = parseInt(localStorage.getItem(key) || 0);
    
    currentCount += amount;
    if (currentCount < 0) currentCount = 0; // منع الأرقام السالبة

    localStorage.setItem(key, currentCount);

    // تحديث الواجهة في القائمة الرئيسية
    const displayEl = document.getElementById(`count-disp-${id}`);
    if (displayEl) {
        displayEl.innerText = currentCount;
        // تحديث ستايل الإتقان
        const box = displayEl.closest('.counter-box');
        if (currentCount >= 20) box.classList.add('mastered');
        else box.classList.remove('mastered');
    }

    // تحديث الواجهة إذا كنا في وضع التركيز
    if (document.getElementById('focus-overlay').style.display === 'flex') {
        // نتأكد أننا نحدث نفس البيت المعروض
        const currentVerseId = verses[currentFocusIndex].id;
        if (currentVerseId === id) {
            document.getElementById('focus-count-val').innerText = currentCount;
        }
    }
}

// === باقي الدوال (بدون تغيير جذري) ===

function toggleShatr(element) { element.classList.toggle('hidden'); }

function toggleTooltip(element, event) {
    event.stopPropagation();
    document.querySelectorAll('.vocab-word').forEach(el => {
        if (el !== element) el.classList.remove('active');
    });
    element.classList.toggle('active');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.vocab-word')) {
        document.querySelectorAll('.vocab-word').forEach(el => el.classList.remove('active'));
    }
});


function hideAllVerses() {
    // نختار جميع الأشطر (الصدر والعجز) ونخفيها
    document.querySelectorAll('.shatr').forEach(el => el.classList.add('hidden'));
}

function hideAllAjuz() {
    document.querySelectorAll('#verses-area .verse-content .shatr:last-child').forEach(el => el.classList.add('hidden'));
}

function showAll() {
    document.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
}

function toggleDone(id, checkbox) {
    localStorage.setItem(`${storageKey}_${id}`, checkbox.checked);
    const container = checkbox.closest('.verse-container');
    if (checkbox.checked) container.classList.add('saved');
    else container.classList.remove('saved');
    
    if (document.getElementById('focus-overlay').style.display === 'flex') {
        const focusCheck = document.getElementById('focus-check');
        if(focusCheck) focusCheck.checked = checkbox.checked;
    }
    updateProgress();
}

function resetProgress() {
    if(confirm('هل تريد تصفير الحفظ والعدادات؟')) {
        // حذف حالة الحفظ والعدادات
        verses.forEach(v => {
            localStorage.removeItem(`${storageKey}_${v.id}`);
            localStorage.removeItem(`${countKey}_${v.id}`);
        });
        renderVerses();
        updateProgress();
    }
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    document.body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

// === وضع التركيز (تحديث ليشمل العداد) ===

function updateFocusCard() {
    const verse = verses[currentFocusIndex];
    const isChecked = localStorage.getItem(`${storageKey}_${verse.id}`) === 'true';
    const count = parseInt(localStorage.getItem(`${countKey}_${verse.id}`) || 0);

    document.getElementById('focus-id').innerText = verse.id;
    document.getElementById('focus-section').innerText = verse.sectionTitle;
    
    document.getElementById('focus-s1').innerHTML = processText(verse.s1, verse.vocab);
    document.getElementById('focus-s2').innerHTML = processText(verse.s2, verse.vocab);
    document.getElementById('focus-s2').classList.add('hidden'); 

    document.getElementById('focus-check').checked = isChecked;

    // تحديث العداد في وضع التركيز (تم إنشاؤه في HTML أدناه)
    const focusCounterDiv = document.getElementById('focus-counter-area');
    focusCounterDiv.innerHTML = `
        <div class="focus-counter">
            <button class="count-btn focus-btn-large secondary" onclick="changeCount(${verse.id}, -1)">-</button>
            <span class="focus-count-display" id="focus-count-val">${count}</span>
            <button class="count-btn focus-btn-large" onclick="changeCount(${verse.id}, 1)">+</button>
        </div>
    `;
}

function openFocusMode() {
    document.getElementById('focus-overlay').style.display = 'flex';
    let firstNotSaved = verses.findIndex(v => localStorage.getItem(`${storageKey}_${v.id}`) !== 'true');
    currentFocusIndex = firstNotSaved >= 0 ? firstNotSaved : 0;
    updateFocusCard();
    document.addEventListener('keydown', handleKeyInput);
}

function closeFocusMode() {
    document.getElementById('focus-overlay').style.display = 'none';
    document.removeEventListener('keydown', handleKeyInput);
    const row = document.getElementById(`verse-row-${currentFocusIndex}`);
    if(row) row.scrollIntoView({behavior: 'smooth', block: 'center'});
}

function toggleFocusShatr(el) { el.classList.toggle('hidden'); }

function nextVerse() {
    if (currentFocusIndex < verses.length - 1) {
        currentFocusIndex++;
        updateFocusCard();
    }
}

function prevVerse() {
    if (currentFocusIndex > 0) {
        currentFocusIndex--;
        updateFocusCard();
    }
}

function toggleDoneFromFocus() {
    const checkbox = document.getElementById('focus-check');
    const verseId = verses[currentFocusIndex].id;
    localStorage.setItem(`${storageKey}_${verseId}`, checkbox.checked);
    renderVerses(); 
    updateProgress();
}

function handleKeyInput(e) {
    if (e.key === 'ArrowLeft') nextVerse();
    if (e.key === 'ArrowRight') prevVerse();
    if (e.key === ' ') {
        e.preventDefault();
        const hiddenPart = document.querySelector('#focus-s2');
        if(hiddenPart) hiddenPart.classList.toggle('hidden');
    }
    // اختصار للعداد
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeCount(verses[currentFocusIndex].id, 1);
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeCount(verses[currentFocusIndex].id, -1);
    }
    // Enter → للحفظ
    if (e.key === 'Enter') {
        e.preventDefault();

        const verseId = verses[currentFocusIndex].id;
        const key = `${storageKey}_${verseId}`;

        // الحالة الحالية
        const currentlyChecked = localStorage.getItem(key) === 'true';

        // عكس الحالة
        const newState = !currentlyChecked;
        localStorage.setItem(key, newState);

        // تحديث checkbox في وضع التركيز
        const focusCheck = document.getElementById('focus-check');
        if (focusCheck) focusCheck.checked = newState;

        // تحديث القائمة الرئيسية والتقدم
        renderVerses();
        updateProgress();
    }

}

// === دالة تحديث شريط التقدم ===
function updateProgress() {
    const total = verses.length;
    // نحسب عدد الأبيات التي قيمتها 'true' في التخزين
    const savedCount = verses.filter(v => localStorage.getItem(`${storageKey}_${v.id}`) === 'true').length;
    
    // حساب النسبة المئوية
    const percent = total === 0 ? 0 : Math.round((savedCount / total) * 100);

    // تحديث الواجهة
    const savedEl = document.getElementById('saved-count');
    const totalEl = document.getElementById('total-count');
    const percentEl = document.getElementById('percent-display');
    const fillEl = document.getElementById('progress-fill');

    if (savedEl) savedEl.innerText = savedCount;
    if (totalEl) totalEl.innerText = total;
    if (percentEl) percentEl.innerText = percent + "%";
    if (fillEl) fillEl.style.width = percent + "%";
}

renderVerses();
updateProgress(); 


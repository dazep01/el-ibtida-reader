// ==========================================
// NOVEL READER - LOGIC ENGINE
// ==========================================

// === KONFIGURASI APLIKASI ===
const CONFIG = {
    JSONBIN_ID: window.NOVEL_APP_CONFIG?.JSONBIN_ID || '6951127043b1c97be909f7c1',
    JSONBIN_KEY: window.NOVEL_APP_CONFIG?.JSONBIN_KEY || null, 
    DATA_URL: window.NOVEL_APP_CONFIG?.DATA_URL || './data.json',
    APP_NAME: 'El-Ibtida Reader',
    DEFAULT_SETTINGS: { theme: 'auto' }
};

// --- INDEXEDDB SETUP ---
const DB_NAME = 'ElIbtidaReaderDB';
const DB_VERSION = 1;
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => {
        console.error("IndexedDB error:", e);
        reject("Gagal membuka database");
    };
    request.onsuccess = (e) => {
        resolve(e.target.result);
    };
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bookmarks')) {
            db.createObjectStore('bookmarks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('progress')) {
            db.createObjectStore('progress', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('highlights')) {
            db.createObjectStore('highlights', { keyPath: 'id' });
        }
    };
});

// === STATE MANAGEMENT ===
class AppState {
    constructor() {
        this.novelData = null;
        this.reviews = [];
        this.settings = { theme: 'auto' };
        this.currentChapter = 0;
        this.bookmarks = new Set();
        this.highlights = [];
        this.isInitialized = false;
        this.isLoading = false;
    }

    static getInstance() {
        if (!AppState.instance) {
            AppState.instance = new AppState();
        }
        return AppState.instance;
    }

    loadSettings() {
        const theme = localStorage.getItem('theme');
        if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.body.classList.add('dark-mode');
        }
    }
    
    saveSettings() {
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        localStorage.setItem('novel-reader-bookmarks', JSON.stringify(Array.from(this.bookmarks)));
    }
}

// === STORAGE MANAGER (IndexedDB) ===
const Storage = {
    getBookmarks: async () => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('bookmarks', 'readonly');
            const store = tx.objectStore('bookmarks');
            const request = store.getAll();
            return new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result.map(item => item.id));
                request.onerror = () => resolve([]);
            });
        } catch (error) {
            console.error("Error getBookmarks:", error);
            return [];
        }
    },

    toggleBookmark: async (bookId) => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('bookmarks', 'readwrite');
            const store = tx.objectStore('bookmarks');
            const getRequest = store.get(bookId);
            
            getRequest.onsuccess = async () => {
                if (getRequest.result) {
                    const deleteReq = store.delete(bookId);
                    deleteReq.onsuccess = () => {
                        toast.show('Dihapus dari Tersimpan', 'info');
                        uiController.renderChapters();
                    };
                } else {
                    const addReq = store.add({ id: bookId, timestamp: Date.now() });
                    addReq.onsuccess = () => {
                        toast.show('Ditambahkan ke Tersimpan', 'success');
                        uiController.renderChapters();
                    };
                }
            };
        } catch (error) {
            console.error("Error toggleBookmark:", error);
            toast.show('Gagal menyimpan bookmark', 'error');
        }
    },

    getProgress: async () => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('progress', 'readonly');
            const store = tx.objectStore('progress');
            const request = store.getAll();
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const progressObj = {};
                    request.result.forEach(item => {
                        progressObj[item.id] = item.data;
                    });
                    resolve(progressObj);
                };
                request.onerror = () => resolve({});
            });
        } catch (error) {
            console.error("Error getProgress:", error);
            return {};
        }
    },

    setProgress: async (bookId, chapterIndex) => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('progress', 'readwrite');
            const store = tx.objectStore('progress');
            const data = {
                id: bookId,
                data: { chapterIndex, lastRead: Date.now() }
            };
            store.put(data); 
        } catch (error) {
            console.error("Error setProgress:", error);
        }
    }
};

// === REVIEW SERVICE (JSONBin) ===
const reviewService = {
    fetchReviews: async () => {
        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}/latest`, {
                headers: CONFIG.JSONBIN_KEY ? { 'X-Master-Key': CONFIG.JSONBIN_KEY } : {}
            });
            if (!response.ok) throw new Error('Gagal mengambil ulasan');
            const data = await response.json();
            AppState.getInstance().reviews = Array.isArray(data.record) ? data.record : []; 
            uiController.renderReviews();
        } catch (error) {
            console.error("Error fetching reviews:", error);
            AppState.getInstance().reviews = []; 
            uiController.renderReviews();
        }
    },

    postReview: async (newReview) => {
        try {
            // 1. Get current data
            const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}/latest`, {
                headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }
            });
            const getData = await getResponse.json();
            let currentReviews = Array.isArray(getData.record) ? getData.record : [];

            // 2. Add new review
            currentReviews.unshift(newReview);

            // 3. Update
            const putResponse = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.JSONBIN_KEY
                },
                body: JSON.stringify(currentReviews)
            });

            if (!putResponse.ok) throw new Error('Gagal menyimpan ulasan');

            // 4. Update state
            AppState.getInstance().reviews = currentReviews;
            uiController.renderReviews();
            toast.show("Terima kasih! Ulasan berhasil dikirim.", "success");
            return true;
        } catch (error) {
            console.error(error);
            toast.show("Gagal mengirim ulasan.", "error");
            return false;
        }
    }
};

// === THEME MANAGER ===
const ThemeManager = {
    init: () => {
        ThemeManager.applyTheme();
        ThemeManager.setupListeners();
    },
    
    applyTheme: () => {
        const isDark = document.body.classList.contains('dark-mode');
        const icon = document.getElementById('theme-icon');
        const navIcon = document.getElementById('nav-theme-icon');
        if (isDark) {
            icon.className = 'ph-fill ph-sun text-lg text-yellow-400';
            navIcon.className = 'ph-fill ph-sun text-lg text-yellow-400';
        } else {
            icon.className = 'ph ph-moon text-lg';
            navIcon.className = 'ph ph-moon text-lg';
        }
    },

    toggleTheme: () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        ThemeManager.applyTheme();
        toast.show(document.body.classList.contains('dark-mode') ? "Mode Gelap Aktif" : "Mode Terang Aktif");
    },

    setupListeners: () => {
        document.getElementById('theme-toggle-btn').onclick = ThemeManager.toggleTheme;
        document.getElementById('nav-theme-btn').onclick = ThemeManager.toggleTheme;
    }
};

// === ROUTER ===
const router = {
    backToHome: () => {
        window.location.href = '../../';
    }
};

// === UI CONTROLLER ===
const uiController = {
    init: async () => {
        const data = AppState.getInstance().novelData;
        
        // 1. Pastikan data sudah dimuat
        if (!data) {
            console.warn("Data novel masih kosong/null");
            return;
        }

        // 2. Ambil element DOM
        const coverTitle = document.getElementById('cover-title');
        const detailTitle = document.getElementById('detail-title');
        const detailAuthor = document.getElementById('detail-author');
        const chapterCount = document.getElementById('chapter-count');
        const descElement = document.getElementById('detail-desc');
        const startReadingBtn = document.getElementById('start-reading-btn');
        
        // 3. Isi Metadata (Judul, Penulis, Cover)
        if (coverTitle) coverTitle.innerText = data.title.split('#')[0].trim();
        if (detailTitle) detailTitle.innerText = data.title;
        if (detailAuthor) detailAuthor.innerText = data.author;
        if (chapterCount) chapterCount.innerText = `${data.chapters.length} Bab`;
        
        // --- PERBAIKAN: Isi Sinopsis ---
        // Mencoba di beberapa kemungkinan key (description, synopsis, desc, sinopsis)
        const synopsisText = data.description || data.synopsis || data.desc || data.sinopsis || "Belum ada sinopsis.";
        
        if (descElement) {
            descElement.innerText = synopsisText;
            // Pastikan CSS line-clamp aktif saat load awal
            descElement.classList.add('line-clamp-3');
        }
        // ----------------------------------------

        // 4. Render Chapters & Reviews
        const bookmarksList = await Storage.getBookmarks();
        const progressData = await Storage.getProgress();

        uiController.renderChapters(bookmarksList, progressData);
        uiController.renderReviews();
        
        // 5. Event Listeners
        uiController.bindEvents();
    },

    renderChapters: async (bookmarksList = [], progressData = {}) => {
        const container = document.getElementById('chapter-list');
        const data = AppState.getInstance().novelData;
        if (!container || !data) return;

        container.innerHTML = '';

        if (data.chapters.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 dark:border-white/10 rounded-2xl">
                    <p class="font-bold">Belum ada bab</p>
                    <p class="text-xs">Cerita sedang dalam proses penulisan.</p>
                </div>
            `;
            return;
        }

        data.chapters.forEach((ch, i) => {
            const el = document.createElement('div');
            el.className = "flex items-center justify-between p-4 bg-white dark:bg-brand-paperDark rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm cursor-pointer active:scale-[0.98] transition-all duration-200 group hover:border-brand-slate/20";
            el.onclick = () => readerController.open(i);
            el.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full bg-brand-bg dark:bg-white/5 flex items-center justify-center text-brand-slate dark:text-brand-slateLight font-bold text-xs group-hover:bg-brand-slate group-hover:text-white transition-colors">
                        ${i+1}
                    </div>
                    <div class="flex flex-col">
                        <span class="font-serif font-bold text-sm text-brand-text dark:text-white truncate leading-tight">${ch.title}</span>
                        <span class="text-[10px] text-gray-400 mt-0.5">${ch.wordCount || 0} kata</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="bookmark-btn p-2 text-gray-400 hover:text-yellow-500 transition-colors ${bookmarksList.includes(i) ? 'text-yellow-500' : ''}"
                            data-index="${i}"
                            onclick="event.stopPropagation(); uiController.toggleBookmark(${i})">
                        <i class="ph ${bookmarksList.includes(i) ? 'ph-bookmark-simple-fill' : 'ph-bookmark-simple'} text-lg"></i>
                    </button>
                    <i class="ph ph-caret-right text-gray-300 dark:text-gray-600 group-hover:text-brand-slate transition-colors"></i>
                </div>
            `;
            container.appendChild(el);
        });
    },

    renderReviews: () => {
        const container = document.getElementById('reviews-container');
        const state = AppState.getInstance();
        if (!container) return;

        if (state.reviews.length === 0) {
            container.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-white/10">Belum ada ulasan.</p>`;
            document.getElementById('avg-rating').innerText = '0.0';
        } else {
            container.innerHTML = state.reviews.map(r => `
                <div class="bg-white dark:bg-brand-paperDark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex gap-3 transition-colors">
                    <div class="w-8 h-8 rounded-full bg-brand-slate/10 dark:bg-white/10 text-brand-slate dark:text-brand-slateLight flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-brand-slate/10 dark:border-white/5">
                        ${r.name ? r.name[0].toUpperCase() : '?'}
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-center mb-1">
                            <h5 class="text-xs font-bold text-brand-text dark:text-white">${r.name || 'Anonim'}</h5>
                            <div class="flex text-[10px] text-amber-400">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-book">"${r.comment}"</p>
                    </div>
                </div>
            `).join('');
            
            const avg = (state.reviews.reduce((a,b) => a + b.rating, 0) / state.reviews.length).toFixed(1);
            document.getElementById('avg-rating').innerText = avg;
        }
    },

    initStarInput: () => {
        const container = document.getElementById('star-input');
        if (!container) return;
        container.innerHTML = '';
        uiController.currentStarRating = 0;
        
        for(let i=1; i<=5; i++) {
            const star = document.createElement('i');
            star.className = `ph-fill ph-star text-2xl text-gray-200 dark:text-gray-600 cursor-pointer transition-colors duration-200 hover:text-amber-300`;
            star.dataset.v = i;
            star.onclick = () => {
                uiController.currentStarRating = i;
                uiController.updateStarDisplay();
            };
            container.appendChild(star);
        }
    },

    updateStarDisplay: () => {
        const stars = document.querySelectorAll('#star-input i');
        stars.forEach((star, i) => {
            if(i < uiController.currentStarRating) {
                star.classList.remove('text-gray-200', 'dark:text-gray-600');
                star.classList.add('text-amber-400');
            } else {
                star.classList.add('text-gray-200', 'dark:text-gray-600');
                star.classList.remove('text-amber-400');
            }
        });
    },

    toggleBookmark: async (index) => {
        await Storage.toggleBookmark(index);
    },

    openReviewModal: () => {
        const modal = document.getElementById('modal-review');
        const content = document.getElementById('modal-content');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('translate-y-full');
        }, 10);
    },

    closeReviewModal: () => {
        const modal = document.getElementById('modal-review');
        const content = document.getElementById('modal-content');
        modal.classList.add('opacity-0');
        content.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    },

    submitReview: async () => {
        const name = document.getElementById('input-name').value.trim();
        const comment = document.getElementById('input-comment').value.trim();
        
        if(uiController.currentStarRating === 0) { toast.show("Berikan rating bintang dulu ya!", "error"); return; }
        if(!comment) { toast.show("Ulasan tidak boleh kosong.", "error"); return; }

        const newReview = { 
            name: name || "Sahabat Kisah", 
            rating: uiController.currentStarRating, 
            comment: comment, 
            date: "Baru saja" 
        };
        
        const success = await reviewService.postReview(newReview);

        if(success) {
            uiController.closeReviewModal();
            document.getElementById('input-name').value = '';
            document.getElementById('input-comment').value = '';
            uiController.currentStarRating = 0;
            uiController.updateStarDisplay();
        }
    },
    
    toggleSynopsis: () => {
        const desc = document.getElementById('detail-desc');
        const btn = document.getElementById('btn-synopsis');
        if(!desc || !btn) return;

        if (desc.classList.contains('line-clamp-3')) {
            desc.classList.remove('line-clamp-3');
            btn.innerHTML = `Tutup <i class="ph-bold ph-caret-up"></i>`;
            // Optional: smooth scroll
            // desc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            desc.classList.add('line-clamp-3');
            btn.innerHTML = `Baca Selengkapnya <i class="ph-bold ph-caret-down"></i>`;
        }
    },

    bindEvents: () => {
        document.getElementById('btn-synopsis').onclick = uiController.toggleSynopsis;
        document.getElementById('open-review-btn').onclick = uiController.openReviewModal;
        document.getElementById('close-review-btn').onclick = uiController.closeReviewModal;
        document.getElementById('submit-review-btn').onclick = uiController.submitReview;
        document.getElementById('start-reading-btn').onclick = () => readerController.open(0);
        document.getElementById('start-fab-btn').onclick = () => readerController.open(0);
        document.getElementById('search-toggle').onclick = searchController.show;
        document.getElementById('share-btn').onclick = shareController.shareBook;
        document.getElementById('nav-toggle-btn').onclick = navMenu.toggle;
        document.getElementById('reader-back-btn').onclick = readerController.back;
    }
};

// === READER CONTROLLER ===
const readerController = {
    idx: 0,
    isUIHidden: false,
    
    open: (i) => {
        readerController.idx = i;
        readerController.render();
        const view = document.getElementById('view-reader');
        view.classList.remove('hidden');
        void view.offsetWidth; 
        view.classList.remove('translate-y-full');
        document.body.style.overflow = 'hidden';
    },
    
    back: () => {
        const view = document.getElementById('view-reader');
        view.classList.add('translate-y-full');
        setTimeout(() => {
            view.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    },
    
    render: () => {
        const ch = AppState.getInstance().novelData.chapters[readerController.idx];
        document.getElementById('reader-title').innerText = ch.title;
        document.getElementById('reader-nav-title').innerText = `BAB ${readerController.idx + 1}`;
        
        const readerBody = document.getElementById('reader-body');
        readerBody.innerHTML = ch.content;
        
        document.getElementById('btn-prev').disabled = readerController.idx === 0;
        document.getElementById('btn-next').disabled = readerController.idx === AppState.getInstance().novelData.chapters.length - 1;
        readerController.updateProgress();
        document.getElementById('reader-scroll').scrollTop = 0;
    },
    
    nav: (d) => { 
        if (readerController.idx + d >= 0 && readerController.idx + d < AppState.getInstance().novelData.chapters.length) {
            readerController.idx += d; 
            readerController.render();
        }
    },

    updateProgress: () => {
        const pct = ((readerController.idx+1)/AppState.getInstance().novelData.chapters.length)*100;
        document.getElementById('progress-bar').style.width = `${pct}%`;
        document.getElementById('mini-progress').style.width = `${pct}%`;
    },

    jumpToProgress: (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const targetIdx = Math.floor(pct * AppState.getInstance().novelData.chapters.length);
        if(targetIdx >= 0 && targetIdx < AppState.getInstance().novelData.chapters.length) {
            readerController.idx = targetIdx;
            readerController.render();
        }
    },

    toggleUI: () => {
        readerController.isUIHidden = !readerController.isUIHidden;
        const top = document.getElementById('reader-top');
        const bottom = document.getElementById('reader-bottom');
        if(readerController.isUIHidden) {
            top.classList.add('reader-hidden');
            bottom.classList.add('reader-hidden');
        } else {
            top.classList.remove('reader-hidden');
            bottom.classList.remove('reader-hidden');
        }
    },
    
    toggleSettings: () => {
        const panel = document.getElementById('settings-panel');
        if(panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            setTimeout(() => {
                panel.classList.remove('opacity-0', 'translate-y-4');
            }, 10);
        } else {
            panel.classList.add('opacity-0', 'translate-y-4');
            setTimeout(() => panel.classList.add('hidden'), 300);
        }
    }
};

// === SEARCH CONTROLLER ===
const searchController = {
    results: [],
    currentQuery: '',
    
    show: () => {
        const modal = document.getElementById('search-modal');
        const content = document.getElementById('search-modal-content');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('-translate-y-full');
            document.getElementById('search-input').focus();
        }, 10);
    },
    
    hide: () => {
        const modal = document.getElementById('search-modal');
        const content = document.getElementById('search-modal-content');
        modal.classList.add('opacity-0');
        content.classList.add('-translate-y-full');
        setTimeout(() => {
            modal.classList.add('hidden');
            searchController.clearResults();
        }, 300);
    },
    
    perform: (query) => {
        searchController.currentQuery = query.trim().toLowerCase();
        if (!searchController.currentQuery) { searchController.clearResults(); return; }
        
        searchController.results = [];
        AppState.getInstance().novelData.chapters.forEach((chapter, chapterIndex) => {
            const textContent = chapter.content.replace(/<[^>]*>/g, ' ').toLowerCase();
            let matchIndex = textContent.indexOf(searchController.currentQuery);
            
            while (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(textContent.length, matchIndex + searchController.currentQuery.length + 100);
                const context = textContent.substring(start, end);
                const highlighted = context.replace(
                    new RegExp(searchController.currentQuery, 'gi'),
                    match => `<mark class="bg-yellow-200 dark:bg-yellow-900 text-black dark:text-yellow-100 px-1 rounded">${match}</mark>`
                );
                
                searchController.results.push({ chapterIndex, chapterTitle: chapter.title, context: highlighted });
                matchIndex = textContent.indexOf(searchController.currentQuery, matchIndex + 1);
            }
        });
        
        searchController.renderResults();
    },
    
    renderResults: () => {
        const container = document.getElementById('search-results');
        const countElement = document.getElementById('search-count');
        
        if (searchController.results.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">Tidak ditemukan</div>`;
            countElement.textContent = '0 hasil';
            return;
        }
        
        container.innerHTML = searchController.results.map((r, i) => `
            <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10"
                 onclick="searchController.openResult(${r.chapterIndex})">
                <div class="text-xs font-bold text-brand-text mb-1">${r.chapterTitle}</div>
                <div class="text-xs text-gray-600 dark:text-gray-300">...${r.context}...</div>
            </div>
        `).join('');
        
        countElement.textContent = `${searchController.results.length} hasil`;
    },

    openResult: (idx) => {
        searchController.hide();
        readerController.open(idx);
    },

    clearResults: () => {
        searchController.results = [];
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('search-count').textContent = '0 hasil';
        document.getElementById('search-input').value = '';
    }
};

// === NAV MENU CONTROLLER ===
function toggleNav() {
    const nav = document.getElementById('floating-nav');
    const toggle = document.getElementById('nav-toggle-btn');
    
    if(nav.classList.contains('hidden-popover')) {
        nav.classList.remove('hidden-popover');
        nav.classList.add('visible-popover');
        
        if (navClickListener) document.removeEventListener('click', navClickListener);
        
        navClickListener = function(e) {
            if (!nav.contains(e.target) && !toggle.contains(e.target)) {
                nav.classList.remove('visible-popover');
                nav.classList.add('hidden-popover');
                document.removeEventListener('click', navClickListener);
                navClickListener = null;
            }
        };
        
        setTimeout(() => document.addEventListener('click', navClickListener), 10);
    } else {
        nav.classList.remove('visible-popover');
        nav.classList.add('hidden-popover');
        if (navClickListener) {
            document.removeEventListener('click', navClickListener);
            navClickListener = null;
        }
    }
}

// === ENHANCED SHARE ===
const shareController = {
    shareBook: async () => {
        const shareData = {
            title: AppState.getInstance().novelData.title,
            text: `Baca "${AppState.getInstance().novelData.title}" karya ${AppState.getInstance().novelData.author}`,
            url: window.location.href
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch (err) {}
        } else {
            navigator.clipboard.writeText(`${shareData.text} - ${shareData.url}`);
            toast.show('Link berhasil disalin!', 'success');
        }
    },
    
    shareQuote: async (text) => {
        if (navigator.share) {
            try { await navigator.share({ title: 'Kutipan', text: `"${text}" - ${AppState.getInstance().novelData.title}` }); } catch (e) {}
        } else {
            navigator.clipboard.writeText(text);
            toast.show('Kutipan disalin', 'success');
        }
    }
};

// === TEXT HIGHLIGHTER ===
class TextHighlighter {
    constructor() {
        this.selection = null;
        this.toolbar = null;
        this.init();
    }
    
    init() {
        document.addEventListener('mouseup', (e) => this.handleSelection(e));
        document.addEventListener('touchend', (e) => this.handleSelection(e));
        document.addEventListener('mousedown', (e) => {
            if (this.toolbar && !this.toolbar.contains(e.target)) this.removeToolbar();
        });
    }
    
    handleSelection(e) {
        if (e.target.closest('.reader-ui') || e.target.closest('.selection-toolbar')) return;
        
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 0 && selectedText.length < 500) {
            this.selection = selection;
            this.showToolbar(e);
        } else {
            this.removeToolbar();
        }
    }
    
    showToolbar(e) {
        this.removeToolbar();
        
        const range = this.selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Fix positioning
        const toolbarWidth = 300; 
        let top = rect.top + window.scrollY - 60;
        let left = rect.left + window.scrollX + (rect.width / 2) - (toolbarWidth / 2);
        
        if (left < 10) left = 10;
        if (left + toolbarWidth > window.innerWidth - 10) left = window.innerWidth - toolbarWidth - 10;
        if (top < 10) top = rect.bottom + window.scrollY + 10;

        const toolbar = document.createElement('div');
        toolbar.className = 'selection-toolbar';
        toolbar.style.left = `${left}px`;
        toolbar.style.top = `${top}px`;
        
        toolbar.innerHTML = `
            <button onclick="textHighlighter.copyText()" title="Salin"><i class="ph ph-copy-simple"></i></button>
            <button onclick="textHighlighter.shareQuote()" title="Bagikan"><i class="ph ph-share-network"></i></button>
            <div class="selection-toolbar-divider"></div>
            <button onclick="textHighlighter.highlight('yellow')" title="Kuning" style="color:#FFD700"><i class="ph ph-highlight"></i></button>
            <button onclick="textHighlighter.removeToolbar()"><i class="ph ph-x"></i></button>
        `;
        
        document.body.appendChild(toolbar);
        this.toolbar = toolbar;
    }
    
    removeToolbar() {
        if (this.toolbar) { this.toolbar.remove(); this.toolbar = null; }
        this.selection = null;
    }
    
    copyText() {
        navigator.clipboard.writeText(window.getSelection().toString());
        toast.show('Teks disalin', 'success');
        this.removeToolbar();
    }
    shareQuote() {
        shareController.shareQuote(window.getSelection().toString());
        this.removeToolbar();
    }
    highlight(color) {
        toast.show('Highlight disimpan', 'success');
        this.removeToolbar();
    }
}

const textHighlighter = new TextHighlighter();

// === TOAST ===
const toast = {
    show: (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        container.innerHTML = ''; 
        
        const el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'polite');
        
        let icon = '';
        switch(type) {
            case 'success': icon = '<i class="ph-fill ph-check-circle text-green-400 text-lg"></i>'; break;
            case 'error': icon = '<i class="ph-fill ph-warning-circle text-red-400 text-lg"></i>'; break;
            default: icon = '<i class="ph-fill ph-info text-blue-400 text-lg"></i>';
        }
        
        el.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(el);
        
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-20px)';
            setTimeout(() => el.remove(), 300);
        }, 3000);
        
        el.onclick = () => el.remove();
    },
    clearAll: () => document.getElementById('toast-container').innerHTML = ''
};

// === PWA INSTALLER ===
class PWAInstall {
    constructor() {
        this.deferredPrompt = null;
        this.installButton = null;
        this.init();
    }
    
    init() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
        });
        
        window.addEventListener('appinstalled', () => {
            toast.show('✅ Aplikasi terinstal!', 'success');
            this.hideInstallButton();
        });
    }
    
    showInstallButton() {
        if(!document.getElementById('floating-nav')) return;
        const nav = document.getElementById('floating-nav');
        if(nav.querySelector('.install-pwa-btn')) return;
        
        const installBtn = document.createElement('button');
        installBtn.className = 'install-pwa-btn w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors';
        installBtn.innerHTML = '<i class="ph ph-download-simple text-lg"></i> Install Aplikasi';
        installBtn.onclick = (e) => { e.stopPropagation(); this.promptInstall(); toggleNav(); };
        
        const container = nav.querySelector('.py-2');
        if(container) container.insertBefore(installBtn, container.firstChild);
        
        this.installButton = installBtn;
        toast.show('📱 Tersedia Install Aplikasi');
    }
    
    async promptInstall() {
        if (!this.deferredPrompt) return;
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;
        this.hideInstallButton();
    }
    
    hideInstallButton() {
        if (this.installButton) { this.installButton.remove(); this.installButton = null; }
    }
}

let pwaInstaller = new PWAInstall();

// === CLEANUP ===
function cleanupModals() {
    toast.clearAll();
    const nav = document.getElementById('floating-nav');
    if(nav) {
        nav.classList.remove('visible-popover');
        nav.classList.add('hidden-popover');
    }
    const reviewModal = document.getElementById('modal-review');
    if(reviewModal && !reviewModal.classList.contains('hidden')) {
        uiController.closeReviewModal();
    }
    const searchModal = document.getElementById('search-modal');
    if(searchModal && !searchModal.classList.contains('hidden')) {
        searchController.hide();
    }
    
    // Highlighters cleanup
    if(textHighlighter.toolbar) {
        textHighlighter.toolbar.remove();
        textHighlighter.toolbar = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cleanupModals();
        readerController.isUIHidden = false;
        document.getElementById('reader-top').classList.remove('reader-hidden');
        document.getElementById('reader-bottom').classList.remove('reader-hidden');
    }
});

// === EVENT BINDER & SAFETY CHECK ===
const EventBinder = {
    // Daftar mapping: ID HTML -> Fungsi Handler
    map: {
        // --- NAVIGATION & HEADER ---
        'theme-toggle-btn': ThemeManager.toggleTheme,
        'nav-theme-btn': ThemeManager.toggleTheme,
        'search-toggle': searchController.show,
        'search-close-btn': searchController.hide,
        'search-backdrop': searchController.hide,
        'nav-toggle-btn': navMenu.toggle,
        'share-btn': shareController.shareBook,
        
        // --- DETAIL PAGE ---
        'btn-synopsis': uiController.toggleSynopsis,
        'btn-bookmark': () => uiController.toggleBookmark(uiController.state?.currentChapter), // Contextual
        'start-reading-btn': () => ReaderController.open(0),
        'start-fab-btn': () => ReaderController.open(0),
        'open-review-btn': uiController.openReviewModal,
        'close-review-btn': uiController.closeReviewModal,
        'review-backdrop': uiController.closeReviewModal,
        'submit-review-btn': uiController.submitReview,
        
        // --- READER ---
        'reader-back-btn': ReaderController.close,
        'btn-prev': () => ReaderController.nav(-1),
        'btn-next': () => ReaderController.nav(1),
        'reader-progress-container': (e) => ReaderController.jumpToProgress(e),
        'reader-scroll': ReaderController.toggleUI, // Tap body to toggle UI
        'reader-settings-btn': ReaderController.toggleSettings,
        'close-settings-btn': ReaderController.toggleSettings
    },

    init: () => {
        console.group('🛡️ Safety Check: Memeriksa Tombol (Event Listeners)');
        
        let successCount = 0;
        let failCount = 0;

        for (const [id, handler] of Object.entries(this.map)) {
            const el = document.getElementById(id);
            
            if (el) {
                // Khusus untuk input (live search)
                if (id === 'search-input') {
                    el.oninput = handler;
                    el.classList.add('focus:ring-2'); // Visual feedback
                    console.log(`✅ [INPUT] #${id} terdeteksi & diaktifkan.`);
                } else {
                    // Biasakan tombol
                    el.onclick = (e) => {
                        handler(e); // Panggil handler
                        if (el.tagName !== 'A') e.preventDefault(); // Mencegah double fire jika perlu
                    };
                    // Tambah kursor pointer untuk memastikan UI
                    el.classList.add('cursor-pointer');
                    console.log(`✅ [BUTTON] #${id} terdeteksi & klik aktif.`);
                }
                successCount++;
            } else {
                console.warn(`❌ Elemen HTML ID #${id} TIDAK DITEMUKAN! Cek HTML Anda.`);
                failCount++;
            }
        }

        console.log(`📊 Hasil: ${successCount} Aktif | ${failCount} Gagal`);
        console.groupEnd();
        
        return { total: successCount + failCount, failed: failCount };
    }
};

// === MAIN INITIALIZATION ===
// === MAIN INITIALIZATION ===
async function initApp() {
    try {
        // 1. Load Preferences
        AppState.getInstance().loadSettings();
        ThemeManager.init();

        // 2. Load Novel Data
        toast.show("Memuat data...", "info");
        const response = await fetch(CONFIG.DATA_URL);
        if (!response.ok) throw new Error(CONFIG.ERRORS.DATA_LOAD);
        
        const novelData = await response.json();
        AppState.getInstance().novelData = novelData;

        // 3. Load Reviews
        await reviewService.fetchReviews();

        // 4. === PERBAIKAN PENTING ===
        // Inisialisasi UI DAN Event Listeners
        uiController.init(); 

        // === RUN SAFETY CHECK ===
        // Ini akan otomatis memasangkan listener ke semua tombol di daftar EventBinder
        // DAN mengecek apakah tombol tersebut ada di HTML
        const checkResult = EventBinder.init();
        
        if (checkResult.failed > 0) {
            toast.show(`Peringatan: ${checkResult.failed} tombol gagal. Cek Console (F12).`, 'error');
        }

        // 5. Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(() => {
                console.log('Service Worker registered');
            }).catch(error => {
                console.log('SW registration failed:', error);
            });
        }

        // 6. Setup global error handling
        this.setupErrorHandling();
        
        // 7. Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        toast.show("Aplikasi siap dibaca!", "success");

    } catch (error) {
        console.error("Init Error:", error);
        toast.show("Gagal memuat aplikasi.", "error");
    }
}

// Start
document.addEventListener('DOMContentLoaded', initApp);

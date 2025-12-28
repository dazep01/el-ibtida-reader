// ==========================================
// NOVEL READER - LOGIC ENGINE
// ==========================================

// === KONFIGURASI APLIKASI ===
const CONFIG = {
    // Mengambil config dari window (jika ada) atau pakai default
    JSONBIN_ID: window.NOVEL_APP_CONFIG?.JSONBIN_ID || '6951127043b1c97be909f7c1', 
    JSONBIN_KEY: window.NOVEL_APP_CONFIG?.JSONBIN_KEY || null, 
    DATA_URL: window.NOVEL_APP_CONFIG?.DATA_URL || './data.json', // Mengambil dari URL parameter config
    APP_NAME: 'El-Ibtida Reader',
    ERRORS: {
        NETWORK: 'Koneksi jaringan bermasalah.',
        DATA_LOAD: 'Gagal memuat data novel.',
        REVIEW_LOAD: 'Gagal memuat ulasan.',
        REVIEW_SUBMIT: 'Gagal mengirim ulasan.'
    }
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
                        uiController.renderChapters(); // Update UI
                    };
                } else {
                    const addReq = store.add({ id: bookId, timestamp: Date.now() });
                    addReq.onsuccess = () => {
                        toast.show('Ditambahkan ke Tersimpan', 'success');
                        uiController.renderChapters(); // Update UI
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
            console.error('Error fetching reviews:', error);
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
        window.location.href = '../'; // Aman kembali ke library
    }
};

// === UI CONTROLLER ===
const uiController = {
    init: async () => {
        if (!AppState.getInstance().novelData) return;

        const data = AppState.getInstance().novelData;
        
        // Elements
        const coverTitle = document.getElementById('cover-title');
        const detailTitle = document.getElementById('detail-title');
        const detailAuthor = document.getElementById('detail-author');
        const chapterCount = document.getElementById('chapter-count');
        const startReadingBtn = document.getElementById('start-reading-btn');
        
        if (coverTitle) coverTitle.innerText = data.title.split('#')[0].trim();
        if (detailTitle) detailTitle.innerText = data.title;
        if (detailAuthor) detailAuthor.innerText = data.author;
        if (chapterCount) chapterCount.innerText = `${data.chapters.length} Bab`;

        const bookmarksList = await Storage.getBookmarks();
        const progressData = await Storage.getProgress();

        // List Chapters
        uiController.renderChapters(bookmarksList, progressData);

        // Reviews
        uiController.renderReviews();
        
        // Event Listeners
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
                    <p class="text-xs">Cerita sedang dalam proses penulisan. Nantikan update terbarunya!</p>
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
                        <span class="font-serif font-bold text-sm text-brand-text dark:text-white leading-tight">${ch.title}</span>
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
        let selectedRating = 0;
        
        for(let i=1; i<=5; i++) {
            const star = document.createElement('i');
            star.className = `ph-fill ph-star text-2xl text-gray-200 dark:text-gray-600 cursor-pointer transition-colors duration-200 hover:text-amber-300`;
            star.dataset.v = i;
            star.onclick = () => {
                selectedRating = i;
                uiController.updateStarDisplay(selectedRating);
            };
            container.appendChild(star);
        }
        
        return {
            getRating: () => selectedRating,
            reset: () => { selectedRating = 0; uiController.updateStarDisplay(0); }
        };
    },

    updateStarDisplay: (rating) => {
        const stars = document.querySelectorAll('#star-input i');
        stars.forEach((star, i) => {
            if(i < rating) {
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
    },

    toggleSynopsis: () => {
        const desc = document.getElementById('detail-desc');
        const btn = document.getElementById('btn-synopsis');
        if (desc.classList.contains('line-clamp-3')) {
            desc.classList.remove('line-clamp-3');
            btn.innerHTML = `Tutup <i class="ph-bold ph-caret-up"></i>`;
            desc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            desc.classList.add('line-clamp-3');
            btn.innerHTML = `Baca Selengkapnya <i class="ph-bold ph-caret-down"></i>`;
        }
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
        const starManager = uiController.initStarInput();
        const name = document.getElementById('input-name').value.trim();
        const comment = document.getElementById('input-comment').value.trim();
        
        if(starManager.getRating() === 0) { toast.show("Berikan rating bintang dulu ya!", "error"); return; }
        if(!comment) { toast.show("Ulasan tidak boleh kosong.", "error"); return; }

        const newReview = { 
            name: name || "Sahabat Kisah", 
            rating: starManager.getRating(), 
            comment: comment, 
            date: "Baru saja" 
        };
        
        const success = await reviewService.postReview(newReview);

        if(success) {
            uiController.closeReviewModal();
            document.getElementById('input-name').value = '';
            document.getElementById('input-comment').value = '';
            starManager.reset();
        }
    }
};

// === READER CONTROLLER ===
const readerController = {
    open: (i) => {
        const data = AppState.getInstance().novelData;
        if (!data || !data.chapters[i]) return;
        
        readerController.idx = i;
        readerController.render();
        
        const view = document.getElementById('view-reader');
        view.classList.remove('hidden');
        void view.offsetWidth; 
        view.classList.remove('translate-y-full');
        document.body.style.overflow = 'hidden';
        
        // Simpan progress
        Storage.setProgress(data.id, i);
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
        const max = AppState.getInstance().novelData.chapters.length;
        if (readerController.idx + d >= 0 && readerController.idx + d < max) {
            readerController.idx += d; 
            readerController.render();
        }
    },

    updateProgress: () => {
        const max = AppState.getInstance().novelData.chapters.length;
        if (max === 0) return;
        const pct = ((readerController.idx+1)/max)*100;
        document.getElementById('progress-bar').style.width = `${pct}%`;
        document.getElementById('mini-progress').style.width = `${pct}%`;
    },

    jumpToProgress: (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const max = AppState.getInstance().novelData.chapters.length;
        const targetIdx = Math.floor(pct * max);
        if(targetIdx >= 0 && targetIdx < max) {
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
        const data = AppState.getInstance().novelData;
        if(!data || data.chapters.length === 0) return;
        
        const queryTrim = query.trim().toLowerCase();
        if (!queryTrim) { searchController.clearResults(); return; }
        
        searchController.results = [];
        data.chapters.forEach((chapter, index) => {
            const textContent = chapter.content.replace(/<[^>]*>/g, ' ').toLowerCase();
            const matchIndex = textContent.indexOf(queryTrim);
            
            if (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(textContent.length, matchIndex + queryTrim.length + 100);
                const context = textContent.substring(start, end);
                const highlighted = context.replace(
                    new RegExp(queryTrim, 'gi'),
                    match => `<mark class="bg-yellow-200 dark:bg-yellow-900 text-black dark:text-yellow-100 px-1 rounded">${match}</mark>`
                );
                
                searchController.results.push({ index, chapterTitle: chapter.title, context: highlighted });
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
        
        container.innerHTML = searchController.results.map(r => `
            <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10"
                 onclick="searchController.openResult(${r.index})">
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
const navMenu = {
    toggle: () => {
        const nav = document.getElementById('floating-nav');
        const toggle = document.getElementById('nav-toggle-btn');
        
        if(nav.classList.contains('hidden-popover')) {
            nav.classList.remove('hidden-popover');
            nav.classList.add('visible-popover');
            
            if (navMenu.clickListener) document.removeEventListener('click', navMenu.clickListener);
            
            navMenu.clickListener = function(e) {
                if (!nav.contains(e.target) && !toggle.contains(e.target)) {
                    nav.classList.remove('visible-popover');
                    nav.classList.add('hidden-popover');
                    document.removeEventListener('click', navMenu.clickListener);
                    navMenu.clickListener = null;
                }
            };
            
            setTimeout(() => document.addEventListener('click', navMenu.clickListener), 10);
        } else {
            nav.classList.remove('visible-popover');
            nav.classList.add('hidden-popover');
            if (navMenu.clickListener) {
                document.removeEventListener('click', navMenu.clickListener);
                navMenu.clickListener = null;
            }
        }
    }
};

// === SHARE CONTROLLER ===
const shareController = {
    shareBook: async () => {
        const data = AppState.getInstance().novelData;
        if (!data) return;

        const shareData = {
            title: data.title,
            text: `Baca "${data.title}" karya ${data.author}`,
            url: window.location.href
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch (err) {}
        } else {
            navigator.clipboard.writeText(`${shareData.text} - ${shareData.url}`);
            toast.show('Link berhasil disalin!', 'success');
        }
    }
};

// === TOAST SYSTEM ===
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
    }
};

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

        // 4. Init UI
        uiController.init();

        // 5. Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW Fail', e));
        }

        toast.show("Siap membaca!", "success");

    } catch (error) {
        console.error("Init Error:", error);
        toast.show("Gagal memuat aplikasi.", "error");
    }
}

// Jalankan aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', initApp);

// ==========================================
// NOVEL READER - LOGIC ENGINE (Self Revision)
// ==========================================

// REVISED: SECURITY HELPER
// Mencegah XSS pada konten user-generated (ulasan).
// Tidak digunakan pada konten novel karena novel butuh formatting HTML.
const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
};


// === KONFIGURASI APLIKASI ===
const CONFIG = {
    JSONBIN_ID: window.NOVEL_APP_CONFIG?.JSONBIN_ID || '6951127043b1c97be909f7c1',
    JSONBIN_KEY: window.NOVEL_APP_CONFIG?.JSONBIN_KEY || null, 
    DATA_URL: window.NOVEL_APP_CONFIG?.DATA_URL || './data.json',
    APP_NAME: 'El-Ibtida Reader',
    ERRORS: {
        NETWORK: 'Koneksi jaringan bermasalah.',
        DATA_LOAD: 'Gagal memuat data novel.'
    }
};

// --- INDEXEDDB SETUP ---
const DB_NAME = 'ElIbtidaReaderDB';
const DB_VERSION = 1;
// REVISED: DOCUMENTATION
// Schema MVP: Menggunakan keyPath sederhana ('id') tanpa index kompleks.
// Belum ada strategi migrasi versi (migration path) untuk fase ini.
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => {
        console.error("IndexedDB error:", e);
        reject("Gagal membuka database");
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('highlights')) db.createObjectStore('highlights', { keyPath: 'id' });
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
        // REVISED: STATE CONSISTENCY
        // Dihapus: this.highlights = []; 
        // Alasan: Menghindari dual source of truth. Source utama adalah IndexedDB.
    }

    static getInstance() {
        if (!AppState.instance) AppState.instance = new AppState();
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
                    store.delete(bookId).onsuccess = () => {
                        toast.show('Dihapus dari Tersimpan', 'info');
                        uiController.renderChapters();
                    };
                } else {
                    store.add({ id: bookId, timestamp: Date.now() }).onsuccess = () => {
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
                    request.result.forEach(item => progressObj[item.id] = item.data);
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
            store.put({ id: bookId, data: { chapterIndex, lastRead: Date.now() } });
        } catch (error) {
            console.error("Error setProgress:", error);
        }
    }
    
    // === HIGHLIGHT STORAGE ===
     getHighlight: async (key) => {
         try {
             const db = await dbPromise;
             const tx = db.transaction('highlights', 'readonly');
             const store = tx.objectStore('highlights');
             const req = store.get(key);
             return new Promise(resolve => {
                 req.onsuccess = () => resolve(req.result || null);
                 req.onerror = () => resolve(null);
             });
         } catch {
             return null;
         }
     },
     
     setHighlight: async (key, content) => {
         try {
             // REVISED: TECHNICAL DECISION
             // Menyimpan full HTML string daripada koordinat range/offset.
             // Alasan: DOM novel statis & sederhana. Menyimpan HTML lebih robust terhadap 
             // perubahan styling minor dibanding range offset yang rapuh (brittle).
             const db = await dbPromise;
             const tx = db.transaction('highlights', 'readwrite');
             tx.objectStore('highlights').put({
                 id: key,
                 content,
                 updatedAt: Date.now()
             });
         } catch (e) {
             console.error('Save highlight failed', e);
         }
     }
};

// === REVIEW SERVICE (JSONBin) ===
const reviewService = {
    // REVISED: SERVICE ARCHITECTURE
    // Menggunakan JSONBin sebagai backend sementara (NoSQL-like).
    // Trade-off: Rate limit & tidak ada validasi server-side yang ketat (hanya client-side).
    
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
            // REVISED: LOGIC FIX (SINGLE READ)
            // Sebelumnya memanggil .json() dua kali yang menyebabkan crash/error stream.
            // Sekarang membaca sekali, simpan ke variabel, baru proses.
            const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}/latest`, {
                headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }
            });
            
            if (!getResponse.ok) throw new Error('Gagal mengambil data lama');

            const data = await getResponse.json(); // Single read point
            const currentReviews = Array.isArray(data.record) ? data.record : [];
            
            // Update state lokal
            currentReviews.unshift(newReview);

            // PUT Request
            const putResponse = await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.JSONBIN_KEY
                },
                body: JSON.stringify(currentReviews)
            });

            if (!putResponse.ok) throw new Error('Gagal menyimpan ulasan');

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
    init() {
        this.applyTheme();
        // Event listeners di-handle oleh EventBinder
    },
    
    applyTheme() {
        const isDark = document.body.classList.contains('dark-mode');
        const icon = document.getElementById('theme-icon');
        const navIcon = document.getElementById('nav-theme-icon');
        if (icon && navIcon) {
            if (isDark) {
                icon.className = 'ph-fill ph-sun text-lg text-yellow-400';
                navIcon.className = 'ph-fill ph-sun text-lg text-yellow-400';
            } else {
                icon.className = 'ph ph-moon text-lg';
                navIcon.className = 'ph ph-moon text-lg';
            }
        }
    },

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        ThemeManager.applyTheme();
        toast.show(document.body.classList.contains('dark-mode') ? "Mode Gelap Aktif" : "Mode Terang Aktif");
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
    currentStarRating: 0,
    isSynopsisExpanded: false,

    async init() {
        const data = AppState.getInstance().novelData;
        if (!data) {
            console.warn("Data novel masih kosong/null");
            return;
        }

        // Render Metadata
        const coverTitle = document.getElementById('cover-title');
        const detailTitle = document.getElementById('detail-title');
        const detailAuthor = document.getElementById('detail-author');
        const chapterCount = document.getElementById('chapter-count');
        const descElement = document.getElementById('detail-desc');
        
        if (coverTitle) coverTitle.innerText = data.title.split('#')[0].trim();
        if (detailTitle) detailTitle.innerText = data.title;
        if (detailAuthor) detailAuthor.innerText = data.author;
        if (chapterCount) chapterCount.innerText = `${data.chapters.length} Bab`;

        // Render Synopsis dengan fallback multi-key
        const synopsisText = data.description || data.synopsis || data.desc || data.sinopsis || "Sinopsis belum ditulis.";
        if (descElement) {
            descElement.innerText = synopsisText;
            descElement.classList.add('line-clamp-3');
        }

        // Load data & render
        await uiController.renderChapters();
        uiController.renderReviews();
        uiController.initStarInput();
    },

    async renderChapters() {
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

        const bookmarksList = await Storage.getBookmarks();
        const progressData = await Storage.getProgress();

        data.chapters.forEach((ch, i) => {
            const el = document.createElement('div');
            el.className = "flex items-center justify-between p-4 bg-white dark:bg-brand-paperDark rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm cursor-pointer active:scale-[0.98] transition-all duration-200 group hover:border-brand-slate/20";
            el.onclick = () => readerController.open(i);
            
            const isBookmarked = bookmarksList.includes(i);
            el.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium text-sm group-hover:bg-brand-slate group-hover:text-white transition-colors flex-shrink-0">
                        ${i+1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-medium text-sm text-gray-800 dark:text-white truncate">${ch.title}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${ch.wordCount || 0} kata</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="bookmark-btn p-2 text-gray-400 hover:text-yellow-500 transition-colors ${isBookmarked ? 'text-yellow-500' : ''}"
                            data-index="${i}"
                            onclick="event.stopPropagation(); uiController.toggleBookmark(${i})">
                        <i class="ph ${isBookmarked ? 'ph-bookmark-simple-fill' : 'ph-bookmark-simple'} text-lg"></i>
                    </button>
                    <i class="ph ph-caret-right text-gray-300 dark:text-gray-600 group-hover:text-brand-slate transition-colors"></i>
                </div>
            `;
            container.appendChild(el);
        });
    },

    renderReviews() {
        const container = document.getElementById('reviews-container');
        const state = AppState.getInstance();
        if (!container) return;

        if (state.reviews.length === 0) {
            container.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-white/10">Belum ada ulasan.</p>`;
            const avgElement = document.getElementById('avg-rating');
            if (avgElement) avgElement.innerText = '0.0';
        } else {
            // REVISED: SECURITY BOUNDARY
            // Menggunakan escapeHTML() untuk membersihkan input user sebelum render.
            // Mencegah potensi XSS injection via nama atau komentar.
            container.innerHTML = state.reviews.map(r => `
                <div class="bg-white dark:bg-brand-paperDark p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex gap-3 transition-colors">
                    <div class="w-8 h-8 rounded-full bg-brand-slate/10 dark:bg-white/10 text-brand-slate dark:text-brand-slateLight flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-brand-slate/10 dark:border-white/5">
                        ${r.name ? escapeHTML(r.name)[0].toUpperCase() : '?'}
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-center mb-1">
                            <h5 class="text-xs font-bold text-brand-text dark:text-white">${escapeHTML(r.name || 'Anonim')}</h5>
                            <div class="flex text-[10px] text-amber-400">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-book">"${escapeHTML(r.comment)}"</p>
                    </div>
                </div>
            `).join('');
            
            const avg = (state.reviews.reduce((a,b) => a + b.rating, 0) / state.reviews.length).toFixed(1);
            const avgElement = document.getElementById('avg-rating');
            if (avgElement) avgElement.innerText = avg;
        }
    },


    initStarInput() {
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

    updateStarDisplay() {
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

    async toggleBookmark(index) {
        await Storage.toggleBookmark(index);
    },

    openReviewModal() {
        const modal = document.getElementById('modal-review');
        const content = document.getElementById('modal-content');
        if (modal && content) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('translate-y-full');
                document.body.style.overflow = 'hidden';
            }, 10);
        }
    },

    closeReviewModal() {
        const modal = document.getElementById('modal-review');
        const content = document.getElementById('modal-content');
        if (modal && content) {
            modal.classList.add('opacity-0');
            content.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }
    },

    async submitReview() {
        const nameInput = document.getElementById('input-name');
        const commentInput = document.getElementById('input-comment');
        
        const name = (nameInput?.value || '').trim();
        const comment = (commentInput?.value || '').trim();
        
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
            if(nameInput) nameInput.value = '';
            if(commentInput) commentInput.value = '';
            uiController.currentStarRating = 0;
            uiController.updateStarDisplay();
        }
    },
    
    toggleSynopsis() {
        const desc = document.getElementById('detail-desc');
        const btn = document.getElementById('btn-synopsis');
        if(!desc || !btn) return;
        
        uiController.isSynopsisExpanded = !uiController.isSynopsisExpanded;
        
        if (uiController.isSynopsisExpanded) {
            desc.classList.remove('line-clamp-3');
            btn.innerHTML = `Tutup <i class="ph-bold ph-caret-up"></i>`;
        } else {
            desc.classList.add('line-clamp-3');
            btn.innerHTML = `Baca Selengkapnya <i class="ph-bold ph-caret-down"></i>`;
        }
    }
};

// === READER CONTROLLER ===
const readerController = {
    idx: 0,
    isUIHidden: false,
    
    open(i) {
        const data = AppState.getInstance().novelData;
        if (!data || !data.chapters[i]) return;
        
        readerController.idx = i;
        readerController.render();
        
        // Simpan progress
        Storage.setProgress(data.id, i);
        
        const view = document.getElementById('view-reader');
        if(view) {
            view.classList.remove('hidden');
            // Force reflow untuk animasi smooth
            void view.offsetWidth;
            view.classList.remove('translate-y-full');
            document.body.style.overflow = 'hidden';
        }
    },
    
    back() {
        const view = document.getElementById('view-reader');
        if(view) {
            view.classList.add('translate-y-full');
            setTimeout(() => {
                view.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }
    },
    
    render() {
        // REVISED: RACE CONDITION GUARD
        // Menyimpan snapshot index saat fungsi dipanggil.
        const currentRenderIndex = readerController.idx;

        const ch = AppState.getInstance().novelData.chapters[readerController.idx];
        const titleEl = document.getElementById('reader-title');
        const navTitleEl = document.getElementById('reader-nav-title');
        const readerBody = document.getElementById('reader-body');
        const prevBtn = document.getElementById('btn-prev');
        const nextBtn = document.getElementById('btn-next');
        const readerScroll = document.getElementById('reader-scroll');
        
        if (titleEl) titleEl.innerText = ch.title;
        if (navTitleEl) navTitleEl.innerText = `BAB ${readerController.idx + 1}`;
        if (readerBody) readerBody.innerHTML = ch.content;
        
        const novel = AppState.getInstance().novelData;
        const key = `${novel.id}_${readerController.idx}`;

        Storage.getHighlight(key).then(saved => {
            // REVISED: ASYNC SAFETY CHECK
            // Memastikan user belum pindah bab saat data highlight selesai dimuat.
            // Jika idx sudah berubah, abaikan hasil promise lama.
            if (saved && readerBody && readerController.idx === currentRenderIndex) {
                readerBody.innerHTML = saved.content;
            }
        });
        
        if (prevBtn) prevBtn.disabled = readerController.idx === 0;
        if (nextBtn) nextBtn.disabled = readerController.idx === AppState.getInstance().novelData.chapters.length - 1;
        
        readerController.updateProgress();
        
        if (readerScroll) readerScroll.scrollTop = 0;
    },

    updateProgress() {
        const max = AppState.getInstance().novelData.chapters.length;
        if (max === 0) return;
        const pct = ((readerController.idx + 1) / max) * 100;
        
        const progressBar = document.getElementById('progress-bar');
        const miniProgress = document.getElementById('mini-progress');
        
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (miniProgress) miniProgress.style.width = `${pct}%`;
    },

    jumpToProgress(e) {
        const container = e.currentTarget;
        if(!container) return;
        
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        
        const max = AppState.getInstance().novelData.chapters.length;
        const targetIdx = Math.floor(pct * max);
        
        if(targetIdx >= 0 && targetIdx < max) {
            readerController.idx = targetIdx;
            readerController.render();
        }
    },

    toggleUI() {
        readerController.isUIHidden = !readerController.isUIHidden;
        
        const top = document.getElementById('reader-top');
        const bottom = document.getElementById('reader-bottom');
        
        if(readerController.isUIHidden) {
            if(top) top.classList.add('reader-hidden');
            if(bottom) bottom.classList.add('reader-hidden');
        } else {
            if(top) top.classList.remove('reader-hidden');
            if(bottom) bottom.classList.remove('reader-hidden');
        }
    },
    
    toggleSettings() {
        const panel = document.getElementById('settings-panel');
        if(panel) {
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
    }
};

// === SEARCH CONTROLLER ===
const searchController = {
    results: [],
    currentQuery: '',
    
    show() {
        const modal = document.getElementById('search-modal');
        const content = document.getElementById('search-modal-content');
        if (modal && content) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('-translate-y-full');
                const input = document.getElementById('search-input');
                if(input) input.focus();
            }, 10);
        }
    },
    
    hide() {
        const modal = document.getElementById('search-modal');
        const content = document.getElementById('search-modal-content');
        if (modal && content) {
            modal.classList.add('opacity-0');
            content.classList.add('-translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
                searchController.clearResults();
            }, 300);
        }
    },
    
    perform(query) {
        searchController.currentQuery = query.trim().toLowerCase();
        if (!searchController.currentQuery) { searchController.clearResults(); return; }
        
        const data = AppState.getInstance().novelData;
        if(!data || data.chapters.length === 0) return;
        
        searchController.results = [];
        data.chapters.forEach((chapter, index) => {
            const textContent = chapter.content.replace(/<[^>]*>/g, ' ').toLowerCase();
            let matchIndex = textContent.indexOf(searchController.currentQuery);
            
            while (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 60);
                const end = Math.min(textContent.length, matchIndex + searchController.currentQuery.length + 100);
                const context = textContent.substring(start, end);
                const highlighted = context.replace(
                    new RegExp(searchController.currentQuery, 'gi'),
                    match => `<mark class="bg-yellow-200 dark:bg-yellow-900 text-black dark:text-yellow-100 px-1 rounded">${match}</mark>`
                );
                
                searchController.results.push({ index, chapterTitle: chapter.title, context: highlighted });
                matchIndex = textContent.indexOf(searchController.currentQuery, matchIndex + 1);
            }
        });
        
        searchController.renderResults();
    },
    
    renderResults() {
        const container = document.getElementById('search-results');
        const countElement = document.getElementById('search-count');
        
        if (!container) return;

        if (searchController.results.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">Tidak ditemukan</div>`;
            if (countElement) countElement.textContent = '0 hasil';
            return;
        }
        
        container.innerHTML = searchController.results.map(r => `
            <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10"
                 onclick="searchController.openResult(${r.index})">
                <div class="text-xs font-bold text-brand-text mb-1">${r.chapterTitle}</div>
                <div class="text-xs text-gray-600 dark:text-gray-300">...${r.context}...</div>
            </div>
        `).join('');
        
        if (countElement) countElement.textContent = `${searchController.results.length} hasil`;
    },
    
    openResult(idx) {
        searchController.hide();
        readerController.open(idx);
    },
    
    clearResults() {
        searchController.results = [];
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        
        const container = document.getElementById('search-results');
        if (container) container.innerHTML = '';
        
        const countElement = document.getElementById('search-count');
        if (countElement) countElement.textContent = '0 hasil';
    }
};

// === NAV MENU CONTROLLER ===
function toggleNav() {
    const nav = document.getElementById('floating-nav');
    const toggle = document.getElementById('nav-toggle-btn');
    
    if(!nav || !toggle) return;

    if (nav.classList.contains('hidden-popover')) {
        nav.classList.remove('hidden-popover');
        nav.classList.add('visible-popover');
        
        if (nav._clickListener) document.removeEventListener('click', nav._clickListener);
        
        nav._clickListener = function(e) {
            if (!nav.contains(e.target) && !toggle.contains(e.target)) {
                nav.classList.remove('visible-popover');
                nav.classList.add('hidden-popover');
                document.removeEventListener('click', nav._clickListener);
                nav._clickListener = null;
            }
        };
        
        setTimeout(() => document.addEventListener('click', nav._clickListener), 10);
    } else {
        nav.classList.remove('visible-popover');
        nav.classList.add('hidden-popover');
        if (nav._clickListener) {
            document.removeEventListener('click', nav._clickListener);
            nav._clickListener = null;
        }
    }
}

const navMenu = { toggle: toggleNav }; // Definisi untuk EventBinder

// === SHARE CONTROLLER ===
const shareController = {
    async shareBook() {
        const data = AppState.getInstance().novelData;
        if (!data) return;

        const shareData = {
            title: data.title,
            text: `Baca "${data.title}" karya ${data.author}`,
            url: window.location.href
        };
        
        if (navigator.share) {
            try { await navigator.share(shareData); } catch (err) {}
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(`${shareData.text} - ${shareData.url}`);
            toast.show('Link berhasil disalin!', 'success');
        }
    },
    
    async shareQuote(text) {
        if (navigator.share) {
            try { await navigator.share({ title: 'Kutipan', text: `"${text}" - ${AppState.getInstance().novelData.title}` }); } catch (e) {}
        } else if (navigator.clipboard) {
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
         if (!this.selection || this.selection.rangeCount === 0) return;

         const range = this.selection.getRangeAt(0);
         const mark = document.createElement('mark');
         mark.style.backgroundColor = color === 'yellow' ? '#FFD700' : '#FFD700';
         mark.className = 'reader-highlight';

         try {
             range.surroundContents(mark);
         } catch {
             toast.show('Tidak bisa highlight bagian ini', 'error');
             return;
         }

         const readerBody = document.getElementById('reader-body');
         if (!readerBody) return;

         const novel = AppState.getInstance().novelData;
         const chapterIndex = readerController.idx;
         const key = `${novel.id}_${chapterIndex}`;

         Storage.setHighlight(key, readerBody.innerHTML);

         toast.show('Highlight disimpan', 'success');
         this.removeToolbar();
     }
}

const textHighlighter = new TextHighlighter();

// === TOAST SYSTEM ===
const toast = {
    show(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
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
    
    clearAll() {
        const container = document.getElementById('toast-container');
        if(container) container.innerHTML = '';
    }
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
        const nav = document.getElementById('floating-nav');
        if(!nav || this.installButton) return;
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

let pwaInstaller = null;

// === CLEANUP & GLOBAL UTILITIES ===
function cleanupModals() {
    toast.clearAll();
    
    const nav = document.getElementById('floating-nav');
    if(nav) {
        nav.classList.remove('visible-popover');
        nav.classList.add('hidden-popover');
        if (nav._clickListener) {
            document.removeEventListener('click', nav._clickListener);
            nav._clickListener = null;
        }
    }
    
    const reviewModal = document.getElementById('modal-review');
    if(reviewModal && !reviewModal.classList.contains('hidden')) {
        uiController.closeReviewModal();
    }
    
    const searchModal = document.getElementById('search-modal');
    if(searchModal && !searchModal.classList.contains('hidden')) {
        searchController.hide();
    }
    
    // Cleanup text highlighter
    if(textHighlighter.toolbar) {
        textHighlighter.toolbar.remove();
        textHighlighter.toolbar = null;
    }
}

function setupErrorHandling() {
    window.addEventListener('error', (event) => {
        console.error("Global Error:", event.error);
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error("Unhandled Promise Rejection:", event.reason);
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Global Esc key
        if (e.key === 'Escape') {
            cleanupModals();
            readerController.isUIHidden = false;
            const top = document.getElementById('reader-top');
            const bottom = document.getElementById('reader-bottom');
            if(top) top.classList.remove('reader-hidden');
            if(bottom) bottom.classList.remove('reader-hidden');
        }
        
        // Only in Reader View (Arrow Keys)
        const readerView = document.getElementById('view-reader');
        if (readerView && !readerView.classList.contains('hidden')) {
            if (e.key === 'ArrowLeft') {
                readerController.nav(-1);
            } else if (e.key === 'ArrowRight') {
                readerController.nav(1);
            } else if (e.key === ' ') {
                e.preventDefault();
                readerController.toggleUI();
            }
        }
    });
}

// === EVENT BINDER & SAFETY CHECK (HYBRID) ===
const EventBinder = {
    // Mapping ID HTML ke Fungsi Handler
    map: {
        // Navigation & Header
        'theme-toggle-btn': ThemeManager.toggleTheme,
        'nav-theme-btn': ThemeManager.toggleTheme,
        'search-toggle': searchController.show,
        'search-close-btn': searchController.hide,
        'search-backdrop': searchController.hide,
        'nav-toggle-btn': toggleNav,
        'search-input': (e) => searchController.perform(e.target.value),
        'share-btn': shareController.shareBook,
        
        // Detail Page
        'btn-synopsis': uiController.toggleSynopsis,
        'btn-bookmark': () => uiController.toggleBookmark(AppState.getInstance().currentChapter),
        'start-reading-btn': () => readerController.open(0),
        'start-fab-btn': () => readerController.open(0),
        'open-review-btn': uiController.openReviewModal,
        'close-review-btn': uiController.closeReviewModal,
        'review-backdrop': uiController.closeReviewModal,
        'submit-review-btn': uiController.submitReview,
        
        // Reader
        'reader-back-btn': readerController.back,
        'reader-scroll': readerController.toggleUI,
        'btn-prev': () => readerController.nav(-1),
        'btn-next': () => readerController.nav(1),
        'reader-progress-container': (e) => readerController.jumpToProgress(e),
        'reader-settings-btn': readerController.toggleSettings,
        'close-settings-btn': readerController.toggleSettings
    },

    init() {
        console.group('🛡️ Safety Check: Memeriksa Tombol (Event Listeners)');
        
        let successCount = 0;
        let failCount = 0;

        // Iterasi map untuk binding otomatis
        for (const [id, handler] of Object.entries(EventBinder.map)) {
            const el = document.getElementById(id);
            
            if (el) {
                if (id === 'search-input') {
                    el.oninput = handler;
                    el.classList.add('focus:ring-2');
                } else {
                    el.onclick = (e) => {
                        handler(e);
                        if (el.tagName !== 'A') e.preventDefault();
                    };
                    el.classList.add('cursor-pointer');
                }
                console.log(`✅ [${id}] terdeteksi & diaktifkan.`);
                successCount++;
            } else {
                console.warn(`❌ Elemen HTML ID #${id} TIDAK DITEMUKAN!`);
                failCount++;
            }
        }

        console.log(`📊 Hasil: ${successCount} Aktif | ${failCount} Gagal`);
        console.groupEnd();
        
        return { total: successCount + failCount, failed: failCount };
    }
};

// === MAIN INITIALIZATION (ROBUST) ===
async function initApp() {
    try {
        // 1. Show loading indicator
        toast.show("Memuat data...", "info");
        
        // 2. Load Preferences first
        AppState.getInstance().loadSettings();
        ThemeManager.init();

        // 3. Load Novel Data
        const response = await fetch(CONFIG.DATA_URL);
        if (!response.ok) throw new Error(CONFIG.ERRORS.DATA_LOAD);
        
        const novelData = await response.json();
        AppState.getInstance().novelData = novelData;

        // 4. Load Reviews
        await reviewService.fetchReviews();

        // 5. Initialize UI
        await uiController.init();

        // 6. Event Binding (Hybrid - Auto + Safety)
        const checkResult = EventBinder.init();
        if (checkResult.failed > 0) {
            console.warn(`Event binding failed for ${checkResult.failed} buttons`);
            // Fallback: Binding manual untuk tombol kritis
            uiController.bindEvents?.();
        }

        // 7. Scroll Progress Listener
        const mainScroll = document.getElementById('main-scroll');
        const progressBar = document.getElementById('scroll-progress');
        if (mainScroll && progressBar) {
            mainScroll.addEventListener('scroll', () => {
                const scrollTop = mainScroll.scrollTop;
                const scrollHeight = mainScroll.scrollHeight - mainScroll.clientHeight;
                const scrollPercent = (scrollHeight > 0) ? (scrollTop / scrollHeight) * 100 : 0;
                progressBar.style.width = `${scrollPercent}%`;
            });
        }

        // 8. Service Worker Registration
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./sw.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.log('SW registration failed:', error);
            }
        }

        // 9. PWA Installer
        if (typeof PWAInstall === 'function') {
            pwaInstaller = new PWAInstall();
        }

        // 10. Global Error Handling
        if (typeof setupErrorHandling === 'function') {
            setupErrorHandling();
        }

        // 11. Keyboard Shortcuts
        if (typeof setupKeyboardShortcuts === 'function') {
            setupKeyboardShortcuts();
        }

        toast.show("Aplikasi siap dibaca!", "success");

    } catch (error) {
        console.error("Init Error:", error);
        toast.show("Gagal memuat aplikasi.", "error");
    }
}

// Start Application
document.addEventListener('DOMContentLoaded', initApp);

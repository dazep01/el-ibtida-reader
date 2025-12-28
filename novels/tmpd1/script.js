// ==========================================
// --- KONFIGURASI JSONBIN ---
// ==========================================
// Masukkan ID Bin dari JSONBin Anda
const JSONBIN_ID = '69510ed743b1c97be909f342'; 
// Masukkan API Key (Master Key atau Access Key dengan permission Write)
const JSONBIN_KEY = '$2a$10$gA9ADhVd/DNOsbERAMFc4u/LgJBqxy3apNZsSHxuUcKtU.ko6gAIS'; 
// ==========================================

// Variabel Global
let supabaseData = null; // Akan diisi dari data.json
let reviews = [];         // Akan diisi dari JSONBin
let selectedRating = 0;
let isSynopsisExpanded = false;
let navClickListener = null;
let pwaInstaller = null;

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
    },
    clearAll: () => document.getElementById('toast-container').innerHTML = ''
};

// === DATA LOADING SERVICE (JSONBin) ===
const reviewService = {
    // Fetch ulasan dari cloud
    fetchReviews: async () => {
        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
                headers: {
                    'X-Master-Key': JSONBIN_KEY // Gunakan Key untuk akses
                }
            });
            
            if (!response.ok) throw new Error('Gagal mengambil ulasan');
            
            const data = await response.json();
            // Jika data bukan array, inisialisasi array kosong
            reviews = Array.isArray(data.record) ? data.record : []; 
            ui.renderReviews();
        } catch (error) {
            console.error('Error fetching reviews:', error);
            // Fallback ke array kosong jika gagal koneksi awal
            reviews = []; 
            ui.renderReviews();
        }
    },

    // Kirim ulasan baru ke cloud
    postReview: async (newReview) => {
        try {
            toast.show("Mengirim ulasan...", "info");
            
            // 1. Ambil data terbaru dulu (untuk mencegah overwrite jika ada ulasan baru)
            const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
                headers: { 'X-Master-Key': JSONBIN_KEY }
            });
            const getData = await getResponse.json();
            let currentReviews = Array.isArray(getData.record) ? getData.record : [];

            // 2. Tambahkan ulasan baru ke paling atas (unshift)
            currentReviews.unshift(newReview);

            // 3. Update kembali ke JSONBin
            const putResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': JSONBIN_KEY
                },
                body: JSON.stringify(currentReviews)
            });

            if (!putResponse.ok) throw new Error('Gagal menyimpan ulasan');

            // 4. Update lokal
            reviews = currentReviews;
            ui.renderReviews();
            toast.show("Terima kasih! Ulasan berhasil dikirim.", "success");
            return true;
        } catch (error) {
            console.error(error);
            toast.show("Gagal mengirim ulasan. Coba lagi nanti.", "error");
            return false;
        }
    }
};

// === ROUTER ===
const router = {
    backToHome: () => {
        window.location.href = '../../'; 
    }
};

// === UI CONTROLLER ===
const ui = {
    init: () => {
        if (!supabaseData) {
            console.error("Data Novel belum dimuat.");
            return;
        }

        document.getElementById('cover-title').innerText = supabaseData.title.split('#')[0].trim();
        document.getElementById('cover-author').innerText = supabaseData.author;
        document.getElementById('detail-title').innerText = supabaseData.title;
        document.getElementById('detail-author').innerText = supabaseData.author;
        
        const desc = document.getElementById('detail-desc');
        desc.innerText = supabaseData.description;
        document.getElementById('chapter-count').innerText = `${supabaseData.chapters.length} Chapters`;

        const list = document.getElementById('chapter-list');
        list.innerHTML = '';
        supabaseData.chapters.forEach((ch, i) => {
            const el = document.createElement('div');
            el.className = "flex items-center justify-between p-4 bg-white dark:bg-brand-paperDark rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm cursor-pointer active:scale-[0.98] transition-all duration-200 group hover:border-brand-slate/20";
            el.onclick = () => reader.open(i);
            el.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full bg-brand-bg dark:bg-white/5 flex items-center justify-center text-brand-slate dark:text-brand-slateLight font-bold text-xs group-hover:bg-brand-slate group-hover:text-white transition-colors">
                        ${i+1}
                    </div>
                    <div class="flex flex-col">
                        <span class="font-serif font-bold text-sm text-brand-text dark:text-white leading-tight">${ch.title}</span>
                        <span class="text-[10px] text-gray-400 mt-0.5">${ch.wordCount} kata</span>
                    </div>
                </div>
                <i class="ph ph-caret-right text-gray-300 dark:text-gray-600 group-hover:text-brand-slate transition-colors"></i>
            `;
            list.appendChild(el);
        });

        ui.initStarInput();
        ui.loadTheme();
        ui.bindEvents();
    },

    bindEvents: () => {
        document.getElementById('btn-synopsis').onclick = ui.toggleSynopsis;
        document.getElementById('theme-toggle-btn').onclick = ui.toggleTheme;
        document.getElementById('nav-theme-btn').onclick = ui.toggleTheme;
        document.getElementById('nav-toggle-btn').onclick = toggleNav;
        document.getElementById('search-toggle').onclick = search.show;
        document.getElementById('search-close-btn').onclick = search.hide;
        document.getElementById('search-backdrop').onclick = search.hide;
        document.getElementById('search-input').oninput = (e) => search.perform(e.target.value);
        document.getElementById('start-reading-btn').onclick = () => reader.open(0);
        document.getElementById('start-fab-btn').onclick = () => reader.open(0);
        document.getElementById('btn-bookmark').onclick = ui.bookmark;
        document.getElementById('share-btn').onclick = enhancedShare.shareBook;
        document.getElementById('open-review-btn').onclick = ui.openReviewModal;
        document.getElementById('close-review-btn').onclick = ui.closeReviewModal;
        document.getElementById('review-backdrop').onclick = ui.closeReviewModal;
        document.getElementById('submit-review-btn').onclick = ui.submitReview;
        document.getElementById('reader-back-btn').onclick = reader.back;
        document.getElementById('reader-settings-btn').onclick = reader.toggleSettings;
        document.getElementById('close-settings-btn').onclick = reader.toggleSettings;
        document.getElementById('btn-prev').onclick = () => reader.nav(-1);
        document.getElementById('btn-next').onclick = () => reader.nav(1);
        document.getElementById('reader-progress-container').onclick = reader.jumpToProgress;
        document.getElementById('reader-scroll').onclick = reader.toggleUI;
    },

    loadTheme: () => {
        const isDark = localStorage.getItem('theme') === 'dark';
        if(isDark) document.body.classList.add('dark-mode');
        ui.updateThemeIcons(isDark);
    },

    toggleTheme: () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        ui.updateThemeIcons(isDark);
        toast.show(isDark ? "Mode Gelap Aktif" : "Mode Terang Aktif");
    },

    updateThemeIcons: (isDark) => {
        const icon = document.getElementById('theme-icon');
        const navIcon = document.getElementById('nav-theme-icon');
        if(isDark) {
            icon.className = 'ph-fill ph-sun text-lg text-yellow-400';
            navIcon.className = 'ph-fill ph-sun text-lg text-yellow-400';
        } else {
            icon.className = 'ph ph-moon text-lg';
            navIcon.className = 'ph ph-moon text-lg';
        }
    },

    toggleSynopsis: () => {
        const desc = document.getElementById('detail-desc');
        const btn = document.getElementById('btn-synopsis');
        isSynopsisExpanded = !isSynopsisExpanded;
        if(isSynopsisExpanded) {
            desc.classList.remove('line-clamp-3');
            btn.innerHTML = `Tutup <i class="ph-bold ph-caret-up"></i>`;
        } else {
            desc.classList.add('line-clamp-3');
            btn.innerHTML = `Baca Selengkapnya <i class="ph-bold ph-caret-down"></i>`;
            desc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    renderReviews: () => {
        const container = document.getElementById('reviews-container');
        if (reviews.length === 0) {
            container.innerHTML = '<p class="text-center text-xs text-gray-400 py-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-white/10">Belum ada ulasan. Jadilah yang pertama!</p>';
        } else {
            container.innerHTML = reviews.map(r => `
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
        }
        
        if (reviews.length > 0) {
            const avg = (reviews.reduce((a,b) => a + b.rating, 0) / reviews.length).toFixed(1);
            document.getElementById('avg-rating').innerText = avg;
        }
    },

    initStarInput: () => {
        const container = document.getElementById('star-input');
        container.innerHTML = '';
        for(let i=1; i<=5; i++) {
            const star = document.createElement('i');
            star.className = `ph-fill ph-star text-2xl text-gray-200 dark:text-gray-600 cursor-pointer transition-colors duration-200 hover:text-amber-300`;
            star.dataset.v = i;
            star.onclick = () => {
                selectedRating = i;
                ui.updateStarDisplay();
            };
            container.appendChild(star);
        }
    },

    updateStarDisplay: () => {
        const stars = document.querySelectorAll('#star-input i');
        stars.forEach((star, i) => {
            if(i < selectedRating) {
                star.classList.remove('text-gray-200', 'dark:text-gray-600');
                star.classList.add('text-amber-400');
            } else {
                star.classList.add('text-gray-200', 'dark:text-gray-600');
                star.classList.remove('text-amber-400');
            }
        });
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
        
        if(selectedRating === 0) { toast.show("Berikan rating bintang dulu ya!", "error"); return; }
        if(!comment) { toast.show("Ulasan tidak boleh kosong.", "error"); return; }

        const newReview = { 
            name: name || "Sahabat Kisah", 
            rating: selectedRating, 
            comment: comment, 
            date: "Baru saja" 
        };
        
        // Panggil API JSONBin
        const success = await reviewService.postReview(newReview);

        if(success) {
            ui.closeReviewModal();
            document.getElementById('input-name').value = '';
            document.getElementById('input-comment').value = '';
            selectedRating = 0;
            ui.updateStarDisplay();
        }
    },

    bookmark: () => {
        const icon = document.getElementById('icon-bookmark');
        if(icon.classList.contains('ph-bookmark-simple')) {
            icon.classList.replace('ph-bookmark-simple', 'ph-bookmark-simple-fill');
            icon.classList.add('text-yellow-500');
            toast.show("Buku ini ditandai", "success");
        } else {
            icon.classList.replace('ph-bookmark-simple-fill', 'ph-bookmark-simple');
            icon.classList.remove('text-yellow-500');
            toast.show("Tanda buku dihapus");
        }
    }
};

// === READER CONTROLLER ===
const reader = {
    idx: 0,
    isUIHidden: false,
    
    open: (i) => {
        reader.idx = i;
        reader.render();
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
        const ch = supabaseData.chapters[reader.idx];
        document.getElementById('reader-title').innerText = ch.title;
        document.getElementById('reader-nav-title').innerText = `BAB ${reader.idx + 1}`;
        
        const readerBody = document.getElementById('reader-body');
        readerBody.innerHTML = ch.content;
        
        document.getElementById('btn-prev').disabled = reader.idx === 0;
        document.getElementById('btn-next').disabled = reader.idx === supabaseData.chapters.length - 1;
        reader.updateProgress();
        document.getElementById('reader-scroll').scrollTop = 0;
    },
    
    nav: (d) => { 
        if (reader.idx + d >= 0 && reader.idx + d < supabaseData.chapters.length) {
            reader.idx += d; 
            reader.render();
        }
    },

    updateProgress: () => {
        const pct = ((reader.idx+1)/supabaseData.chapters.length)*100;
        document.getElementById('progress-bar').style.width = `${pct}%`;
        document.getElementById('mini-progress').style.width = `${pct}%`;
    },

    jumpToProgress: (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const targetIdx = Math.floor(pct * supabaseData.chapters.length);
        if(targetIdx >= 0 && targetIdx < supabaseData.chapters.length) {
            reader.idx = targetIdx;
            reader.render();
        }
    },

    toggleUI: () => {
        reader.isUIHidden = !reader.isUIHidden;
        const top = document.getElementById('reader-top');
        const bottom = document.getElementById('reader-bottom');
        if(reader.isUIHidden) {
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

// === NAVIGATION MENU LOGIC ===
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

// === SEARCH ENGINE ===
const search = {
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
            search.clearResults();
        }, 300);
    },
    
    perform: (query) => {
        search.currentQuery = query.trim().toLowerCase();
        if (!search.currentQuery) { search.clearResults(); return; }
        
        search.results = [];
        supabaseData.chapters.forEach((chapter, chapterIndex) => {
            const textContent = chapter.content.replace(/<[^>]*>/g, ' ').toLowerCase();
            let matchIndex = textContent.indexOf(search.currentQuery);
            
            while (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(textContent.length, matchIndex + search.currentQuery.length + 100);
                const context = textContent.substring(start, end);
                const highlighted = context.replace(
                    new RegExp(search.currentQuery, 'gi'),
                    match => `<mark class="bg-yellow-200 dark:bg-yellow-900 text-black dark:text-yellow-100 px-1 rounded">${match}</mark>`
                );
                
                search.results.push({ chapterIndex, chapterTitle: chapter.title, context: highlighted });
                matchIndex = textContent.indexOf(search.currentQuery, matchIndex + 1);
            }
        });
        
        search.renderResults();
    },
    
    renderResults: () => {
        const container = document.getElementById('search-results');
        const countElement = document.getElementById('search-count');
        
        if (search.results.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">Tidak ditemukan.</div>`;
            countElement.textContent = '0 hasil';
            return;
        }
        
        container.innerHTML = search.results.map((r, i) => `
            <div class="bg-gray-50 dark:bg-white/5 p-4 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10"
                 onclick="search.openResult(${r.chapterIndex})">
                <div class="text-xs font-bold text-brand-text mb-1">${r.chapterTitle}</div>
                <div class="text-xs text-gray-600 dark:text-gray-300">...${r.context}...</div>
            </div>
        `).join('');
        
        countElement.textContent = `${search.results.length} hasil`;
    },

    openResult: (idx) => {
        search.hide();
        reader.open(idx);
    },

    clearResults: () => {
        search.results = [];
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('search-count').textContent = '0 hasil';
        document.getElementById('search-input').value = '';
    }
};

// === ENHANCED SHARE ===
const enhancedShare = {
    shareBook: async () => {
        const shareData = {
            title: supabaseData.title,
            text: `Baca "${supabaseData.title}" karya ${supabaseData.author}`,
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
            try { await navigator.share({ title: 'Kutipan', text: `"${text}" - ${supabaseData.title}` }); } catch (e) {}
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
        enhancedShare.shareQuote(window.getSelection().toString());
        this.removeToolbar();
    }
    highlight(color) {
        toast.show('Highlight disimpan', 'success');
        this.removeToolbar();
    }
}

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

const textHighlighter = new TextHighlighter();

// === INITIALIZATION (ASYNC) ===
async function initApp() {
    try {
        // 1. Load Data Novel Lokal
        const novelResponse = await fetch('./data.json');
        if (!novelResponse.ok) throw new Error('Gagal memuat data novel');
        supabaseData = await novelResponse.json();

        // 2. Load Ulasan dari JSONBin
        await reviewService.fetchReviews();

        // 3. Inisialisasi UI setelah data siap
        ui.init();

        // Scroll Progress Listener
        const mainScroll = document.getElementById('main-scroll');
        const progressBar = document.getElementById('scroll-progress');
        mainScroll.addEventListener('scroll', () => {
            const scrollTop = mainScroll.scrollTop;
            const scrollHeight = mainScroll.scrollHeight - mainScroll.clientHeight;
            const scrollPercent = (scrollTop / scrollHeight) * 100;
            progressBar.style.width = `${scrollPercent}%`;
        });

        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(() => {
                console.log('Service Worker registered');
            }).catch(error => {
                console.log('SW registration failed:', error);
            });
        }

        // PWA Installer
        pwaInstaller = new PWAInstall();

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                search.show();
            }
            if (e.key === 'Escape') {
                search.hide();
                ui.closeReviewModal();
            }
        });

    } catch (error) {
        console.error("Init Error:", error);
        document.body.innerHTML = `<div class="p-10 text-center text-red-500">Gagal memuat aplikasi. Mohon refresh halaman.<br><small>${error.message}</small></div>`;
    }
}

// Jalankan Init saat DOM siap
document.addEventListener('DOMContentLoaded', initApp);

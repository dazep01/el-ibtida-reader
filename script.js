// === CONFIG & STATE ===
const LIBRARY_DATA_URL = './library.json';
let libraryData = [];
let currentTab = 'home'; // 'home', 'library', 'bookmarks'
let searchQuery = '';

// --- INDEXEDDB SETUP ---
const DB_NAME = 'ElIbtidaReaderDB';
const DB_VERSION = 1;

// Membuka koneksi database
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
        console.error("IndexedDB error:", e);
        reject("Gagal membuka database");
    };

    request.onsuccess = (e) => {
        resolve(e.target.result);
    };

    // Membuat Schema jika versi DB berubah/baru
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Store untuk Bookmarks
        if (!db.objectStoreNames.contains('bookmarks')) {
            db.createObjectStore('bookmarks', { keyPath: 'id' });
        }
        // Store untuk Reading Progress
        if (!db.objectStoreNames.contains('progress')) {
            db.createObjectStore('progress', { keyPath: 'id' });
        }
    };
});

// === STORAGE MANAGER (IndexedDB) ===
const Storage = {
    // Ambil semua ID bookmark
    getBookmarks: async () => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('bookmarks', 'readonly');
            const store = tx.objectStore('bookmarks');
            const request = store.getAll();
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    // Kembalikan array of IDs saja ['tmpd1', 'tmpd2']
                    resolve(request.result.map(item => item.id));
                };
                request.onerror = () => resolve([]);
            });
        } catch (error) {
            console.error("Error getBookmarks:", error);
            return [];
        }
    },

    // Toggle tambah/hapus bookmark
toggleBookmark: async (bookId) => {
    console.log('Toggle bookmark dipanggil untuk:', bookId); // DEBUG
    try {
        const db = await dbPromise;
        console.log('Database connected'); // DEBUG
        
        const tx = db.transaction('bookmarks', 'readwrite');
        const store = tx.objectStore('bookmarks');
        
        const getRequest = store.get(bookId);
        
        getRequest.onsuccess = () => {
            console.log('Bookmark status:', getRequest.result ? 'Ada' : 'Tidak ada'); // DEBUG
            
            if (getRequest.result) {
                store.delete(bookId);
                console.log('Bookmark dihapus'); // DEBUG
                toast('Dihapus dari Tersimpan', 'info');
            } else {
                store.add({ id: bookId, timestamp: Date.now() });
                console.log('Bookmark ditambahkan'); // DEBUG
                toast('Ditambahkan ke Tersimpan', 'success');
            }
            renderContent();
        };
        
        getRequest.onerror = (e) => {
            console.error('Error checking bookmark:', e);
        };
        
        tx.oncomplete = () => {
            console.log('Transaction completed'); // DEBUG
        };
        
    } catch (error) {
        console.error("Error toggleBookmark:", error);
        toast('Gagal menyimpan bookmark', 'error');
    }
},
    
    // Ambil progress bacaan (Semua buku)
    getProgress: async () => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('progress', 'readonly');
            const store = tx.objectStore('progress');
            const request = store.getAll();
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    // Ubah format array menjadi object: { 'tmpd1': { chapterIndex: 1, ... } }
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

    // Simpan progress bacaan
    setProgress: async (bookId, chapterIndex) => {
        try {
            const db = await dbPromise;
            const tx = db.transaction('progress', 'readwrite');
            const store = tx.objectStore('progress');
            
            const data = {
                id: bookId,
                data: { 
                    chapterIndex, 
                    lastRead: Date.now() 
                }
            };
            
            const request = store.put(data); // put akan update jika ada, create jika baru
            request.onerror = () => console.error("Gagal menyimpan progress");
        } catch (error) {
            console.error("Error setProgress:", error);
        }
    }
};

// === THEME MANAGER ===
const loadPreferences = () => {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark');
    }
};

const toggleTheme = () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
};

// === DATA LOADER ===
async function initApp() {
    loadPreferences();

        // Test IndexedDB connection
    try {
        const db = await dbPromise;
        console.log('IndexedDB connected successfully');
    } catch (error) {
        console.error('IndexedDB connection failed:', error);
        toast('Database tidak tersedia', 'error');
    }
    
    // Tampilkan Loading State (opsional)
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `<div class="flex justify-center py-20"><div class="w-8 h-8 border-2 border-brand-main border-t-transparent rounded-full animate-spin"></div></div>`;

    try {
        const res = await fetch(LIBRARY_DATA_URL);
        if (!res.ok) throw new Error('Gagal memuat library');
        libraryData = await res.json();
    } catch (err) {
        console.error(err);
        toast.show('Gagal memuat data buku', 'error');
        return;
    }

    renderContent();
    bindEvents();
}

// === RENDER LOGIC (ASYNC) ===
async function renderContent() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = ''; 

    // Ambil data bookmark terbaru setiap kali render
    const bookmarksList = await Storage.getBookmarks(); // TAMBAHKAN INI
    
    if (currentTab === 'home') {
        await renderHome(contentArea, bookmarksList); // PASS SEBAGAI PARAMETER
    } else if (currentTab === 'library') {
        await renderLibrary(contentArea, bookmarksList);
    } else if (currentTab === 'bookmarks') {
        await renderBookmarks(contentArea, bookmarksList);
    }
}

// 1. HOME VIEW
async function renderHome(container) {
    // Ambil data progress dan bookmarks secara paralel
    const [progressData, bookmarksList] = await Promise.all([
        Storage.getProgress(),
        Storage.getBookmarks()
    ]);
    
    // Get "Continue Reading"
    const continueReading = libraryData
        .filter(book => progressData[book.id])
        .sort((a, b) => progressData[b.id].lastRead - progressData[a.id].lastRead);

    // Header HTML
    let html = `
        <div class="mb-8 animate-fade-in-up">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1 font-serif">Selamat Datang,</h2>
            <p class="text-gray-500 dark:text-gray-400">Mari lanjutkan petualangan membaca Anda.</p>
        </div>
    `;

    // Continue Reading Section
    if (continueReading.length > 0) {
        html += `
            <div class="flex justify-between items-end mb-4 animate-fade-in-up" style="animation-delay: 0.1s">
                <h3 class="font-bold text-gray-800 dark:text-white">Lanjut Membaca</h3>
                <span class="text-xs text-brand-main font-medium cursor-pointer" onclick="switchTab('library')">Lihat Semua</span>
            </div>
            <div class="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 animate-fade-in-up" style="animation-delay: 0.2s">
                ${continueReading.map(book => createCard(book, 'horizontal', bookmarksList, progressData)).join('')}
            </div>
            <div class="h-px bg-gray-200 dark:bg-white/10 my-8"></div>
        `;
    }

    // Featured Section
    html += `
        <div class="mb-4 animate-fade-in-up" style="animation-delay: 0.3s">
            <h3 class="font-bold text-gray-800 dark:text-white">Terbaru & Rekomendasi</h3>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up" style="animation-delay: 0.4s">
            ${libraryData.map(book => createCard(book, 'grid', bookmarksList, progressData)).join('')}
        </div>
    `;

    container.innerHTML = html;
}

// 2. LIBRARY VIEW
async function renderLibrary(container) {
    // Fetch bookmarks sekali saja untuk filter jika perlu, atau cukup pass ke createCard
    const bookmarksList = await Storage.getBookmarks();

    let html = `
        <div class="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2 animate-fade-in-up">
            ${['All', 'Fiksi', 'Romance', 'Drama', 'Thriller'].map(cat => `
                <button onclick="filterCategory('${cat}')" class="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                    searchQuery === cat 
                    ? 'bg-brand-main text-white shadow-lg shadow-brand-main/30' 
                    : 'bg-white dark:bg-white/10 text-gray-500 dark:text-gray-400'
                }">${cat}</button>
            `).join('')}
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up" style="animation-delay: 0.2s">
            ${filterBooks().map(book => createCard(book, 'grid', bookmarksList, {})).join('')}
        </div>
    `;
    container.innerHTML = html;
}

// 3. BOOKMARKS VIEW
async function renderBookmarks(container) {
    const bookmarksList = await Storage.getBookmarks();
    const bookmarkedBooks = libraryData.filter(b => bookmarksList.includes(b.id));

    if (bookmarkedBooks.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-96 text-center animate-fade-in-up">
                <div class="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <i class="ph ph-bookmarks text-3xl text-gray-300 dark:text-gray-600"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-2">Belum ada yang disimpan</h3>
                <p class="text-gray-500 text-sm max-w-xs">Simpan novel favoritmu agar mudah ditemukan di sini.</p>
                <button onclick="switchTab('library')" class="mt-6 px-6 py-3 bg-brand-main text-white rounded-xl font-medium shadow-lg shadow-brand-main/30">Cari Novel</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <h3 class="font-bold text-gray-800 dark:text-white mb-4 animate-fade-in-up">Koleksi Saya</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up">
                ${bookmarkedBooks.map(book => createCard(book, 'grid', bookmarksList, {})).join('')}
            </div>
        `;
    }
}

// === COMPONENT: BOOK CARD ===
// Diubah untuk menerima `bookmarksList` dan `progressData` sebagai argumen agar performa baik
function createCard(book, layout, bookmarksList = [], progressData = {}) {
    const isBookmarked = bookmarksList.includes(book.id);
    const progress = progressData[book.id] || {};
    
    let statusBadge = '';
    if(book.status === 'On Going') statusBadge = `<span class="status-badge status-ongoing">Ongoing</span>`;
    else if(book.status === 'Completed') statusBadge = `<span class="status-badge status-completed">Selesai</span>`;

    if (layout === 'horizontal') {
        return `
            <a href="${book.path}" class="flex-shrink-0 w-64 bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-soft flex gap-3 book-card group relative overflow-hidden">
                <div class="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden book-cover">
                    <img src="${book.cover}" class="w-full h-full object-cover" alt="${book.title}" loading="lazy">
                </div>
                <div class="flex-1 flex flex-col justify-center min-w-0">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-sm text-gray-800 dark:text-white truncate leading-tight group-hover:text-brand-main transition-colors">${book.title}</h4>
                        ${statusBadge}
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">${book.author}</p>
                    ${progress.chapterIndex !== undefined ? `
                        <div class="mt-3">
                            <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>Bab ${progress.chapterIndex + 1}</span>
                            </div>
                            <div class="reading-progress w-full"><div class="reading-progress-bar" style="width: ${Math.min(100, (progress.chapterIndex+1)*10)}%"></div></div>
                        </div>
                    ` : `<div class="mt-3 text-xs text-brand-main font-medium">Mulai Baca &rarr;</div>`}
                </div>
            </a>
        `;
    } else { // Grid Layout
        return `
            <div class="group relative">
                <a href="${book.path}" class="block bg-white dark:bg-gray-800 rounded-2xl p-3 pb-4 shadow-soft book-card relative overflow-hidden h-full flex flex-col">
                    <div class="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 book-cover">
                        <img src="${book.cover}" class="w-full h-full object-cover" alt="${book.title}" loading="lazy">
                        <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <div class="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm transform scale-0 group-hover:scale-100 transition-transform">
                                <i class="ph-fill ph-book-open text-brand-main text-xl"></i>
                             </div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="min-h-0 flex-1 flex flex-col">
                        <h4 class="font-bold text-sm text-gray-800 dark:text-white truncate leading-tight mb-1 line-clamp-2">${book.title}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-1">${book.author}</p>
                        
                        <div class="mt-auto flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/5">
                            <div class="flex items-center gap-1 text-xs text-yellow-500">
                                <i class="ph-fill ph-star"></i>
                                <span class="font-medium">${book.rating}</span>
                            </div>
                            <button onclick="event.preventDefault(); event.stopPropagation(); Storage.toggleBookmark('${book.id}')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition">
                                <i class="ph ${isBookmarked ? 'ph-bookmark-simple-fill text-brand-main' : 'ph-bookmark-simple text-gray-400'} text-lg"></i>
                            </button>
                        </div>
                    </div>
                </a>
            </div>
        `;
    }
}

// === UTILS & EVENTS ===
function filterBooks() {
    if (searchQuery === 'All') return libraryData;
    return libraryData.filter(b => 
        b.tags && b.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        b.genre.toLowerCase().includes(searchQuery.toLowerCase())
    );
}

function filterCategory(cat) {
    searchQuery = cat;
    renderContent();
}

function switchTab(tab) {
    currentTab = tab;
    
    document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(el => {
        const isActive = el.dataset.tab === tab;
        if (isActive) {
            if(el.classList.contains('nav-item')) {
                el.classList.add('bg-white', 'dark:bg-white/10', 'text-brand-main', 'dark:text-white', 'shadow-soft');
                el.classList.remove('text-gray-400', 'hover:bg-white');
            } else {
                el.classList.add('text-brand-main');
                el.classList.remove('text-gray-400');
            }
        } else {
             if(el.classList.contains('nav-item')) {
                el.classList.remove('bg-white', 'dark:bg-white/10', 'text-brand-main', 'dark:text-white', 'shadow-soft');
                el.classList.add('text-gray-400', 'hover:bg-white');
             } else {
                el.classList.remove('text-brand-main');
                el.classList.add('text-gray-400');
             }
        }
    });

    renderContent();
}

// Search Logic
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');

function toggleSearch(show) {
    if (show) {
        searchOverlay.classList.remove('translate-y-full');
        searchInput.focus();
    } else {
        searchOverlay.classList.add('translate-y-full');
        searchInput.value = '';
        renderSearchResults('');
    }
}

function renderSearchResults(query) {
    const results = document.getElementById('search-results');
    if (!query) {
        results.innerHTML = '';
        return;
    }

    const filtered = libraryData.filter(b => 
        b.title.toLowerCase().includes(query.toLowerCase()) ||
        b.author.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        results.innerHTML = `<div class="text-center text-gray-500 mt-20">Tidak ditemukan</div>`;
    } else {
        results.innerHTML = filtered.map(book => createCard(book, 'horizontal', [], {})).join('');
    }
}

// Ganti function toast() yang ada dengan:
const toast = (msg, type = 'info') => {
    const div = document.createElement('div');
    div.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-50 text-sm font-medium animate-fade-in-up ${
        type === 'success' ? 'bg-green-600 text-white' : 
        type === 'error' ? 'bg-red-600 text-white' : 
        'bg-gray-800 text-white'
    }`;
    div.innerText = msg;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 2000);
};

function bindEvents() {
    document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(btn => {
        if(btn.dataset.tab) btn.onclick = () => switchTab(btn.dataset.tab);
    });
    document.getElementById('theme-toggle-desktop').onclick = toggleTheme;
    
    const mobileSearchBtn = document.getElementById('search-toggle-mobile');
    const desktopSearchBtn = document.getElementById('search-toggle-desktop');
    const closeSearchBtn = document.getElementById('close-search');

    mobileSearchBtn.onclick = () => toggleSearch(true);
    desktopSearchBtn.onclick = () => toggleSearch(true);
    closeSearchBtn.onclick = () => toggleSearch(false);

    searchInput.oninput = (e) => renderSearchResults(e.target.value);
}

// Start
initApp();

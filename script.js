// === CONFIG & STATE ===
const LIBRARY_DATA_URL = './library.json';
let libraryData = [];
let currentTab = 'home'; // 'home', 'library', 'bookmarks'
let searchQuery = '';

// Load User Preferences
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

// === STORAGE MANAGER (Local Storage) ===
const Storage = {
    getProgress: () => JSON.parse(localStorage.getItem('elibtida_progress')) || {},
    setProgress: (bookId, chapterIndex) => {
        const progress = Storage.getProgress();
        progress[bookId] = { chapterIndex, lastRead: Date.now() };
        localStorage.setItem('elibtida_progress', JSON.stringify(progress));
    },
    getBookmarks: () => JSON.parse(localStorage.getItem('elibtida_bookmarks')) || [],
    toggleBookmark: (bookId) => {
        let bookmarks = Storage.getBookmarks();
        if (bookmarks.includes(bookId)) {
            bookmarks = bookmarks.filter(id => id !== bookId);
            toast.show('Dihapus dari Tersimpan', 'info');
        } else {
            bookmarks.push(bookId);
            toast.show('Ditambahkan ke Tersimpan', 'success');
        }
        localStorage.setItem('elibtida_bookmarks', JSON.stringify(bookmarks));
        if (currentTab === 'bookmarks') renderContent();
        else updateUI();
    }
};

// === DATA LOADER ===
async function initApp() {
    loadPreferences();
    try {
        const res = await fetch(LIBRARY_DATA_URL);
        libraryData = await res.json();
    } catch (err) {
        console.error('Gagal load library:', err);
        toast.show('Gagal memuat data buku', 'error');
    }
    renderContent();
    bindEvents();
}

// === RENDER LOGIC ===
function renderContent() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = ''; // Clear

    if (currentTab === 'home') {
        renderHome(contentArea);
    } else if (currentTab === 'library') {
        renderLibrary(contentArea);
    } else if (currentTab === 'bookmarks') {
        renderBookmarks(contentArea);
    }
}

// 1. HOME VIEW
function renderHome(container) {
    const progressData = Storage.getProgress();
    
    // Get "Continue Reading" books (sort by most recent)
    const continueReading = libraryData
        .filter(book => progressData[book.id])
        .sort((a, b) => progressData[b.id].lastRead - progressData[a.id].lastRead);

    // Header
    container.innerHTML += `
        <div class="mb-8 animate-fade-in-up">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1 font-serif">Selamat Datang,</h2>
            <p class="text-gray-500 dark:text-gray-400">Mari lanjutkan petualangan membaca Anda.</p>
        </div>
    `;

    // Continue Reading Section
    if (continueReading.length > 0) {
        container.innerHTML += `
            <div class="flex justify-between items-end mb-4 animate-fade-in-up" style="animation-delay: 0.1s">
                <h3 class="font-bold text-gray-800 dark:text-white">Lanjut Membaca</h3>
                <span class="text-xs text-brand-main font-medium cursor-pointer" onclick="switchTab('library')">Lihat Semua</span>
            </div>
            <div class="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 animate-fade-in-up" style="animation-delay: 0.2s">
                ${continueReading.map(book => createCard(book, 'horizontal')).join('')}
            </div>
            <div class="h-px bg-gray-200 dark:bg-white/10 my-8"></div>
        `;
    }

    // Featured / New Arrivals
    container.innerHTML += `
        <div class="mb-4 animate-fade-in-up" style="animation-delay: 0.3s">
            <h3 class="font-bold text-gray-800 dark:text-white">Terbaru & Rekomendasi</h3>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in-up" style="animation-delay: 0.4s">
            ${libraryData.map(book => createCard(book, 'grid')).join('')}
        </div>
    `;
}

// 2. LIBRARY VIEW
function renderLibrary(container) {
    container.innerHTML = `
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
            ${filterBooks().map(book => createCard(book, 'grid')).join('')}
        </div>
    `;
}

// 3. BOOKMARKS VIEW
function renderBookmarks(container) {
    const bookmarkedIds = Storage.getBookmarks();
    const bookmarkedBooks = libraryData.filter(b => bookmarkedIds.includes(b.id));

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
                ${bookmarkedBooks.map(book => createCard(book, 'grid')).join('')}
            </div>
        `;
    }
}

// === COMPONENT: BOOK CARD ===
function createCard(book, layout) {
    const progressData = Storage.getProgress();
    const progress = progressData[book.id] || {};
    const isBookmarked = Storage.getBookmarks().includes(book.id);
    
    // Status Badge Logic
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
                            <button onclick="event.preventDefault(); Storage.toggleBookmark('${book.id}')" class="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition">
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
    renderContent(); // Re-render library
}

function switchTab(tab) {
    currentTab = tab;
    
    // Update UI States
    document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(el => {
        const isActive = el.dataset.tab === tab;
        // Styles for active
        if (isActive) {
            if(el.classList.contains('nav-item')) {
                el.classList.add('bg-white', 'dark:bg-white/10', 'text-brand-main', 'dark:text-white', 'shadow-soft');
                el.classList.remove('text-gray-400', 'hover:bg-white');
            } else {
                el.classList.add('text-brand-main');
                el.classList.remove('text-gray-400');
            }
        } else {
            // Reset styles
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
        results.innerHTML = filtered.map(book => createCard(book, 'horizontal')).join('');
    }
}

// Toast Notification
function toast(msg, type = 'info') {
    // Simple toast implementation
    const div = document.createElement('div');
    div.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-50 text-sm font-medium animate-fade-in-up ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-gray-800 text-white'
    }`;
    div.innerText = msg;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 2000);
}

function bindEvents() {
    // Tab Switchers
    document.querySelectorAll('.nav-item, .nav-item-mobile').forEach(btn => {
        if(btn.dataset.tab) btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // Theme Toggles
    document.getElementById('theme-toggle-desktop').onclick = toggleTheme;
    
    // Search
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

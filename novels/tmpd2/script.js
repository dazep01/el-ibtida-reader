// ==========================================
// NOVEL READER - Aplikasi Pembaca Novel
// Versi: 2.0.0 (Robust & Production Ready)
// ==========================================

// === KONFIGURASI APLIKASI ===
const CONFIG = {
    // Environment variables (dalam produksi, ini harus di-set melalui build process)
    JSONBIN_ID: window.NOVEL_APP_JSONBIN_ID || '6951127043b1c97be909f7c1',
    JSONBIN_KEY: window.NOVEL_APP_JSONBIN_KEY || null, // Akan diambil dari environment
    
    // App Configuration
    APP_NAME: 'Novel Reader',
    VERSION: '2.0.0',
    
    // Default Settings
    DEFAULT_SETTINGS: {
        theme: 'auto',
        fontSize: 16,
        fontFamily: 'serif',
        lineHeight: 1.6
    },
    
    // API Endpoints (dalam produksi, gunakan backend proxy)
    API: {
        JSONBIN: {
            BASE_URL: 'https://api.jsonbin.io/v3',
            GET: '/b/{ID}/latest',
            PUT: '/b/{ID}'
        }
    },
    
    // Error Messages
    ERRORS: {
        NETWORK: 'Koneksi jaringan bermasalah. Periksa koneksi internet Anda.',
        DATA_LOAD: 'Gagal memuat data novel.',
        REVIEW_LOAD: 'Gagal memuat ulasan.',
        REVIEW_SUBMIT: 'Gagal mengirim ulasan.',
        INVALID_DATA: 'Data novel tidak valid.'
    }
};

// === STATE MANAGEMENT ===
class AppState {
    constructor() {
        this.novelData = null;
        this.reviews = [];
        this.settings = { ...CONFIG.DEFAULT_SETTINGS };
        this.currentChapter = 0;
        this.bookmarks = new Set();
        this.highlights = [];
        this.isInitialized = false;
        this.isLoading = false;
    }
    
    // Singleton pattern
    static getInstance() {
        if (!AppState.instance) {
            AppState.instance = new AppState();
        }
        return AppState.instance;
    }
    
    // Load settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem('novel-reader-settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
            
            // Load bookmarks
            const savedBookmarks = localStorage.getItem('novel-reader-bookmarks');
            if (savedBookmarks) {
                this.bookmarks = new Set(JSON.parse(savedBookmarks));
            }
            
            // Load highlights
            const savedHighlights = localStorage.getItem('novel-reader-highlights');
            if (savedHighlights) {
                this.highlights = JSON.parse(savedHighlights);
            }
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
    }
    
    // Save settings to localStorage
    saveSettings() {
        try {
            localStorage.setItem('novel-reader-settings', JSON.stringify(this.settings));
            localStorage.setItem('novel-reader-bookmarks', 
                JSON.stringify(Array.from(this.bookmarks)));
            localStorage.setItem('novel-reader-highlights', 
                JSON.stringify(this.highlights));
        } catch (error) {
            console.warn('Failed to save settings:', error);
        }
    }
    
    // Validate novel data structure
    validateNovelData(data) {
        if (!data) return false;
        if (!data.title || typeof data.title !== 'string') return false;
        if (!data.author || typeof data.author !== 'string') return false;
        if (!Array.isArray(data.chapters)) return false;
        
        // Validate each chapter
        return data.chapters.every(chapter => 
            chapter && 
            chapter.title && 
            typeof chapter.title === 'string' &&
            chapter.content && 
            typeof chapter.content === 'string'
        );
    }
}

// === ERROR HANDLER ===
class ErrorHandler {
    static handle(error, context = 'unknown') {
        console.error(`[${context}]`, error);
        
        // User-friendly error messages
        let message = CONFIG.ERRORS.NETWORK;
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            message = CONFIG.ERRORS.NETWORK;
        } else if (error.message.includes('data')) {
            message = CONFIG.ERRORS.DATA_LOAD;
        } else if (error.message.includes('review')) {
            message = CONFIG.ERRORS.REVIEW_LOAD;
        }
        
        return {
            error: true,
            message,
            originalError: error.message,
            context
        };
    }
    
    static showUserError(message) {
        Toast.show(message, 'error');
    }
}

// === TOAST NOTIFICATION SYSTEM ===
class Toast {
    static container = null;
    static queue = [];
    static isShowing = false;
    
    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 items-end max-w-md';
            document.body.appendChild(this.container);
        }
    }
    
    static show(message, type = 'info', duration = 4000) {
        this.init();
        
        const toast = {
            id: Date.now(),
            message,
            type,
            duration
        };
        
        this.queue.push(toast);
        this.processQueue();
    }
    
    static processQueue() {
        if (this.isShowing || this.queue.length === 0) return;
        
        this.isShowing = true;
        const toast = this.queue.shift();
        this.display(toast);
    }
    
    static display(toast) {
        const element = document.createElement('div');
        element.id = `toast-${toast.id}`;
        element.className = 'toast-message animate-slide-in';
        element.setAttribute('role', 'alert');
        element.setAttribute('aria-live', 'polite');
        
        // Icons based on type
        const icons = {
            success: 'ph-fill ph-check-circle text-green-400',
            error: 'ph-fill ph-warning-circle text-red-400',
            warning: 'ph-fill ph-warning text-yellow-400',
            info: 'ph-fill ph-info text-blue-400'
        };
        
        element.innerHTML = `
            <div class="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border-l-4 ${toast.type === 'success' ? 'border-green-500' : toast.type === 'error' ? 'border-red-500' : toast.type === 'warning' ? 'border-yellow-500' : 'border-blue-500'}">
                <i class="${icons[toast.type] || icons.info} text-lg"></i>
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">${toast.message}</span>
                <button onclick="Toast.dismiss('${toast.id}')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <i class="ph ph-x"></i>
                </button>
            </div>
        `;
        
        this.container.appendChild(element);
        
        // Auto-dismiss
        setTimeout(() => {
            this.dismiss(toast.id);
        }, toast.duration);
        
        // Click to dismiss
        element.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                this.dismiss(toast.id);
            }
        });
    }
    
    static dismiss(id) {
        const element = document.getElementById(`toast-${id}`);
        if (element) {
            element.classList.remove('animate-slide-in');
            element.classList.add('animate-slide-out');
            
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                this.isShowing = false;
                this.processQueue();
            }, 300);
        }
    }
    
    static clearAll() {
        this.container.innerHTML = '';
        this.queue = [];
        this.isShowing = false;
    }
}

// === REVIEW SERVICE (Dengan Backend Proxy Pattern) ===
class ReviewService {
    constructor() {
        this.baseUrl = CONFIG.API.JSONBIN.BASE_URL;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }
    
    async fetchReviews() {
        const state = AppState.getInstance();
        const cacheKey = 'reviews';
        
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            state.reviews = cached.data;
            return state.reviews;
        }
        
        try {
            // In production, this should be a backend endpoint
            // For now, we'll use direct JSONBin call with error handling
            const response = await this.safeFetch(
                `${this.baseUrl}/b/${CONFIG.JSONBIN_ID}/latest`,
                {
                    headers: this.getHeaders(),
                    signal: AbortSignal.timeout(10000) // 10 second timeout
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Validate and sanitize data
            const reviews = this.sanitizeReviews(data.record);
            state.reviews = reviews;
            
            // Update cache
            this.cache.set(cacheKey, {
                data: reviews,
                timestamp: Date.now()
            });
            
            return reviews;
        } catch (error) {
            ErrorHandler.handle(error, 'fetchReviews');
            
            // Return empty array as fallback
            state.reviews = [];
            return [];
        }
    }
    
    async submitReview(review) {
        try {
            // Validate review data
            if (!this.validateReview(review)) {
                throw new Error('Data ulasan tidak valid');
            }
            
            // Get current reviews
            const currentReviews = await this.fetchReviews();
            
            // Add new review with metadata
            const newReview = {
                ...review,
                id: this.generateId(),
                timestamp: Date.now(),
                date: new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                })
            };
            
            // Add to beginning of array
            const updatedReviews = [newReview, ...currentReviews];
            
            // Limit to 100 reviews to prevent excessive data
            if (updatedReviews.length > 100) {
                updatedReviews.length = 100;
            }
            
            // Send to server
            const response = await this.safeFetch(
                `${this.baseUrl}/b/${CONFIG.JSONBIN_ID}`,
                {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedReviews),
                    signal: AbortSignal.timeout(15000)
                }
            );
            
            if (!response.ok) {
                throw new Error(`Gagal menyimpan: HTTP ${response.status}`);
            }
            
            // Update local state and cache
            const state = AppState.getInstance();
            state.reviews = updatedReviews;
            
            this.cache.set('reviews', {
                data: updatedReviews,
                timestamp: Date.now()
            });
            
            return newReview;
            
        } catch (error) {
            ErrorHandler.handle(error, 'submitReview');
            throw error;
        }
    }
    
    sanitizeReviews(reviews) {
        if (!Array.isArray(reviews)) return [];
        
        return reviews.filter(review => 
            review && 
            typeof review === 'object' &&
            typeof review.name === 'string' &&
            typeof review.rating === 'number' &&
            review.rating >= 1 && review.rating <= 5 &&
            typeof review.comment === 'string' &&
            review.comment.trim().length > 0 &&
            review.comment.length <= 500 // Limit comment length
        ).slice(0, 50); // Limit to 50 reviews
    }
    
    validateReview(review) {
        return review &&
            typeof review.name === 'string' &&
            review.name.length <= 50 &&
            typeof review.rating === 'number' &&
            review.rating >= 1 && review.rating <= 5 &&
            typeof review.comment === 'string' &&
            review.comment.trim().length >= 3 &&
            review.comment.length <= 500;
    }
    
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'X-Bin-Versioning': 'false'
        };
        
        // Only add API key if available
        if (CONFIG.JSONBIN_KEY) {
            headers['X-Master-Key'] = CONFIG.JSONBIN_KEY;
        }
        
        return headers;
    }
    
    async safeFetch(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// === DATA LOADER ===
class DataLoader {
    static async loadNovelData() {
        const state = AppState.getInstance();
        
        if (state.novelData) {
            return state.novelData;
        }
        
        try {
            // Try multiple potential paths
            const paths = [
                'data.json',
                './data.json',
                '../data.json',
                window.location.pathname.replace(/[^/]*$/, '') + 'data.json'
            ];
            
            let data = null;
            
            for (const path of paths) {
                try {
                    const response = await fetch(path, {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (response.ok) {
                        data = await response.json();
                        
                        // Validate data structure
                        if (state.validateNovelData(data)) {
                            state.novelData = data;
                            return data;
                        } else {
                            console.warn(`Data dari ${path} tidak valid`);
                            data = null;
                        }
                    }
                } catch (error) {
                    // Continue to next path
                    console.debug(`Gagal memuat dari ${path}:`, error.message);
                }
            }
            
            if (!data) {
                throw new Error(CONFIG.ERRORS.INVALID_DATA);
            }
            
        } catch (error) {
            ErrorHandler.handle(error, 'loadNovelData');
            throw error;
        }
    }
}

// === THEME MANAGER ===
class ThemeManager {
    static init() {
        this.applyTheme();
        this.setupListeners();
    }
    
    static applyTheme() {
        const state = AppState.getInstance();
        const savedTheme = state.settings.theme;
        
        let theme = savedTheme;
        
        if (theme === 'auto') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark-mode');
        }
        
        this.updateThemeIcons(theme === 'dark');
    }
    
    static toggleTheme() {
        const state = AppState.getInstance();
        const current = state.settings.theme;
        
        let newTheme;
        
        if (current === 'auto') {
            newTheme = 'light';
        } else if (current === 'light') {
            newTheme = 'dark';
        } else {
            newTheme = 'auto';
        }
        
        state.settings.theme = newTheme;
        state.saveSettings();
        
        this.applyTheme();
        Toast.show(`Mode ${newTheme === 'auto' ? 'Otomatis' : newTheme === 'dark' ? 'Gelap' : 'Terang'} diaktifkan`);
    }
    
    static setupListeners() {
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const state = AppState.getInstance();
            if (state.settings.theme === 'auto') {
                this.applyTheme();
            }
        });
    }
    
    static updateThemeIcons(isDark) {
        const icons = document.querySelectorAll('[data-theme-icon]');
        icons.forEach(icon => {
            if (isDark) {
                icon.classList.remove('ph-moon');
                icon.classList.add('ph-sun');
                icon.classList.add('text-yellow-400');
            } else {
                icon.classList.remove('ph-sun');
                icon.classList.remove('text-yellow-400');
                icon.classList.add('ph-moon');
            }
        });
    }
}

// === UI CONTROLLER ===
class UIController {
    constructor() {
        this.state = AppState.getInstance();
        this.reviewService = new ReviewService();
        this.currentStarRating = 0;
        this.isSynopsisExpanded = false;
    }
    
    init() {
        this.renderNovelInfo();
        this.renderChapters();
        this.bindEvents();
        this.renderReviews();
        this.setupStarRating();
        this.setupScrollProgress();
    }
    
    renderNovelInfo() {
        if (!this.state.novelData) return;
        
        const data = this.state.novelData;
        
        // Update cover section
        this.updateElement('#cover-title', data.title.split('#')[0].trim());
        this.updateElement('#cover-author', data.author);
        
        // Update detail section
        this.updateElement('#detail-title', data.title);
        this.updateElement('#detail-author', data.author);
        this.updateElement('#chapter-count', `${data.chapters.length} Bab`);
        
        // Description with toggle
        const descElement = document.getElementById('detail-desc');
        if (descElement) {
            descElement.textContent = data.description;
            if (!this.isSynopsisExpanded) {
                descElement.classList.add('line-clamp-3');
            }
        }
    }
    
    renderChapters() {
        if (!this.state.novelData) return;
        
        const container = document.getElementById('chapter-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.state.novelData.chapters.forEach((chapter, index) => {
            const chapterElement = document.createElement('div');
            chapterElement.className = 'chapter-item';
            chapterElement.dataset.index = index;
            
            const isBookmarked = this.state.bookmarks.has(index);
            
            chapterElement.innerHTML = `
                <div class="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-slate/30 transition-all duration-200 cursor-pointer group">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium text-sm group-hover:bg-brand-slate group-hover:text-white transition-colors flex-shrink-0">
                            ${index + 1}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-medium text-gray-800 dark:text-gray-200 truncate">${this.escapeHtml(chapter.title)}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${chapter.wordCount || '0'} kata • ${this.estimateReadingTime(chapter)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="bookmark-btn p-2 text-gray-400 hover:text-yellow-500 transition-colors ${isBookmarked ? 'text-yellow-500' : ''}"
                                data-index="${index}"
                                onclick="event.stopPropagation(); uiController.toggleBookmark(${index})">
                            <i class="ph ${isBookmarked ? 'ph-bookmark-simple-fill' : 'ph-bookmark-simple'}"></i>
                        </button>
                        <i class="ph ph-caret-right text-gray-300 dark:text-gray-600 group-hover:text-brand-slate transition-colors"></i>
                    </div>
                </div>
            `;
            
            chapterElement.addEventListener('click', () => ReaderController.open(index));
            container.appendChild(chapterElement);
        });
    }
    
    renderReviews() {
        const container = document.getElementById('reviews-container');
        if (!container) return;
        
        if (this.state.reviews.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-chat-circle-text text-3xl text-gray-300 dark:text-gray-600 mb-3"></i>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Belum ada ulasan</p>
                    <p class="text-gray-400 dark:text-gray-500 text-xs mt-1">Jadilah yang pertama berbagi pendapat!</p>
                </div>
            `;
            this.updateElement('#avg-rating', '0.0');
            this.updateElement('#review-count', '0 ulasan');
            return;
        }
        
        // Calculate average rating
        const avgRating = (this.state.reviews.reduce((sum, review) => sum + review.rating, 0) / this.state.reviews.length).toFixed(1);
        this.updateElement('#avg-rating', avgRating);
        this.updateElement('#review-count', `${this.state.reviews.length} ulasan`);
        
        // Render reviews
        container.innerHTML = this.state.reviews.map(review => `
            <div class="review-card">
                <div class="flex items-start gap-3">
                    <div class="review-avatar">
                        ${review.name ? review.name[0].toUpperCase() : '?'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-2">
                            <h5 class="review-author">${this.escapeHtml(review.name) || 'Anonim'}</h5>
                            <div class="review-rating">
                                ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
                                <span class="review-date">${review.date || 'Baru saja'}</span>
                            </div>
                        </div>
                        <p class="review-comment">"${this.escapeHtml(review.comment)}"</p>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    setupStarRating() {
        const container = document.getElementById('star-input');
        if (!container) return;
        
        container.innerHTML = '';
        
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('button');
            star.type = 'button';
            star.className = 'star-btn';
            star.dataset.rating = i;
            star.innerHTML = '<i class="ph-fill ph-star"></i>';
            star.addEventListener('click', () => this.setStarRating(i));
            star.addEventListener('mouseenter', () => this.previewStarRating(i));
            container.appendChild(star);
        }
        
        // Reset preview when mouse leaves
        container.addEventListener('mouseleave', () => {
            this.updateStarDisplay(this.currentStarRating);
        });
    }
    
    setStarRating(rating) {
        this.currentStarRating = rating;
        this.updateStarDisplay(rating);
    }
    
    previewStarRating(rating) {
        this.updateStarDisplay(rating, true);
    }
    
    updateStarDisplay(rating, isPreview = false) {
        const stars = document.querySelectorAll('#star-input .star-btn i');
        stars.forEach((star, index) => {
            const starRating = index + 1;
            if (starRating <= rating) {
                star.classList.remove('text-gray-300', 'dark:text-gray-600');
                star.classList.add('text-amber-400');
            } else {
                star.classList.remove('text-amber-400');
                star.classList.add('text-gray-300', 'dark:text-gray-600');
            }
            
            if (isPreview) {
                star.classList.add('opacity-80');
            } else {
                star.classList.remove('opacity-80');
            }
        });
    }
    
    async submitReview() {
        const nameInput = document.getElementById('input-name');
        const commentInput = document.getElementById('input-comment');
        
        const name = (nameInput?.value || '').trim();
        const comment = (commentInput?.value || '').trim();
        
        // Validation
        if (this.currentStarRating === 0) {
            Toast.show('Berikan rating bintang terlebih dahulu', 'error');
            return;
        }
        
        if (!comment) {
            Toast.show('Tulis ulasan terlebih dahulu', 'error');
            return;
        }
        
        if (comment.length < 3) {
            Toast.show('Ulasan terlalu pendek', 'error');
            return;
        }
        
        if (comment.length > 500) {
            Toast.show('Ulasan terlalu panjang (maksimal 500 karakter)', 'error');
            return;
        }
        
        try {
            const review = {
                name: name || 'Pembaca',
                rating: this.currentStarRating,
                comment: comment
            };
            
            await this.reviewService.submitReview(review);
            
            // Reset form
            this.currentStarRating = 0;
            this.updateStarDisplay(0);
            if (nameInput) nameInput.value = '';
            if (commentInput) commentInput.value = '';
            
            // Close modal
            this.closeReviewModal();
            
            Toast.show('Ulasan berhasil dikirim! Terima kasih.', 'success');
            
        } catch (error) {
            Toast.show('Gagal mengirim ulasan. Silakan coba lagi.', 'error');
        }
    }
    
    toggleSynopsis() {
        const descElement = document.getElementById('detail-desc');
        const button = document.getElementById('btn-synopsis');
        
        if (!descElement || !button) return;
        
        this.isSynopsisExpanded = !this.isSynopsisExpanded;
        
        if (this.isSynopsisExpanded) {
            descElement.classList.remove('line-clamp-3');
            button.innerHTML = 'Tutup <i class="ph-bold ph-caret-up"></i>';
        } else {
            descElement.classList.add('line-clamp-3');
            button.innerHTML = 'Baca Selengkapnya <i class="ph-bold ph-caret-down"></i>';
            
            // Smooth scroll to description
            descElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }
    
    toggleBookmark(chapterIndex) {
        if (this.state.bookmarks.has(chapterIndex)) {
            this.state.bookmarks.delete(chapterIndex);
            Toast.show('Bookmark dihapus');
        } else {
            this.state.bookmarks.add(chapterIndex);
            Toast.show('Bab ditandai', 'success');
        }
        
        this.state.saveSettings();
        this.renderChapters(); // Re-render to update bookmark icons
    }
    
    openReviewModal() {
        const modal = document.getElementById('modal-review');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.add('active');
                document.getElementById('input-comment')?.focus();
            }, 10);
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeReviewModal() {
        const modal = document.getElementById('modal-review');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }
    }
    
    setupScrollProgress() {
        const mainScroll = document.getElementById('main-scroll');
        const progressBar = document.getElementById('scroll-progress');
        
        if (!mainScroll || !progressBar) return;
        
        mainScroll.addEventListener('scroll', () => {
            const scrollTop = mainScroll.scrollTop;
            const scrollHeight = mainScroll.scrollHeight - mainScroll.clientHeight;
            const scrollPercent = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
            
            progressBar.style.width = `${scrollPercent}%`;
        });
    }
    
    bindEvents() {
        // Synopsis toggle
        document.getElementById('btn-synopsis')?.addEventListener('click', () => this.toggleSynopsis());
        
        // Review modal
        document.getElementById('open-review-btn')?.addEventListener('click', () => this.openReviewModal());
        document.getElementById('close-review-btn')?.addEventListener('click', () => this.closeReviewModal());
        document.getElementById('review-backdrop')?.addEventListener('click', () => this.closeReviewModal());
        document.getElementById('submit-review-btn')?.addEventListener('click', () => this.submitReview());
        
        // Theme toggle
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => ThemeManager.toggleTheme());
        document.getElementById('nav-theme-btn')?.addEventListener('click', () => ThemeManager.toggleTheme());
        
        // Bookmark
        document.getElementById('btn-bookmark')?.addEventListener('click', () => {
            this.toggleBookmark(this.state.currentChapter);
        });
        
        // Start reading buttons
        document.getElementById('start-reading-btn')?.addEventListener('click', () => ReaderController.open(0));
        document.getElementById('start-fab-btn')?.addEventListener('click', () => ReaderController.open(0));
        
        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeReviewModal();
                SearchController.hide();
                ReaderController.closeSettings();
            }
        });
    }
    
    // Helper methods
    updateElement(selector, content) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = content;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    estimateReadingTime(chapter) {
        const words = chapter.wordCount || chapter.content.split(/\s+/).length;
        const minutes = Math.ceil(words / 200); // Average reading speed
        return `${minutes} mnt`;
    }
}

// === READER CONTROLLER ===
class ReaderController {
    static state = AppState.getInstance();
    static isUIHidden = false;
    
    static open(chapterIndex) {
        if (!this.state.novelData || !this.state.novelData.chapters[chapterIndex]) {
            Toast.show('Bab tidak ditemukan', 'error');
            return;
        }
        
        this.state.currentChapter = chapterIndex;
        this.render();
        
        const readerView = document.getElementById('view-reader');
        if (readerView) {
            readerView.classList.remove('hidden');
            setTimeout(() => {
                readerView.classList.add('active');
                document.body.style.overflow = 'hidden';
            }, 10);
        }
    }
    
    static close() {
        const readerView = document.getElementById('view-reader');
        if (readerView) {
            readerView.classList.remove('active');
            setTimeout(() => {
                readerView.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }
    }
    
    static render() {
        const chapter = this.state.novelData.chapters[this.state.currentChapter];
        if (!chapter) return;
        
        // Update UI elements
        this.updateElement('#reader-title', chapter.title);
        this.updateElement('#reader-nav-title', `Bab ${this.state.currentChapter + 1}`);
        
        // Render content with proper formatting
        const readerBody = document.getElementById('reader-body');
        if (readerBody) {
            readerBody.innerHTML = this.formatChapterContent(chapter.content);
        }
        
        // Update navigation buttons
        this.updateNavigation();
        
        // Update progress
        this.updateProgress();
        
        // Reset scroll position
        const readerScroll = document.getElementById('reader-scroll');
        if (readerScroll) {
            readerScroll.scrollTop = 0;
        }
    }
    
    static formatChapterContent(content) {
        // Basic content formatting
        let formatted = content
            .replace(/\n\s*\n/g, '</p><p>') // Double newlines to paragraph breaks
            .replace(/\n/g, '<br>'); // Single newlines to line breaks
        
        // Wrap in paragraphs if needed
        if (!formatted.includes('<p>')) {
            formatted = `<p>${formatted}</p>`;
        }
        
        // Apply reader settings
        return `<div class="reader-content" style="font-size: ${this.state.settings.fontSize}px; font-family: ${this.state.settings.fontFamily}; line-height: ${this.state.settings.lineHeight}">${formatted}</div>`;
    }
    
    static navigate(direction) {
        const newIndex = this.state.currentChapter + direction;
        const totalChapters = this.state.novelData.chapters.length;
        
        if (newIndex >= 0 && newIndex < totalChapters) {
            this.state.currentChapter = newIndex;
            this.render();
        }
    }
    
    static updateNavigation() {
        const totalChapters = this.state.novelData.chapters.length;
        const prevBtn = document.getElementById('btn-prev');
        const nextBtn = document.getElementById('btn-next');
        
        if (prevBtn) {
            prevBtn.disabled = this.state.currentChapter === 0;
            prevBtn.classList.toggle('opacity-50', this.state.currentChapter === 0);
            prevBtn.classList.toggle('cursor-not-allowed', this.state.currentChapter === 0);
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.state.currentChapter === totalChapters - 1;
            nextBtn.classList.toggle('opacity-50', this.state.currentChapter === totalChapters - 1);
            nextBtn.classList.toggle('cursor-not-allowed', this.state.currentChapter === totalChapters - 1);
        }
    }
    
    static updateProgress() {
        const totalChapters = this.state.novelData.chapters.length;
        const progressPercent = ((this.state.currentChapter + 1) / totalChapters) * 100;
        
        const progressBar = document.getElementById('progress-bar');
        const miniProgress = document.getElementById('mini-progress');
        
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
        }
        
        if (miniProgress) {
            miniProgress.style.width = `${progressPercent}%`;
        }
        
        // Update progress text
        this.updateElement('#progress-text', `${this.state.currentChapter + 1}/${totalChapters}`);
    }
    
    static jumpToProgress(event) {
        const container = event.currentTarget;
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percent = x / rect.width;
        
        const totalChapters = this.state.novelData.chapters.length;
        const targetIndex = Math.floor(percent * totalChapters);
        
        if (targetIndex >= 0 && targetIndex < totalChapters) {
            this.state.currentChapter = targetIndex;
            this.render();
        }
    }
    
    static toggleUI() {
        this.isUIHidden = !this.isUIHidden;
        
        const topBar = document.getElementById('reader-top');
        const bottomBar = document.getElementById('reader-bottom');
        
        if (topBar) {
            topBar.classList.toggle('hidden', this.isUIHidden);
        }
        
        if (bottomBar) {
            bottomBar.classList.toggle('hidden', this.isUIHidden);
        }
    }
    
    static openSettings() {
        const panel = document.getElementById('settings-panel');
        if (panel) {
            panel.classList.remove('hidden');
            setTimeout(() => {
                panel.classList.add('active');
            }, 10);
        }
    }
    
    static closeSettings() {
        const panel = document.getElementById('settings-panel');
        if (panel) {
            panel.classList.remove('active');
            setTimeout(() => {
                panel.classList.add('hidden');
            }, 300);
        }
    }
    
    static updateSetting(setting, value) {
        this.state.settings[setting] = value;
        this.state.saveSettings();
        this.render(); // Re-render with new settings
    }
    
    static updateElement(selector, content) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = content;
        }
    }
}

// === SEARCH CONTROLLER ===
class SearchController {
    static results = [];
    
    static show() {
        const modal = document.getElementById('search-modal');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.add('active');
                document.getElementById('search-input')?.focus();
            }, 10);
        }
    }
    
    static hide() {
        const modal = document.getElementById('search-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.classList.add('hidden');
                this.clearResults();
            }, 300);
        }
    }
    
    static perform(query) {
        const state = AppState.getInstance();
        if (!state.novelData) return;
        
        const searchTerm = query.trim().toLowerCase();
        if (!searchTerm) {
            this.clearResults();
            return;
        }
        
        this.results = [];
        
        state.novelData.chapters.forEach((chapter, index) => {
            // Remove HTML tags for searching
            const textContent = chapter.content.replace(/<[^>]*>/g, ' ').toLowerCase();
            let matchIndex = textContent.indexOf(searchTerm);
            
            while (matchIndex !== -1 && this.results.length < 50) { // Limit results
                const start = Math.max(0, matchIndex - 60);
                const end = Math.min(textContent.length, matchIndex + searchTerm.length + 60);
                
                let context = textContent.substring(start, end);
                
                // Add ellipsis if not at start/end
                if (start > 0) context = '...' + context;
                if (end < textContent.length) context = context + '...';
                
                // Highlight matching term
                const highlighted = context.replace(
                    new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                    match => `<mark>${match}</mark>`
                );
                
                this.results.push({
                    chapterIndex: index,
                    chapterTitle: chapter.title,
                    context: highlighted,
                    position: matchIndex
                });
                
                matchIndex = textContent.indexOf(searchTerm, matchIndex + 1);
            }
        });
        
        this.renderResults();
    }
    
    static renderResults() {
        const container = document.getElementById('search-results');
        const countElement = document.getElementById('search-count');
        
        if (!container) return;
        
        if (this.results.length === 0) {
            container.innerHTML = `
                <div class="empty-search">
                    <i class="ph ph-magnifying-glass text-2xl text-gray-300 mb-2"></i>
                    <p class="text-gray-500">Tidak ditemukan</p>
                </div>
            `;
            
            if (countElement) {
                countElement.textContent = '0 hasil';
            }
            return;
        }
        
        container.innerHTML = this.results.map(result => `
            <div class="search-result" onclick="SearchController.openResult(${result.chapterIndex})">
                <div class="result-header">
                    <span class="result-chapter">Bab ${result.chapterIndex + 1}</span>
                    <h4 class="result-title">${result.chapterTitle}</h4>
                </div>
                <div class="result-context">...${result.context}...</div>
            </div>
        `).join('');
        
        if (countElement) {
            countElement.textContent = `${this.results.length} hasil ditemukan`;
        }
    }
    
    static openResult(chapterIndex) {
        this.hide();
        ReaderController.open(chapterIndex);
    }
    
    static clearResults() {
        this.results = [];
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        
        this.renderResults();
    }
}

// === NAVIGATION MENU ===
class NavigationMenu {
    static isOpen = false;
    static clickListener = null;
    
    static toggle() {
        const nav = document.getElementById('floating-nav');
        const toggle = document.getElementById('nav-toggle-btn');
        
        if (!nav || !toggle) return;
        
        if (nav.classList.contains('hidden')) {
            this.show(nav, toggle);
        } else {
            this.hide(nav);
        }
    }
    
    static show(nav, toggle) {
        nav.classList.remove('hidden');
        setTimeout(() => {
            nav.classList.add('active');
        }, 10);
        
        this.isOpen = true;
        
        // Close on outside click
        this.clickListener = (event) => {
            if (!nav.contains(event.target) && !toggle.contains(event.target)) {
                this.hide(nav);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', this.clickListener);
        }, 10);
    }
    
    static hide(nav) {
        nav.classList.remove('active');
        setTimeout(() => {
            nav.classList.add('hidden');
        }, 300);
        
        this.isOpen = false;
        
        if (this.clickListener) {
            document.removeEventListener('click', this.clickListener);
            this.clickListener = null;
        }
    }
}

// === SHARE CONTROLLER ===
class ShareController {
    static async shareBook() {
        const state = AppState.getInstance();
        if (!state.novelData) return;
        
        const shareData = {
            title: state.novelData.title,
            text: `Baca "${state.novelData.title}" karya ${state.novelData.author}`,
            url: window.location.href
        };
        
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(`${shareData.text}\n\n${shareData.url}`);
                Toast.show('Link berhasil disalin ke clipboard!', 'success');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share failed:', error);
            }
        }
    }
    
    static async shareQuote(text) {
        const state = AppState.getInstance();
        
        const quoteText = `"${text}"\n\n— ${state.novelData?.title || 'Novel'}`;
        
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Kutipan Favorit',
                    text: quoteText
                });
            } else {
                await navigator.clipboard.writeText(quoteText);
                Toast.show('Kutipan disalin ke clipboard', 'success');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share quote failed:', error);
            }
        }
    }
}

// === PWA INSTALLER ===
class PWAInstaller {
    static deferredPrompt = null;
    static installButton = null;
    
    static init() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
        });
        
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            Toast.show('Aplikasi berhasil diinstal!', 'success');
            this.hideInstallButton();
        });
    }
    
    static showInstallButton() {
        // Add install button to navigation menu
        const nav = document.getElementById('floating-nav');
        if (!nav || this.installButton) return;
        
        this.installButton = document.createElement('button');
        this.installButton.className = 'install-pwa-btn';
        this.installButton.innerHTML = `
            <i class="ph ph-download-simple"></i>
            <span>Install Aplikasi</span>
        `;
        
        this.installButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.promptInstall();
            NavigationMenu.toggle();
        });
        
        const container = nav.querySelector('.nav-content');
        if (container) {
            container.insertBefore(this.installButton, container.firstChild);
            Toast.show('Aplikasi tersedia untuk diinstal');
        }
    }
    
    static hideInstallButton() {
        if (this.installButton) {
            this.installButton.remove();
            this.installButton = null;
        }
    }
    
    static async promptInstall() {
        if (!this.deferredPrompt) return;
        
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        this.deferredPrompt = null;
        this.hideInstallButton();
        
        if (outcome === 'accepted') {
            console.log('User accepted install');
        }
    }
}

// === APPLICATION INITIALIZATION ===
class NovelReaderApp {
    static state = AppState.getInstance();
    static ui = null;
    static isInitializing = false;
    
    static async init() {
        if (this.isInitializing) return;
        this.isInitializing = true;
        
        try {
            // Initialize Toast system
            Toast.init();
            
            // Load settings
            this.state.loadSettings();
            
            // Apply theme
            ThemeManager.init();
            
            // Load novel data
            Toast.show('Memuat novel...', 'info');
            await DataLoader.loadNovelData();
            
            // Load reviews
            const reviewService = new ReviewService();
            await reviewService.fetchReviews();
            
            // Initialize UI
            this.ui = new UIController();
            this.ui.init();
            
            // Initialize PWA
            PWAInstaller.init();
            
            // Initialize Service Worker
            this.initServiceWorker();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            this.state.isInitialized = true;
            Toast.show('Aplikasi siap!', 'success');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showErrorScreen(error);
        } finally {
            this.isInitializing = false;
        }
    }
    
    static initServiceWorker() {
        if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }
    
    static setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
        });
        
        // Unhandled promise rejection
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
    }
    
    static setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                SearchController.show();
            }
            
            // Reader shortcuts
            const readerView = document.getElementById('view-reader');
            if (readerView && !readerView.classList.contains('hidden')) {
                // Arrow keys for navigation
                if (e.key === 'ArrowLeft') {
                    ReaderController.navigate(-1);
                } else if (e.key === 'ArrowRight') {
                    ReaderController.navigate(1);
                }
                // Space to toggle UI
                else if (e.key === ' ') {
                    e.preventDefault();
                    ReaderController.toggleUI();
                }
            }
        });
    }
    
    static showErrorScreen(error) {
        document.body.innerHTML = `
            <div class="error-screen">
                <div class="error-content">
                    <i class="ph ph-book-open-text text-4xl text-red-400 mb-4"></i>
                    <h1 class="error-title">Gagal Memuat Aplikasi</h1>
                    <p class="error-message">${error.message || 'Terjadi kesalahan yang tidak diketahui'}</p>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="btn-primary">
                            <i class="ph ph-arrow-clockwise"></i>
                            Muat Ulang
                        </button>
                        <button onclick="NovelReaderApp.resetApp()" class="btn-secondary">
                            <i class="ph ph-trash"></i>
                            Reset Aplikasi
                        </button>
                    </div>
                    <details class="error-details">
                        <summary>Detail Teknis</summary>
                        <pre>${error.stack || error.toString()}</pre>
                    </details>
                </div>
            </div>
        `;
    }
    
    static resetApp() {
        if (confirm('Apakah Anda yakin ingin mereset aplikasi? Semua pengaturan dan bookmark akan dihapus.')) {
            localStorage.clear();
            location.reload();
        }
    }
}

// === GLOBAL EXPORTS ===
// Make controllers available globally for HTML onclick attributes
window.uiController = new UIController();
window.ReaderController = ReaderController;
window.SearchController = SearchController;
window.NavigationMenu = NavigationMenu;
window.ShareController = ShareController;
window.ThemeManager = ThemeManager;
window.Toast = Toast;
window.NovelReaderApp = NovelReaderApp;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add loading state
    document.body.classList.add('loading');
    
    // Initialize app
    setTimeout(() => {
        NovelReaderApp.init().finally(() => {
            document.body.classList.remove('loading');
        });
    }, 100);
});

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    /* Animation classes */
    .animate-slide-in {
        animation: slideIn 0.3s ease-out;
    }
    
    .animate-slide-out {
        animation: slideOut 0.3s ease-in forwards;
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
    
    /* Loading state */
    .loading {
        cursor: wait;
    }
    
    .loading * {
        pointer-events: none !important;
    }
    
    /* Error screen */
    .error-screen {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .error-content {
        background: white;
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    
    /* Selection toolbar */
    .selection-toolbar {
        position: fixed;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 8px;
        display: flex;
        gap: 4px;
        z-index: 10000;
        border: 1px solid #e5e7eb;
    }
    
    .selection-toolbar button {
        padding: 8px;
        border-radius: 4px;
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    }
    
    .selection-toolbar button:hover {
        background: #f3f4f6;
    }
    
    /* Dark mode overrides */
    .dark-mode .selection-toolbar {
        background: #1f2937;
        border-color: #374151;
    }
    
    .dark-mode .selection-toolbar button:hover {
        background: #374151;
    }
    
    /* Reader styles */
    .reader-content {
        text-align: justify;
        hyphens: auto;
    }
    
    .reader-content p {
        margin-bottom: 1.5em;
        text-indent: 2em;
    }
    
    /* Smooth transitions */
    .modal {
        transition: opacity 0.3s ease;
    }
    
    .modal.active {
        opacity: 1;
    }
    
    /* Search highlights */
    mark {
        background: rgba(255, 230, 0, 0.3);
        border-radius: 2px;
        padding: 0 2px;
    }
    
    .dark-mode mark {
        background: rgba(255, 230, 0, 0.5);
    }
`;
document.head.appendChild(style);

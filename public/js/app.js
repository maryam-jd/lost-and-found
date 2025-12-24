// AJAX Search functionality with advanced features
class LostAndFoundApp {
    constructor() {
        this.isSearching = false;
        this.currentSearchTerm = '';
        this.currentFilters = {};
        this.init();
    }

    init() {
        this.initSearch();
        this.initAutoSuggest();
        this.initFormValidation();
        this.initDynamicFilters();
        this.initMobileNavigation();
        this.initNotifications();
        this.initCharacterCounters();
    }

    // Real-time search with debouncing
    initSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchForm = document.getElementById('searchForm');
        const searchButton = document.getElementById('searchButton');
        const searchSpinner = document.getElementById('searchSpinner');
        
        if (!searchInput) return;

        // Load current filters from page
        this.loadCurrentFilters();

        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            this.currentSearchTerm = e.target.value;
            clearTimeout(searchTimeout);
            
            if (this.currentSearchTerm.length >= 2 || this.currentSearchTerm.length === 0) {
                searchTimeout = setTimeout(() => {
                    this.performSearch(this.currentSearchTerm);
                }, 500);
            }
        });

        // Prevent form submission for real-time search
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.performSearch(searchInput.value);
            });
        }

        // Show loading state
        if (searchButton && searchSpinner) {
            searchButton.addEventListener('click', () => {
                if (searchInput.value.trim()) {
                    searchSpinner.style.display = 'inline-block';
                    searchButton.disabled = true;
                }
            });
        }
    }

    async performSearch(query, page = 1) {
        if (this.isSearching) return;
        
        this.isSearching = true;
        this.showLoadingState();

        try {
            const url = new URL('/items/api/search', window.location.origin);
            url.searchParams.set('q', query);
            url.searchParams.set('page', page);
            
            // Add current filters
            Object.keys(this.currentFilters).forEach(key => {
                if (this.currentFilters[key] && this.currentFilters[key] !== 'all') {
                    url.searchParams.set(key, this.currentFilters[key]);
                }
            });
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                this.updateSearchResults(data.items, data.hasMore, page);
                this.updateURL(query, page);
            } else {
                this.showNotification('Search failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Search failed:', error);
            this.showNotification('Search failed. Please check your connection.', 'error');
        } finally {
            this.isSearching = false;
            this.hideLoadingState();
        }
    }

    updateSearchResults(items, hasMore, currentPage) {
        const itemsGrid = document.getElementById('itemsGrid');
        const itemsCount = document.querySelector('.items-count');
        const pagination = document.querySelector('.pagination');
        
        if (!itemsGrid) return;

        if (items.length === 0) {
            itemsGrid.innerHTML = `
                <div class="no-items">
                    <div class="no-items-icon">🔍</div>
                    <h3>No items found</h3>
                    <p>Try adjusting your search criteria or filters.</p>
                </div>
            `;
            
            if (itemsCount) itemsCount.innerHTML = '<p>Found 0 items</p>';
            if (pagination) pagination.style.display = 'none';
            
            return;
        }

        // Update items grid
        itemsGrid.innerHTML = items.map(item => `
            <div class="item-card" data-item-id="${item._id}">
                <div class="item-type ${item.type}">
                    <span class="status-dot"></span>
                    ${item.type}
                </div>
                <h3><a href="/items/${item._id}" class="item-link">${item.name}</a></h3>
                <p class="item-category">🏷️ ${item.category}</p>
                <p class="item-description">${this.truncateText(item.description, 100)}</p>
                <p class="item-location">📍 ${item.location}</p>
                <p class="item-date">📅 ${new Date(item.date).toLocaleDateString()}</p>
                <div class="item-meta">
                    <span class="item-status ${item.status}">
                        <span class="status-dot"></span>
                        ${item.status.replace('_', ' ')}
                    </span>
                    <span class="item-reporter">By: ${item.reportedBy.name}</span>
                </div>
                ${item.tags && item.tags.length > 0 ? `
                    <div class="item-tags">
                        ${item.tags.slice(0, 3).map(tag => `
                            <span class="tag">${tag}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Update items count
        if (itemsCount) {
            itemsCount.innerHTML = `<p>Found ${items.length} item(s)</p>`;
        }

        // Update pagination
        if (pagination) {
            if (hasMore) {
                pagination.style.display = 'flex';
                const nextPage = currentPage + 1;
                pagination.innerHTML = `
                    <button class="btn btn-secondary" onclick="app.loadMore(${nextPage})">
                        Load More
                    </button>
                `;
            } else {
                pagination.style.display = 'none';
            }
        }
    }

    async loadMore(page) {
        await this.performSearch(this.currentSearchTerm, page);
    }

    updateURL(query, page) {
        const url = new URL(window.location);
        if (query) {
            url.searchParams.set('search', query);
        } else {
            url.searchParams.delete('search');
        }
        url.searchParams.set('page', page);
        
        // Update filters in URL
        Object.keys(this.currentFilters).forEach(key => {
            if (this.currentFilters[key] && this.currentFilters[key] !== 'all') {
                url.searchParams.set(key, this.currentFilters[key]);
            } else {
                url.searchParams.delete(key);
            }
        });
        
        window.history.replaceState({}, '', url);
    }

    loadCurrentFilters() {
        // Load filters from URL or form
        const urlParams = new URLSearchParams(window.location.search);
        this.currentFilters = {
            category: urlParams.get('category') || 'all',
            type: urlParams.get('type') || 'all',
            status: urlParams.get('status') || 'all',
            location: urlParams.get('location') || '',
            dateFrom: urlParams.get('dateFrom') || '',
            dateTo: urlParams.get('dateTo') || ''
        };
    }

    // Auto-suggestions with enhanced UX
    initAutoSuggest() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        let suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'suggestions-container';
        suggestionsContainer.id = 'suggestionsContainer';
        searchInput.parentNode.appendChild(suggestionsContainer);

        let suggestTimeout;

        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            
            clearTimeout(suggestTimeout);
            
            if (query.length < 2) {
                this.hideSuggestions();
                return;
            }

            suggestTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`/items/api/suggestions?q=${encodeURIComponent(query)}`);
                    const data = await response.json();
                    
                    this.showSuggestions(data.suggestions, suggestionsContainer, searchInput);
                } catch (error) {
                    console.error('Suggestions failed:', error);
                }
            }, 300);
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const suggestions = suggestionsContainer.querySelectorAll('.suggestion-item');
            const activeSuggestion = suggestionsContainer.querySelector('.suggestion-item.active');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateSuggestions(1, suggestions, activeSuggestion);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSuggestions(-1, suggestions, activeSuggestion);
            } else if (e.key === 'Enter' && activeSuggestion) {
                e.preventDefault();
                this.selectSuggestion(activeSuggestion, searchInput);
            } else if (e.key === 'Escape') {
                this.hideSuggestions();
            }
        });
    }

    navigateSuggestions(direction, suggestions, activeSuggestion) {
        let index = -1;
        
        if (activeSuggestion) {
            index = Array.from(suggestions).indexOf(activeSuggestion);
        }
        
        index += direction;
        
        if (index < 0) index = suggestions.length - 1;
        if (index >= suggestions.length) index = 0;
        
        suggestions.forEach(s => s.classList.remove('active'));
        suggestions[index].classList.add('active');
    }

    showSuggestions(suggestions, container, input) {
        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        container.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion-item" data-suggestion="${suggestion}">
                ${suggestion}
            </div>
        `).join('');

        container.style.display = 'block';

        // Add click handlers
        container.querySelectorAll('.suggestion-item').forEach((item, index) => {
            if (index === 0) item.classList.add('active');
            
            item.addEventListener('click', () => {
                this.selectSuggestion(item, input);
            });
            
            item.addEventListener('mouseenter', () => {
                container.querySelectorAll('.suggestion-item').forEach(s => s.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    selectSuggestion(suggestionItem, input) {
        input.value = suggestionItem.dataset.suggestion;
        this.hideSuggestions();
        this.performSearch(input.value);
        input.focus();
    }

    hideSuggestions() {
        const container = document.getElementById('suggestionsContainer');
        if (container) {
            container.style.display = 'none';
        }
    }

    // Enhanced form validation
    initFormValidation() {
        this.validateAllForms();
        this.initRealTimeValidation();
    }

    validateAllForms() {
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            form.addEventListener('submit', (e) => {
                if (!this.validateForm(form)) {
                    e.preventDefault();
                    this.showFormErrors(form);
                }
            });
        });
    }

    initRealTimeValidation() {
        const inputs = document.querySelectorAll('input[required], textarea[required], select[required]');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });
    }

    initCharacterCounters() {
        const textareas = document.querySelectorAll('textarea[maxlength]');
        
        textareas.forEach(textarea => {
            const counter = document.createElement('div');
            counter.className = 'char-counter';
            counter.style.cssText = 'font-size: 0.8rem; color: #666; text-align: right; margin-top: 0.25rem;';
            textarea.parentNode.appendChild(counter);
            
            const updateCounter = () => {
                const current = textarea.value.length;
                const max = parseInt(textarea.getAttribute('maxlength'));
                counter.textContent = `${current}/${max}`;
                
                if (current > max * 0.9) {
                    counter.style.color = '#dc3545';
                } else if (current > max * 0.75) {
                    counter.style.color = '#ffc107';
                } else {
                    counter.style.color = '#666';
                }
            };
            
            textarea.addEventListener('input', updateCounter);
            updateCounter(); // Initialize
        });
    }

    validateForm(form) {
        let isValid = true;
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Required validation
        if (!value) {
            errorMessage = 'This field is required';
            isValid = false;
        }
        // Email validation
        else if (field.type === 'email' && !this.isValidEmail(value)) {
            errorMessage = 'Please enter a valid email address';
            isValid = false;
        }
        // Password strength
        else if (field.type === 'password' && value.length < 6) {
            errorMessage = 'Password must be at least 6 characters long';
            isValid = false;
        }
        // Password confirmation
        else if (field.name === 'confirmPassword') {
            const password = document.querySelector('#password');
            if (password && value !== password.value) {
                errorMessage = 'Passwords do not match';
                isValid = false;
            }
        }
        // Date validation
        else if (field.type === 'date') {
            const inputDate = new Date(value);
            const today = new Date();
            
            if (inputDate > today) {
                errorMessage = 'Date cannot be in the future';
                isValid = false;
            }
        }

        if (!isValid) {
            this.showFieldError(field, errorMessage);
        } else {
            this.clearFieldError(field);
        }

        return isValid;
    }

    showFormErrors(form) {
        const firstError = form.querySelector('.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
        }
    }

    showFieldError(field, message) {
        field.classList.add('error');
        
        let errorDiv = field.parentNode.querySelector('.field-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            field.parentNode.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorDiv = field.parentNode.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Dynamic filter updates
    initDynamicFilters() {
        const filterSelects = document.querySelectorAll('.filter-select');
        const filterInputs = document.querySelectorAll('.filter-input');
        
        filterSelects.forEach(select => {
            select.addEventListener('change', () => {
                this.updateCurrentFilters();
                this.debouncedSearch();
            });
        });
        
        filterInputs.forEach(input => {
            input.addEventListener('input', this.utils.debounce(() => {
                this.updateCurrentFilters();
                this.debouncedSearch();
            }, 500));
        });
    }

    updateCurrentFilters() {
        const form = document.querySelector('.filter-form');
        if (!form) return;

        const formData = new FormData(form);
        this.currentFilters = {
            category: formData.get('category') || 'all',
            type: formData.get('type') || 'all',
            status: formData.get('status') || 'all',
            location: formData.get('location') || '',
            dateFrom: formData.get('dateFrom') || '',
            dateTo: formData.get('dateTo') || ''
        };
    }

    debouncedSearch = this.utils.debounce(() => {
        this.performSearch(this.currentSearchTerm);
    }, 300);

    // Mobile navigation
    initMobileNavigation() {
        const menuBtn = document.querySelector('.mobile-menu-btn');
        const navMenu = document.querySelector('.nav-menu');
        
        if (menuBtn && navMenu) {
            menuBtn.addEventListener('click', () => {
                navMenu.classList.toggle('active');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!menuBtn.contains(e.target) && !navMenu.contains(e.target)) {
                    navMenu.classList.remove('active');
                }
            });
        }
    }

    // Notification system
    initNotifications() {
        // Check for flash messages
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => {
            setTimeout(() => {
                alert.style.opacity = '0';
                alert.style.transition = 'opacity 0.5s ease';
                setTimeout(() => alert.remove(), 500);
            }, 5000);
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOut 0.3s ease-in forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // Loading states
    showLoadingState() {
        const itemsList = document.getElementById('itemsList');
        if (itemsList) {
            itemsList.classList.add('loading');
        }
    }

    hideLoadingState() {
        const itemsList = document.getElementById('itemsList');
        const searchButton = document.getElementById('searchButton');
        const searchSpinner = document.getElementById('searchSpinner');
        
        if (itemsList) itemsList.classList.remove('loading');
        if (searchButton) searchButton.disabled = false;
        if (searchSpinner) searchSpinner.style.display = 'none';
    }

    // Utility methods
    truncateText(text, length) {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    }

    utils = {
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        formatDate(date) {
            return new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LostAndFoundApp();
});

// Global functions for HTML onclick handlers
window.app = app;

// Character counter for claim forms (for item details page)
document.addEventListener('DOMContentLoaded', function() {
    const textareas = document.querySelectorAll('textarea[maxlength]');
    
    textareas.forEach(textarea => {
        const charCount = textarea.parentNode.querySelector('.char-count');
        if (charCount) {
            // Update count on input
            textarea.addEventListener('input', function() {
                const currentLength = this.value.length;
                const maxLength = parseInt(this.getAttribute('maxlength'));
                charCount.textContent = `${currentLength}/${maxLength} characters`;
                
                if (currentLength > maxLength * 0.8) {
                    charCount.style.color = '#dc3545';
                } else {
                    charCount.style.color = '#666';
                }
            });
            
            // Initialize count
            textarea.dispatchEvent(new Event('input'));
        }
    });
    
    // Add confirmation for status changes
    const statusForm = document.querySelector('.status-form');
    if (statusForm) {
        statusForm.addEventListener('submit', function(e) {
            const statusSelect = this.querySelector('.status-select');
            const newStatus = statusSelect.value;
            const currentStatus = '<%= item.status %>';
            
            if (newStatus !== currentStatus) {
                const message = `Are you sure you want to change the status from "${currentStatus}" to "${newStatus}"?`;
                if (!confirm(message)) {
                    e.preventDefault();
                }
            }
        });
    }
});
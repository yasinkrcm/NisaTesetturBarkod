// ============= MAIN RENDERER FILE =============
// Notification, keyboard shortcuts, and barcode functions are now in separate modules
// See: js/notifications.js, js/keyboard-shortcuts.js, js/barcode.js

// USER interface Operations
document.addEventListener('DOMContentLoaded', () => {
    // Bypass login and initialize app immediately
    const defaultUser = {
        id: 1,
        kullaniciAdi: 'SametAslan',
        yetkiSeviyesi: 1
    };

    // Hide login form and show main app (just in case)
    const loginForm = document.getElementById('loginForm');
    const mainApp = document.getElementById('mainApp');
    if (loginForm) loginForm.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');

    initializeApp(defaultUser);

    // Initialize form handlers when the document loads
    initializeFormHandlers();

    // Initialize keyboard shortcuts (from keyboard-shortcuts.js)
    initializeKeyboardShortcuts();
});

// Logout function converted to Exit App
function logout() {
    window.electronAPI.quitApp();
}

let currentUser = null;
let cachedPrinters = []; // Yazıcı ön belleği - modal açılışında kasma önlemek için
let cart = [];

// Get printers (uses cached list if available to avoid UI lag/freezing)
async function getPrintersCached() {
    if (cachedPrinters && cachedPrinters.length > 0) {
        return cachedPrinters;
    }
    try {
        const printers = await window.electronAPI.getPrinters();
        cachedPrinters = printers;
        return printers;
    } catch (err) {
        console.error('Error fetching printers:', err);
        return [];
    }
}

// Login function
// Login function removed as it is no longer used
// async function login() { ... }

// Form işleyicilerini başlat
function initializeFormHandlers() {
    // Login form
    const loginForm = document.getElementById('loginFormElements');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            login();
        });
    }

    // Password field'da Enter tuşu için event listener
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                login();
            }
        });
    }

    // Add product form disabled here as it is handled in setupFormEventListeners


    // Barcode input handler
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', handleBarcodeInput);
        // Otomatik input focus kaldırıldı
    }
}

// Setup form event listeners
function setupFormEventListeners() {
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const kategori = document.getElementById('newKategori').value;
            const bedenler = [];
            let totalStok = 0;

            if (kategori === 'Kıyafet') {
                // Renk seçimi zorunlu
                const selectedColors = getSelectedColors();

                if (selectedColors.length === 0) {
                    showNotification('En az bir renk seçmelisiniz!', 'error');
                    return;
                }

                const checkedSizes = document.querySelectorAll('.size-checkbox:checked');
    const customSizes = document.querySelectorAll('.selected-size-input');

                // Her beden+renk kombinasyonu için ayrı kayıt
                checkedSizes.forEach(checkbox => {
                    const size = checkbox.value;
                    selectedColors.forEach(color => {
                        const key = `${size}_${color}`;
                        const stockInput = document.getElementById(`stock_${key}`);
                        const barcodeInput = document.getElementById(`barcode_val_${key}`);
                        const stockVal = parseInt(stockInput?.value) || 0;

                        if (stockVal > 0) {
                            bedenler.push({
                                beden: size,
                                renk: color,
                                barkod: barcodeInput ? barcodeInput.value : generateBarcodeNumber(),
                                miktar: stockVal
                            });
                            totalStok += stockVal;
                        }
                    });
                });
            }

            if (bedenler.length === 0) {
                // Kıyafet kategorisinde beden zorunlu, Ev Tekstili'nde değil
                if (kategori === 'Kıyafet') {
                    showNotification('En az bir beden ve miktar seçmelisiniz!', 'error');
                    return;
                }
                // Ev Tekstili için stok miktarını direkt oku
                totalStok = parseInt(document.getElementById('newStokMiktari').value) || 0;
            } else {
                totalStok = parseInt(document.getElementById('newStokMiktari').value) || 0;
            }

            const isAuto = document.getElementById('autoGenerateBarcode') ? document.getElementById('autoGenerateBarcode').checked : false;
            let mainBarcode = document.getElementById('newBarkod').value;

            if (isAuto && !mainBarcode && kategori !== 'Kıyafet') {
                mainBarcode = generateBarcodeNumber();
            }

            const product = {
                barkod: mainBarcode,
                urunAdi: document.getElementById('newUrunAdi').value,
                kategori: kategori,
                alisFiyati: parseFloat(document.getElementById('newAlisFiyati').value),
                satisFiyati: parseFloat(document.getElementById('newSatisFiyati').value),
                stokMiktari: totalStok,
                indirim: parseFloat(document.getElementById('newIndirim').value || 0),
                bedenler: bedenler
            };

            try {
                await window.electronAPI.addProduct(product);
                showNotification('Ürün başarıyla eklendi!', 'success');
                showProducts();
            } catch (error) {
                console.error('Add product error:', error);
                showNotification('Ürün eklenirken bir hata oluştu!', 'error');
            }
        });
    }

    // Barcode Input
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', handleBarcodeInput);
    }
}


// Function to handle Enter key navigation between form fields
function setupEnterKeyNavigation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const inputs = form.querySelectorAll('input');
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();

                // If it's the last input, submit the form
                if (index === inputs.length - 1) {
                    form.dispatchEvent(new Event('submit'));
                } else {
                    // Otherwise focus the next input
                    inputs[index + 1].focus();
                }
            }
        });
    });
}

// Initialize main app after login
async function initializeMainApp() {
    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }

    const mainApp = document.getElementById('mainApp');

    // Load latest statistics and start automatic updates
    await loadStatistics();
    startAutomaticStatsUpdates();
    console.log('Uygulama başlatıldı ve istatistik otomatik güncellemesi aktif edildi.');

    // Get the current time for greeting
    const hour = new Date().getHours();
    let greeting = "Günaydın";
    if (hour >= 12 && hour < 18) greeting = "İyi Günler";
    else if (hour >= 18) greeting = "İyi Akşamlar";

    mainApp.innerHTML = `
        <div class="h-screen flex flex-col bg-gray-100 overflow-hidden">
            <!-- Header -->
            <header class="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 text-white p-4 shadow-lg relative overflow-hidden">
                <div class="absolute inset-0 overflow-hidden">
                    <div class="absolute -top-40 -right-40 w-80 h-80 bg-white opacity-10 rounded-full"></div>
                    <div class="absolute bottom-0 left-1/3 w-32 h-32 bg-white opacity-10 rounded-full"></div>
                    <div class="absolute top-1/2 left-1/4 w-24 h-24 bg-white opacity-10 rounded-full"></div>
                </div>
                
                <div class="container mx-auto flex flex-col md:flex-row justify-between items-center relative z-10">
                    <div class="flex items-center space-x-4 mb-3 md:mb-0 w-full md:w-auto justify-center md:justify-start">
                        <div class="bg-white p-2 rounded-full shadow-md transform transition-transform duration-300 hover:scale-110">
                            <i class="fas fa-barcode text-purple-600 text-xl"></i>
                        </div>
                        <h1 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-100">Nisa Tesettür</h1>
                    </div>
                    
                    <div class="flex flex-col md:flex-row items-center md:space-x-6 w-full md:w-auto">
                        <div class="relative mb-3 md:mb-0 w-full md:w-auto">
                            <div class="flex items-center px-4 py-2 bg-white bg-opacity-20 rounded-lg border border-white border-opacity-30 backdrop-blur-sm">
                                <div class="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 mr-3 shadow-inner">
                                    <i class="fas fa-user text-lg"></i>
                                </div>
                                <div>
                                    <span class="text-purple-100">${greeting},</span>
                                    <span class="font-bold ml-1">${currentUser.kullaniciAdi}</span>
                                </div>
                            </div>
                        </div>
                        
                        <button onclick="logout()" class="flex items-center bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg shadow-lg transition duration-300 transform hover:-translate-y-1 w-full md:w-auto justify-center">
                            <i class="fas fa-power-off mr-2"></i>
                            <span>Uygulamayı Kapat</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- Main Content -->
            <div class="flex-1 container mx-auto p-6 flex flex-col lg:flex-row gap-6 overflow-auto">
                <!-- Left Side - Main Content Area -->
                <div class="w-full lg:w-2/3 space-y-6">
                    <!-- Barcode Scanner Section (only on main page) -->
                    <div id="barcodeSection" class="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hover-card shimmer-bg">
                        <h2 class="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 mr-3">
                                <i class="fas fa-search text-indigo-600"></i>
                            </div>
                            <span>Ürün Tarama</span>
                        </h2>
                        <div>
                            <label class="block text-gray-700 font-medium mb-3">Barkod Okutun</label>
                            <div class="relative">
                                <input type="text" id="barcodeInput" 
                                    class="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-indigo-100 focus:border-indigo-500 rounded-xl focus:outline-none transition-all focus:ring-2 focus:ring-indigo-200 hover:bg-white" 
                                    placeholder="Barkod okutun veya numarayı girin...">
                                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <i class="fas fa-barcode text-indigo-500 text-xl"></i>
                                </div>
                                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <div class="animate-pulse">
                                        <i class="fas fa-search text-indigo-400"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Quick Actions Section (only on main page) -->
                    <div id="quickActionsSection" class="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden shimmer-bg">
                        <div class="absolute inset-0 overflow-hidden">
                            <div class="absolute -top-20 -right-20 w-40 h-40 bg-white opacity-10 rounded-full"></div>
                            <div class="absolute bottom-0 left-1/3 w-20 h-20 bg-white opacity-10 rounded-full"></div>
                        </div>
                        
                        <h2 class="text-xl font-semibold mb-5 relative z-10 flex items-center">
                            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-white bg-opacity-20 mr-3">
                                <i class="fas fa-bolt text-white"></i>
                            </div>
                            <span>Hızlı İşlemler</span>
                        </h2>
                        
                        <div class="grid grid-cols-1 gap-4 relative z-10">
                            <button onclick="showProducts()" 
                                class="flex items-center justify-between px-5 py-4 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl backdrop-filter backdrop-blur-sm border border-white border-opacity-20 transition duration-300 transform hover:-translate-y-1">
                                <span class="flex items-center">
                                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 bg-opacity-80 mr-3 shadow">
                                        <i class="fas fa-boxes text-white"></i>
                                    </div>
                                    <span class="font-medium">Ürün Listesi</span>
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            
                            <button onclick="showSales()" 
                                class="flex items-center justify-between px-5 py-4 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl backdrop-filter backdrop-blur-sm border border-white border-opacity-20 transition duration-300 transform hover:-translate-y-1">
                                <span class="flex items-center">
                                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500 bg-opacity-80 mr-3 shadow">
                                        <i class="fas fa-receipt text-white"></i>
                                    </div>
                                    <span class="font-medium">Satışlarım</span>
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            
                            <button onclick="addProduct()" 
                                class="flex items-center justify-between px-5 py-4 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl backdrop-filter backdrop-blur-sm border border-white border-opacity-20 transition duration-300 transform hover:-translate-y-1">
                                <span class="flex items-center">
                                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 bg-opacity-80 mr-3 shadow">
                                        <i class="fas fa-plus-circle text-white"></i>
                                    </div>
                                    <span class="font-medium">Yeni Ürün Ekle</span>
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            
                            <button onclick="showBarcodeGenerator()" 
                                class="flex items-center justify-between px-5 py-4 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl backdrop-filter backdrop-blur-sm border border-white border-opacity-20 transition duration-300 transform hover:-translate-y-1">
                                <span class="flex items-center">
                                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500 bg-opacity-80 mr-3 shadow">
                                        <i class="fas fa-qrcode text-white"></i>
                                    </div>
                                    <span class="font-medium">Barkod Üret</span>
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            
                            <button onclick="getDailyReport()" 
                                class="flex items-center justify-between px-5 py-4 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-xl backdrop-filter backdrop-blur-sm border border-white border-opacity-20 transition duration-300 transform hover:-translate-y-1">
                                <span class="flex items-center">
                                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500 bg-opacity-80 mr-3 shadow">
                                        <i class="fas fa-chart-bar text-white"></i>
                                    </div>
                                    <span class="font-medium">Gün Sonu Al</span>
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Statistics Section (only on main page) -->
                    <div id="statsSection" class="bg-white p-6 rounded-2xl border border-gray-100 shadow-xl hover-card">
                        <div class="flex justify-between items-center mb-5">
                            <h3 class="font-semibold text-gray-800 flex items-center">
                                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 mr-2">
                                    <i class="fas fa-chart-line text-sm text-purple-600"></i>
                                </div>
                                <span>Hızlı İstatistikler</span>
                            </h3>
                            <span class="text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-medium">Bugün</span>
                        </div>
                        <div id="quickStatsCards" class="grid grid-cols-2 gap-4">
                            <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl shadow-sm border border-blue-200 hover:shadow-md transition-shadow">
                                <p class="text-sm text-gray-600 mb-1 font-medium">Toplam Satış</p>
                                <div class="flex justify-between items-center">
                                    <p class="text-xl font-bold text-indigo-600" id="statsToplamSatis">-</p>
                                    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100">
                                        <i class="fas fa-shopping-bag text-indigo-600"></i>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl shadow-sm border border-green-200 hover:shadow-md transition-shadow">
                                <p class="text-sm text-gray-600 mb-1 font-medium">Toplam Gelir</p>
                                <div class="flex justify-between items-center">
                                    <p class="text-xl font-bold text-green-600" id="statsToplamCiro">-</p>
                                    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-green-100">
                                        <i class="fas fa-coins text-green-600"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Keyboard Shortcuts Section (only on main page) -->
                    <div id="shortcutsSection" class="bg-white p-6 rounded-2xl border border-gray-100 shadow-xl hover-card">
                        <div class="flex justify-between items-center mb-5">
                            <h3 class="font-semibold text-gray-800 flex items-center">
                                <div class="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 mr-2">
                                    <i class="fas fa-keyboard text-sm text-amber-600"></i>
                                </div>
                                <span>Klavye Kısayolları</span>
                            </h3>
                            <span class="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-medium">Hızlı Erişim</span>
                        </div>
                        <div class="grid grid-cols-1 gap-3">
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F1</kbd>
                                    <span class="text-sm text-gray-700">Barkod Tarama</span>
                                </div>
                                <i class="fas fa-barcode text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F2</kbd>
                                    <span class="text-sm text-gray-700">Ürün Listesi</span>
                                </div>
                                <i class="fas fa-boxes text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F3</kbd>
                                    <span class="text-sm text-gray-700">Satışlarım</span>
                                </div>
                                <i class="fas fa-receipt text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F4</kbd>
                                    <span class="text-sm text-gray-700">Yeni Ürün Ekle</span>
                                </div>
                                <i class="fas fa-plus-circle text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F5</kbd>
                                    <span class="text-sm text-gray-700">Gün Sonu Al</span>
                                </div>
                                <i class="fas fa-chart-bar text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F6</kbd>
                                    <span class="text-sm text-gray-700">Barkod Üret</span>
                                </div>
                                <i class="fas fa-qrcode text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">F10</kbd>
                                    <span class="text-sm text-gray-700">Satışı Tamamla</span>
                                </div>
                                <i class="fas fa-check-circle text-gray-400"></i>
                            </div>
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <kbd class="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm mr-3">ESC</kbd>
                                    <span class="text-sm text-gray-700">Ana Menü</span>
                                </div>
                                <i class="fas fa-home text-gray-400"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Content Area -->
                    <div id="dynamicContent" class="min-h-96">
                        <!-- Content will be loaded here -->
                    </div>
                </div>

                <!-- Right Side - Cart (Always Visible) -->
                <div class="w-full lg:w-1/3">
                    <div class="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hover-card sticky top-6">
                        <div class="flex justify-between items-center mb-5">
                            <h2 class="text-xl font-semibold text-gray-700 flex items-center">
                                <div class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 mr-3">
                                    <i class="fas fa-shopping-cart text-indigo-600"></i>
                                </div>
                                <span>Sepet</span>
                            </h2>
                            <span class="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                                <i class="fas fa-tag mr-1"></i>
                                Aktif Satış
                            </span>
                        </div>
                        
                        <div id="cartItems" class="divide-y divide-gray-100 max-h-64 overflow-auto mb-5 -mx-6 px-6">
                            <!-- Cart items will be listed here -->
                        </div>
                        
                        <div class="flex flex-col md:flex-row justify-between items-center pt-5 border-t border-gray-100">
                            <div class="price-tag mb-4 md:mb-0 w-full md:w-auto text-center">
                                <span class="text-xs uppercase tracking-wide opacity-80">Toplam Tutar</span>
                                <div class="text-2xl font-bold"><span id="cartTotal">0.00</span> ₺</div>
                            </div>
                            
                            <button onclick="completeSale()" 
                                class="btn-animated bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-3 rounded-xl shadow-lg flex items-center justify-center w-full md:w-auto transition duration-300 transform hover:-translate-y-1">
                                <i class="fas fa-check-circle mr-2 text-lg"></i>
                                <span class="font-medium">Satışı Tamamla</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <footer class="bg-gray-900 text-white py-4 text-center text-sm">
                <div class="container mx-auto">
                    <div class="flex justify-center items-center mb-2">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center mr-2">
                            <i class="fas fa-barcode text-white"></i>
                        </div>
                        <span class="font-semibold text-lg">Nisa Tesettür</span>
                    </div>
                    <p class="text-gray-400">© 2025 Nisa Tesettür Barkod Sistemi. Tüm hakları saklıdır.</p>
                </div>
            </footer>
        </div>
    `;

    // Hide loading overlay after a short delay
    setTimeout(() => {
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }

        // Add enter animation to main app
        mainApp.classList.add('animate-fadeIn');
    }, 800);

    // Setup event listeners after content is loaded
    setupFormEventListeners();

    // Initialize cart display
    updateCartDisplay();

    console.log("Ana menü başarıyla yüklendi.");
}

// Initialize the main application with user data
async function initializeApp(user) {
    currentUser = user;
    if (document.getElementById('loginForm')) document.getElementById('loginForm').classList.add('hidden');
    if (document.getElementById('mainApp')) document.getElementById('mainApp').classList.remove('hidden');

    // Yazıcıları başlangıçta arka planda bir kez önbelleğe al
    getPrintersCached().catch(() => {});

    await loadStatistics();
    await initializeMainApp();
}

// Load and display quick statistics - Doğrudan Daily Report verilerini kullanıyor
async function loadStatistics() {
    try {
        // Kullanıcı oturumu kapatmış olabilir, bu durumda güncellemeyi atla
        if (!currentUser) {
            // console.log('Kullanıcı oturumu kapandı, istatistik güncelleme atlanıyor');
            return;
        }

        // getDailyReport verileri doğrudan kullanılıyor - getStatistics yerine
        const dailyData = await window.electronAPI.getDailyReport();
        // console.log('Loaded Daily Report statistics:', dailyData);

        // Update quick stats display using specific IDs for better targeting
        const saleCountElement = document.getElementById('statsToplamSatis');
        const revenueElement = document.getElementById('statsToplamCiro');

        if (saleCountElement) {
            saleCountElement.textContent = dailyData.toplamSatis || 0;
        }

        if (revenueElement) {
            // Formatı "1234.56 TL" olarak ayarlanıyor
            const ciro = typeof dailyData.toplamCiro === 'number' ?
                dailyData.toplamCiro.toFixed(2) : dailyData.toplamCiro || '0.00';
            revenueElement.textContent = `${ciro} TL`;
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
        // Show fallback values if there was an error
        const saleCountElement = document.getElementById('statsToplamSatis');
        const revenueElement = document.getElementById('statsToplamCiro');

        if (saleCountElement) saleCountElement.textContent = '0';
        if (revenueElement) revenueElement.textContent = '0.00 TL';
    }
}

let statsUpdateTimer; // İstatistikleri güncelleme için zamanlayıcı

// İstatistiklerin otomatik olarak yenilenmesini başlat
function startAutomaticStatsUpdates() {
    // Önceki zamanlayıcı varsa temizle
    stopAutomaticStatsUpdates();

    // Hemen ilk güncelleştirmeyi yap
    loadStatistics();

    // Her 30 saniyede bir istatistikleri güncelle
    statsUpdateTimer = setInterval(async () => {
        // console.log('Otomatik istatistik güncellemesi yapılıyor...');
        await loadStatistics();
    }, 30000); // 30 saniye

    // console.log('Otomatik istatistik güncellemeleri başlatıldı - her 30 saniyede bir güncellenecek');
}

// İstatistik güncellemelerini durdur (örneğin logout olduğunda)
function stopAutomaticStatsUpdates() {
    if (statsUpdateTimer) {
        clearInterval(statsUpdateTimer);
        statsUpdateTimer = null;
        console.log('Otomatik istatistik güncellemeleri durduruldu');
    }
}

// Show main menu
async function showMainMenu() {
    // Refresh statistics when returning to main menu
    await loadStatistics();

    // Show main page sections
    document.getElementById('barcodeSection').style.display = 'block';
    document.getElementById('quickActionsSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
    document.getElementById('shortcutsSection').style.display = 'block';

    // Clear dynamic content
    document.getElementById('dynamicContent').innerHTML = '';

    // Otomatik input focus kaldırıldı

    console.log("Ana menüye dönüldü.");
}

// Logout function is now just a reload/close
// function logout() { ... } replaced above

// This is now handled in the main DOMContentLoaded event listener above

// Ana menü tuşu ortak fonksiyonu
function createMainMenuButton() {
    const button = document.createElement('button');
    button.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4';
    button.textContent = 'Ana Menü';
    button.onclick = () => showMainMenu();
    return button;
}

// Show login page
function showLoginPage() {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('username').focus();
    initializeFormHandlers();
}

// Show products page
async function showProducts() {
    try {
        const products = await window.electronAPI.getProducts();
    products.reverse();

        // Hide main page sections
        document.getElementById('barcodeSection').style.display = 'none';
        document.getElementById('quickActionsSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('shortcutsSection').style.display = 'none';

        // Load content into dynamic area
        const dynamicContent = document.getElementById('dynamicContent');
        dynamicContent.innerHTML = `
            <div class="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 p-4">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-white flex items-center">
                            <i class="fas fa-boxes mr-2"></i>
                            Ürün Listesi
                        </h2>
                        <button onclick="showMainMenu()" class="bg-white text-indigo-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition duration-200 flex items-center shadow-sm">
                            <i class="fas fa-home mr-2"></i>
                            Ana Menü
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    <div class="mb-6 relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i class="fas fa-search text-gray-400"></i>
                        </div>
                        <input type="text" id="productSearchInput" placeholder="Barkod veya ürün adı ile ara..." 
                            class="w-full pl-10 pr-4 py-3 border-2 border-indigo-100 focus:border-indigo-400 rounded-lg focus:outline-none transition-colors">
                    </div>
                    
                    <div class="rounded-lg border border-gray-200 overflow-hidden w-full">
                        <table class="w-full table-fixed divide-y divide-gray-200 text-xs">
                            <colgroup>
                                <col style="width:14%">
                                <col style="width:18%">
                                <col style="width:9%">
                                <col style="width:16%">
                                <col style="width:10%">
                                <col style="width:11%">
                                <col style="width:9%">
                                <col style="width:13%">
                            </colgroup>
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barkod</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ürün Adı</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Beden/Renk</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Alış</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Satış</th>
                                    <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stok</th>
                                    <th class="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody id="productTableBody" class="bg-white divide-y divide-gray-200">
                                ${products.map(p => `
                                    <tr class="hover:bg-gray-50 transition-colors" data-search="${p.urunAdi} ${p.barkod} ${p.bedenler ? p.bedenler.map(b => `${b.barkod} ${b.beden} ${b.renk || ''}`).join(' ') : ''}" data-id="${p.id}">
                                        <td class="px-2 py-1 overflow-hidden">
                                            <span class="font-medium text-gray-900 text-xs block truncate">${p.barkod || (p.bedenler && p.bedenler[0] ? p.bedenler[0].barkod : '-')}</span>
                                        </td>
                                        <td class="px-2 py-1 overflow-hidden">
                                            <div class="text-xs font-medium text-gray-900 truncate">${p.urunAdi}</div>
                                        </td>
                                        <td class="px-2 py-1">
                                            ${p.kategori ? `<span class="px-1 py-0.5 text-xs rounded-full ${p.kategori === 'Kıyafet' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} block truncate">${p.kategori}</span>` : '<span class="text-gray-400 text-xs">-</span>'}
                                        </td>
                                        <td class="px-2 py-1 overflow-hidden">
                                            <div class="flex flex-wrap gap-0.5">
                                                ${p.bedenler && p.bedenler.length > 0
                ? p.bedenler.map(b => `
                    <span class="inline-block bg-gray-100 text-[9px] rounded px-1 py-0.5 border border-gray-200 whitespace-nowrap">${b.beden}/${b.miktar}${b.renk ? ' ' + b.renk : ''}</span>
                `).join('')
                : `<span class="inline-block bg-gray-100 text-[9px] rounded px-1 py-0.5 border border-gray-200">${p.beden || '-'}</span>`}
                                            </div>
                                        </td>
                                        <td class="px-2 py-1 whitespace-nowrap">
                                            <span class="text-xs text-gray-500">${(p.alisFiyati || 0).toFixed(2)}₺</span>
                                        </td>
                                        <td class="px-2 py-1 whitespace-nowrap">
                                            <div class="text-sm font-bold text-indigo-700">${(p.satisFiyati || 0).toFixed(2)}₺${p.indirim > 0 ? `<span class="ml-1 text-xs text-red-500">%${p.indirim}</span>` : ''}</div>
                                        </td>
                                        <td class="px-2 py-1 whitespace-nowrap">
                                            ${(p.stokMiktari || 0) > 10
                ? `<span class="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-800">${(p.stokMiktari || 0)}</span>`
                : (p.stokMiktari || 0) > 3
                    ? `<span class="px-1.5 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800">${(p.stokMiktari || 0)}</span>`
                    : `<span class="px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-800">${(p.stokMiktari || 0)}</span>`}
                                            ${p.bedenler && p.bedenler.length > 0 ? `<button onclick='showSizeDetails(${JSON.stringify(p.bedenler)}, "${p.urunAdi}")' class="text-[9px] text-indigo-600 hover:underline block">Detay</button>` : ''}
                                        </td>
                                        <td class="px-2 py-1 text-right">
                                            <div class="flex justify-end gap-1">
                                                <button onclick="editProduct(${p.id})" class="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded text-xs transition inline-flex items-center gap-1">
                                                    <i class="fas fa-edit text-xs"></i><span>Düzenle</span>
                                                </button>
                                                <button onclick="deleteProduct(${p.id})" 
                                                    class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-0.5 rounded text-xs transition inline-flex items-center gap-1"
                                                    title="Bu ürünü sil">
                                                    <i class="fas fa-trash-alt text-xs"></i>
                                                    <span>Sil</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Setup event listeners after content is loaded
        setupFormEventListeners();

        // After rendering the product list, set up the search functionality
        setTimeout(() => {
            setupProductSearch();
            // Otomatik input focus kaldırıldı, kısayollar her zaman çalışacak
        }, 100);
    } catch (error) {
        console.error('Show products error:', error);
        showNotification('Ürünler listelenirken bir hata oluştu!', 'error');
    }
}

// Function to setup barcode search in product list
function setupProductSearch() {
    const searchInput = document.getElementById('productSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#productTableBody tr');

        rows.forEach(row => {
            const searchData = row.getAttribute('data-search').toLowerCase();
            if (searchData.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });

    // Otomatik input focus kaldırıldı, kısayollar her zaman çalışacak
}

// Show sales page
async function showSales() {
    try {
        const sales = await window.electronAPI.getSales(currentUser.id);
    sales.reverse();

        // Hide main page sections
        document.getElementById('barcodeSection').style.display = 'none';
        document.getElementById('quickActionsSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('shortcutsSection').style.display = 'none';

        // Load content into dynamic area
        const dynamicContent = document.getElementById('dynamicContent');
        dynamicContent.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold text-white flex items-center">
                            <i class="fas fa-receipt mr-3"></i>
                            Satış Geçmişi
                        </h2>
                        <button onclick="showMainMenu()" class="bg-white text-indigo-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition duration-200 flex items-center shadow-sm">
                            <i class="fas fa-home mr-2"></i>
                            Ana Menü
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    ${sales.length === 0 ? `
                        <div class="text-center py-12">
                            <div class="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4">
                                <i class="fas fa-receipt text-gray-400 text-2xl"></i>
                            </div>
                            <h3 class="text-lg font-medium text-gray-900 mb-2">Henüz Satış Yok</h3>
                            <p class="text-gray-500">İlk satışınızı yapmak için ana menüye dönün ve ürün taramaya başlayın.</p>
                        </div>
                    ` : `
                        <div class="rounded-lg border border-gray-200 overflow-hidden">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Satış No</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ürünler</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam Tutar</th>
                                        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${sales.map(s => `
                                        <tr class="hover:bg-gray-50 transition-colors">
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="text-sm font-medium text-gray-900">
                                                    ${new Date(s.tarih).toLocaleDateString('tr-TR')}
                                                </div>
                                                <div class="text-sm text-gray-500">
                                                    ${new Date(s.tarih).toLocaleTimeString('tr-TR')}
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                                    #${s.id}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4">
                                                <div class="text-sm text-gray-900 max-w-xs truncate" title="${s.urunler}">
                                                    ${s.urunler}
                                                </div>
                                                <div class="text-sm text-gray-500">
                                                    ${s.urunSayisi} ürün
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="text-lg font-bold text-green-600">
                                                    ${s.toplamTutar.toFixed(2)} TL
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-center">
                                                <button onclick="deleteSale(${s.id})" 
                                                    class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">
                                                    <i class="fas fa-trash-alt mr-1"></i>
                                                    Sil
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;

        // Setup event listeners after content is loaded
        setupFormEventListeners();
    } catch (error) {
        console.error('Sales error:', error);
        showNotification('Satışlar listelenirken bir hata oluştu!', 'error');
    }
}

// Add new product
function addProduct() {
    // Hide main page sections
    document.getElementById('barcodeSection').style.display = 'none';
    document.getElementById('quickActionsSection').style.display = 'none';
    document.getElementById('statsSection').style.display = 'none';
    document.getElementById('shortcutsSection').style.display = 'none';

    // Load content into dynamic area
    const dynamicContent = document.getElementById('dynamicContent');
    dynamicContent.innerHTML = `
        <div class="w-full max-w-2xl mx-auto">
            <div class="bg-white p-6 rounded-xl shadow-xl border border-gray-100">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-gray-800 flex items-center">
                        <i class="fas fa-plus-circle mr-2 text-green-600"></i>
                        Yeni Ürün Ekle
                    </h2>
                    <button onclick="showMainMenu()" class="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition duration-200 flex items-center">
                        <i class="fas fa-home mr-2"></i>
                        Ana Menü
                    </button>
                </div>
                <form id="addProductForm" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <label class="block text-gray-700 text-sm font-bold">Barkod</label>
                                <label class="flex items-center text-xs text-indigo-600 cursor-pointer">
                                    <input type="checkbox" id="autoGenerateBarcode" checked onchange="updateBarcodeUI()" class="mr-1 rounded">
                                    Otomatik Oluştur
                                </label>
                            </div>
                            <div id="barcodeInputWrapper">
                                <input type="text" id="newBarkod" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" placeholder="Barkod okutun veya yazın">
                            </div>
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Ürün Adı</label>
                            <input type="text" id="newUrunAdi" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Kategori</label>
                            <select id="newKategori" onchange="toggleSizeSelection(this.value)" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors">
                                <option value="Kıyafet" selected>Kıyafet</option>
                                <option value="Ev Tekstili">Ev Tekstili</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">İndirim (%) <span class="text-xs text-orange-500 font-normal">- Sadece Barkod İçin</span></label>
                            <input type="number" step="0.01" id="newIndirim" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" min="0" max="100" value="0">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Alış Fiyatı</label>
                            <input type="number" step="0.01" id="newAlisFiyati" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" oninput="calculateAutoPrice('add')">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Satış Fiyatı</label>
                            <input type="number" step="0.01" id="newSatisFiyati" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors">
                        </div>
                    </div>

                    <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border border-amber-200">
                        <label class="flex items-center cursor-pointer">
                            <input type="checkbox" id="newAutoPrice" onchange="toggleAutoPrice('add')" class="form-checkbox h-4 w-4 text-amber-600 rounded mr-2">
                            <span class="text-sm font-bold text-amber-800"><i class="fas fa-calculator mr-1"></i> Kar Yüzdesine göre otomatik fiyat gir</span>
                        </label>
                        <div id="newKarYuzdesiDiv" class="hidden mt-3">
                            <label class="block text-gray-700 text-sm font-bold mb-1">Kar Yüzdesi (%)</label>
                            <input type="number" step="0.01" id="newKarYuzdesi" class="w-full px-3 py-2 border border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none transition-colors bg-white font-bold text-amber-700" min="0" oninput="calculateAutoPrice('add')" placeholder="Örn: 50">
                        </div>
                    </div>

                    <div id="newSizeSelectionDiv" class="hidden space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Renk Seçimi (Zorunlu)</label>
                            <div id="colorSelectionDiv" class="space-y-2 mt-2">
                                <div class="text-sm text-gray-500 mb-2">Genel Renkler:</div>
                                <div class="flex flex-wrap gap-3">
                                    ${['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Pembe', 'Mor', 'Lacivert', 'Bej', 'Gri', 'Kahverengi', 'Bordo', 'Turkuaz'].map(renk => `
                                        <label class="inline-flex items-center p-2 px-3 bg-white border rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors text-sm shadow-sm">
                                            <input type="checkbox" class="color-checkbox form-checkbox h-5 w-5 text-indigo-600" value="${renk}">
                                            <span class="ml-2 text-sm text-gray-700 font-medium">${renk}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <div class="mt-3">
                                    <label class="block text-sm text-gray-600 mb-1">Diğer Renk Ekle:</label>
                                    <div class="flex gap-2">
                                        <input type="text" id="customColorInput" placeholder="Renk adı girin..." class="flex-1 px-3 py-2 text-sm border rounded-lg focus:border-indigo-500 outline-none">
                                        <button type="button" onclick="addCustomColor()" class="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition">
                                            <i class="fas fa-plus"></i> Ekle
                                        </button>
                                    </div>
                                </div>
                                <div id="selectedColorsContainer" class="flex flex-wrap gap-2 mt-3"></div>
                            </div>
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Beden Seçimi (Sayısal)</label>
                            <div class="flex flex-wrap gap-2">
                                ${[36, 38, 40, 42, 44, 46, 48, 50, 52, 54].map(size => `
                                    <label class="inline-flex items-center p-2 bg-white border rounded hover:bg-indigo-50 cursor-pointer transition-colors">
                                        <input type="checkbox" class="size-checkbox form-checkbox h-4 w-4 text-indigo-600" value="${size}" onchange="updateStockInputs()">
                                        <span class="ml-2 text-sm text-gray-700">${size}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                            <div class="mt-3">
                                <label class="block text-sm text-gray-600 mb-1">Diğer Beden Ekle:</label>
                                <div class="flex gap-2">
                                    <input type="text" id="customSizeInput" placeholder="Beden girin..." class="flex-1 px-3 py-2 text-sm border rounded-lg focus:border-indigo-500 outline-none">
                                    <button type="button" onclick="addCustomSize()" class="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <div id="selectedSizesContainer" class="flex flex-wrap gap-2 mt-2"></div>
                            </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Beden Seçimi (Standart)</label>
                            <div class="flex flex-wrap gap-2">
                                ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => `
                                    <label class="inline-flex items-center p-2 bg-white border rounded hover:bg-indigo-50 cursor-pointer transition-colors">
                                        <input type="checkbox" class="size-checkbox form-checkbox h-4 w-4 text-indigo-600" value="${size}" onchange="updateStockInputs()">
                                        <span class="ml-2 text-sm text-gray-700">${size}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div id="newStockQuantityDiv" class="hidden space-y-2">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Beden-Renk Kombinasyonları</label>
                        <div id="stockInputContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            <!-- Stock inputs will be generated here -->
                        </div>
                    </div>

                    <div id="standardStockDiv">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Stok Miktarı</label>
                        <input type="number" id="newStokMiktari" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors">
                    </div>

                    <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 transition duration-200 font-medium">
                        <i class="fas fa-plus mr-2"></i>
                        Ürün Ekle
                    </button>
                </form>
            </div>
        </div>
    `;


    // Setup event listeners after content is loaded
    setupFormEventListeners();

    // Setup Enter key navigation for the newly displayed form
    setTimeout(() => {
        updateBarcodeUI(); // Set initial visibility
        toggleSizeSelection('Kıyafet'); // Kategori varsayılan olarak Kıyafet seçili
        setupEnterKeyNavigation('addProductForm');
        document.dispatchEvent(new Event('addProductPageShown'));
    }, 100);
}

// Helper to toggle size selection area
function toggleSizeSelection(category) {
    const sizeDiv = document.getElementById('newSizeSelectionDiv');
    const stockDiv = document.getElementById('newStockQuantityDiv');
    const standardDiv = document.getElementById('standardStockDiv');
    const standardInput = document.getElementById('newStokMiktari');

    if (category === 'Kıyafet') {
        sizeDiv.classList.remove('hidden');
        stockDiv.classList.remove('hidden');
        standardDiv.classList.add('hidden');
        standardInput.required = false;
    } else {
        sizeDiv.classList.add('hidden');
        stockDiv.classList.add('hidden');
        standardDiv.classList.remove('hidden');
        standardInput.required = true;
    }
}

// Helper to toggle color selection
function toggleColorSelection() {
    const checkbox = document.getElementById('enableColorSelection');
    const colorDiv = document.getElementById('colorSelectionDiv');

    if (checkbox.checked) {
        colorDiv.classList.remove('hidden');
    } else {
        colorDiv.classList.add('hidden');
    }
}

// Helper to add custom color

function addCustomSize() {
    const input = document.getElementById('customSizeInput');
    const sizeName = input.value.trim();
    if (!sizeName) return;
    const container = document.getElementById('selectedSizesContainer');
    const sizeTag = document.createElement('span');
    sizeTag.className = 'inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs border';
    sizeTag.innerHTML = `${sizeName} <button type="button" onclick="this.parentElement.remove(); updateStockInputs();" class="ml-1 text-gray-500 hover:text-red-500"><i class="fas fa-times"></i></button><input type="hidden" class="selected-size-input" value="${sizeName}">`;
    container.appendChild(sizeTag);
    input.value = '';
    updateStockInputs();
}

function addEditCustomSize() {
    const input = document.getElementById('editCustomSizeInput');
    const sizeName = input.value.trim();
    if (!sizeName) return;
    const container = document.getElementById('editSelectedSizesContainer');
    const sizeTag = document.createElement('span');
    sizeTag.className = 'inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs border';
    sizeTag.innerHTML = `${sizeName} <button type="button" onclick="this.parentElement.remove(); updateEditStockInputs();" class="ml-1 text-gray-500 hover:text-red-500"><i class="fas fa-times"></i></button><input type="hidden" class="edit-selected-size-input" value="${sizeName}">`;
    container.appendChild(sizeTag);
    input.value = '';
    updateEditStockInputs();
}

function addBarcodeCustomSize() {
    const input = document.getElementById('barcodeCustomSizeInput');
    const sizeName = input.value.trim();
    if (!sizeName) return;
    const container = document.getElementById('barcodeSelectedSizesContainer');
    const sizeTag = document.createElement('span');
    sizeTag.className = 'inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs border';
    sizeTag.innerHTML = `${sizeName} <button type="button" onclick="this.parentElement.remove(); updateBarcodeStockInputs();" class="ml-1 text-gray-500 hover:text-red-500"><i class="fas fa-times"></i></button><input type="hidden" class="barcode-selected-size-input" value="${sizeName}">`;
    container.appendChild(sizeTag);
    input.value = '';
    updateBarcodeStockInputs();
}

function addCustomColor() {
    const input = document.getElementById('customColorInput');
    const colorName = input.value.trim();

    if (!colorName) {
        showNotification('Lütfen bir renk adı girin!', 'error');
        return;
    }

    // Seçilen renkleri göster
    const container = document.getElementById('selectedColorsContainer');
    const colorTag = document.createElement('span');
    colorTag.className = 'inline-flex items-center px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs';
    colorTag.innerHTML = `
        ${colorName}
        <button type="button" onclick="this.parentElement.remove()" class="ml-1 text-indigo-500 hover:text-indigo-700">
            <i class="fas fa-times"></i>
        </button>
        <input type="hidden" class="selected-color-input" value="${colorName}">
    `;
    container.appendChild(colorTag);

    input.value = '';
}

// Helper to get selected colors
function getSelectedColors() {
    const colors = [];
    document.querySelectorAll('.color-checkbox:checked').forEach(checkbox => {
        colors.push(checkbox.value);
    });
    document.querySelectorAll('.selected-color-input').forEach(input => {
        colors.push(input.value);
    });
    return [...new Set(colors)]; // Remove duplicates
}

// Update stock inputs based on checked sizes
// Helper to toggle manual/auto barcode entry
function updateBarcodeUI() {
    const isAuto = document.getElementById('autoGenerateBarcode').checked;
    const wrapper = document.getElementById('barcodeInputWrapper');

    if (isAuto) {
        wrapper.classList.add('hidden');
        document.getElementById('newBarkod').value = ''; // Clear manual entry
    } else {
        wrapper.classList.remove('hidden');
    }

    // Refresh stock inputs as well
    if (document.getElementById('newKategori').value === 'Kıyafet') {
        updateStockInputs();
    }
}

function updateStockInputs() {
    const container = document.getElementById('stockInputContainer');
    const checkedSizes = document.querySelectorAll('.size-checkbox:checked');
    const customSizes = document.querySelectorAll('.selected-size-input');
    const autoGen = document.getElementById('autoGenerateBarcode').checked;
    const enableColors = true; // Renk seçimi her zaman aktif
    const currentValues = {};

    // Mevcut değerleri ve barkodları koru
    document.querySelectorAll('[id^="stock_"], [id^="barcode_val_"]').forEach(input => {
        currentValues[input.id] = input.value;
    });

    container.innerHTML = '';

    // Seçilen renkleri al
    const selectedColors = [];
    document.querySelectorAll('.color-checkbox:checked').forEach(cb => selectedColors.push(cb.value));
    document.querySelectorAll('.selected-color-input').forEach(input => selectedColors.push(input.value));

    const sizesToProcess = [];
    checkedSizes.forEach(cb => sizesToProcess.push(cb.value));
    customSizes.forEach(input => sizesToProcess.push(input.value));
    [...new Set(sizesToProcess)].forEach(size => {

        // Eğer renk seçimi aktifse, her beden+renk için ayrı kart oluştur
        if (enableColors && selectedColors.length > 0) {
            selectedColors.forEach(color => {
                const key = `${size}_${color}`;
                const stockVal = currentValues[`stock_${key}`] || '1';
                const barcodeVal = currentValues[`barcode_val_${key}`] || generateBarcodeNumber();

                const div = document.createElement('div');
                div.className = 'bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2 shadow-sm';

                let barcodeHTML = '';
                if (autoGen) {
                    barcodeHTML = `
                        <div class="text-[10px] text-gray-400">Barkod: ${barcodeVal}</div>
                        <input type="hidden" id="barcode_val_${key}" value="${barcodeVal}">
                    `;
                } else {
                    barcodeHTML = `
                        <div>
                            <label class="text-[10px] font-bold text-gray-500 uppercase">Barkod</label>
                            <input type="text" id="barcode_val_${key}" value="${currentValues[`barcode_val_${key}`] || ''}"
                                placeholder="Barkod girin"
                                class="w-full px-2 py-1.5 text-xs border rounded focus:border-indigo-500 outline-none mt-1" required>
                        </div>
                    `;
                }

                div.innerHTML = `
                    <div class="flex items-center justify-between border-b border-gray-200 pb-2">
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">${color}</span>
                        <span class="text-sm font-bold text-indigo-700">${size} Beden</span>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-gray-500 uppercase">Stok Miktarı</label>
                        <input type="number" id="stock_${key}" value="${stockVal}" placeholder="Stok"
                            class="w-full px-2 py-1.5 text-xs border rounded focus:border-indigo-500 outline-none mt-1" required>
                    </div>
                    ${barcodeHTML}
                `;
                container.appendChild(div);
            });
        } else {
            // Renk seçimi yoksa, sadece beden
            const stockVal = currentValues[`stock_${size}`] || '1';
            const barcodeVal = currentValues[`barcode_val_${size}`] || generateBarcodeNumber();

            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2 shadow-sm';

            let barcodeHTML = '';
            if (autoGen) {
                barcodeHTML = `
                    <div class="text-[10px] text-gray-400">Barkod: ${barcodeVal}</div>
                    <input type="hidden" id="barcode_val_${size}" value="${barcodeVal}">
                `;
            } else {
                barcodeHTML = `
                    <div>
                        <label class="text-[10px] font-bold text-gray-500 uppercase">Barkod</label>
                        <input type="text" id="barcode_val_${size}" value="${currentValues[`barcode_val_${size}`] || ''}"
                            placeholder="Barkod girin"
                            class="w-full px-2 py-1.5 text-xs border rounded focus:border-indigo-500 outline-none mt-1" required>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="text-sm font-bold text-gray-600 border-b border-gray-200 pb-2">${size} Beden</div>
                <div>
                    <label class="text-[10px] font-bold text-gray-500 uppercase">Stok Miktarı</label>
                    <input type="number" id="stock_${size}" value="${stockVal}" placeholder="Stok"
                        class="w-full px-2 py-1.5 text-xs border rounded focus:border-indigo-500 outline-none mt-1" required>
                </div>
                ${barcodeHTML}
            `;
            container.appendChild(div);
        }
    });
}

// Helper to show size details in an alert or modal
function showSizeDetails(bedenler, urunAdi) {
    // Önce varsa eski modalı temizle
    const oldModal = document.getElementById('sizeDetailsModal');
    if (oldModal) oldModal.remove();

    const modalHTML = `
        <div id="sizeDetailsModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white">
                    <h3 class="font-bold text-lg flex items-center">
                        <i class="fas fa-info-circle mr-2"></i>
                        Beden Detayları
                    </h3>
                    <button onclick="document.getElementById('sizeDetailsModal').remove()" class="hover:rotate-90 transition-transform duration-200">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <div class="mb-4">
                        <p class="text-sm text-gray-500 uppercase tracking-wider font-semibold">Ürün Adı</p>
                        <p class="text-gray-800 font-bold text-xl">${urunAdi}</p>
                    </div>
                    
                    <div class="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                        ${bedenler.map(b => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                                <div class="flex items-center">
                                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold mr-3 shadow-inner">
                                        ${b.beden}
                                    </div>
                                    <div>
                                        ${b.renk ? `
                                            <p class="text-[10px] text-gray-400 font-bold uppercase">Renk</p>
                                            <span class="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs mb-1">${b.renk}</span>
                                        ` : ''}
                                        <p class="text-[10px] text-gray-400 font-bold uppercase">Barkod</p>
                                        <p class="text-xs font-mono text-gray-600">${b.barkod || '-'}</p>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="text-[10px] text-gray-400 font-bold uppercase">Miktar</p>
                                    <p class="text-lg font-bold text-indigo-700">${b.miktar} <span class="text-xs">adet</span></p>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mt-8">
                        <button onclick="document.getElementById('sizeDetailsModal').remove()" 
                            class="w-full py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-bold uppercase text-xs tracking-widest outline-none">
                            Kapat
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Get daily report
async function getDailyReport() {
    try {
        const report = await window.electronAPI.getDailyReport();
        if (report.satilanUrunler) report.satilanUrunler.reverse();

        // Hide main page sections
        document.getElementById('barcodeSection').style.display = 'none';
        document.getElementById('quickActionsSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';

        // Load content into dynamic area
        const dynamicContent = document.getElementById('dynamicContent');
        dynamicContent.innerHTML = `
            <div class="w-full max-w-3xl mx-auto">
                <div class="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                    <div class="flex justify-between items-center mb-8">
                        <div class="flex items-center">
                            <div class="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mr-4">
                                <i class="fas fa-chart-line text-indigo-600 text-xl"></i>
                            </div>
                            <h2 class="text-3xl font-bold text-gray-800">Günlük Rapor</h2>
                        </div>
                        <button onclick="showMainMenu()" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-all flex items-center">
                            <i class="fas fa-arrow-left mr-2"></i>
                            Ana Menü
                        </button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl text-center border border-blue-200 shadow-sm hover-card">
                            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500 text-white mx-auto mb-4">
                                <i class="fas fa-shopping-bag text-2xl"></i>
                            </div>
                            <h3 class="text-lg font-semibold mb-2 text-blue-800">Toplam Satış</h3>
                            <p class="text-4xl font-bold text-blue-600">${report.toplamSatis || 0}</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl text-center border border-green-200 shadow-sm hover-card">
                            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-green-500 text-white mx-auto mb-4">
                                <i class="fas fa-coins text-2xl"></i>
                            </div>
                            <h3 class="text-lg font-semibold mb-2 text-green-800">Toplam Ciro</h3>
                            <p class="text-4xl font-bold text-green-600">${report.toplamCiro?.toFixed(2) || '0.00'} TL</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl text-center border border-purple-200 shadow-sm hover-card">
                            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-purple-500 text-white mx-auto mb-4">
                                <i class="fas fa-chart-line text-2xl"></i>
                            </div>
                            <h3 class="text-lg font-semibold mb-2 text-purple-800">Toplam Kar</h3>
                            <p class="text-4xl font-bold text-purple-600">${report.toplamKar?.toFixed(2) || '0.00'} TL</p>
                        </div>
                    </div>

                    <!-- Satılan Ürünler Listesi -->
                    <div class="mb-8 overflow-hidden border rounded-xl">
                        <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center">
                                <i class="fas fa-list-ul mr-2 text-indigo-500"></i>
                                Satılan Ürün Detayları
                            </h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Barkod</th>
                                        <th class="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Ürün</th>
                                        <th class="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Beden</th>
                                        <th class="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Renk</th>
                                        <th class="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Adet</th>
                                        <th class="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase">Fiyat</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${report.satilanUrunler && report.satilanUrunler.length > 0 ? report.satilanUrunler.map(item => `
                                        <tr>
                                            <td class="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500">${item.barkod}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-xs font-bold text-gray-900">${item.urunAdi}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">
                                                <span class="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">${item.beden}</span>
                                            </td>
                                            <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-600">
                                                ${item.renk ? `<span class="px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">${item.renk}</span>` : '-'}
                                            </td>
                                            <td class="px-4 py-3 whitespace-nowrap text-center text-xs font-bold text-indigo-600">${item.miktar}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-right text-xs font-bold text-gray-900">${(item.satisFiyati * item.miktar).toFixed(2)} TL</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="6" class="px-4 py-8 text-center text-gray-500 italic text-sm">Henüz satış yapılmadı.</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div class="border-t border-gray-200 pt-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onclick="printCurrentDailyReport()" 
                                class="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 px-6 rounded-xl flex items-center justify-center transition duration-300 hover:shadow-lg">
                                <i class="fas fa-print mr-2"></i>
                                <span class="font-medium">Raporu Yazdır</span>
                            </button>
                            <button onclick="showResetConfirmation()" 
                                class="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-4 px-6 rounded-xl flex items-center justify-center transition duration-300 hover:shadow-lg">
                                <i class="fas fa-sync-alt mr-2"></i>
                                <span class="font-medium">Gün Sonu Al ve Sıfırla</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Confirmation Dialog (Hidden by default) -->
            <div id="resetConfirmation" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full">
                    <div class="text-center mb-6">
                        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
                            <i class="fas fa-exclamation-triangle text-2xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-800 mb-2">Emin misiniz?</h3>
                        <p class="text-gray-600">Günlük satışları sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                    </div>
                    
                    <div class="flex space-x-4">
                        <button onclick="hideResetConfirmation()" 
                            class="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors focus:outline-none">
                            <i class="fas fa-times mr-2"></i>
                            Vazgeç
                        </button>
                        <button onclick="resetDailyReport()" 
                            class="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors focus:outline-none">
                            <i class="fas fa-check mr-2"></i>
                            Evet, Sıfırla
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Daily report error:', error);
        showNotification('Günlük rapor alınırken bir hata oluştu!', 'error');
    }
}

// Print end of day report
function printEndOfDayReport() {
    window.print();
}

// Show Reset Confirmation Dialog
function showResetConfirmation() {
    const resetConfirmation = document.getElementById('resetConfirmation');
    if (resetConfirmation) {
        resetConfirmation.classList.remove('hidden');
    }
}

// Hide Reset Confirmation Dialog
function hideResetConfirmation() {
    const resetConfirmation = document.getElementById('resetConfirmation');
    if (resetConfirmation) {
        resetConfirmation.classList.add('hidden');
    }
}

// Reset Daily Report
async function resetDailyReport() {
    try {
        // Show loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
        }

        // Get the report data before resetting for printing
        const reportData = await window.electronAPI.getDailyReport();

        const result = await window.electronAPI.resetDailyReport();
        hideResetConfirmation();

        if (result.success) {
            showNotification(result.message, 'success');

            // Print end of day report with the data before reset
            if (reportData.toplamSatis > 0) {
                try {
                    await window.electronAPI.printEndOfDayReport(reportData);
                    showNotification('Gün sonu raporu yazdırılıyor...', 'info');
                } catch (printError) {
                    console.error('Print end of day report error:', printError);
                    showNotification('Gün sonu raporu yazdırılırken bir hata oluştu!', 'error');
                }
            }

            // Refresh the report display after a short delay to show zeroed values
            setTimeout(async () => {
                getDailyReport();

                // Hide loading overlay
                if (loadingOverlay) {
                    loadingOverlay.classList.add('hidden');
                }

                // No longer clear cart items - leave them intact when resetting daily reports
                // Refresh stats to show reset values
                await loadStatistics();
            }, 1000);
        } else {
            showNotification(result.message, 'error');

            // Hide loading overlay
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error resetting daily report:', error);
        showNotification('Günlük satışlar sıfırlanırken bir hata oluştu!', 'error');
        hideResetConfirmation();

        // Hide loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    }
}

// Update item quantity in the cart
async function updateItemQuantity(index, newQuantity) {
    // Don't allow quantity below 1
    if (newQuantity < 1) return;

    const item = cart[index];

    // Check if we have enough stock for the new quantity
    try {
        const product = await window.electronAPI.getProduct(item.urunId);

        // Find specific size stock if applicable
        let stockAvailable = product.stokMiktari;
        if (product && product.bedenler && product.bedenler.length > 0 && item.beden) {
            const sizeInfo = product.bedenler.find(b => b.beden === item.beden);
            if (sizeInfo) {
                stockAvailable = sizeInfo.miktar;
            }
        }

        if (product && newQuantity > stockAvailable) {
            showNotification(`Yetersiz stok! ${item.urunAdi} (${item.beden}) için sadece ${stockAvailable} adet stok mevcut.`, 'error');
            return;
        }

        // İndirim sadece barkod için kullanılır, sepete otomatik uygulanmaz
        // if (product && product.indirim !== undefined) {
        //     item.indirim = product.indirim;
        // }
    } catch (error) {
        console.error('Error checking stock:', error);
    }

    item.miktar = newQuantity;

    // Apply discount if any
    const discountFactor = 1 - (item.indirim / 100 || 0);
    item.toplamFiyat = item.birimFiyat * newQuantity * discountFactor;

    updateCartDisplay();
}

// Remove item from cart
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

// Complete Sale
// Complete Sale - Opens Payment Modal
function completeSale() {
    if (cart.length === 0) {
        showNotification('Sepet boş!', 'error');
        return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);

    // Update modal UI
    document.getElementById('paymentTotalAmount').textContent = totalAmount.toFixed(2);
    document.getElementById('receivedAmount').value = '';
    document.getElementById('changeAmount').textContent = '0.00 ₺';
    document.getElementById('changeAmount').className = 'text-2xl font-bold text-gray-500';

    // Show modal
    const modal = document.getElementById('paymentModal');
    modal.classList.remove('hidden');

    // Yazıcıları yükle - varsayılan Aclas ile başlayan
    const savedSalePrinter = localStorage.getItem('defaultSalePrinter') || '';
    getPrintersCached().then(printers => {
        const select = document.getElementById('saleReceiptPrinter');
        // Mevcut seçenekleri temizle (manuel haç kalabilir)
        select.innerHTML = '<option value="manuel">Manuel Seçim (Diyalog)</option>';
        printers.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            select.appendChild(option);
        });
        // Aclas ile başlayan yazıcıyı bul, yoksa kaydedileni, yoksa ilkini kullan
        const aclasPrinter = printers.find(p => p.name.toLowerCase().startsWith('aclas'));
        const targetPrinter = savedSalePrinter && printers.find(p => p.name === savedSalePrinter)
            ? savedSalePrinter
            : (aclasPrinter ? aclasPrinter.name : (printers[0] ? printers[0].name : 'manuel'));
        select.value = targetPrinter;
        // Değişiklikte kaydet
        select.onchange = (e) => localStorage.setItem('defaultSalePrinter', e.target.value);
    }).catch(() => {});

    // Auto focus input
    setTimeout(() => {
        document.getElementById('receivedAmount').focus();
    }, 100);
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}

function calculateChange() {
    const totalAmount = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);
    const receivedAmount = parseFloat(document.getElementById('receivedAmount').value) || 0;
    const changeAmount = document.getElementById('changeAmount');

    if (receivedAmount >= totalAmount) {
        const change = receivedAmount - totalAmount;
        changeAmount.textContent = `${change.toFixed(2)} ₺`;
        changeAmount.className = 'text-2xl font-bold text-green-600';
    } else {
        const missing = totalAmount - receivedAmount;
        changeAmount.textContent = `Eksik: ${missing.toFixed(2)} ₺`;
        changeAmount.className = 'text-2xl font-bold text-red-600';
    }
}

function setReceivedAmount(amount) {
    const totalAmount = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);
    const input = document.getElementById('receivedAmount');

    if (amount === 'exact') {
        input.value = totalAmount.toFixed(2);
    } else {
        input.value = amount;
    }

    calculateChange();
    document.getElementById('receivedAmount').focus();
}

async function confirmPaymentAndPrint() {
    const totalAmount = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);
    let receivedAmount = parseFloat(document.getElementById('receivedAmount').value);

    // If no amount entered, assume exact amount (cash)
    if (!receivedAmount || receivedAmount < totalAmount) {
        // Optional: Block sale if amount is insufficient? 
        // For now, if empty, assume exact cash. If explicitly less, warn user.
        if (document.getElementById('receivedAmount').value && receivedAmount < totalAmount) {
            showNotification('Ödenen miktar yetersiz!', 'error');
            return;
        }
        receivedAmount = totalAmount;
    }

    const changeAmount = receivedAmount - totalAmount;

    try {
        const saleId = await window.electronAPI.saveSale({
            kullaniciId: currentUser.id,
            toplamTutar: totalAmount,
            items: cart
        });

        if (saleId) {
            showNotification('Satış başarıyla tamamlandı!', 'success');
            closePaymentModal();

            // Print receipt with payment details
            try {
                const printerSelect = document.getElementById('saleReceiptPrinter');
                const selectedPrinter = printerSelect ? printerSelect.value : 'manuel';
                await window.electronAPI.printSaleReceipt({
                    saleId: saleId,
                    items: cart,
                    totalAmount: totalAmount,
                    receivedAmount: receivedAmount,
                    changeAmount: changeAmount,
                    printerName: selectedPrinter
                });
                showNotification('Fiş yazdırılıyor...', 'info');
            } catch (printError) {
                console.error('Print error:', printError);
                showNotification('Fiş yazdırılırken bir hata oluştu!', 'error');
            }

            cart = [];
            updateCartDisplay();
            await loadStatistics();
        }
    } catch (error) {
        console.error('Sale error:', error);
        showNotification('Satış kaydedilirken bir hata oluştu!', 'error');
    }
}

// Function to edit a product
async function editProduct(id) {
    try {
        const product = await window.electronAPI.getProduct(id);
        if (!product) {
            showNotification('Ürün bulunamadı!', 'error');
            return;
        }

        // Hide main page sections
        document.getElementById('barcodeSection').style.display = 'none';
        document.getElementById('quickActionsSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';

        // Load content into dynamic area
        const dynamicContent = document.getElementById('dynamicContent');
        dynamicContent.innerHTML = `
            <div class="w-full max-w-md mx-auto">
                <div class="bg-white p-6 rounded-xl shadow-xl border border-gray-100">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-xl font-bold text-gray-800 flex items-center">
                            <i class="fas fa-edit mr-2 text-blue-600"></i>
                            Ürün Düzenle
                        </h2>
                        <button onclick="showProducts()" class="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition duration-200 flex items-center">
                            <i class="fas fa-arrow-left mr-2"></i>
                            Geri
                        </button>
                    </div>
                    <form id="editProductForm" class="space-y-4">
                        <input type="hidden" id="editProductId" value="${product.id}">
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Barkod</label>
                            <input type="text" id="editBarkod" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.barkod}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Ürün Adı</label>
                            <input type="text" id="editUrunAdi" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.urunAdi}">
                        </div>
                        <div class="space-y-2">
                            <label class="block text-gray-700 text-sm font-bold">Kategori</label>
                            <select id="editKategori" onchange="toggleEditSizeSelection(this.value)" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors">
                                <option value="Kıyafet" ${product.kategori !== 'Ev Tekstili' ? 'selected' : ''}>Kıyafet</option>
                                <option value="Ev Tekstili" ${product.kategori === 'Ev Tekstili' ? 'selected' : ''}>Ev Tekstili</option>
                            </select>
                        </div>

                        <div id="editSizeSelectionDiv" class="${product.kategori === 'Kıyafet' ? '' : 'hidden'}">
                            <!-- Renk Seçimi -->
                            <div class="mb-3">
                                <label class="flex items-center text-sm font-bold text-gray-700 mb-2">
                                    <input type="checkbox" id="editEnableColorSelection" onchange="toggleEditColorSelection()" class="mr-2 rounded form-checkbox h-4 w-4 text-indigo-600" ${product.bedenler && product.bedenler.some(b => b.renk) ? 'checked' : ''}>
                                    Renk Seçimi Aktif
                                </label>
                                <div id="editColorSelectionDiv" class="${product.bedenler && product.bedenler.some(b => b.renk) ? '' : 'hidden'} space-y-2 mt-2">
                                    <div class="text-sm text-gray-500 mb-2">Genel Renkler:</div>
                                    <div class="flex flex-wrap gap-3">
                                        ${['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Pembe', 'Mor', 'Lacivert', 'Bej', 'Gri', 'Kahverengi', 'Bordo', 'Turkuaz'].map(renk => {
            const isChecked = product.bedenler && product.bedenler.some(b => b.renk === renk);
            return `
                                                <label class="inline-flex items-center p-2 px-3 bg-white border rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors text-sm shadow-sm">
                                                    <input type="checkbox" class="edit-color-checkbox form-checkbox h-5 w-5 text-indigo-600" value="${renk}" ${isChecked ? 'checked' : ''} onchange="updateEditStockInputs()">
                                                    <span class="ml-2 text-sm text-gray-700 font-medium">${renk}</span>
                                                </label>
                                            `;
        }).join('')}
                                    </div>
                                    <div class="mt-3">
                                        <label class="block text-sm text-gray-600 mb-1">Diğer Renk Ekle:</label>
                                        <div class="flex gap-2">
                                            <input type="text" id="editCustomColorInput" placeholder="Renk adı girin..." class="flex-1 px-3 py-2 text-sm border rounded-lg focus:border-indigo-500 outline-none">
                                            <button type="button" onclick="addEditCustomColor()" class="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition">
                                                <i class="fas fa-plus"></i> Ekle
                                            </button>
                                        </div>
                                    </div>
                                    <div id="editSelectedColorsContainer" class="flex flex-wrap gap-2 mt-3"></div>
                                </div>
                            </div>

                            <label class="block text-gray-700 text-sm font-bold mb-2">Bedenler</label>
                            <div class="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg border">
                                ${['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(size => {
            const isChecked = product.bedenler && product.bedenler.some(b => b.beden === size);
            return `
                                        <label class="flex items-center space-x-1 text-xs cursor-pointer hover:text-indigo-600">
                                            <input type="checkbox" value="${size}" class="edit-size-checkbox rounded text-indigo-600"
                                                onchange="updateEditStockInputs()" ${isChecked ? 'checked' : ''}>
                                            <span>${size}</span>
                                        </label>
                                    `;
        }).join('')}
                            </div>
                        </div>

                        <div id="editStockQuantityDiv" class="${product.kategori === 'Kıyafet' ? '' : 'hidden'}">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Beden Stokları ve Barkodları</label>
                            <div id="editStockInputContainer" class="grid grid-cols-2 gap-3">
                                <!-- Dynamic inputs will be loaded here -->
                            </div>
                        </div>

                        <div id="editStandardStockDiv" class="${product.kategori === 'Kıyafet' ? 'hidden' : ''}">
                             <label class="block text-gray-700 text-sm font-bold mb-2">Stok Miktarı</label>
                             <input type="number" id="editStokMiktari" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.stokMiktari || 0}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Alış Fiyatı</label>
                            <input type="number" step="0.01" id="editAlisFiyati" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.alisFiyati}" oninput="calculateAutoPrice('edit')">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Satış Fiyatı</label>
                            <input type="number" step="0.01" id="editSatisFiyati" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.satisFiyati}">
                        </div>
                        <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border border-amber-200">
                            <label class="flex items-center cursor-pointer">
                                <input type="checkbox" id="editAutoPrice" onchange="toggleAutoPrice('edit')" class="form-checkbox h-4 w-4 text-amber-600 rounded mr-2">
                                <span class="text-sm font-bold text-amber-800"><i class="fas fa-calculator mr-1"></i> Kar Yüzdesine göre otomatik fiyat gir</span>
                            </label>
                            <div id="editKarYuzdesiDiv" class="hidden mt-3">
                                <label class="block text-gray-700 text-sm font-bold mb-1">Kar Yüzdesi (%)</label>
                                <input type="number" step="0.01" id="editKarYuzdesi" class="w-full px-3 py-2 border border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none transition-colors bg-white font-bold text-amber-700" min="0" oninput="calculateAutoPrice('edit')" placeholder="Örn: 50">
                            </div>
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Stok Miktarı</label>
                            <input type="number" id="editStokMiktari" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.stokMiktari}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">İndirim (%) <span class="text-xs text-orange-500 font-normal">- Sadece Barkod İçin</span></label>
                            <input type="number" step="0.01" id="editIndirim" class="w-full px-3 py-2 border rounded-lg focus:border-indigo-500 focus:outline-none transition-colors" value="${product.indirim || 0}" min="0" max="100">
                        </div>
                        <button type="submit" class="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition duration-200 font-medium">
                            <i class="fas fa-save mr-2"></i>
                            Kaydet
                        </button>
                    </form>
                </div>
            </div>
        `;

        // Setup Enter key navigation for the edit form
        setTimeout(() => {
            // Initial stock inputs load
            updateEditStockInputs(product.bedenler);

            setupEnterKeyNavigation('editProductForm');

            // Set up the form submit handler
            const editForm = document.getElementById('editProductForm');
            if (editForm) {
                editForm.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const kategori = document.getElementById('editKategori').value;
                    const bedenler = [];
                    let totalStok = 0;

                    if (kategori === 'Kıyafet') {
                        const checkedSizes = document.querySelectorAll('.edit-size-checkbox:checked');
    const customSizes = document.querySelectorAll('.edit-selected-size-input');
                        const enableColors = document.getElementById('editEnableColorSelection').checked;
                        const selectedColors = [];

                        // Seçilen renkleri al
                        document.querySelectorAll('.edit-color-checkbox:checked').forEach(cb => selectedColors.push(cb.value));
                        document.querySelectorAll('.edit-selected-color-input').forEach(input => selectedColors.push(input.value));

                        checkedSizes.forEach(checkbox => {
                            const size = checkbox.value;

                            if (enableColors && selectedColors.length > 0) {
                                // Her beden+renk kombinasyonu için
                                selectedColors.forEach(color => {
                                    const key = `${size}_${color}`;
                                    const stockInput = document.getElementById(`edit_stock_${key}`);
                                    const barcodeInput = document.getElementById(`edit_barcode_val_${key}`);
                                    const stockVal = stockInput ? parseInt(stockInput.value) || 0 : 0;

                                    if (stockVal >= 0) {
                                        bedenler.push({
                                            beden: size,
                                            renk: color,
                                            barkod: barcodeInput ? barcodeInput.value : document.getElementById('editBarkod').value,
                                            miktar: stockVal
                                        });
                                        totalStok += stockVal;
                                    }
                                });
                            } else {
                                // Renk yoksa, sadece beden
                                const stockInput = document.getElementById(`edit_stock_${size}`);
                                const barcodeInput = document.getElementById(`edit_barcode_val_${size}`);
                                const stockVal = stockInput ? parseInt(stockInput.value) || 0 : 0;
                                if (stockVal >= 0) {
                                    bedenler.push({
                                        beden: size,
                                        barkod: barcodeInput ? barcodeInput.value : document.getElementById('editBarkod').value,
                                        miktar: stockVal
                                    });
                                    totalStok += stockVal;
                                }
                            }
                        });
                    } else {
                        totalStok = parseInt(document.getElementById('editStokMiktari').value) || 0;
                    }

                    const updatedProduct = {
                        id: parseInt(document.getElementById('editProductId').value),
                        barkod: document.getElementById('editBarkod').value,
                        urunAdi: document.getElementById('editUrunAdi').value,
                        kategori: kategori,
                        alisFiyati: parseFloat(document.getElementById('editAlisFiyati').value),
                        satisFiyati: parseFloat(document.getElementById('editSatisFiyati').value),
                        stokMiktari: totalStok,
                        indirim: parseFloat(document.getElementById('editIndirim').value || 0),
                        bedenler: bedenler
                    };

                    try {
                        const success = await window.electronAPI.updateProduct(updatedProduct);
                        if (success) {
                            showNotification('Ürün başarıyla güncellendi!', 'success');
                            showProducts();
                        } else {
                            showNotification('Ürün güncellenemedi!', 'error');
                        }
                    } catch (error) {
                        console.error('Update product error:', error);
                        showNotification('Ürün güncellenirken bir hata oluştu!', 'error');
                    }
                });
            }
        }, 100);

    } catch (error) {
        console.error('Edit product error:', error);
        showNotification('Ürün düzenleme sayfası açılırken bir hata oluştu!', 'error');
    }
}

// Helper for edit product category toggle
function toggleEditSizeSelection(category) {
    const sizeDiv = document.getElementById('editSizeSelectionDiv');
    const stockDiv = document.getElementById('editStockQuantityDiv');
    const standardDiv = document.getElementById('editStandardStockDiv');

    if (category === 'Kıyafet') {
        sizeDiv.classList.remove('hidden');
        stockDiv.classList.remove('hidden');
        standardDiv.classList.add('hidden');
    } else {
        sizeDiv.classList.add('hidden');
        stockDiv.classList.add('hidden');
        standardDiv.classList.remove('hidden');
    }
}

// Update stock inputs during product edit
function updateEditStockInputs(initialBedenler = null) {
    const container = document.getElementById('editStockInputContainer');
    const checkedSizes = document.querySelectorAll('.edit-size-checkbox:checked');
    const customSizes = document.querySelectorAll('.edit-selected-size-input');
    const enableColors = document.getElementById('editEnableColorSelection')?.checked || false;
    const currentValues = {};

    // Mevcut değerleri ve barkodları koru (initialBedenler yoksa)
    if (!initialBedenler) {
        document.querySelectorAll('[id^="edit_stock_"], [id^="edit_barcode_val_"]').forEach(input => {
            currentValues[input.id] = input.value;
        });
    } else {
        // İlk yüklemede initialBedenler kullan
        initialBedenler.forEach(b => {
            const key = b.renk ? `${b.beden}_${b.renk}` : b.beden;
            currentValues[`edit_stock_${key}`] = b.miktar;
            currentValues[`edit_barcode_val_${key}`] = b.barkod;
        });
    }

    container.innerHTML = '';

    // Seçilen renkleri al
    const selectedColors = [];
    document.querySelectorAll('.edit-color-checkbox:checked').forEach(cb => selectedColors.push(cb.value));
    document.querySelectorAll('.edit-selected-color-input').forEach(input => selectedColors.push(input.value));

    const sizesToProcess = [];
    checkedSizes.forEach(cb => sizesToProcess.push(cb.value));
    customSizes.forEach(input => sizesToProcess.push(input.value));
    [...new Set(sizesToProcess)].forEach(size => {

        // Eğer renk seçimi aktifse, her beden+renk için ayrı kart oluştur
        if (enableColors && selectedColors.length > 0) {
            selectedColors.forEach(color => {
                const key = `${size}_${color}`;
                const stockVal = currentValues[`edit_stock_${key}`] || '1';
                const barcodeVal = currentValues[`edit_barcode_val_${key}`] || generateBarcodeNumber();

                const div = document.createElement('div');
                div.className = 'bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2 shadow-sm';
                div.innerHTML = `
                    <div class="flex items-center justify-between border-b border-gray-200 pb-2">
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">${color}</span>
                        <span class="text-sm font-bold text-indigo-700">${size} Beden</span>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-gray-500 uppercase">Stok Miktarı</label>
                        <input type="number" id="edit_stock_${key}" value="${stockVal}" placeholder="Stok"
                            class="w-full px-2 py-1.5 text-xs border rounded focus:border-indigo-500 outline-none mt-1" required>
                    </div>
                    <div class="text-[10px] text-gray-400 truncate">Barkod: ${barcodeVal}</div>
                    <input type="hidden" id="edit_barcode_val_${key}" value="${barcodeVal}">
                `;
                container.appendChild(div);
            });
        } else {
            // Renk seçimi yoksa, sadece beden
            const stockVal = currentValues[`edit_stock_${size}`] || '1';
            const barcodeVal = currentValues[`edit_barcode_val_${size}`] || generateBarcodeNumber();

            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-2 rounded border border-gray-200 space-y-1';
            div.innerHTML = `
                <div class="text-xs font-bold text-gray-600">${size} Beden</div>
                <input type="number" id="edit_stock_${size}" value="${stockVal}" placeholder="Stok"
                    class="w-full px-2 py-1 text-xs border rounded focus:border-indigo-500 outline-none" required>
                <div class="text-[10px] text-gray-400 truncate">Barkod: ${barcodeVal}</div>
                <input type="hidden" id="edit_barcode_val_${size}" value="${barcodeVal}">
            `;
            container.appendChild(div);
        }
    });
}

// Toggle color selection in edit form
function toggleEditColorSelection() {
    const checkbox = document.getElementById('editEnableColorSelection');
    const colorDiv = document.getElementById('editColorSelectionDiv');

    if (checkbox.checked) {
        colorDiv.classList.remove('hidden');
    } else {
        colorDiv.classList.add('hidden');
    }

    // Refresh stock inputs
    updateEditStockInputs();
}

// Add custom color in edit form
function addEditCustomColor() {
    const input = document.getElementById('editCustomColorInput');
    const colorName = input.value.trim();

    if (!colorName) {
        showNotification('Lütfen bir renk adı girin!', 'error');
        return;
    }

    // Seçilen renkleri göster
    const container = document.getElementById('editSelectedColorsContainer');
    const colorTag = document.createElement('span');
    colorTag.className = 'inline-flex items-center px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs';
    colorTag.innerHTML = `
        ${colorName}
        <button type="button" onclick="this.parentElement.remove(); updateEditStockInputs();" class="ml-1 text-indigo-500 hover:text-indigo-700">
            <i class="fas fa-times"></i>
        </button>
        <input type="hidden" class="edit-selected-color-input" value="${colorName}">
    `;
    container.appendChild(colorTag);

    input.value = '';
    updateEditStockInputs();
}

// Function to delete a product
async function deleteProduct(id) {
    try {
        // Get product details for better confirmation message
        const product = await window.electronAPI.getProduct(id);
        if (!product) {
            showNotification('Ürün bulunamadı!', 'error');
            return;
        }

        // Show modern confirmation modal
        showDeleteProductModal(product);
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Ürün silinirken bir hata oluştu!', 'error');
    }
}

// Show modern delete product confirmation modal
function showDeleteProductModal(product) {
    // Create modal HTML
    const modalHTML = `
        <div id="deleteProductModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all">
                <div class="p-6">
                    <div class="text-center mb-6">
                        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
                            <i class="fas fa-exclamation-triangle text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">Ürünü Sil</h3>
                        <p class="text-gray-600">Bu ürünü silmek istediğinizden emin misiniz?</p>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-sm font-medium text-gray-600">Ürün Adı:</span>
                                <span class="text-sm text-gray-900">${product.urunAdi}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm font-medium text-gray-600">Barkod:</span>
                                <span class="text-sm text-gray-900">${product.barkod}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm font-medium text-gray-600">Stok:</span>
                                <span class="text-sm text-gray-900">${product.stokMiktari} adet</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm font-medium text-gray-600">Satış Fiyatı:</span>
                                <span class="text-sm text-gray-900">${product.satisFiyati.toFixed(2)} TL</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-center mb-6">
                        <input type="checkbox" id="confirmDeleteCheckbox" class="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 focus:ring-2">
                        <label for="confirmDeleteCheckbox" class="ml-2 text-sm text-gray-700">
                            Bu ürünü silmek istediğimi onaylıyorum
                        </label>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button onclick="hideDeleteProductModal()" 
                            class="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500">
                            <i class="fas fa-times mr-2"></i>
                            Vazgeç
                        </button>
                        <button id="confirmDeleteBtn" onclick="confirmDeleteProduct(${product.id})" 
                            class="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled>
                            <i class="fas fa-trash-alt mr-2"></i>
                            Sil
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup checkbox event listener
    const checkbox = document.getElementById('confirmDeleteCheckbox');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    checkbox.addEventListener('change', function () {
        confirmBtn.disabled = !this.checked;
    });

    // Focus checkbox
    checkbox.focus();
}

// Hide delete product modal
function hideDeleteProductModal() {
    const modal = document.getElementById('deleteProductModal');
    if (modal) {
        modal.remove();
    }
}

// Confirm delete product
async function confirmDeleteProduct(productId) {
    try {
        const result = await window.electronAPI.deleteProduct(productId);

        hideDeleteProductModal();

        if (result.success) {
            showNotification(result.message, 'success');
            // Refresh product list
            showProducts();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Ürün silinirken bir hata oluştu!', 'error');
        hideDeleteProductModal();
    }
}

// Function to delete a sale
async function deleteSale(saleId) {
    try {
        // Show confirmation dialog with more detailed warning
        if (!confirm('Bu satışı silmek istediğinizden emin misiniz?\n\nBu işlem:\n• Satışı tamamen silecek\n• Ürün stoklarını geri yükleyecek\n• Günlük raporlardan düşecek\n\nBu işlem geri alınamaz!')) {
            return;
        }

        const result = await window.electronAPI.deleteSale(saleId);

        if (result.success) {
            showNotification(result.message, 'success');
            // Refresh sales list
            showSales();
            // Refresh statistics
            await loadStatistics();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Delete sale error:', error);
        showNotification('Satış silinirken bir hata oluştu!', 'error');
    }
}

// Handle barcode input when Enter key is pressed
async function handleBarcodeInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const barcodeInput = document.getElementById('barcodeInput');
        const barcode = barcodeInput.value.trim();

        if (barcode === '') {
            showNotification('Lütfen bir barkod girin!', 'error');
            barcodeInput.focus();
            return;
        }

        try {
            console.log('Searching for product with barcode:', barcode);
            const product = await window.electronAPI.searchProduct(barcode);

            if (product) {
                // Her beden+renk kombinasyonunun ayrı barkodu olduğu için selectedBeden varsa direkt ekle
                if (product.selectedBeden) {
                    // Eğer barkod spesifik bir beden+renk kombinasyonuna aitse
                    const matchingBeden = product.bedenler && product.bedenler.find(b => b.barkod === barcode);
                    if (matchingBeden) {
                        addToCartWithProduct(product, matchingBeden.beden, matchingBeden.renk || '');
                    } else {
                        addToCartWithProduct(product, product.selectedBeden, product.selectedRenk || '');
                    }
                } else if (product.bedenler && product.bedenler.length > 1) {
                    // Eğer belirli bir beden seçili gelmediyse ve birden fazla beden varsa diyaloğu göster
                    showSizeSelectionDialog(product);
                    return;
                } else {
                    // Tek beden veya beden bilgisi yoksa
                    const selectedSize = product.bedenler && product.bedenler.length === 1
                        ? product.bedenler[0].beden
                        : (product.beden || '');
                    const selectedRenk = product.bedenler && product.bedenler.length === 1
                        ? (product.bedenler[0].renk || '')
                        : '';

                    addToCartWithProduct(product, selectedSize, selectedRenk);
                }

                // Clear input
                barcodeInput.value = '';
                barcodeInput.focus();
            } else {
                showNotification('Ürün bulunamadı!', 'error');
                barcodeInput.value = '';
                barcodeInput.focus();
            }
        } catch (error) {
            console.error('Search product error:', error);
            showNotification('Ürün aranırken bir hata oluştu!', 'error');
            barcodeInput.value = '';
            barcodeInput.focus();
        }
    }
}

// Dialog for choosing size
function showSizeSelectionDialog(product) {
    // Create a simple overlay modal for size selection
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]';
    modal.id = 'sizeSelectionModal';

    modal.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-gray-800">Beden/Renk Seçiniz</h3>
            <p class="text-gray-600 mb-4">${product.urunAdi} için seçim yapın:</p>
            <div class="grid grid-cols-2 gap-2 mb-6">
                ${product.bedenler.map(b => `
                    <button onclick="selectProductSize(${product.id}, '${b.beden}', '${b.renk || ''}')"
                        class="px-3 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition-colors font-medium text-left ${b.miktar <= 0 ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${b.miktar <= 0 ? 'disabled' : ''}>
                        <div class="flex items-center justify-between">
                            <div>
                                ${b.renk ? `<div class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold inline-block mb-1">${b.renk}</div>` : ''}
                                <div class="text-sm font-bold">${b.beden} Beden</div>
                            </div>
                            <div class="text-[10px] text-gray-500">${b.miktar} st.</div>
                        </div>
                    </button>
                `).join('')}
            </div>
            <button onclick="document.getElementById('sizeSelectionModal').remove()"
                class="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors">
                İptal
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Handler for size selection from dialog
async function selectProductSize(productId, size, renk = '') {
    try {
        const product = await window.electronAPI.getProduct(productId);
        if (product) {
            addToCartWithProduct(product, size, renk);
            document.getElementById('sizeSelectionModal').remove();

            // Refocus barcode input
            const barcodeInput = document.getElementById('barcodeInput');
            if (barcodeInput) {
                barcodeInput.value = '';
                barcodeInput.focus();
            }
        }
    } catch (err) {
        console.error('Select size error:', err);
    }
}

// Logic to add a specific product/size to cart
function addToCartWithProduct(product, selectedSize, selectedRenk = '') {
    // Check stock for specific size+color combination if applicable
    let stockAvailable = product.stokMiktari;
    let sizeInfo = null;

    if (product.bedenler && product.bedenler.length > 0 && selectedSize) {
        // Beden+renk kombinasyonunu bul
        sizeInfo = product.bedenler.find(b => b.beden === selectedSize && (selectedRenk ? b.renk === selectedRenk : !b.renk));
        if (!sizeInfo && selectedRenk) {
            // Eğer tam eşleşme yoksa, sadece beden ile eşleşen var mı kontrol et
            sizeInfo = product.bedenler.find(b => b.beden === selectedSize);
        }
        if (sizeInfo) {
            stockAvailable = sizeInfo.miktar;
        }
    }

    if (stockAvailable <= 0) {
        const displayText = selectedRenk ? `${selectedSize} / ${selectedRenk}` : selectedSize;
        showNotification(`Yetersiz stok! ${product.urunAdi} (${displayText}) için stok bulunmuyor.`, 'error');
        return;
    }

    // Cart'ta aynı beden+renk kombinasyonunu ara
    const existingIndex = cart.findIndex(item =>
        item.urunId === product.id &&
        item.beden === selectedSize &&
        (selectedRenk ? item.renk === selectedRenk : !item.renk)
    );

    if (existingIndex !== -1) {
        if (cart[existingIndex].miktar + 1 > stockAvailable) {
            const displayText = selectedRenk ? `${selectedSize} / ${selectedRenk}` : selectedSize;
            showNotification(`Yetersiz stok! ${product.urunAdi} (${displayText}) için sadece ${stockAvailable} adet stok mevcut.`, 'error');
            return;
        }
        updateItemQuantity(existingIndex, cart[existingIndex].miktar + 1);
        const displayText = selectedRenk ? `${selectedSize} / ${selectedRenk}` : selectedSize;
        showNotification(`${product.urunAdi} (${displayText}) sepete eklendi!`, 'success');
    } else {
        const indirim = 0; // İndirim sadece barkod için kullanılır, sepete uygulanmaz
        const discountFactor = 1;
        const discountedPrice = product.satisFiyati;

        cart.push({
            urunId: product.id,
            barkod: sizeInfo ? sizeInfo.barkod : product.barkod,
            urunAdi: product.urunAdi,
            beden: selectedSize || (product.beden || ''),
            renk: selectedRenk || '',
            birimFiyat: product.satisFiyati,
            miktar: 1,
            indirim: indirim,
            toplamFiyat: discountedPrice
        });
        const displayText = selectedRenk ? `${selectedSize} / ${selectedRenk}` : selectedSize;
        showNotification(`${product.urunAdi} (${displayText}) sepete eklendi!`, 'success');
    }
    updateCartDisplay();
}


// Function to update the cart display
function updateCartDisplay() {
    const cartItemsContainer = document.getElementById('cartItems');
    const cartTotalElement = document.getElementById('cartTotal');

    if (!cartItemsContainer || !cartTotalElement) {
        return;
    }

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-center">
                <div class="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-2">
                    <i class="fas fa-shopping-cart text-gray-400 text-xl"></i>
                </div>
                <p class="text-gray-500">Sepetiniz boş</p>
                <p class="text-sm text-gray-400">Ürün eklemek için barkod okutun</p>
            </div>
        `;
        cartTotalElement.textContent = '0.00';
        return;
    }

    // Calculate the total
    const total = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);

    // Update the cart display with detailed discount information
    cartItemsContainer.innerHTML = cart.map((item, index) => `
        <div class="py-4 flex items-center justify-between">
            <div class="flex-1">
                <div class="flex items-center">
                    <div class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 mr-3">
                        <i class="fas fa-box text-indigo-600"></i>
                    </div>
                    <div>
                        <h3 class="font-medium">${item.urunAdi}${item.beden ? ` <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-1">${item.beden} Beden</span>` : ''}${item.renk ? ` <span class="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full ml-1">${item.renk}</span>` : ''}</h3>
                        <div class="text-sm text-gray-500">
                            <span>${item.birimFiyat.toFixed(2)} TL x ${item.miktar}</span>
                            ${item.indirim > 0 ? `<span class="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">%${item.indirim} İndirim</span>` : ''}
                        </div>
                        ${item.indirim > 0 ?
            `<div class="text-xs text-red-500 flex items-center">
                            <i class="fas fa-tag mr-1"></i>
                            <span>İndirimli fiyat: ${(item.birimFiyat * (1 - item.indirim / 100)).toFixed(2)} TL</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex items-center">
                <div class="mr-4 text-right">
                    <span class="font-bold">${item.toplamFiyat.toFixed(2)} TL</span>
                </div>
                <div class="flex flex-col">
                    <div class="flex items-center space-x-2">
                        <button onclick="updateItemQuantity(${index}, ${item.miktar - 1})" 
                            class="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
                            <i class="fas fa-minus text-gray-600 text-xs"></i>
                        </button>
                        <span class="font-medium text-lg w-6 text-center">${item.miktar}</span>
                        <button onclick="updateItemQuantity(${index}, ${item.miktar + 1})" 
                            class="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
                            <i class="fas fa-plus text-gray-600 text-xs"></i>
                        </button>
                        <button onclick="removeFromCart(${index})" 
                            class="ml-2 h-8 w-8 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200">
                            <i class="fas fa-trash-alt text-red-600 text-xs"></i>
                        </button>
                    </div>
                    <div class="flex items-center mt-2">
                        <div class="text-xs text-gray-500 mr-2">İndirim:</div>
                        <input type="number" 
                            min="0" max="100" 
                            value="${item.indirim || 0}"
                            onchange="updateItemDiscount(${index}, this.value)"
                            class="w-16 h-6 px-1 py-0 text-xs border border-gray-300 rounded">
                        <span class="text-xs ml-1">%</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Update the total display
    cartTotalElement.textContent = total.toFixed(2);
}

// Function to update item discount in cart
function updateItemDiscount(index, discountPercent) {
    // Validate discount percentage (0-100)
    const discount = Math.min(Math.max(parseFloat(discountPercent) || 0, 0), 100);

    const item = cart[index];
    item.indirim = discount;

    // Recalculate total price with discount
    const discountFactor = 1 - (discount / 100);
    item.toplamFiyat = item.birimFiyat * item.miktar * discountFactor;

    console.log(`İndirim uygulandı: %${discount}, Birim Fiyat: ${item.birimFiyat} TL, İndirimli Birim Fiyat: ${(item.birimFiyat * discountFactor).toFixed(2)} TL, Toplam: ${item.toplamFiyat.toFixed(2)} TL`);

    updateCartDisplay();
}

// Print current daily report
async function printCurrentDailyReport() {
    try {
        const reportData = await window.electronAPI.getDailyReport();

        if (reportData.toplamSatis === 0) {
            showNotification('Yazdırılacak satış verisi bulunamadı!', 'error');
            return;
        }

        await window.electronAPI.printEndOfDayReport(reportData);
        showNotification('Günlük rapor yazdırılıyor...', 'info');
    } catch (error) {
        console.error('Print current daily report error:', error);
        showNotification('Rapor yazdırılırken bir hata oluştu!', 'error');
    }
}

// ============ BARKOD ÜRETME SİSTEMİ ============

// Barkod üretici modal'ı göster
function showBarcodeGenerator() {
    // Hide main page sections
    document.getElementById('barcodeSection').style.display = 'none';
    document.getElementById('quickActionsSection').style.display = 'none';
    document.getElementById('statsSection').style.display = 'none';
    document.getElementById('shortcutsSection').style.display = 'none';

    const dynamicContent = document.getElementById('dynamicContent');
    dynamicContent.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 p-4">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-white flex items-center">
                        <i class="fas fa-qrcode mr-2"></i>
                        Barkod Üretim Sistemi
                    </h2>
                    <button onclick="showMainMenu()" class="bg-white text-indigo-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition duration-200 flex items-center shadow-sm">
                        <i class="fas fa-home mr-2"></i>
                        Ana Menü
                    </button>
                </div>
            </div>
            
            <div class="p-6">
                <!-- Seçim Butonları -->
                <div class="grid grid-cols-2 gap-4 mb-6">
                    <button onclick="selectBarcodeMode('new')" 
                        class="p-6 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 border-2 border-green-300 rounded-xl transition-all transform hover:scale-105 shadow-md">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-3 shadow-lg">
                                <i class="fas fa-plus text-white text-2xl"></i>
                            </div>
                            <h3 class="font-bold text-lg text-green-800">Yeni Ürün Ekle</h3>
                            <p class="text-sm text-green-600 mt-2">Yeni ürün kaydı oluştur ve barkod üret</p>
                        </div>
                    </button>
                    
                    <button onclick="selectBarcodeMode('existing')" 
                        class="p-6 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-300 rounded-xl transition-all transform hover:scale-105 shadow-md">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-3 shadow-lg">
                                <i class="fas fa-box text-white text-2xl"></i>
                            </div>
                            <h3 class="font-bold text-lg text-blue-800">Mevcut Ürüne Barkod Ekle</h3>
                            <p class="text-sm text-blue-600 mt-2">Var olan bir ürün için yeni barkod üret</p>
                        </div>
                    </button>
                </div>
                
                <!-- Form Alanı -->
                <div id="barcodeFormArea" class="hidden">
                    <!-- Form buraya yüklenecek -->
                </div>
            </div>
        </div>
    `;
}

// İndirim inputlarını senkronize et - YENİ MANTIK
// İndirimsiz Fiyat = Satış Fiyatı / (1 - İndirim/100)
// İndirimli Fiyat = Satış Fiyatı (DB'deki gerçek fiyat)
function syncDiscountInputs(source) {
    const priceInput = document.getElementById('barcodeSatisFiyati');
    const percentInput = document.getElementById('barcodeIndirim');
    const fullPriceInput = document.getElementById('barcodeIndirimsizFiyat');

    const price = parseFloat(priceInput.value) || 0;

    if (source === 'price') {
        // Satış fiyatı değiştiğinde, indirimsiz fiyatı güncelle
        const percent = parseFloat(percentInput.value) || 0;
        if (price > 0 && percent > 0 && percent < 100) {
            const fullPrice = price * (1 + percent / 100);
            fullPriceInput.value = fullPrice.toFixed(2);
        } else {
            fullPriceInput.value = '';
        }
    } else if (source === 'percent') {
        // Yüzde değiştiğinde, indirimsiz fiyatı güncelle
        const percent = parseFloat(percentInput.value) || 0;
        if (price > 0 && percent > 0 && percent < 100) {
            const fullPrice = price * (1 + percent / 100);
            fullPriceInput.value = fullPrice.toFixed(2);
        } else {
            fullPriceInput.value = '';
        }
    } else if (source === 'fullPrice') {
        // İndirimsiz fiyat değiştiğinde, yüzdeyi hesapla
        const fullPrice = parseFloat(fullPriceInput.value) || 0;
        if (fullPrice > 0 && price > 0 && fullPrice > price) {
            const percent = ((fullPrice / price) - 1) * 100;
            percentInput.value = percent.toFixed(1);
        }
    }
}

// Barkod modu seçimi
async function selectBarcodeMode(mode) {
    const formArea = document.getElementById('barcodeFormArea');
    formArea.classList.remove('hidden');

    if (mode === 'new') {
        formArea.innerHTML = `
            <div class="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <i class="fas fa-edit mr-2 text-green-600"></i>
                    Yeni Ürün Bilgileri
                </h3>
                
                <form id="newProductBarcodeForm" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="col-span-2 md:col-span-1">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Ürün Adı *</label>
                            <input type="text" id="barcodeUrunAdi" required
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        
                        <div class="col-span-2 md:col-span-1">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Kategori *</label>
                            <select id="barcodeKategori" required onchange="toggleBarcodeSizeSelection(this.value)"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="Kıyafet" selected>Kıyafet</option>
                                <option value="Ev Tekstili">Ev Tekstili</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Alış Fiyatı (TL) *</label>
                            <input type="number" id="barcodeAlisFiyati" step="0.01" min="0" required
                                oninput="calculateAutoPrice('barcode')"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        
                        <div class="col-span-2">
                            <div class="bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-lg border border-amber-200 mb-3">
                                <label class="flex items-center cursor-pointer">
                                    <input type="checkbox" id="barcodeAutoPrice" onchange="toggleAutoPrice('barcode')" class="form-checkbox h-4 w-4 text-amber-600 rounded mr-2">
                                    <span class="text-sm font-bold text-amber-800"><i class="fas fa-calculator mr-1"></i> Kar Yüzdesine göre otomatik fiyat gir</span>
                                </label>
                                <div id="barcodeKarYuzdesiDiv" class="hidden mt-2">
                                    <label class="block text-gray-700 text-sm font-bold mb-1">Kar Yüzdesi (%)</label>
                                    <input type="number" step="0.01" id="barcodeKarYuzdesi" class="w-full px-3 py-2 border border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none transition-colors bg-white font-bold text-amber-700" min="0" oninput="calculateAutoPrice('barcode')" placeholder="Örn: 50">
                                </div>
                            </div>
                        </div>

                        <div class="col-span-2">
                            <div class="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Satış Fiyatı (TL) *</label>
                                    <input type="number" id="barcodeSatisFiyati" step="0.01" min="0" required
                                        oninput="syncDiscountInputs('price')"
                                        class="w-full px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">İndirim Oranı (%) <span class="text-xs text-orange-500">Barkod İçin</span></label>
                                    <input type="number" id="barcodeIndirim" min="0" max="100" value="0" step="0.1"
                                        oninput="syncDiscountInputs('percent')"
                                        class="w-full px-4 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-orange-600 font-bold">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">İNDİRİMSİZ FİYAT <span class="text-xs text-gray-400">(Barkodda üzeri çizili)</span></label>
                                    <input type="number" id="barcodeIndirimsizFiyat" step="0.01" min="0"
                                        oninput="syncDiscountInputs('fullPrice')"
                                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 bg-gray-50 text-gray-600 font-bold text-lg">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="barcodeSizeSelectionDiv" class="hidden space-y-4 p-4 bg-white rounded-lg border border-gray-200">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-2">Renk Seçimi (Zorunlu)</label>
                            <div id="barcodeColorSelectionDiv" class="space-y-2 mt-2">
                                <div class="text-sm text-gray-500 mb-2">Genel Renkler:</div>
                                <div class="flex flex-wrap gap-3">
                                    ${['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Pembe', 'Mor', 'Lacivert', 'Bej', 'Gri', 'Kahverengi', 'Bordo', 'Turkuaz'].map(renk => `
                                        <label class="inline-flex items-center p-2 px-3 bg-white border rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors text-sm shadow-sm">
                                            <input type="checkbox" class="barcode-color-checkbox form-checkbox h-5 w-5 text-indigo-600" value="${renk}" onchange="updateBarcodeStockInputs()">
                                            <span class="ml-2 text-sm text-gray-700 font-medium">${renk}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <div class="mt-3">
                                    <label class="block text-sm text-gray-600 mb-1">Diğer Renk Ekle:</label>
                                    <div class="flex gap-2">
                                        <input type="text" id="barcodeCustomColorInput" placeholder="Renk adı girin..." class="flex-1 px-3 py-2 text-sm border rounded-lg focus:border-indigo-500 outline-none">
                                        <button type="button" onclick="addBarcodeCustomColor()" class="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition">
                                            <i class="fas fa-plus"></i> Ekle
                                        </button>
                                    </div>
                                </div>
                                <div id="barcodeSelectedColorsContainer" class="flex flex-wrap gap-2 mt-3"></div>
                            </div>
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Beden Seçimi (Sayısal)</label>
                            <div class="flex flex-wrap gap-2">
                                ${[36, 38, 40, 42, 44, 46, 48, 50, 52, 54].map(size => `
                                    <label class="inline-flex items-center p-2 bg-gray-50 border rounded hover:bg-indigo-50 cursor-pointer transition-colors">
                                        <input type="checkbox" class="barcode-size-checkbox form-checkbox h-4 w-4 text-indigo-600" value="${size}" onchange="updateBarcodeStockInputs()">
                                        <span class="ml-2 text-sm text-gray-700">${size}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                            <div class="mt-3">
                                <label class="block text-sm text-gray-600 mb-1">Diğer Beden Ekle:</label>
                                <div class="flex gap-2">
                                    <input type="text" id="barcodeCustomSizeInput" placeholder="Beden girin..." class="flex-1 px-3 py-2 text-sm border rounded-lg focus:border-indigo-500 outline-none">
                                    <button type="button" onclick="addBarcodeCustomSize()" class="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 transition">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <div id="barcodeSelectedSizesContainer" class="flex flex-wrap gap-2 mt-2"></div>
                            </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Beden Seçimi (Standart)</label>
                            <div class="flex flex-wrap gap-2">
                                ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => `
                                    <label class="inline-flex items-center p-2 bg-gray-50 border rounded hover:bg-indigo-50 cursor-pointer transition-colors">
                                        <input type="checkbox" class="barcode-size-checkbox form-checkbox h-4 w-4 text-indigo-600" value="${size}" onchange="updateBarcodeStockInputs()">
                                        <span class="ml-2 text-sm text-gray-700">${size}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div id="barcodeStockQuantityDiv" class="hidden space-y-2">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Beden Stok & Barkod Adedi</label>
                        <div id="barcodeStockInputContainer" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <!-- inputs will be generated here -->
                        </div>
                    </div>

                    <div id="barcodeStandardDiv" class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Stok Miktarı *</label>
                            <input type="number" id="barcodeStokMiktari" min="1" value="1"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Barkod Adedi *</label>
                            <input type="number" id="barcodeAdet" min="1" value="1"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" onclick="showBarcodeGenerator()" 
                            class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition">
                            <i class="fas fa-times mr-2"></i>İptal
                        </button>
                        <button type="submit" 
                            class="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition shadow-md">
                            <i class="fas fa-qrcode mr-2"></i>Barkod Üret
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('newProductBarcodeForm').addEventListener('submit', handleNewProductBarcode);
        toggleBarcodeSizeSelection('Kıyafet'); // Kategori varsayılan olarak Kıyafet seçili

    } else if (mode === 'existing') {
        const products = await window.electronAPI.getProducts();
    products.reverse();

        formArea.innerHTML = `
            <div class="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <i class="fas fa-box mr-2 text-blue-600"></i>
                    Mevcut Ürün Seçimi
                </h3>
                
                <form id="existingProductBarcodeForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Ürün Seçin *</label>
                        <select id="existingProductSelect" required
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Ürün seçiniz...</option>
                            ${products.map(p => `
                                <option value="${p.id}">${p.urunAdi} ${p.beden ? `(${p.beden})` : ''} - ${p.barkod} (Stok: ${p.stokMiktari})</option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div id="existingProductDetails" class="hidden space-y-4">
                        <div id="existingSizeBarcodeCounts" class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-4 rounded-lg border border-gray-200">
                            <!-- Size-specific barcode counts will be loaded here -->
                        </div>
                        <div id="existingStandardBarcodeCount">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Barkod Adedi *</label>
                            <input type="number" id="existingBarcodeAdet" min="1" value="1"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" onclick="showBarcodeGenerator()" 
                            class="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition">
                            <i class="fas fa-times mr-2"></i>İptal
                        </button>
                        <button type="submit" 
                            class="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition shadow-md">
                            <i class="fas fa-qrcode mr-2"></i>Barkod Üret
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('existingProductSelect').addEventListener('change', async (e) => {
            const detailsDiv = document.getElementById('existingProductDetails');
            const sizeCountsDiv = document.getElementById('existingSizeBarcodeCounts');
            const standardCountDiv = document.getElementById('existingStandardBarcodeCount');

            if (e.target.value) {
                detailsDiv.classList.remove('hidden');
                const product = products.find(p => p.id == e.target.value);

                if (product.bedenler && product.bedenler.length > 0) {
                    sizeCountsDiv.classList.remove('hidden');
                    standardCountDiv.classList.add('hidden');
                    sizeCountsDiv.innerHTML = `
                        <div class="col-span-2 text-sm font-bold text-gray-600 mb-1 border-bottom">Bedenlere Göre Barkod Adedi</div>
                        ${product.bedenler.map(b => {
                        const key = b.renk ? `${b.beden}_${b.renk}` : b.beden;
                        return `
                            <div class="flex items-center space-x-2 bg-blue-50 p-2 rounded border border-blue-100">
                                <div class="flex flex-col">
                                    <span class="text-sm font-bold text-blue-700">${b.beden}</span>
                                    ${b.renk ? `<span class="text-xs text-gray-700">${b.renk}</span>` : ''}
                                </div>
                                <input type="number" id="existing_barcode_count_${key}" value="1" min="0"
                                    class="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-400 outline-none"
                                    placeholder="Barkod Adedi">
                            </div>
                        `}).join('')}
                    `;
                } else {
                    sizeCountsDiv.classList.add('hidden');
                    standardCountDiv.classList.remove('hidden');
                }
            } else {
                detailsDiv.classList.add('hidden');
            }
        });

        document.getElementById('existingProductBarcodeForm').addEventListener('submit', handleExistingProductBarcode);
    }
}

// Yeni ürün için barkod üretimi
async function handleNewProductBarcode(e) {
    e.preventDefault();

    const kategori = document.getElementById('barcodeKategori').value;
    const urunAdi = document.getElementById('barcodeUrunAdi').value;
    const alisFiyati = parseFloat(document.getElementById('barcodeAlisFiyati').value);
    const satisFiyati = parseFloat(document.getElementById('barcodeSatisFiyati').value);
    const indirim = parseFloat(document.getElementById('barcodeIndirim').value) || 0;

    let indirimsizFiyat = null;
    if (indirim > 0 && indirim < 100) {
        indirimsizFiyat = satisFiyati * (1 + indirim / 100);
    }

    const bedenler = [];
    const printItems = [];
    let totalStok = 0;
    const barkod = generateBarcodeNumber();

    if (kategori === 'Kıyafet') {
        const checkedSizes = document.querySelectorAll('.barcode-size-checkbox:checked');
    const customSizes = document.querySelectorAll('.barcode-selected-size-input');
        const enableColors = true; // Renk seçimi her zaman aktif
        const selectedColors = [];

        // Seçilen renkleri al
        document.querySelectorAll('.barcode-color-checkbox:checked').forEach(cb => selectedColors.push(cb.value));
        document.querySelectorAll('.barcode-selected-color-input').forEach(input => selectedColors.push(input.value));

        const sizesToProcess = [];
        checkedSizes.forEach(cb => sizesToProcess.push(cb.value));
        customSizes.forEach(input => sizesToProcess.push(input.value));
        [...new Set(sizesToProcess)].forEach(size => {

            if (enableColors && selectedColors.length > 0) {
                // Her beden+renk kombinasyonu için
                selectedColors.forEach(color => {
                    const key = `${size}_${color}`;
                    const stockInput = document.getElementById(`barcode_stock_${key}`);
                    const countInput = document.getElementById(`barcode_count_${key}`);

                    if (stockInput && countInput) {
                        const stockVal = parseInt(stockInput.value) || 0;
                        const countVal = parseInt(countInput.value) || 0;

                        if (stockVal > 0 || countVal > 0) {
                            const uniqueBarcode = document.getElementById(`barcode_val_${key}`).value || generateBarcodeNumber();
                            bedenler.push({
                                beden: size,
                                renk: color,
                                barkod: uniqueBarcode,
                                miktar: stockVal
                            });
                            totalStok += stockVal;

                            if (countVal > 0) {
                                // Beden aralığını hesapla
                                const allCheckedSizes = Array.from(document.querySelectorAll('.barcode-size-checkbox:checked'))
                                    .map(cb => parseInt(cb.value))
                                    .filter(val => !isNaN(val))
                                    .sort((a, b) => a - b);

                                let bedenAraligi = '';
                                if (allCheckedSizes.length > 0) {
                                    bedenAraligi = `${allCheckedSizes[0]}-${allCheckedSizes[allCheckedSizes.length - 1]}`;
                                }

                                printItems.push({
                                    barkod: uniqueBarcode,
                                    urunAdi: urunAdi,
                                    kategori: kategori,
                                    beden: size,
                                    bedenAraligi: bedenAraligi,
                                    renk: color,
                                    satisFiyati: satisFiyati,
                                    indirimsizFiyat: indirimsizFiyat,
                                    adet: countVal
                                });
                            }
                        }
                    }
                });
            } else {
                // Renk yoksa, sadece beden
                const stockVal = parseInt(document.getElementById(`barcode_stock_${size}`).value) || 0;
                const countVal = parseInt(document.getElementById(`barcode_count_${size}`).value) || 0;

                if (stockVal > 0 || countVal > 0) {
                    const uniqueBarcode = document.getElementById(`barcode_val_${size}`).value || generateBarcodeNumber();
                    bedenler.push({
                        beden: size,
                        barkod: uniqueBarcode,
                        miktar: stockVal
                    });
                    totalStok += stockVal;

                    if (countVal > 0) {
                        printItems.push({
                            barkod: uniqueBarcode,
                            urunAdi: urunAdi,
                            kategori: kategori,
                            beden: size,
                            satisFiyati: satisFiyati,
                            indirimsizFiyat: indirimsizFiyat,
                            adet: countVal
                        });
                    }
                }
            }
        });

        if (bedenler.length === 0) {
            showNotification('En az bir beden ve miktar/barkod seçmelisiniz!', 'error');
            return;
        }
    } else {
        totalStok = parseInt(document.getElementById('barcodeStokMiktari').value) || 0;
        const countVal = parseInt(document.getElementById('barcodeAdet').value) || 0;

        if (countVal > 0) {
            printItems.push({
                barkod: barkod,
                urunAdi: urunAdi,
                kategori: kategori,
                beden: '',
                satisFiyati: satisFiyati,
                adet: countVal
            });
        }
    }

    try {
        // Ürünü veritabanına ekle
        await window.electronAPI.addProduct({
            barkod: barkod,
            urunAdi: urunAdi,
            kategori: kategori,
            beden: '', // Multi-size products don't have a single "beden" string
            alisFiyati: alisFiyati,
            satisFiyati: satisFiyati,
            stokMiktari: totalStok,
            indirim: indirim,
            bedenler: bedenler
        });

        if (printItems.length > 0) {
            showBarcodePreview(printItems);
            showNotification('Ürün başarıyla eklendi ve barkodlar oluşturuldu!', 'success');
        } else {
            showNotification('Ürün başarıyla eklendi (Barkod üretilmedi)!', 'success');
            showProducts();
        }
    } catch (error) {
        console.error('Barkod üretim hatası:', error);
        showNotification('Barkod üretilirken hata oluştu!', 'error');
    }
}

// Mevcut ürün için barkod üretimi
async function handleExistingProductBarcode(e) {
    e.preventDefault();

    const productId = parseInt(document.getElementById('existingProductSelect').value);
    const printItems = [];

    try {
        const products = await window.electronAPI.getProducts();
    products.reverse();
        const product = products.find(p => p.id === productId);

        if (!product) {
            showNotification('Ürün bulunamadı!', 'error');
            return;
        }

        if (product.bedenler && product.bedenler.length > 0) {
            // Mevcut ürün beden aralığını bul
            let bedenAraligi = '';
            const sizes = product.bedenler.map(b => parseInt(b.beden)).filter(val => !isNaN(val)).sort((a, b) => a - b);
            if (sizes.length > 0) {
                bedenAraligi = `${sizes[0]}-${sizes[sizes.length - 1]}`;
            }

            product.bedenler.forEach(b => {
                const key = b.renk ? `${b.beden}_${b.renk}` : b.beden;
                const countVal = parseInt(document.getElementById(`existing_barcode_count_${key}`).value) || 0;
                if (countVal > 0) {
                    let indirimsizFiyat = null;
                    if (product.indirim && product.indirim > 0 && product.indirim < 100) {
                        indirimsizFiyat = product.satisFiyati * (1 + product.indirim / 100);
                    }

                    printItems.push({
                        barkod: b.barkod || product.barkod,
                        urunAdi: product.urunAdi,
                        kategori: product.kategori || 'Kıyafet',
                        beden: b.beden,
                        bedenAraligi: bedenAraligi,
                        renk: b.renk || '',
                        satisFiyati: product.satisFiyati,
                        indirimsizFiyat: indirimsizFiyat,
                        adet: countVal
                    });
                }
            });
        } else {
            const countVal = parseInt(document.getElementById('existingBarcodeAdet').value) || 0;
            if (countVal > 0) {
                let indirimsizFiyat = null;
                if (product.indirim && product.indirim > 0 && product.indirim < 100) {
                    indirimsizFiyat = product.satisFiyati * (1 + product.indirim / 100);
                }

                printItems.push({
                    barkod: product.barkod,
                    urunAdi: product.urunAdi,
                    kategori: product.kategori || 'Kıyafet',
                    beden: product.beden || '',
                    satisFiyati: product.satisFiyati,
                    indirimsizFiyat: indirimsizFiyat,
                    adet: countVal
                });
            }
        }

        if (printItems.length === 0) {
            showNotification('Lütfen barkod adedi girin!', 'error');
            return;
        }

        showBarcodePreview(printItems);
        showNotification('Barkodlar oluşturuldu!', 'success');
    } catch (error) {
        console.error('Barkod üretim hatası:', error);
        showNotification('Barkod üretilirken hata oluştu!', 'error');
    }
}

// Benzersiz barkod numarası üret (EAN-13 uyumlu olması için 12 hane üretilmeli)
// Benzersiz barkod numarası üret (EAN-13 uyumlu olması için 12 hane üretilmeli)
function generateBarcodeNumber() {
    // Timestamp'in son 9 hanesi + 3 rastgele rakam = 12 hane
    // Rapid çağrılarda farklılık olması için extra bir salt ekliyoruz
    const now = Date.now();
    const timestamp = now.toString().slice(-9);
    // Güvenlik için 0-999 arası rastgele sayı ve milisaniye hash'i kullanıyoruz
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return timestamp + random;
}

// Barkod önizleme ve yazdırma
async function showBarcodePreview(items) {
    const formArea = document.getElementById('barcodeFormArea');

    // Load QR code as base64 once
    let qrBase64 = 'qr.jpeg'; // Fallback
    try {
        const qr = await window.electronAPI.getQRBase64();
        if (qr) {
            qrBase64 = qr;
        }
    } catch (err) {
        console.error('Failed to load QR base64:', err);
    }

    let barcodesHTML = '';
    let globalIndex = 0;

    items.forEach(item => {
        for (let i = 0; i < item.adet; i++) {
            const price = parseFloat(item.satisFiyati || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            // Ürün adına göre font büyüklüğünü ölçekle (Min 7px, Max 11px)
            let nameFontSize = '11px';
            const nameLen = (item.urunAdi || '').length;
            const sizeRange = item.bedenAraligi || item.beden || '';
            if (nameLen > 25) {
                nameFontSize = '9px';
            }
            if (nameLen > 40) {
                nameFontSize = '8px';
            }
            if (nameLen > 60) {
                nameFontSize = '7px';
            }

            barcodesHTML += `
                <div class="barcode-item bg-white overflow-hidden" 
                     style="width: 38mm; height: 54mm; box-sizing: border-box; margin: 2mm 0 0 0.5mm; padding: 0; border: 0;">
                    
                    <table style="width: 100%; height: 100%; border-collapse: collapse; border: 2px solid black; table-layout: fixed;">
                        <!-- Row 1: Name and Beden Header -->
                        <tr style="height: 15%;">
                            <td style="width: 70%; border: 2px solid black; padding: 1px; font-size: ${nameFontSize}; font-weight: bold; text-align: center; vertical-align: middle; line-height: 1; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">
                                ${item.urunAdi}
                            </td>
                            <td style="width: 30%; border: 2px solid black; padding: 0px; font-size: 8px; font-weight: bold; text-align: center; vertical-align: middle;">
                                BEDEN
                            </td>
                        </tr>
                        <!-- Row 2: Color and Specific Size Value -->
                        <tr style="height: 10%;">
                            <td style="border: 2px solid black; padding: 0px; font-size: 8px; font-weight: bold; text-align: center; vertical-align: middle;">
                                ${item.renk || '-'}
                            </td>
                            <td style="border: 2px solid black; padding: 0px; font-size: 11px; font-weight: 900; text-align: center; vertical-align: middle;">
                                ${item.beden || 'STD'}
                            </td>
                        </tr>
                        <!-- Row 3: Size Range -->
                         <tr style="height: 8%;">
                            <td colspan="2" style="border: 2px solid black; padding: 0px; font-size: 8px; font-weight: 800; text-align: center; vertical-align: middle;">
                                BEDEN/SİZE (${sizeRange})
                            </td>
                         </tr>
                        
                        <!-- Row 4: Barcode (Code128) - Centered with padding -->
                         <tr style="height: 28%;">
                            <td colspan="2" style="border: 2px solid black; padding: 4px; text-align: center; vertical-align: middle;">
                                <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; overflow: hidden;">
                                    <svg id="barcode-${globalIndex}" class="barcode-svg" style="width: 85%; height: 100%;"></svg>
                                </div>
                            </td>
                         </tr>
                         
                        <!-- Row 5: Price and QR Code -->
                         <tr style="height: 25%;">
                            <td colspan="2" style="border: 2px solid black; padding: 0;">
                                <div style="display: flex; height: 100%;">
                                    <div style="width: 65%; display: flex; flex-direction: column; justify-content: center; align-items: center; border-right: 2px solid black;">
                                        ${item.indirimsizFiyat && item.indirimsizFiyat > item.satisFiyati ? `
                                            <div style="text-decoration: line-through; font-size: 9px; font-weight: bold; color: black; line-height: 1; margin-bottom: 0px; white-space: nowrap;">${parseFloat(item.indirimsizFiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</div>
                                            <div style="font-size: 13px; font-weight: 900; line-height: 1; white-space: nowrap;">${price} ₺</div>
                                        ` : `
                                            <div style="font-size: 13px; font-weight: 900; white-space: nowrap;">${price} ₺</div>
                                        `}
                                        <div style="font-size: 7px; font-weight: bold; margin-top: 1px;">KDV DAHİL</div>
                                    </div>
                                    <div style="width: 35%; display: flex; justify-content: center; align-items: center; padding: 1px;">
                                        <img src="${qrBase64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="QR">
                                    </div>
                                </div>
                            </td>
                         </tr>

                        <!-- Row 6: Store Name - Fixed Overflow -->
                         <tr style="height: 14%;">
                            <td colspan="2" style="border: 2px solid black; padding: 0; text-align: center; vertical-align: middle; font-size: 9px; font-weight: 900; letter-spacing: 0.5px; line-height: 1;">
                                NİSA TESETTÜR
                            </td>
                         </tr>
                    </table>
                </div>
            `;
            globalIndex++;
        }
    });

    // Preview container logic
    formArea.innerHTML = `
        <div class="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-300">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-green-800 flex items-center">
                    <i class="fas fa-check-circle mr-2"></i>
                    Barkodlar Oluşturuldu (${globalIndex} Adet)
                </h3>
                <div class="space-x-2 flex items-center">
                    <select id="printerSelect" class="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                        <option value="manuel">Manuel Seçim (Diyalog)</option>
                    </select>
                    <button onclick="printBarcodes()"
                        class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-md">
                        <i class="fas fa-print mr-2"></i>Yazdır
                    </button>
                    <button onclick="showBarcodeGenerator()"
                        class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition">
                        <i class="fas fa-redo mr-2"></i>Yeni Barkod
                    </button>
                </div>
            </div>

            <div id="barcodePreviewArea" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
                ${barcodesHTML}
            </div>
        </div>
    `;

    // Draw barcodes with preview size (same as print format)
    setTimeout(() => {
        let currentIdx = 0;
        items.forEach(item => {
            for (let i = 0; i < item.adet; i++) {
                try {
                    JsBarcode(`#barcode-${currentIdx}`, item.barkod, {
                        format: 'CODE128',
                        width: 2,
                        height: 35,
                        displayValue: true,
                        fontSize: 9,
                        margin: 2,
                        textMargin: 1
                    });
                } catch (err) {
                    console.error('JsBarcode error:', err);
                }
                currentIdx++;
            }
        });

        // Load printers and select previously saved one
        getPrintersCached().then(printers => {
            const select = document.getElementById('printerSelect');
            const savedPrinter = localStorage.getItem('defaultBarcodePrinter') || '';
            
            printers.forEach(p => {
                const option = document.createElement('option');
                option.value = p.name;
                option.textContent = p.name;
                select.appendChild(option);
            });

            // Argox ile başlayan yazıcıyı varsayılan yap
            const argoxPrinter = printers.find(p => p.name.toLowerCase().includes('argox'));
            const targetPrinter = savedPrinter && printers.find(p => p.name === savedPrinter)
                ? savedPrinter
                : (argoxPrinter ? argoxPrinter.name : (printers[0] ? printers[0].name : 'manuel'));
            select.value = targetPrinter;

            // Save on change
            select.addEventListener('change', (e) => {
                localStorage.setItem('defaultBarcodePrinter', e.target.value);
            });
        }).catch(err => console.error('Printers load error:', err));

    }, 100);
}

// Barkodları yazdır (40x58mm Termal Etiket - DİKEY)
// Barkod yazdırma fonksiyonu (IPC ile ana sürece gönderir)
async function printBarcodes() {
    // Preview alanındaki itemları al
    const barcodeItems = document.querySelectorAll('.barcode-item');
    if (barcodeItems.length === 0) {
        showNotification('Yazdırılacak barkod bulunamadı!', 'error');
        return;
    }

    let printContent = '';
    barcodeItems.forEach(item => {
        // Preview için olan classları temizleyip, sadece içeriği kopyalıyoruz
        const clone = item.cloneNode(true);
        // Remove bg-white for print
        clone.classList.remove('bg-white');

        // Wrap in print-item div which has page-break-after style in main.js
        printContent += `<div class="print-item">${clone.innerHTML}</div>`;
    });

    try {
        const select = document.getElementById('printerSelect');
        const selectedPrinter = select ? select.value : 'manuel';
        const result = await window.electronAPI.printProductLabel(printContent, selectedPrinter);
        if (result.success) {
            showNotification('Barkodlar başarıyla yazdırıldı veya kuyruğa eklendi.');
        } else {
            showNotification('Barkod yazdırma hatası: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Print barcode error:', error);
        showNotification('Yazdırma işlemi sırasında bir hata oluştu.', 'error');
    }
}

// Helper to toggle size selection in barcode generator
function toggleBarcodeSizeSelection(category) {
    const sizeDiv = document.getElementById('barcodeSizeSelectionDiv');
    const stockDiv = document.getElementById('barcodeStockQuantityDiv');
    const standardDiv = document.getElementById('barcodeStandardDiv');

    if (category === 'Kıyafet') {
        sizeDiv.classList.remove('hidden');
        stockDiv.classList.remove('hidden');
        standardDiv.classList.add('hidden');
    } else {
        sizeDiv.classList.add('hidden');
        stockDiv.classList.add('hidden');
        standardDiv.classList.remove('hidden');
    }
}

// Update stock and barcode count inputs based on checked sizes
function updateBarcodeStockInputs() {
    const container = document.getElementById('barcodeStockInputContainer');
    const checkedSizes = document.querySelectorAll('.barcode-size-checkbox:checked');
    const customSizes = document.querySelectorAll('.barcode-selected-size-input');
    const enableColors = true; // Renk seçimi her zaman aktif
    const currentValues = {};

    // Save current values to restore them after re-render
    document.querySelectorAll('[id^="barcode_stock_"], [id^="barcode_count_"], [id^="barcode_val_"]').forEach(input => {
        currentValues[input.id] = input.value;
    });

    container.innerHTML = '';

    // Seçilen renkleri al
    const selectedColors = [];
    document.querySelectorAll('.barcode-color-checkbox:checked').forEach(cb => selectedColors.push(cb.value));
    document.querySelectorAll('.barcode-selected-color-input').forEach(input => selectedColors.push(input.value));

    const sizesToProcess = [];
    checkedSizes.forEach(cb => sizesToProcess.push(cb.value));
    customSizes.forEach(input => sizesToProcess.push(input.value));
    [...new Set(sizesToProcess)].forEach(size => {

        // Eğer renk seçimi aktifse, her beden+renk için ayrı kart oluştur
        if (enableColors && selectedColors.length > 0) {
            selectedColors.forEach(color => {
                const key = `${size}_${color}`;
                const stockVal = currentValues[`barcode_stock_${key}`] || '1';
                const countVal = currentValues[`barcode_count_${key}`] || '1';
                const barcodeVal = currentValues[`barcode_val_${key}`] || generateBarcodeNumber();

                const div = document.createElement('div');
                div.className = 'bg-indigo-50 p-3 rounded border border-indigo-100 space-y-2';
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="px-2 py-0.5 bg-gray-100 text-black rounded text-xs font-bold inline-block mb-1">${color}</div>
                            <div class="text-sm font-bold text-indigo-700">${size} Beden</div>
                        </div>
                        <div class="text-[10px] text-indigo-400 truncate">Barkod: ${barcodeVal}</div>
                        <input type="hidden" id="barcode_val_${key}" value="${barcodeVal}">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Stok</label>
                            <input type="number" id="barcode_stock_${key}" value="${stockVal}"
                                class="w-full px-2 py-1 text-sm border rounded focus:border-indigo-500 focus:outline-none"
                                placeholder="Miktar" required>
                        </div>
                        <div>
                            <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Barkod</label>
                            <input type="number" id="barcode_count_${key}" value="${countVal}"
                                class="w-full px-2 py-1 text-sm border rounded focus:border-indigo-500 focus:outline-none"
                                placeholder="Adet" required min="0">
                        </div>
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            // Renk seçimi yoksa, sadece beden
            const stockVal = currentValues[`barcode_stock_${size}`] || '1';
            const countVal = currentValues[`barcode_count_${size}`] || '1';
            const barcodeVal = currentValues[`barcode_val_${size}`] || generateBarcodeNumber();

            const div = document.createElement('div');
            div.className = 'bg-indigo-50 p-3 rounded border border-indigo-100 space-y-2';
            div.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="text-sm font-bold text-indigo-700">${size} Beden</div>
                    <div class="text-[10px] text-indigo-400 truncate">Barkod: ${barcodeVal}</div>
                    <input type="hidden" id="barcode_val_${size}" value="${barcodeVal}">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Stok</label>
                        <input type="number" id="barcode_stock_${size}" value="${stockVal}"
                            class="w-full px-2 py-1 text-sm border rounded focus:border-indigo-500 focus:outline-none"
                            placeholder="Miktar" required>
                    </div>
                    <div>
                        <label class="block text-[10px] uppercase font-bold text-gray-500 mb-1">Barkod</label>
                        <input type="number" id="barcode_count_${size}" value="${countVal}"
                            class="w-full px-2 py-1 text-sm border rounded focus:border-indigo-500 focus:outline-none"
                            placeholder="Adet" required min="0">
                    </div>
                </div>
            `;
            container.appendChild(div);
        }
    });
}

// Toggle color selection in barcode form
function toggleBarcodeColorSelection() {
    const checkbox = document.getElementById('barcodeEnableColorSelection');
    const colorDiv = document.getElementById('barcodeColorSelectionDiv');

    if (checkbox.checked) {
        colorDiv.classList.remove('hidden');
    } else {
        colorDiv.classList.add('hidden');
    }

    // Refresh stock inputs
    updateBarcodeStockInputs();
}

// Add custom color in barcode form
function addBarcodeCustomColor() {
    const input = document.getElementById('barcodeCustomColorInput');
    const colorName = input.value.trim();

    if (!colorName) {
        showNotification('Lütfen bir renk adı girin!', 'error');
        return;
    }

    // Seçilen renkleri göster
    const container = document.getElementById('barcodeSelectedColorsContainer');
    const colorTag = document.createElement('span');
    colorTag.className = 'inline-flex items-center px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs';
    colorTag.innerHTML = `
        ${colorName}
        <button type="button" onclick="this.parentElement.remove(); updateBarcodeStockInputs();" class="ml-1 text-indigo-500 hover:text-indigo-700">
            <i class="fas fa-times"></i>
        </button>
        <input type="hidden" class="barcode-selected-color-input" value="${colorName}">
    `;
    container.appendChild(colorTag);

    input.value = '';
    updateBarcodeStockInputs();
}

// ============ KAR YÜZDESİ OTOMATİK FİYAT SİSTEMİ ============

// Kar Yüzdesine göre otomatik fiyat checkbox'ını toggle et
function toggleAutoPrice(context) {
    let checkboxId, karDivId, satisFiyatiId;

    if (context === 'add') {
        checkboxId = 'newAutoPrice';
        karDivId = 'newKarYuzdesiDiv';
        satisFiyatiId = 'newSatisFiyati';
    } else if (context === 'edit') {
        checkboxId = 'editAutoPrice';
        karDivId = 'editKarYuzdesiDiv';
        satisFiyatiId = 'editSatisFiyati';
    } else if (context === 'barcode') {
        checkboxId = 'barcodeAutoPrice';
        karDivId = 'barcodeKarYuzdesiDiv';
        satisFiyatiId = 'barcodeSatisFiyati';
    }

    const checkbox = document.getElementById(checkboxId);
    const karDiv = document.getElementById(karDivId);
    const satisFiyatiInput = document.getElementById(satisFiyatiId);

    if (!checkbox || !karDiv || !satisFiyatiInput) return;

    if (checkbox.checked) {
        karDiv.classList.remove('hidden');
        satisFiyatiInput.readOnly = true;
        satisFiyatiInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        satisFiyatiInput.title = 'Kar yüzdesi aktifken otomatik hesaplanır';
        // Hemen hesapla
        calculateAutoPrice(context);
    } else {
        karDiv.classList.add('hidden');
        satisFiyatiInput.readOnly = false;
        satisFiyatiInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        satisFiyatiInput.title = '';
    }
}

// Kar yüzdesine göre satış fiyatını otomatik hesapla
// Formül: Satış Fiyatı = Alış Fiyatı * (1 + Kar Yüzdesi / 100)
function calculateAutoPrice(context) {
    let checkboxId, alisFiyatiId, karYuzdesiId, satisFiyatiId;

    if (context === 'add') {
        checkboxId = 'newAutoPrice';
        alisFiyatiId = 'newAlisFiyati';
        karYuzdesiId = 'newKarYuzdesi';
        satisFiyatiId = 'newSatisFiyati';
    } else if (context === 'edit') {
        checkboxId = 'editAutoPrice';
        alisFiyatiId = 'editAlisFiyati';
        karYuzdesiId = 'editKarYuzdesi';
        satisFiyatiId = 'editSatisFiyati';
    } else if (context === 'barcode') {
        checkboxId = 'barcodeAutoPrice';
        alisFiyatiId = 'barcodeAlisFiyati';
        karYuzdesiId = 'barcodeKarYuzdesi';
        satisFiyatiId = 'barcodeSatisFiyati';
    }

    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || !checkbox.checked) return;

    const alisFiyati = parseFloat(document.getElementById(alisFiyatiId)?.value) || 0;
    const karYuzdesi = parseFloat(document.getElementById(karYuzdesiId)?.value) || 0;
    const satisFiyatiInput = document.getElementById(satisFiyatiId);

    if (!satisFiyatiInput) return;

    if (alisFiyati > 0 && karYuzdesi >= 0) {
        const satisFiyati = alisFiyati * (1 + karYuzdesi / 100);
        satisFiyatiInput.value = satisFiyati.toFixed(2);

        // Barkod formundaysa sync de tetikle
        if (context === 'barcode') {
            syncDiscountInputs('price');
        }
    }
}

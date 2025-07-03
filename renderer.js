// Enhanced notification system with animations and icons
let activeNotifications = [];
let notificationCounter = 0;

function showNotification(message, type = 'info') {
    // Check for duplicate messages already visible
    if (activeNotifications.includes(message)) {
        console.log(`Skipping duplicate notification: ${message}`);
        return;
    }
    
    activeNotifications.push(message);
    notificationCounter++;
    
    const notification = document.createElement('div');
    const notificationId = `notification-${notificationCounter}`;
    notification.id = notificationId;
    
    // Position notifications stacked from top
    const topPosition = 20 + (activeNotifications.length - 1) * 70;
    
    // Create notification with icon and styled content
    let icon = '';
    notification.className = 'notification';
    
    if (type === 'error') {
        notification.classList.add('error');
        icon = '<i class="fas fa-exclamation-circle mr-2"></i>';
    } else if (type === 'success') {
        notification.classList.add('success');
        icon = '<i class="fas fa-check-circle mr-2"></i>';
    } else {
        notification.classList.add('info');
        icon = '<i class="fas fa-info-circle mr-2"></i>';
    }
    
    notification.style.top = `${topPosition}px`;
    notification.style.zIndex = 9999;
    
    // Create structured content
    notification.innerHTML = `
        <div class="flex items-center">
            <div class="flex-shrink-0">
                ${icon}
            </div>
            <div class="ml-2 font-medium">${message}</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    console.log(`Showing notification: ${message} (${type})`);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        notification.style.opacity = 0;
        
        setTimeout(() => {
            notification.remove();
            activeNotifications = activeNotifications.filter(msg => msg !== message);
            
            // Reposition remaining notifications
            document.querySelectorAll('.notification').forEach((element, index) => {
                element.style.top = `${20 + index * 70}px`;
            });
        }, 300);
    }, 3000);
}

// Kullanıcı arayüzü işlemleri
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const mainApp = document.getElementById('mainApp');
    // Initialize form handlers when the document loads
    initializeFormHandlers();
    // Focus username field
    document.getElementById('username').focus();
});

let currentUser = null;
let cart = [];

// Login function
async function login() {
    console.log('Login function called');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showNotification('Kullanıcı adı ve şifre gereklidir!', 'error');
        return;
    }

    try {
        console.log('Attempting login with:', { username });
        const user = await window.electronAPI.login({ username, password });
        
        if (user) {
            console.log('Login successful:', user);
            currentUser = user;
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            await initializeMainApp();
            showNotification('Giriş başarılı!', 'success');
        } else {
            console.log('Login failed: Invalid credentials');
            showNotification('Kullanıcı adı veya şifre hatalı!', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Giriş yapılırken bir hata oluştu!', 'error');
    }
}

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

    // Add product form
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const product = {
                barkod: document.getElementById('newBarkod').value,
                urunAdi: document.getElementById('newUrunAdi').value,
                alisFiyati: parseFloat(document.getElementById('newAlisFiyati').value),
                satisFiyati: parseFloat(document.getElementById('newSatisFiyati').value),
                stokMiktari: parseInt(document.getElementById('newStokMiktari').value),
                indirim: parseFloat(document.getElementById('newIndirim').value || 0)
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

        // Set focus to first input in add product form
        const firstInput = document.getElementById('newBarkod');
        if (firstInput) {
            firstInput.focus();
        }
    }

    // Barcode input handler
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', handleBarcodeInput);
        barcodeInput.focus();
    }
}

// Setup form event listeners
function setupFormEventListeners() {
    // Add Product Form
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const product = {
                barkod: document.getElementById('newBarkod').value,
                urunAdi: document.getElementById('newUrunAdi').value,
                alisFiyati: parseFloat(document.getElementById('newAlisFiyati').value),
                satisFiyati: parseFloat(document.getElementById('newSatisFiyati').value),
                stokMiktari: parseInt(document.getElementById('newStokMiktari').value)
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

        // Focus first input after form is shown
        const firstInput = document.getElementById('newBarkod');
        if (firstInput) {
            firstInput.focus();
        }
    }

    // Barcode Input
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', handleBarcodeInput);
        barcodeInput.focus();
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
                            <i class="fas fa-sign-out-alt mr-2"></i>
                            <span>Çıkış</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- Main Content -->
            <div class="flex-1 container mx-auto p-6 flex flex-col lg:flex-row gap-6 overflow-auto">
                <!-- Left Side - Barcode and Cart -->
                <div class="w-full lg:w-2/3 space-y-6">
                    <div class="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hover-card shimmer-bg">
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
                    
                    <div class="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hover-card">
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

                <!-- Right Side - Quick Actions -->
                <div class="w-full lg:w-1/3 space-y-6">
                    <div class="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden shimmer-bg">
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
                    
                    <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-xl hover-card">
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
    
    console.log("Ana menü başarıyla yüklendi.");
}

// Initialize the main application with user data
async function initializeApp(user) {
    currentUser = user;
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // userInfo elementi bulunamadı, bu satırı kaldırıyoruz
    // document.getElementById('userInfo').textContent = user.kullaniciAdi;
    
    await loadStatistics();
    await initializeMainApp();
}

// Load and display quick statistics - Doğrudan Daily Report verilerini kullanıyor
async function loadStatistics() {
    try {
        // Kullanıcı oturumu kapatmış olabilir, bu durumda güncellemeyi atla
        if (!currentUser) {
            console.log('Kullanıcı oturumu kapandı, istatistik güncelleme atlanıyor');
            return;
        }
        
        // getDailyReport verileri doğrudan kullanılıyor - getStatistics yerine
        const dailyData = await window.electronAPI.getDailyReport();
        console.log('Loaded Daily Report statistics:', dailyData);
        
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
        console.log('Otomatik istatistik güncellemesi yapılıyor...');
        await loadStatistics();
    }, 30000); // 30 saniye
    
    console.log('Otomatik istatistik güncellemeleri başlatıldı - her 30 saniyede bir güncellenecek');
}

// İstatistik güncellemelerini durdur (örneğin logout olduğunda)
function stopAutomaticStatsUpdates() {
    if (statsUpdateTimer) {
        clearInterval(statsUpdateTimer);
        statsUpdateTimer = null;
        console.log('Otomatik istatistik güncellemeleri durduruldu');
    }
}

// Main menu display
function showMainMenu() {
    // Hide all main app sections
    document.querySelectorAll('#mainApp > div').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show the main menu section
    document.getElementById('mainMenu').classList.remove('hidden');
}

// Logout function
function logout() {
    currentUser = null;
    // Clear cart on logout for security reasons
    cart = [];
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('username').focus();
    
    // Stop automatic statistics updates on logout
    stopAutomaticStatsUpdates();
    console.log('Kullanıcı oturumu sonlandırıldı, istatistik güncellemeleri durduruldu.');
}

// This is now handled in the main DOMContentLoaded event listener above

// Ana menü tuşu ortak fonksiyonu
function createMainMenuButton() {
    const button = document.createElement('button');
    button.className = 'bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4';
    button.textContent = 'Ana Menü';
    button.onclick = () => showMainMenu();
    return button;
}

// Show main menu
async function showMainMenu() {
    // Refresh statistics when returning to main menu
    await loadStatistics();
    
    // Ana sayfayı tekrar oluştur
    await initializeMainApp();
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
        const mainContent = document.querySelector('#mainApp .flex-1');
        
        mainContent.innerHTML = `
            <div class="container mx-auto p-6">
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
                            <input type="text" id="productSearchInput" placeholder="Barkod ile ara..." 
                                class="w-full pl-10 pr-4 py-3 border-2 border-indigo-100 focus:border-indigo-400 rounded-lg focus:outline-none transition-colors">
                        </div>
                        
                        <div class="overflow-x-auto rounded-lg border border-gray-200">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Barkod</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ürün Adı</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alış Fiyatı</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Satış Fiyatı</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stok</th>
                                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody id="productTableBody" class="bg-white divide-y divide-gray-200">
                                    ${products.map(p => `
                                        <tr class="hover:bg-gray-50 transition-colors" data-barkod="${p.barkod}" data-id="${p.id}">
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="flex items-center">
                                                    <i class="fas fa-barcode text-gray-400 mr-2"></i>
                                                    <span class="font-medium text-gray-900">${p.barkod}</span>
                                                </div>
                                            </td>
                                            <td class="px-6 py-4">
                                                <div class="text-sm font-medium text-gray-900">${p.urunAdi}</div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="text-sm text-gray-500">${p.alisFiyati.toFixed(2)} TL</div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="font-medium text-indigo-600">
                                                    ${p.satisFiyati.toFixed(2)} TL
                                                    ${p.indirim > 0 ? 
                                                        `<span class="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">%${p.indirim} İndirim</span>
                                                        <div class="text-sm text-red-500">İndirimli: ${(p.satisFiyati * (1 - p.indirim/100)).toFixed(2)} TL</div>` 
                                                    : ''}
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                ${p.stokMiktari > 10 
                                                ? `<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">${p.stokMiktari} adet</span>` 
                                                : p.stokMiktari > 3 
                                                ? `<span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">${p.stokMiktari} adet</span>` 
                                                : `<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">${p.stokMiktari} adet</span>`}
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div class="flex justify-end space-x-2">
                                                    <button onclick="editProduct(${p.id})" class="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition duration-150 flex items-center space-x-1 inline-flex">
                                                        <i class="fas fa-edit"></i>
                                                        <span>Düzenle</span>
                                                    </button>
                                                    <button onclick="deleteProduct(${p.id})" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-lg transition duration-150 flex items-center space-x-1 inline-flex">
                                                        <i class="fas fa-trash-alt"></i>
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
            </div>
        `;
        
        // Setup event listeners after content is loaded
        setupFormEventListeners();

        // After rendering the product list, set up the search functionality
        setTimeout(() => {
            setupProductSearch();
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

    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#productTableBody tr');
        
        rows.forEach(row => {
            const barkod = row.getAttribute('data-barkod').toLowerCase();
            if (barkod.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });

    // Focus the search input when the page loads
    searchInput.focus();
}

// Show sales page
async function showSales() {
    try {
        const sales = await window.electronAPI.getSales(currentUser.id);
        const mainContent = document.querySelector('#mainApp .flex-1');
        
        mainContent.innerHTML = `
            <div class="w-full">
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold">Satışlarım</h2>
                        <button onclick="showMainMenu()" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
                            Ana Menü
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="px-4 py-2">Tarih</th>
                                    <th class="px-4 py-2">Ürünler</th>
                                    <th class="px-4 py-2">Toplam Tutar</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sales.map(s => `
                                    <tr class="border-b">
                                        <td class="px-4 py-2">${new Date(s.tarih).toLocaleString('tr-TR')}</td>
                                        <td class="px-4 py-2">${s.urunler}</td>
                                        <td class="px-4 py-2">${s.toplamTutar.toFixed(2)} TL</td>
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
    } catch (error) {
        console.error('Sales error:', error);
        showNotification('Satışlar listelenirken bir hata oluştu!', 'error');
    }
}

// Add new product
function addProduct() {
    const mainContent = document.querySelector('#mainApp .flex-1');
    
    mainContent.innerHTML = `
        <div class="w-full max-w-md mx-auto">
            <div class="bg-white p-4 rounded-lg shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">Yeni Ürün Ekle</h2>
                    <button onclick="showMainMenu()" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
                        Ana Menü
                    </button>
                </div>
                <form id="addProductForm" class="space-y-4">
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">Barkod</label>
                        <input type="text" id="newBarkod" class="w-full px-3 py-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">Ürün Adı</label>
                        <input type="text" id="newUrunAdi" class="w-full px-3 py-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">Alış Fiyatı</label>
                        <input type="number" step="0.01" id="newAlisFiyati" class="w-full px-3 py-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">Satış Fiyatı</label>
                        <input type="number" step="0.01" id="newSatisFiyati" class="w-full px-3 py-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">Stok Miktarı</label>
                        <input type="number" id="newStokMiktari" class="w-full px-3 py-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="block text-gray-700 text-sm font-bold mb-2">İndirim (%)</label>
                        <input type="number" step="0.01" id="newIndirim" class="w-full px-3 py-2 border rounded-lg" min="0" max="100" value="0">
                    </div>
                    <button type="submit" class="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600">
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
        setupEnterKeyNavigation('addProductForm');
        document.dispatchEvent(new Event('addProductPageShown'));
    }, 100);
}

// Get daily report
async function getDailyReport() {
    try {
        const report = await window.electronAPI.getDailyReport();
        const mainContent = document.querySelector('#mainApp .flex-1');
        
        mainContent.innerHTML = `
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
                            <p class="text-4xl font-bold text-blue-600">${report.toplamSatis}</p>
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
                    
                    <div class="border-t border-gray-200 pt-6">
                        <button onclick="showResetConfirmation()" 
                            class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-4 px-6 rounded-xl flex items-center justify-center transition duration-300 hover:shadow-lg">
                            <i class="fas fa-sync-alt mr-2"></i>
                            <span class="font-medium">Gün Sonu Al ve Sıfırla</span>
                        </button>
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
        
        const result = await window.electronAPI.resetDailyReport();
        hideResetConfirmation();
        
        if (result.success) {
            showNotification(result.message, 'success');
            
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
        if (product && newQuantity > product.stokMiktari) {
            showNotification(`Yetersiz stok! ${item.urunAdi} için sadece ${product.stokMiktari} adet stok mevcut.`, 'error');
            return;
        }
        
        // Update the item's discount in case it was changed in the product
        if (product && product.indirim !== undefined) {
            item.indirim = product.indirim;
        }
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
async function completeSale() {
    if (cart.length === 0) {
        showNotification('Sepet boş!', 'error');
        return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.toplamFiyat, 0);

    try {
        const saleId = await window.electronAPI.saveSale({
            kullaniciId: currentUser.id,
            toplamTutar: totalAmount,
            items: cart
        });

        if (saleId) {
            showNotification('Satış başarıyla tamamlandı!', 'success');
            cart = [];
            updateCartDisplay();
            
            // Refresh statistics after sale is completed
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
        
        const mainContent = document.querySelector('#mainApp .flex-1');
        
        mainContent.innerHTML = `
            <div class="w-full max-w-md mx-auto">
                <div class="bg-white p-4 rounded-lg shadow">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold">Ürün Düzenle</h2>
                        <button onclick="showProducts()" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">
                            Geri
                        </button>
                    </div>
                    <form id="editProductForm" class="space-y-4">
                        <input type="hidden" id="editProductId" value="${product.id}">
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Barkod</label>
                            <input type="text" id="editBarkod" class="w-full px-3 py-2 border rounded-lg" value="${product.barkod}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Ürün Adı</label>
                            <input type="text" id="editUrunAdi" class="w-full px-3 py-2 border rounded-lg" value="${product.urunAdi}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Alış Fiyatı</label>
                            <input type="number" step="0.01" id="editAlisFiyati" class="w-full px-3 py-2 border rounded-lg" value="${product.alisFiyati}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Satış Fiyatı</label>
                            <input type="number" step="0.01" id="editSatisFiyati" class="w-full px-3 py-2 border rounded-lg" value="${product.satisFiyati}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">Stok Miktarı</label>
                            <input type="number" id="editStokMiktari" class="w-full px-3 py-2 border rounded-lg" value="${product.stokMiktari}">
                        </div>
                        <div>
                            <label class="block text-gray-700 text-sm font-bold mb-2">İndirim (%)</label>
                            <input type="number" step="0.01" id="editIndirim" class="w-full px-3 py-2 border rounded-lg" value="${product.indirim || 0}" min="0" max="100">
                        </div>
                        <button type="submit" class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">
                            Kaydet
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        // Setup Enter key navigation for the edit form
        setTimeout(() => {
            setupEnterKeyNavigation('editProductForm');
            
            // Set up the form submit handler
            const editForm = document.getElementById('editProductForm');
            if (editForm) {
                editForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const updatedProduct = {
                        id: parseInt(document.getElementById('editProductId').value),
                        barkod: document.getElementById('editBarkod').value,
                        urunAdi: document.getElementById('editUrunAdi').value,
                        alisFiyati: parseFloat(document.getElementById('editAlisFiyati').value),
                        satisFiyati: parseFloat(document.getElementById('editSatisFiyati').value),
                        stokMiktari: parseInt(document.getElementById('editStokMiktari').value),
                        indirim: parseFloat(document.getElementById('editIndirim').value || 0)
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

// Function to delete a product
async function deleteProduct(id) {
    try {
        // Show confirmation dialog
        if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) {
            return;
        }
        
        await window.electronAPI.deleteProduct(id);
        showNotification('Ürün başarıyla silindi!', 'success');
        
        // Refresh product list
        showProducts();
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Ürün silinirken bir hata oluştu!', 'error');
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
            return;
        }
        
        try {
            console.log('Searching for product with barcode:', barcode);
            const product = await window.electronAPI.searchProduct(barcode);
            
            // Log product details for debugging
            if (product) {
                console.log('Ürün bulundu:', {
                    id: product.id,
                    barkod: product.barkod,
                    urunAdi: product.urunAdi,
                    satisFiyati: product.satisFiyati,
                    stokMiktari: product.stokMiktari,
                    indirim: product.indirim || 0
                });
            }
            
            if (product) {
                // Check if product stock is 0
                if (product.stokMiktari === 0) {
                    showNotification(`Ürün Adedi 0! ${product.urunAdi} için satış gerçekleşmedi.`, 'error');
                    barcodeInput.value = '';
                    barcodeInput.focus();
                    return;
                }
                
                // Check if the product is already in the cart
                const existingIndex = cart.findIndex(item => item.urunId === product.id);
                
                if (existingIndex !== -1) {
                    // Check if adding more would exceed stock
                    if (cart[existingIndex].miktar + 1 > product.stokMiktari) {
                        showNotification(`Yetersiz stok! ${product.urunAdi} için sadece ${product.stokMiktari} adet stok mevcut.`, 'error');
                        return;
                    }
                    
                    // Update discount information from product
                    if (product.indirim !== undefined) {
                        cart[existingIndex].indirim = product.indirim;
                    }
                    
                    // Increase quantity if already in cart
                    updateItemQuantity(existingIndex, cart[existingIndex].miktar + 1);
                    showNotification(`${product.urunAdi} sepete eklendi!`, 'success');
                } else {
                    // Add new product to cart with proper discount handling
                    const indirim = product.indirim || 0;
                    const discountFactor = 1 - (indirim / 100);
                    const discountedPrice = product.satisFiyati * discountFactor;
                    
                    cart.push({
                        urunId: product.id,
                        barkod: product.barkod,
                        urunAdi: product.urunAdi,
                        birimFiyat: product.satisFiyati,
                        miktar: 1,
                        indirim: indirim,
                        toplamFiyat: discountedPrice
                    });
                    showNotification(`${product.urunAdi} sepete eklendi!`, 'success');
                }
                
                // Update the cart display
                updateCartDisplay();
                
                // Clear the input field for next barcode
                barcodeInput.value = '';
                barcodeInput.focus();
            } else {
                showNotification('Ürün bulunamadı!', 'error');
            }
        } catch (error) {
            console.error('Search product error:', error);
            showNotification('Ürün aranırken bir hata oluştu!', 'error');
        }
    }
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
                        <h3 class="font-medium">${item.urunAdi}</h3>
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

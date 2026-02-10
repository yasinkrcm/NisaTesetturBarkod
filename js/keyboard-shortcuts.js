// Keyboard shortcuts handler
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only work when main app is visible (not on login screen)
        if (document.getElementById('mainApp').classList.contains('hidden')) {
            return;
        }

        // Check if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'F1':
                e.preventDefault();
                // Focus barcode input
                const barcodeInput = document.getElementById('barcodeInput');
                if (barcodeInput) {
                    barcodeInput.focus();
                    showNotification('Barkod tarama alanına odaklanıldı', 'info');
                }
                break;

            case 'F2':
                e.preventDefault();
                // Go to product list
                showProducts();
                showNotification('Ürün listesi açıldı (F2)', 'info');
                break;

            case 'F3':
                e.preventDefault();
                // Go to sales
                showSales();
                showNotification('Satışlar sayfası açıldı (F3)', 'info');
                break;

            case 'F4':
                e.preventDefault();
                // Add new product
                addProduct();
                showNotification('Yeni ürün ekleme sayfası açıldı (F4)', 'info');
                break;

            case 'F5':
                e.preventDefault();
                // Go to daily report
                getDailyReport();
                showNotification('Gün sonu raporu açıldı (F5)', 'info');
                break;

            case 'F6':
                e.preventDefault();
                // Go to barcode generator
                showBarcodeGenerator();
                showNotification('Barkod üretici açıldı (F6)', 'info');
                break;

            case 'F10':
                e.preventDefault();
                // Complete sale
                completeSale();
                showNotification('Satış tamamlanıyor... (F10)', 'info');
                break;

            case 'Escape':
                e.preventDefault();
                // Return to main menu
                showMainMenu();
                if (activeNotifications.length === 0) { // Don't spam notifications
                    showNotification('Ana menüye dönüldü (ESC)', 'info');
                }
                break;
        }
    });
}

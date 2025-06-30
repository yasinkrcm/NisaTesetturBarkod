const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('database.json');
const db = low(adapter);

// Set default data
db.defaults({
    kullanicilar: [],
    urunler: [],
    satislar: [],
    satisDetay: [],
    lastId: {
        kullanicilar: 0,
        urunler: 0,
        satislar: 0,
        satisDetay: 0
    }
}).write();

// Create default admin user if not exists
if (!db.get('kullanicilar').find({ kullaniciAdi: 'SametAslan' }).value()) {
    // Remove old admin user if exists
    db.get('kullanicilar')
        .remove({ kullaniciAdi: 'admin' })
        .write();
    
    // Add new admin user
    db.get('kullanicilar')
        .push({
            id: db.get('lastId.kullanicilar').value() + 1,
            kullaniciAdi: 'SametAslan',
            sifre: '445944',
            yetkiSeviyesi: 1
        })
        .write();
    db.update('lastId.kullanicilar', n => n + 1).write();
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers
ipcMain.handle('login', (event, data) => {
    const user = db.get('kullanicilar')
        .find({ kullaniciAdi: data.username, sifre: data.password })
        .value();
    return user ? {
        id: user.id,
        kullaniciAdi: user.kullaniciAdi,
        yetkiSeviyesi: user.yetkiSeviyesi
    } : null;
});

ipcMain.handle('getProducts', () => {
    return db.get('urunler').value();
});

ipcMain.handle('searchProduct', (event, barcode) => {
    try {
        console.log(`Main process searching for barcode: ${barcode}`);
        // Convert barcode to string to ensure consistent comparison
        const barcodeStr = String(barcode).trim();
        
        // Find product where barcodes match, converting both to strings for comparison
        const product = db.get('urunler')
            .find(item => String(item.barkod).trim() === barcodeStr)
            .value();
            
        console.log('Product found in database:', product);
        return product;
    } catch (error) {
        console.error('Error searching for product:', error);
        throw error;
    }
});

ipcMain.handle('saveSale', (event, data) => {
    const saleId = db.get('lastId.satislar').value() + 1;
    
    // Insert sale
    db.get('satislar')
        .push({
            id: saleId,
            tarih: new Date().toISOString(),
            kullaniciId: data.kullaniciId,
            musteriId: data.musteriId,
            toplamTutar: data.toplamTutar
        })
        .write();
    db.update('lastId.satislar', n => n + 1).write();

    // Insert sale details and update stock
    data.items.forEach(item => {
        const detailId = db.get('lastId.satisDetay').value() + 1;
        db.get('satisDetay')
            .push({
                id: detailId,
                satisId: saleId,
                urunId: item.urunId,
                miktar: item.miktar,
                birimFiyat: item.birimFiyat,
                toplamFiyat: item.toplamFiyat
            })
            .write();
        db.update('lastId.satisDetay', n => n + 1).write();

        // Update stock
        db.get('urunler')
            .find({ id: item.urunId })
            .update('stokMiktari', n => n - item.miktar)
            .write();
    });

    return saleId;
});

ipcMain.handle('getSales', (event, userId) => {
    const sales = db.get('satislar')
        .filter({ kullaniciId: userId })
        .value();

    return sales.map(sale => {
        const details = db.get('satisDetay')
            .filter({ satisId: sale.id })
            .value();

        const products = details.map(detail => {
            const product = db.get('urunler')
                .find({ id: detail.urunId })
                .value();
            return `${product.urunAdi} (${detail.miktar})`;
        });

        return {
            ...sale,
            urunSayisi: details.length,
            urunler: products.join(', ')
        };
    });
});

ipcMain.handle('addProduct', (event, product) => {
    const id = db.get('lastId.urunler').value() + 1;
    db.get('urunler')
        .push({
            id,
            ...product
        })
        .write();
    db.update('lastId.urunler', n => n + 1).write();
    return id;
});

ipcMain.handle('updateProduct', (event, product) => {
    try {
        db.get('urunler')
            .find({ id: product.id })
            .assign({
                barkod: product.barkod,
                urunAdi: product.urunAdi,
                alisFiyati: product.alisFiyati,
                satisFiyati: product.satisFiyati,
                stokMiktari: product.stokMiktari
            })
            .write();
        return true;
    } catch (error) {
        console.error('Update product error:', error);
        return false;
    }
});

ipcMain.handle('getProduct', (event, id) => {
    try {
        return db.get('urunler').find({ id: id }).value();
    } catch (error) {
        console.error('Get product error:', error);
        return null;
    }
});

// Get daily report stats
ipcMain.handle('getDailyReport', () => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's sales that haven't been counted in a daily report
        const todaySales = db.get('satislar')
            .filter(sale => sale.tarih.startsWith(today) && !sale.dailyReportCounted)
            .value();
            
        // Get IDs of today's sales
        const saleIds = todaySales.map(sale => sale.id);
        
        // Calculate totals
        const toplamSatis = todaySales.length; // Total sales count
        const toplamCiro = todaySales.reduce((sum, sale) => sum + sale.toplamTutar, 0); // Total revenue
        
        // Get details of today's sales for calculating profit
        const saleDetails = db.get('satisDetay')
            .filter(detail => saleIds.includes(detail.satisId))
            .value();
            
        // Calculate total profit
        let toplamKar = 0;
        
        saleDetails.forEach(detail => {
            const product = db.get('urunler')
                .find({ id: detail.urunId })
                .value();
                
            if (product) {
                const kar = (product.satisFiyati - product.alisFiyati) * detail.miktar;
                toplamKar += kar;
            }
        });
        
        return { toplamSatis, toplamCiro, toplamKar };
    } catch (error) {
        console.error('Error getting daily report:', error);
        return { toplamSatis: 0, toplamCiro: 0, toplamKar: 0 };
    }
});

// Get quick statistics for dashboard - Uses the same logic as getDailyReport for consistency
ipcMain.handle('getStatistics', () => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's sales that haven't been counted in a daily report
        const todaySales = db.get('satislar')
            .filter(sale => sale.tarih.startsWith(today) && !sale.dailyReportCounted)
            .value();
            
        // Get IDs of today's sales
        const saleIds = todaySales.map(sale => sale.id);
        
        // Calculate totals
        const toplamSatis = todaySales.length; // Total sales count
        const toplamCiro = todaySales.reduce((sum, sale) => sum + sale.toplamTutar, 0); // Total revenue
        
        // Get details of today's sales for calculating profit
        const saleDetails = db.get('satisDetay')
            .filter(detail => saleIds.includes(detail.satisId))
            .value();
            
        // Calculate total profit
        let toplamKar = 0;
        
        saleDetails.forEach(detail => {
            const product = db.get('urunler')
                .find({ id: detail.urunId })
                .value();
                
            if (product) {
                const kar = (product.satisFiyati - product.alisFiyati) * detail.miktar;
                toplamKar += kar;
            }
        });
        
        return { 
            toplamSatis, 
            toplamCiro: toplamCiro.toFixed(2),
            toplamKar: toplamKar.toFixed(2)
        };
    } catch (error) {
        console.error('Error getting statistics:', error);
        return { toplamSatis: 0, toplamCiro: "0.00", toplamKar: "0.00" };
    }
});

ipcMain.handle('resetDailyReport', () => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Mark today's sales as counted in the daily report by adding a field
        // This way they stay in the permanent sales log but aren't counted in daily reports
        db.get('satislar')
            .filter(sale => sale.tarih.startsWith(today))
            .forEach(sale => {
                sale.dailyReportCounted = true;
            })
            .write();
            
        return { success: true, message: "Günlük satışlar sıfırlandı!" };
    } catch (error) {
        console.error('Error resetting daily report:', error);
        return { success: false, message: "Günlük satışlar sıfırlanırken bir hata oluştu!" };
    }
});

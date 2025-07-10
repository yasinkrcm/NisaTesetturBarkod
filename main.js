const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');

const adapter = new FileSync('database.json');
const db = low(adapter);

// Uygulama başlarken database.json dosyasının otomatik yedeğini al
const dbPath = path.join(__dirname, 'database.json');
const backupPath = path.join(__dirname, 'database_backup.json');

if (fs.existsSync(dbPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
}

// Otomatik kurtarma: database.json sıfırlandıysa veya bozulduysa yedekten geri yükle
if (fs.existsSync(backupPath) && fs.existsSync(dbPath)) {
    try {
        const dbContent = fs.readFileSync(dbPath, 'utf-8');
        const parsed = JSON.parse(dbContent);
        // Eğer ürünler, satışlar ve detaylar boşsa, sıfırlanmış demektir
        if (
            Array.isArray(parsed.urunler) && parsed.urunler.length === 0 &&
            Array.isArray(parsed.satislar) && parsed.satislar.length === 0 &&
            Array.isArray(parsed.satisDetay) && parsed.satisDetay.length === 0 &&
            parsed.kullanicilar && parsed.kullanicilar.length === 1 &&
            parsed.kullanicilar[0].kullaniciAdi === 'SametAslan'
        ) {
            fs.copyFileSync(backupPath, dbPath);
            console.log('database.json sıfırlandığı için yedekten geri yüklendi.');
        }
    } catch (e) {
        // Dosya bozuksa da yedekten geri yükle
        fs.copyFileSync(backupPath, dbPath);
        console.log('database.json bozuk olduğu için yedekten geri yüklendi.');
    }
}

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
                stokMiktari: product.stokMiktari,
                indirim: product.indirim || 0
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

// Delete product function
ipcMain.handle('deleteProduct', (event, id) => {
    try {
        // Check if product exists
        const product = db.get('urunler').find({ id: id }).value();
        if (!product) {
            return { success: false, message: "Ürün bulunamadı!" };
        }
        
        // Check if product is used in any sales
        const saleDetails = db.get('satisDetay').filter({ urunId: id }).value();
        if (saleDetails.length > 0) {
            return { success: false, message: "Bu ürün satışlarda kullanıldığı için silinemez!" };
        }
        
        // Delete the product
        db.get('urunler').remove({ id: id }).write();
        return { success: true, message: "Ürün başarıyla silindi!" };
    } catch (error) {
        console.error('Delete product error:', error);
        return { success: false, message: "Ürün silinirken bir hata oluştu!" };
    }
});

// Delete sale function
ipcMain.handle('deleteSale', (event, saleId) => {
    try {
        // Check if sale exists
        const sale = db.get('satislar').find({ id: saleId }).value();
        if (!sale) {
            return { success: false, message: "Satış bulunamadı!" };
        }
        
        // Get sale details to restore stock
        const saleDetails = db.get('satisDetay').filter({ satisId: saleId }).value();
        
        // Restore stock for each product in the sale
        saleDetails.forEach(detail => {
            db.get('urunler')
                .find({ id: detail.urunId })
                .update('stokMiktari', n => n + detail.miktar)
                .write();
        });
        
        // Delete sale details first (foreign key constraint)
        db.get('satisDetay').remove({ satisId: saleId }).write();
        
        // Delete the sale
        db.get('satislar').remove({ id: saleId }).write();
        
        return { success: true, message: "Satış başarıyla silindi ve stoklar geri yüklendi!" };
    } catch (error) {
        console.error('Delete sale error:', error);
        return { success: false, message: "Satış silinirken bir hata oluştu!" };
    }
});

// Print sale receipt
ipcMain.handle('printSaleReceipt', (event, saleData) => {
    try {
        const { BrowserWindow } = require('electron');
        
        // Create a hidden window for printing
        const printWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        
        // Create HTML content for the receipt
        const receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Satış Fişi</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 30px;
                    margin: 0;
                    padding: 50px;
                    width: 750px;
                }
                .header {
                    text-align: center;
                    border-bottom: 1px solid #000;
                    padding-bottom: 10px;
                    margin-bottom: 10px;
                }
                .title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .date {
                    font-size: 10px;
                }
                .items {
                    margin: 10px 0;
                }
                .item {
                    display: flex;
                    justify-content: space-between;
                    margin: 2px 0;
                }
                .item-name {
                    flex: 1;
                }
                .item-price {
                    text-align: right;
                }
                .total {
                    border-top: 1px solid #000;
                    padding-top: 10px;
                    margin-top: 10px;
                    font-weight: bold;
                    text-align: right;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">NİSA TESETTÜR</div>
                <div class="date">${new Date().toLocaleString('tr-TR')}</div>
                <div>Satış No: ${saleData.saleId}</div>
            </div>
            
            <div class="items">
                ${saleData.items.map(item => `
                    <div class="item">
                        <span class="item-name">${item.urunAdi} x${item.miktar}</span>
                        <span class="item-price">${item.toplamFiyat.toFixed(2)} TL</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="total">
                Toplam: ${saleData.totalAmount.toFixed(2)} TL
            </div>
            
            <div class="footer">
                Bizi tercih ettiğiniz için teşekkürler!
            </div>
        </body>
        </html>
        `;
        
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);
        
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                if (success) {
                    console.log('Print successful');
                } else {
                    console.log('Print failed:', reason);
                }
                printWindow.close();
            });
        });
        
        return { success: true };
    } catch (error) {
        console.error('Print error:', error);
        return { success: false, message: "Yazdırma sırasında bir hata oluştu!" };
    }
});

// Print end of day report
ipcMain.handle('printEndOfDayReport', (event, reportData) => {
    try {
        const { BrowserWindow } = require('electron');
        
        // Create a hidden window for printing
        const printWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        
        // Create HTML content for the end of day report
        const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Gün Sonu Raporu</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    margin: 0;
                    padding: 20px;
                    width: 400px;
                }
                .header {
                    text-align: center;
                    border-bottom: 2px solid #000;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .title {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .date {
                    font-size: 12px;
                }
                .stats {
                    margin: 20px 0;
                }
                .stat-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px 0;
                    border-bottom: 1px solid #ccc;
                }
                .stat-label {
                    font-weight: bold;
                }
                .stat-value {
                    text-align: right;
                }
                .total-row {
                    border-top: 2px solid #000;
                    border-bottom: 2px solid #000;
                    font-weight: bold;
                    font-size: 14px;
                    padding: 10px 0;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    font-size: 10px;
                    border-top: 1px solid #000;
                    padding-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">NİSA TESETTÜR</div>
                <div class="date">GÜN SONU RAPORU</div>
                <div class="date">${new Date().toLocaleDateString('tr-TR')}</div>
            </div>
            
            <div class="stats">
                <div class="stat-row">
                    <span class="stat-label">Toplam Satış Sayısı:</span>
                    <span class="stat-value">${typeof reportData.toplamSatis === 'number' ? reportData.toplamSatis : (Number(reportData.toplamSatis) || 0)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Toplam Ciro:</span>
                    <span class="stat-value">${typeof reportData.toplamCiro === 'number' ? reportData.toplamCiro.toFixed(2) : (Number(reportData.toplamCiro) || 0).toFixed(2)} TL</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Toplam Kar:</span>
                    <span class="stat-value">${typeof reportData.toplamKar === 'number' ? reportData.toplamKar.toFixed(2) : (Number(reportData.toplamKar) || 0).toFixed(2)} TL</span>
                </div>
            </div>
            
            <div class="footer">
                Rapor ${new Date().toLocaleString('tr-TR')} tarihinde oluşturulmuştur.
            </div>
        </body>
        </html>
        `;
        
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHTML)}`);
        
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                if (success) {
                    console.log('End of day report print successful');
                } else {
                    console.log('End of day report print failed:', reason);
                }
                printWindow.close();
            });
        });
        
        return { success: true };
    } catch (error) {
        console.error('Print end of day report error:', error);
        return { success: false, message: "Gün sonu raporu yazdırılırken bir hata oluştu!" };
    }
});

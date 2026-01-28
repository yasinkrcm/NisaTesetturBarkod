const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');

// Donanım kaynaklarını optimize et
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-2d-canvas-clip-aa');
app.commandLine.appendSwitch('proxy-server', 'direct://');
app.commandLine.appendSwitch('proxy-bypass-list', '*');

// Tekil örnek kilidi (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();
let mainWindow = null;

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Kullanıcı ikinci bir kopya açmaya çalışırsa ana pencereyi odakla
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

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

// Migration: Convert old product format to new multi-size format
function migrateProductsToNewFormat() {
    const products = db.get('urunler').value();
    let needsMigration = false;

    products.forEach(product => {
        if (!product.bedenler || !Array.isArray(product.bedenler)) {
            needsMigration = true;
            const bedenler = [{
                beden: product.beden || '',
                barkod: product.barkod || '',
                miktar: product.stokMiktari || 0
            }];

            db.get('urunler')
                .find({ id: product.id })
                .assign({
                    bedenler: bedenler
                })
                .write();
        }
    });

    if (needsMigration) {
        console.log('Products migrated to new multi-size format');
    }
}

migrateProductsToNewFormat();

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
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development
    // win.webContents.openDevTools();
}

app.on('ready', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

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
        const barcodeStr = String(barcode).trim();

        // Check if products have bedenler array (new format)
        const products = db.get('urunler').value();
        let foundProduct = null;
        let foundBeden = null;

        for (const product of products) {
            // New format with bedenler array
            if (product.bedenler && Array.isArray(product.bedenler)) {
                const beden = product.bedenler.find(b => String(b.barkod).trim() === barcodeStr);
                if (beden) {
                    foundProduct = product;
                    foundBeden = beden;
                    break;
                }
            } else {
                // Old format with single barkod
                if (String(product.barkod).trim() === barcodeStr) {
                    foundProduct = product;
                    foundBeden = { beden: product.beden || '', barkod: product.barkod, miktar: product.stokMiktari };
                    break;
                }
            }
        }

        if (foundProduct && foundBeden) {
            return {
                ...foundProduct,
                selectedBeden: foundBeden.beden,
                selectedBarkod: foundBeden.barkod,
                selectedMiktar: foundBeden.miktar
            };
        }

        console.log('Product not found in database');
        return null;
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
                beden: item.beden || '',
                miktar: item.miktar,
                birimFiyat: item.birimFiyat,
                toplamFiyat: item.toplamFiyat
            })
            .write();
        db.update('lastId.satisDetay', n => n + 1).write();

        // Update stock based on format
        const product = db.get('urunler').find({ id: item.urunId }).value();

        if (product.bedenler && Array.isArray(product.bedenler)) {
            // New format: update specific beden's miktar
            const bedenIndex = product.bedenler.findIndex(b => b.beden === item.beden);
            if (bedenIndex !== -1) {
                db.get('urunler')
                    .find({ id: item.urunId })
                    .get(`bedenler[${bedenIndex}].miktar`)
                    .update(n => n - item.miktar)
                    .write();
            }
        }

        // Top-level stock is ALWAYS the sum of all sizes (or the single stock for old format)
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
            const bedenInfo = detail.beden ? ` (${detail.beden})` : '';
            return `${product.urunAdi}${bedenInfo} (${detail.miktar})`;
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

    // Calculate total stock from bedenler if available
    let stokMiktari = product.stokMiktari || 0;
    if (product.bedenler && Array.isArray(product.bedenler)) {
        stokMiktari = product.bedenler.reduce((sum, b) => sum + (parseInt(b.miktar) || 0), 0);
    }

    // New format with bedenler array
    const newProduct = {
        id,
        urunAdi: product.urunAdi,
        barkod: product.barkod || '',
        kategori: product.kategori,
        alisFiyati: product.alisFiyati,
        satisFiyati: product.satisFiyati,
        stokMiktari: stokMiktari,
        indirim: product.indirim || 0,
        bedenler: product.bedenler || []
    };

    db.get('urunler')
        .push(newProduct)
        .write();
    db.update('lastId.urunler', n => n + 1).write();
    return id;
});

ipcMain.handle('updateProduct', (event, product) => {
    try {
        const existingProduct = db.get('urunler').find({ id: product.id }).value();
        if (!existingProduct) return false;

        // Calculate total stock from bedenler if available
        let stokMiktari = product.stokMiktari || 0;
        if (product.bedenler && Array.isArray(product.bedenler)) {
            stokMiktari = product.bedenler.reduce((sum, b) => sum + (parseInt(b.miktar) || 0), 0);
        }

        db.get('urunler')
            .find({ id: product.id })
            .assign({
                urunAdi: product.urunAdi,
                barkod: product.barkod || '',
                kategori: product.kategori,
                alisFiyati: product.alisFiyati,
                satisFiyati: product.satisFiyati,
                stokMiktari: stokMiktari,
                indirim: product.indirim || 0,
                bedenler: product.bedenler || []
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
        const product = db.get('urunler').find({ id: id }).value();

        // Convert old format to new format for frontend compatibility
        if (product && !product.bedenler) {
            return {
                ...product,
                bedenler: [{
                    beden: product.beden || '',
                    barkod: product.barkod || '',
                    miktar: product.stokMiktari
                }]
            };
        }

        return product;
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
        const toplamSatis = todaySales.length;
        const toplamCiro = todaySales.reduce((sum, sale) => sum + sale.toplamTutar, 0);

        // Get details of today's sales for calculating profit and product list
        const saleDetails = db.get('satisDetay')
            .filter(detail => saleIds.includes(detail.satisId))
            .value();

        // Calculate total profit and aggregate sold products
        let toplamKar = 0;
        const satilanUrunler = [];

        saleDetails.forEach(detail => {
            const product = db.get('urunler')
                .find({ id: detail.urunId })
                .value();

            if (product) {
                const kar = (product.satisFiyati - product.alisFiyati) * detail.miktar;
                toplamKar += kar;

                // Aggregate for the report
                const existing = satilanUrunler.find(p => p.urunId === detail.urunId && p.beden === detail.beden);
                if (existing) {
                    existing.miktar += detail.miktar;
                } else {
                    // Get correct barcode for this size
                    let barkod = product.barkod;
                    if (product.bedenler && Array.isArray(product.bedenler)) {
                        const sizeInfo = product.bedenler.find(b => b.beden === detail.beden);
                        if (sizeInfo) barkod = sizeInfo.barkod;
                    }

                    satilanUrunler.push({
                        urunId: detail.urunId,
                        urunAdi: product.urunAdi,
                        beden: detail.beden || '-',
                        barkod: barkod || product.barkod || '-',
                        miktar: detail.miktar,
                        satisFiyati: product.satisFiyati
                    });
                }
            }
        });

        return { toplamSatis, toplamCiro, toplamKar, satilanUrunler };
    } catch (error) {
        console.error('Error getting daily report:', error);
        return { toplamSatis: 0, toplamCiro: 0, toplamKar: 0, satilanUrunler: [] };
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
            const product = db.get('urunler').find({ id: detail.urunId }).value();

            if (product.bedenler && Array.isArray(product.bedenler)) {
                // New format: restore specific beden's miktar
                const bedenIndex = product.bedenler.findIndex(b => b.beden === detail.beden);
                if (bedenIndex !== -1) {
                    db.get('urunler')
                        .find({ id: detail.urunId })
                        .get(`bedenler[${bedenIndex}].miktar`)
                        .update(n => n + detail.miktar)
                        .write();
                }
            }

            // Top-level stock is ALWAYS the sum of all sizes
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
            width: 300,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        // Create HTML content for the receipt (sade, küçük, termal yazıcıya uygun)
        const receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Satış Fişi</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    margin: 0;
                    padding: 0;
                    width: 220px;
                }
                .center { text-align: center; }
                .line { border-top: 1px dashed #000; margin: 4px 0; }
                .item { display: flex; justify-content: space-between; }
            </style>
        </head>
        <body>
            <div class="center">NİSA TESETTÜR</div>
            <div class="center">SATIŞ FİŞİ</div>
            <div class="center">${new Date().toLocaleString('tr-TR')}</div>
            <div class="center">Satış No: ${saleData.saleId}</div>
            <div class="line"></div>
            ${saleData.items.map(item => `
                <div class="item">
                    <span>${item.urunAdi}${item.beden ? ` (${item.beden})` : ''} x${item.miktar}</span>
                    <span>${item.toplamFiyat.toFixed(2)} TL</span>
                </div>
            `).join('')}
            <div class="line"></div>
            <div class="item">
                <span><b>Toplam:</b></span>
                <span><b>${saleData.totalAmount.toFixed(2)} TL</b></span>
            </div>
            <div class="center">Teşekkürler!</div>
        </body>
        </html>
        `;
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                printWindow.destroy();
            });

            // Güvenlik önlemi: 30 saniye sonra hala kapanmadıysa zorla kapat
            setTimeout(() => {
                if (!printWindow.isDestroyed()) printWindow.destroy();
            }, 30000);
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: "Yazdırma sırasında bir hata oluştu!" };
    }
});

// Print end of day report
ipcMain.handle('printEndOfDayReport', (event, reportData) => {
    try {
        const { BrowserWindow } = require('electron');
        // Create a hidden window for printing
        const printWindow = new BrowserWindow({
            width: 300,
            height: 400,
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        // Tarih formatı: gün.ay.yıl
        const today = new Date();
        const formattedDate = today.toLocaleDateString('tr-TR');
        // Create HTML content for the end of day report (fotoğraftaki gibi)
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
                    padding: 0;
                    width: 220px;
                }
                .center { text-align: center; }
                .line { border-top: 1px solid #000; margin: 8px 0; }
                .row { margin: 10px 0 10px 0; }
                .label { display: inline-block; min-width: 120px; }
            </style>
        </head>
        <body>
            <div class="center"><b>NİSA TESETTÜR</b></div>
            <div class="center">GÜN SONU RAPORU</div>
            <div class="center">${formattedDate}</div>
            <div class="line"></div>
            <div class="row"><span class="label">Toplam Satış Sayısı:</span> <span>${reportData.toplamSatis}</span></div>
            <div class="row"><span class="label">Toplam Ciro:</span> <span>${Number(reportData.toplamCiro).toFixed(2)} TL</span></div>
            <div class="row"><span class="label">Toplam Kar:</span> <span>${Number(reportData.toplamKar).toFixed(2)} TL</span></div>
            <div class="line"></div>
            <div class="center"><b>SATILAN ÜRÜNLER</b></div>
            <div class="line"></div>
            ${reportData.satilanUrunler && reportData.satilanUrunler.length > 0 ? reportData.satilanUrunler.map(item => `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <b>${item.urunAdi}</b>
                        <b>${(item.satisFiyati * item.miktar).toFixed(2)} TL</b>
                    </div>
                    <div style="font-size: 10px; display: flex; justify-content: space-between;">
                        <span>Beden: ${item.beden}</span>
                        <span>Adet: ${item.miktar} x ${item.satisFiyati.toFixed(2)} TL</span>
                    </div>
                    <div style="font-size: 10px;">Barkod: ${item.barkod}</div>
                </div>
            `).join('') : '<div class="center">Satış yok</div>'}
            <div class="line"></div>
        </body>
        </html>
        `;
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHTML)}`);
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                printWindow.destroy();
            });
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: "Gün sonu raporu yazdırılırken bir hata oluştu!" };
    }
});

// Ürün etiketi yazdırma fonksiyonu (sadece ürün adı, küçük ve sade)
ipcMain.handle('printProductLabel', (event, labelData) => {
    try {
        const { BrowserWindow } = require('electron');
        const printWindow = new BrowserWindow({
            width: 220,
            height: 120,
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        // labelData: { urunAdi: '2li yastık kılıfı' }
        const labelHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ürün Etiketi</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    margin: 0;
                    padding: 0;
                    width: 220px;
                }
                .label-text {
                    margin-top: 30px;
                    margin-bottom: 30px;
                    padding-left: 8px;
                    letter-spacing: 1px;
                }
            </style>
        </head>
        <body>
            <div class="label-text">${labelData.urunAdi}</div>
        </body>
        </html>
        `;
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(labelHTML)}`);
        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                printWindow.destroy();
            });
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: "Etiket yazdırılırken bir hata oluştu!" };
    }
});

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

// ============================================================
// GÜNLÜK YEDEKLEME SİSTEMİ
// ============================================================

const dbPath = path.join(__dirname, 'database.json');
const backupsDir = path.join(__dirname, 'backups');
const backupPath = path.join(__dirname, 'database_backup.json');

// Backups klasörünü oluştur
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    console.log('backups/ klasörü oluşturuldu.');
}

// Tarihi formatla (YYYY-MM-DD)
function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Günlük yedek al
function createDailyBackup() {
    try {
        const today = getFormattedDate();
        const dailyBackupPath = path.join(backupsDir, `database_${today}.json`);

        // Eğer bugün için yedek yoksa oluştur
        if (!fs.existsSync(dailyBackupPath)) {
            fs.copyFileSync(dbPath, dailyBackupPath);
            console.log(`Günlük yedek alındı: database_${today}.json`);
        }

        // Eski yedekleri temizle (7 günden eski olanları sil)
        cleanOldBackups(7);
    } catch (error) {
        console.error('Yedek alma hatası:', error);
    }
}

// Eski yedekleri temizle (gün sayısı)
function cleanOldBackups(daysToKeep) {
    try {
        const files = fs.readdirSync(backupsDir);
        const now = new Date();

        files.forEach(file => {
            if (file.startsWith('database_') && file.endsWith('.json')) {
                const filePath = path.join(backupsDir, file);
                const stats = fs.statSync(filePath);
                const fileAge = now - stats.mtime;
                const daysOld = fileAge / (1000 * 60 * 60 * 24);

                if (daysOld > daysToKeep) {
                    fs.unlinkSync(filePath);
                    console.log(`${file} (${Math.floor(daysOld)} gün) silindi.`);
                }
            }
        });
    } catch (error) {
        console.error('Yedek temizleme hatası:', error);
    }
}

// Uygulama başladığında yedek al
createDailyBackup();

// Her gün gece yarısı yedek al (24 saatte bir)
setInterval(() => {
    createDailyBackup();
}, 24 * 60 * 60 * 1000); // 24 saat

// ============================================================
// ESKİ YEDEKLEME SİSTEMİ (GERİYE UYUMLULUK)
// ============================================================

// ============================================================
// ESKİ YEDEKLEME SİSTEMİ KALDIRILDI
// ============================================================
// Eski 'database_backup.json' dosyası boş olduğu için veri kaybına
// ve veritabanı sıfırlanmasına neden oluyordu. Bu tehlikeli mantık
// devre dışı bırakıldı. Artık sadece 'backups/' klasöründeki
// tarihli ve güvenli yedekler kullanılacak.


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

// Auto-repair stock consistency: recalculate stokMiktari from bedenler
function repairStockConsistency() {
    const products = db.get('urunler').value();
    let repairsCount = 0;

    products.forEach(product => {
        if (product.bedenler && Array.isArray(product.bedenler) && product.bedenler.length > 0) {
            const calculatedTotal = product.bedenler.reduce((sum, b) => sum + (parseInt(b.miktar) || 0), 0);

            // If total doesn't match sum, fix it
            if (product.stokMiktari !== calculatedTotal) {
                console.log(`Fixing stock mismatch for ${product.urunAdi} (ID: ${product.id}): DB=${product.stokMiktari}, Real=${calculatedTotal}`);
                db.get('urunler')
                    .find({ id: product.id })
                    .assign({ stokMiktari: calculatedTotal })
                    .write();
                repairsCount++;
            }
        }
    });

    if (repairsCount > 0) {
        console.log(`Repaired stock consistency for ${repairsCount} products.`);
    }
}

repairStockConsistency();

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
        // console.log(`Main process searching for barcode: ${barcode}`); // Removed to reduce noise
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
    // 1. Pre-validation loop
    for (const item of data.items) {
        const product = db.get('urunler').find({ id: item.urunId }).value();

        if (!product) {
            throw new Error(`Ürün bulunamadı: ${item.urunAdi}`);
        }

        let availableStock = 0;

        // Check if product has variants (bedenler)
        if (product.bedenler && Array.isArray(product.bedenler) && product.bedenler.length > 0) {
            // It's a varianted product
            if (!item.beden) {
                // Try to find if there's only one size, otherwise error
                if (product.bedenler.length === 1) {
                    availableStock = product.bedenler[0].miktar;
                } else {
                    throw new Error(`Beden seçimi gerekli: ${product.urunAdi}`);
                }
            } else {
                // Find specific size+color combination
                const variant = product.bedenler.find(b =>
                    String(b.beden).trim() === String(item.beden).trim() &&
                    (!item.renk || String(b.renk || '').trim() === String(item.renk).trim())
                );

                if (!variant) {
                    const displayText = item.renk ? `${item.beden} / ${item.renk}` : item.beden;
                    throw new Error(`Beden/Renk kombinasyonu bulunamadı: ${product.urunAdi} - ${displayText}`);
                }
                availableStock = variant.miktar;
            }
        } else {
            // Standard product (no variants)
            availableStock = product.stokMiktari;
        }

        if (availableStock < item.miktar) {
            throw new Error(`Yetersiz stok! ${product.urunAdi} (${item.beden || 'Standart'}) için sadece ${availableStock} adet kaldı.`);
        }
    }

    // 2. Execution loop
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
                renk: item.renk || '',
                miktar: item.miktar,
                birimFiyat: item.birimFiyat,
                toplamFiyat: item.toplamFiyat
            })
            .write();
        db.update('lastId.satisDetay', n => n + 1).write();

        // Update stock fully consistent
        const product = db.get('urunler').find({ id: item.urunId }).value();

        if (product.bedenler && Array.isArray(product.bedenler) && product.bedenler.length > 0) {
            // Find index with robust matching (beden + renk combination)
            const bedenIndex = product.bedenler.findIndex(b =>
                String(b.beden).trim() === String(item.beden).trim() &&
                (!item.renk || String(b.renk || '').trim() === String(item.renk).trim())
            );

            if (bedenIndex !== -1) {
                // Get fresh copy of product to modify
                const freshProduct = db.get('urunler').find({ id: item.urunId }).value();
                const currentMiktar = parseInt(freshProduct.bedenler[bedenIndex].miktar) || 0;
                const saleMiktar = parseInt(item.miktar) || 0;

                const oldStock = currentMiktar;
                const newStock = currentMiktar - saleMiktar;

                // Update the array in memory
                freshProduct.bedenler[bedenIndex].miktar = newStock;

                // Recalculate total stock from SUM of variants
                const totalStock = freshProduct.bedenler.reduce((sum, b) => sum + (parseInt(b.miktar) || 0), 0);
                freshProduct.stokMiktari = totalStock;

                // Persist the changes
                db.get('urunler')
                    .find({ id: item.urunId })
                    .assign({
                        bedenler: freshProduct.bedenler,
                        stokMiktari: totalStock
                    })
                    .write();

                console.log(`SOLD: ${freshProduct.urunAdi} (${freshProduct.bedenler[bedenIndex].beden}) | Qty: ${saleMiktar} | Old Stock: ${oldStock} | New Stock: ${newStock} | Total Stock: ${totalStock}`);

            } else {
                console.error(`CRITICAL: Beden not found during write for ${product.urunAdi} - ${item.beden}`);
            }
        } else {
            const freshProduct = db.get('urunler').find({ id: item.urunId }).value();
            const currentMiktar = parseInt(freshProduct.stokMiktari) || 0;
            const saleMiktar = parseInt(item.miktar) || 0;

            const oldStock = currentMiktar;
            const newStock = currentMiktar - saleMiktar;

            db.get('urunler')
                .find({ id: item.urunId })
                .assign({ stokMiktari: newStock })
                .write();

            console.log(`SOLD: ${freshProduct.urunAdi} (Standart) | Qty: ${saleMiktar} | Old Stock: ${oldStock} | New Stock: ${newStock}`);
        }
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
            const renkInfo = detail.renk ? ` / ${detail.renk}` : '';
            return `${product.urunAdi}${bedenInfo}${renkInfo} (${detail.miktar})`;
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
                // New format: restore specific beden+renk combination's miktar
                const bedenIndex = product.bedenler.findIndex(b =>
                    b.beden === detail.beden &&
                    (!detail.renk || (b.renk || '') === detail.renk)
                );
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

// Helper function to print to specific printer or fallback
async function printToDevice(printWindow, deviceName) {
    let printer = null;
    try {
        const printers = await printWindow.webContents.getPrintersAsync();
        printer = printers.find(p => p.name.includes(deviceName));
    } catch (e) {
        console.error("Error getting printers:", e);
    }

    if (!printer) {
        console.log(`Printer matching "${deviceName}" not found. Opening print dialog...`);
        return new Promise((resolve, reject) => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                if (success) resolve();
                else reject(reason);
            });
        });
    }

    console.log(`Found printer: ${printer.name}`);
    return new Promise((resolve, reject) => {
        printWindow.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: printer.name
        }, (success, reason) => {
            if (!success) {
                console.log(`Silent print failed on ${printer.name}, retrying with dialog...`);
                printWindow.webContents.print({ silent: false, printBackground: true }, (retrySuccess, retryReason) => {
                    if (retrySuccess) resolve();
                    else reject(retryReason);
                });
            } else {
                resolve();
            }
        });
    });
}

// Print receipt
ipcMain.handle('printSaleReceipt', async (event, saleData) => {
    try {
        const { BrowserWindow } = require('electron');
        const printWindow = new BrowserWindow({
            width: 300,
            height: 400,
            show: false,
            webPreferences: { nodeIntegration: true }
        });

        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR');
        const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const receivedAmount = saleData.receivedAmount || saleData.totalAmount;
        const changeAmount = saleData.changeAmount || 0;

        // "Kasiyer" bilgisi varsa kullan, yoksa boş veya varsayılan
        // saleData içinde kasiyer adı gelmiyor olabilir, şimdilik statik veya boş bırakalım.
        // Eğer renderer'dan gönderilirse buraya eklenmeli.
        const kasiyer = "KASA";

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
                    font-weight: bold;
                }
                .center { text-align: center; }
                .right { text-align: right; }
                .left { text-align: left; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .row { display: flex; justify-content: space-between; }
                .bold { font-weight: bold; }
                .mb-1 { margin-bottom: 2px; }
                .mt-2 { margin-top: 10px; }
                .header { font-size: 14px; margin-bottom: 5px; }
                .address { font-size: 10px; margin-bottom: 5px; text-transform: uppercase; }
                .info-grid {
                    display: grid;
                    grid-template-columns: auto auto;
                    gap: 2px 10px;
                    font-size: 11px;
                }
                .item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .item-name {
                    max-width: 150px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            </style>
        </head>
        <body>
            <div class="center header">NİSA TESETTÜR</div>
            <div class="center address">
                Gazi Mustafa Kemal Paşa Mahallesi
                <br>
                Öztrak Caddesi No:46/1
                <br>
                Tekirdağ/Çerkezköy
            </div>

            <div class="info-grid">
                <div>TARİH : ${dateStr}</div>
                <div class="right">SAAT : ${timeStr}</div>
                <div>SATIŞ NO : ${saleData.saleId}</div>
                <div class="right">SATIŞ : NAKİT</div>
                <div>KASİYER : ${kasiyer}</div>
                <div></div>
            </div>
            
            <div class="line"></div>

            ${saleData.items.map(item => {
            // Fiyat kontrolü: satisFiyati, birimFiyat veya 0
            const price = parseFloat(item.satisFiyati || item.birimFiyat || 0);
            const total = parseFloat(item.toplamFiyat || (price * item.miktar) || 0);
            return `
                <div class="mb-1">
                    ${item.barkod || ''} (${item.miktar} ADET X ${price.toFixed(2)})
                </div>
                <div class="item-row mb-1">
                    <span class="item-name">${item.urunAdi}</span>
                    <span>${total.toFixed(2)}</span>
                </div>
                `;
        }).join('')}

            <div class="line"></div>

            <div class="row">
                <span>ALINAN PARA</span>
                <span>${parseFloat(receivedAmount).toFixed(2)}</span>
            </div>
            <div class="row">
                <span>PARA ÜSTÜ</span>
                <span>${parseFloat(changeAmount).toFixed(2)}</span>
            </div>
            
            <div class="line"></div>

            <div class="row bold mt-2" style="font-size: 14px;">
                <span>GENEL TOPLAM</span>
                <span>${parseFloat(saleData.totalAmount).toFixed(2)}</span>
            </div>
            
            <br>
            <div class="center">KDV FİŞİ DEĞİLDİR</div>
            
            <br>
            <div class="center">
                <!-- Basit barkod temsili (fontsuz) -->
                ||| || ||| || ||| |||
            </div>
        </body>
        </html>
        `;

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);

        await new Promise(resolve => printWindow.webContents.on('did-finish-load', resolve));

        // Try to print to "Aclas Printer"
        await printToDevice(printWindow, "Aclas Printer");

        if (!printWindow.isDestroyed()) printWindow.destroy();

        return { success: true };
    } catch (error) {
        console.error('Print receipt error:', error);
        return { success: false, message: "Yazdırma sırasında bir hata oluştu!" };
    }
});

// Print end of day report
ipcMain.handle('printEndOfDayReport', async (event, reportData) => {
    try {
        const { BrowserWindow } = require('electron');
        const printWindow = new BrowserWindow({
            width: 300,
            height: 400,
            show: false,
            webPreferences: { nodeIntegration: true }
        });

        const formattedDate = new Date().toLocaleDateString('tr-TR');
        const formattedTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

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
                    font-weight: bold;
                }
                .center { text-align: center; }
                .right { text-align: right; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .row { display: flex; justify-content: space-between;margin: 2px 0; }
                .header { font-size: 14px; margin-bottom: 5px; }
                .subheader { font-size: 12px; margin-bottom: 5px; }
                .address { font-size: 10px; margin-bottom: 10px; text-transform: uppercase; }
                .item-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                }
                .item-name {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 140px;
                }
            </style>
        </head>
        <body>
            <div class="center header">NİSA TESETTÜR</div>
            <div class="center address">
                Gazi Mustafa Kemal Paşa Mahallesi
                <br>
                Öztrak Caddesi No:46/1
                <br>
                Tekirdağ/Çerkezköy
            </div>
            
             <div class="center subheader">GÜN SONU RAPORU</div>
             <div class="row">
                <span>TARİH : ${formattedDate}</span>
                <span>SAAT : ${formattedTime}</span>
            </div>

            <div class="line"></div>
            
            <div class="row">
                <span>TOPLAM SATIŞ</span>
                <span>${reportData.toplamSatis} ADET</span>
            </div>
            <div class="row">
                <span>TOPLAM CİRO</span>
                <span>${Number(reportData.toplamCiro).toFixed(2)} TL</span>
            </div>
            <div class="row">
                <span>TOPLAM KAR</span>
                <span>${Number(reportData.toplamKar).toFixed(2)} TL</span>
            </div>
            
            <div class="line"></div>
            <div class="center" style="margin-bottom: 5px;">SATILAN ÜRÜNLER</div>
            <div class="line"></div>
            
            ${reportData.satilanUrunler && reportData.satilanUrunler.length > 0 ? reportData.satilanUrunler.map(item => `
                <div style="margin-bottom: 4px;">
                    <div class="item-row">
                        <span class="item-name">${item.urunAdi}</span>
                        <span>${(item.satisFiyati * item.miktar).toFixed(2)}</span>
                    </div>
                    <div style="font-size: 10px;">
                        ${item.barkod || ''} (${item.miktar} ADET X ${parseFloat(item.satisFiyati).toFixed(2)})
                    </div>
                </div>
            `).join('') : '<div class="center">Satış yok</div>'}
            
            <div class="line"></div>
            <br>
            <div class="center">
                 <br>
                 İMZA
            </div>
        </body>
        </html>
        `;

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHTML)}`);

        await new Promise(resolve => printWindow.webContents.on('did-finish-load', resolve));

        // Use Aclas printer for report too if available
        await printToDevice(printWindow, "Aclas Printer");

        if (!printWindow.isDestroyed()) printWindow.destroy();

        return { success: true };
    } catch (error) {
        return { success: false, message: "Gün sonu raporu yazdırılırken bir hata oluştu!" };
    }
});

// Ürün etiketi (Barkod) yazdırma fonksiyonu
ipcMain.handle('printProductLabel', async (event, htmlContent) => {
    try {
        const { BrowserWindow } = require('electron');
        const printWindow = new BrowserWindow({
            width: 400,
            height: 300,
            show: false,
            webPreferences: { nodeIntegration: true }
        });

        // Read QR code image and convert to base64
        let qrBase64 = '';
        try {
            const path = require('path');
            const fs = require('fs');

            // Production path (build aldıktan sonra burası kullanılır)
            const productionQrPath = path.join(process.resourcesPath, 'qr.jpeg');

            // Development paths
            const devQrPath = path.join(__dirname, 'qr.jpeg');
            const userDevQrPath = 'C:\\Users\\yasin\\OneDrive\\Masaüstü\\nisa tesettür\\nisa-tesettur-barkod\\resources\\qr.jpeg';

            let qrPath = null;

            // Check paths in order: Production -> Dev (current dir) -> Dev (user path)
            if (fs.existsSync(productionQrPath)) {
                qrPath = productionQrPath;
                console.log('QR loaded from production path:', productionQrPath);
            } else if (fs.existsSync(devQrPath)) {
                qrPath = devQrPath;
                console.log('QR loaded from dev path:', devQrPath);
            } else if (fs.existsSync(userDevQrPath)) {
                qrPath = userDevQrPath;
                console.log('QR loaded from user dev path:', userDevQrPath);
            }

            if (qrPath && fs.existsSync(qrPath)) {
                const qrData = fs.readFileSync(qrPath);
                qrBase64 = `data:image/jpeg;base64,${qrData.toString('base64')}`;
            } else {
                console.error('QR code not found in any path');
            }
        } catch (err) {
            console.error('Error reading qr.jpeg:', err);
        }

        // Inject base64 image into HTML
        // Replace src="qr.jpeg" with base64 data
        let finalHTMLContent = htmlContent;
        if (qrBase64) {
            finalHTMLContent = htmlContent.replace(/src="qr.jpeg"/g, `src="${qrBase64}"`);
        }

        const fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barkod Yazdırma</title>
            <style>
                @page {
                    size: 40mm 58mm;
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                }
                .print-item {
                    page-break-after: always;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    width: 40mm;
                    height: 58mm; /* Etiket boyutu */
                    overflow: hidden;
                }
            </style>
        </head>
        <body>
            ${finalHTMLContent}
        </body>
        </html>`;

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHTML)}`);

        await new Promise(resolve => printWindow.webContents.on('did-finish-load', resolve));

        // Print - Open dialog (Ctrl+P style) as requested to fix size/settings
        // "Argox" auto-selection removed
        await new Promise((resolve, reject) => {
            printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
                if (success) resolve();
                else reject(reason);
            });
        });

        if (!printWindow.isDestroyed()) printWindow.destroy();

        return { success: true };
    } catch (error) {
        console.error('Label print error:', error);
        return { success: false, message: "Etiket yazdırılırken bir hata oluştu!" };
    }
});

// Get QR code as base64 for renderer preview
ipcMain.handle('getQRBase64', () => {
    try {
        const path = require('path');
        const fs = require('fs');

        // Production path (build aldıktan sonra burası kullanılır)
        const productionQrPath = path.join(process.resourcesPath, 'qr.jpeg');

        // Development paths
        const devQrPath = path.join(__dirname, 'qr.jpeg');
        const userDevQrPath = 'C:\\Users\\yasin\\OneDrive\\Masaüstü\\nisa tesettür\\nisa-tesettur-barkod\\resources\\qr.jpeg';

        let qrPath = null;

        // Check paths in order: Production -> Dev (current dir) -> Dev (user path)
        if (fs.existsSync(productionQrPath)) {
            qrPath = productionQrPath;
        } else if (fs.existsSync(devQrPath)) {
            qrPath = devQrPath;
        } else if (fs.existsSync(userDevQrPath)) {
            qrPath = userDevQrPath;
        }

        if (qrPath && fs.existsSync(qrPath)) {
            const qrData = fs.readFileSync(qrPath);
            return `data:image/jpeg;base64,${qrData.toString('base64')}`;
        }

        return null;
    } catch (err) {
        console.error('Error reading QR for preview:', err);
        return null;
    }
});

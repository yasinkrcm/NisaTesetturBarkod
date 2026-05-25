const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { MongoClient } = require('mongodb');

// Bağlantı adresi (Güvenlik için .env dosyasından çekiyoruz)
const uri = process.env.MONGODB_URI;

// Bağlantı ayarları: Sadece internet varsa anında hata verip kapatsın diye timeoutlar düşük tutuldu.
// İnternet yokken veya yavaşken ana uygulamayı kilitlemesini engelliyoruz.
const client = new MongoClient(uri, { 
    serverSelectionTimeoutMS: 3000, 
    connectTimeoutMS: 3000,
    socketTimeoutMS: 3000 
});

let isConnected = false;
let syncTimeout = null;
let lastSyncTime = 0;

/**
 * Arka planda sessizce MongoDB'ye bağlanıp tüm DB'yi gönderir.
 * @param {Object} db - lowdb instance'ı
 */
async function triggerCloudBackup(db) {
    // Performans için 2 saniyelik debounce (bekletme) süresi koyuyoruz.
    // Eğer art arda 5 kere write çağrılırsa (örneğin stok güncellenirken), sadece son halini 1 kere gönderecek.
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }

    syncTimeout = setTimeout(async () => {
        try {
            // Eğer daha önce bağlanmadıysa bağlan
            if (!isConnected) {
                await client.connect();
                isConnected = true;
            }

            const database = client.db('NisaTesettur');
            const backupCollection = database.collection('Backups');

            // lowdb içerisindeki JSON nesnesinin birebir aynısını al
            const currentState = db.getState();

            // Sadece tek bir döküman (latest_backup) tutarak her seferinde üzerine yazdır
            await backupCollection.updateOne(
                { _id: 'latest_backup' },
                { 
                    $set: { 
                        data: currentState, 
                        updatedAt: new Date() 
                    } 
                },
                { upsert: true }
            );

            // Başarılı olursa hiçbir uyarı verme
        } catch (error) {
            // İnternet yoksa, MongoDB'ye ulaşılamazsa veya herhangi bir hata olursa:
            // SESSİZCE YOKSAY. Ana programı veya kullanıcıyı kesinlikle rahatsız etme.
            if (error.name === 'MongoServerSelectionError' || error.name === 'MongoNetworkError') {
                isConnected = false;
            }
        }
    }, 2000);
}

/**
 * Uygulama ilk açıldığında yerel DB ile bulutu karşılaştırır,
 * fark varsa (çevrimdışıyken işlem yapılmışsa) buluta aktarır.
 */
async function syncOnStartup(db) {
    try {
        if (!isConnected) {
            await client.connect();
            isConnected = true;
        }

        const database = client.db('NisaTesettur');
        const backupCollection = database.collection('Backups');

        const cloudBackup = await backupCollection.findOne({ _id: 'latest_backup' });
        const localState = db.getState();

        // Eğer bulutta veri yoksa veya yerel veri ile buluttaki veri farklıysa
        // (Yani internet yokken ürün eklenmiş, satılmış vb.)
        if (!cloudBackup || JSON.stringify(cloudBackup.data) !== JSON.stringify(localState)) {
            await backupCollection.updateOne(
                { _id: 'latest_backup' },
                { $set: { data: localState, updatedAt: new Date() } },
                { upsert: true }
            );
        }
    } catch (error) {
        // Başlangıçta internet yoksa sessizce geç
        if (error.name === 'MongoServerSelectionError' || error.name === 'MongoNetworkError') {
            isConnected = false;
        }
    }
}

module.exports = {
    triggerCloudBackup,
    syncOnStartup
};

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    quitApp: () => ipcRenderer.invoke('quitApp'),
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getProducts: () => ipcRenderer.invoke('getProducts'),
    getProduct: (id) => ipcRenderer.invoke('getProduct', id),
    searchProduct: (barcode) => ipcRenderer.invoke('searchProduct', barcode),
    saveSale: (saleData) => ipcRenderer.invoke('saveSale', saleData),
    getSales: (userId) => ipcRenderer.invoke('getSales', userId),
    deleteSale: (saleId) => ipcRenderer.invoke('deleteSale', saleId),
    addProduct: (product) => ipcRenderer.invoke('addProduct', product),
    updateProduct: (product) => ipcRenderer.invoke('updateProduct', product),
    deleteProduct: (id) => ipcRenderer.invoke('deleteProduct', id),
    getDailyReport: () => ipcRenderer.invoke('getDailyReport'),
    getStatistics: () => ipcRenderer.invoke('getStatistics'),
    resetDailyReport: () => ipcRenderer.invoke('resetDailyReport'),
    printSaleReceipt: (saleData) => ipcRenderer.invoke('printSaleReceipt', saleData),
    printEndOfDayReport: (reportData) => ipcRenderer.invoke('printEndOfDayReport', reportData),
    printProductLabel: (htmlContent) => ipcRenderer.invoke('printProductLabel', htmlContent),
    getQRBase64: () => ipcRenderer.invoke('getQRBase64')
});

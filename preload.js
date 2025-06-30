const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    getProducts: () => ipcRenderer.invoke('getProducts'),
    getProduct: (id) => ipcRenderer.invoke('getProduct', id),
    searchProduct: (barcode) => ipcRenderer.invoke('searchProduct', barcode),
    saveSale: (saleData) => ipcRenderer.invoke('saveSale', saleData),
    getSales: (userId) => ipcRenderer.invoke('getSales', userId),
    addProduct: (product) => ipcRenderer.invoke('addProduct', product),
    updateProduct: (product) => ipcRenderer.invoke('updateProduct', product),
    getDailyReport: () => ipcRenderer.invoke('getDailyReport'),
    getStatistics: () => ipcRenderer.invoke('getStatistics'),
    resetDailyReport: () => ipcRenderer.invoke('resetDailyReport')
});

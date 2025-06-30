// Complete Sale function
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

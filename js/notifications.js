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

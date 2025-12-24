// claims.js - Claim Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initClaimForms();
    initClaimStatusUpdates();
});

// Initialize claim forms
function initClaimForms() {
    const claimForms = document.querySelectorAll('.claim-form');
    
    claimForms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const itemId = this.dataset.itemId;
            const submitBtn = this.querySelector('button[type="submit"]');
            
            // Disable button and show loading
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';
            
            try {
                const response = await fetch(`/items/${itemId}/claim`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(Object.fromEntries(formData))
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Claim submitted successfully!', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    throw new Error(data.message || 'Failed to submit claim');
                }
            } catch (error) {
                console.error('Claim submission error:', error);
                showNotification('Error: ' + error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    });
}

// Initialize claim status updates
function initClaimStatusUpdates() {
    const approveBtns = document.querySelectorAll('.approve-claim-btn');
    const rejectBtns = document.querySelectorAll('.reject-claim-btn');
    
    // Approve claim buttons
    approveBtns.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            const claimId = this.dataset.claimId;
            
            if (confirm('Are you sure you want to approve this claim?')) {
                await updateClaimStatus(claimId, 'approve');
            }
        });
    });
    
    // Reject claim buttons
    rejectBtns.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            const claimId = this.dataset.claimId;
            
            if (confirm('Are you sure you want to reject this claim?')) {
                await updateClaimStatus(claimId, 'reject');
            }
        });
    });
}

// Update claim status
async function updateClaimStatus(claimId, action) {
    try {
        const response = await fetch(`/claims/${claimId}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Claim ${action}d successfully!`, 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || `Failed to ${action} claim`);
        }
    } catch (error) {
        console.error(`Claim ${action} error:`, error);
        showNotification('Error: ' + error.message, 'error');
    }
}

// Show notification
function showNotification(message, type) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `custom-notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 5px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    if (type === 'success') {
        notification.style.background = '#28a745';
    } else if (type === 'error') {
        notification.style.background = '#dc3545';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Character counter for claim forms
document.addEventListener('input', function(e) {
    if (e.target.matches('textarea[maxlength]')) {
        const counter = e.target.parentNode.querySelector('.char-counter');
        if (counter) {
            const current = e.target.value.length;
            const max = parseInt(e.target.getAttribute('maxlength'));
            counter.textContent = `${current}/${max}`;
            
            if (current > max) {
                counter.style.color = '#dc3545';
                e.target.style.borderColor = '#dc3545';
            } else if (current > max * 0.9) {
                counter.style.color = '#ffc107';
                e.target.style.borderColor = '#ffc107';
            } else {
                counter.style.color = '#666';
                e.target.style.borderColor = '#ddd';
            }
        }
    }
});
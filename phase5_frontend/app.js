/*
  InsightAI Frontend Logic (Minimalist Version)
  Handles API integration with conditional visibility
*/

const API_BASE = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    fetchSystemStatus();
    setupEventListeners();
});

async function fetchSystemStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        
        const statsHeader = document.getElementById('statsHeader');
        const analysisMeta = document.getElementById('analysisMeta');

        // Only show if we actually have data, and avoid 'Never' or 0 if possible
        if (data.reviewCount > 0 && data.lastAnalysisDate !== 'Never') {
            analysisMeta.innerText = `${data.reviewCount} Reviews Analyzed • Updated ${data.lastAnalysisDate}`;
            statsHeader.classList.remove('hidden');
        } else {
            statsHeader.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error fetching system status:', error);
    }
}

async function fetchDashboardData() {
    console.log('Fetching dashboard data...');
    try {
        const response = await fetch(`${API_BASE}/pulse`);
        if (!response.ok) throw new Error('Pulse data not available');
        
        const data = await response.json();
        renderDashboard(data);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // On error, hide sections
        ['themesSection', 'quotesSection', 'actionSection'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    }
}

function renderDashboard(data) {
    // 1. Render Themes
    const themesSection = document.getElementById('themesSection');
    const themesList = document.getElementById('themesList');
    
    if (data.top_themes && data.top_themes.length > 0) {
        themesList.innerHTML = data.top_themes.map(theme => `
            <div class="theme-item">
                <h3>${theme.name || 'Untitled Theme'}</h3>
                <p>${theme.description || ''}</p>
            </div>
        `).join('');
        themesSection.classList.remove('hidden');
    } else {
        themesSection.classList.add('hidden');
    }

    // 2. Render User Quotes
    const quotesSection = document.getElementById('quotesSection');
    const quotesList = document.getElementById('quotesList');
    
    if (data.quotes && data.quotes.length > 0) {
        quotesList.innerHTML = data.quotes.map(quote => 
            quote ? `<div class="quote-item">"${quote}"</div>` : ''
        ).join('');
        quotesSection.classList.remove('hidden');
    } else {
        quotesSection.classList.add('hidden');
    }

    // 3. Render Action Ideas
    const actionSection = document.getElementById('actionSection');
    const actionList = document.getElementById('actionList');
    
    if (data.action_ideas && data.action_ideas.length > 0) {
        actionList.innerHTML = data.action_ideas.map(idea => 
            idea ? `<div class="action-item">${idea}</div>` : ''
        ).join('');
        actionSection.classList.remove('hidden');
    } else {
        actionSection.classList.add('hidden');
    }
}

function setupEventListeners() {
    // Regenerate Analysis
    const triggerBtn = document.getElementById('triggerPipeline');
    triggerBtn.addEventListener('click', async () => {
        triggerBtn.disabled = true;
        const originalText = triggerBtn.innerText;
        triggerBtn.innerText = 'Analyzing...';
        
        try {
            await fetch(`${API_BASE}/trigger`, { method: 'POST' });
            showToast('Analysis triggered. Refreshing data...', 'success');
            setTimeout(() => {
                fetchDashboardData();
                fetchSystemStatus();
            }, 10000);
        } catch (error) {
            showToast('Failed to trigger analysis', 'error');
        } finally {
            setTimeout(() => {
                triggerBtn.disabled = false;
                triggerBtn.innerText = originalText;
            }, 5000);
        }
    });

    // Send Email Form
    const emailForm = document.getElementById('emailForm');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sendBtn = document.getElementById('sendEmailBtn');
        const statusMsg = document.getElementById('emailStatus');
        
        const payload = {
            name: document.getElementById('recipientName').value,
            email: document.getElementById('recipientEmail').value
        };

        sendBtn.disabled = true;
        sendBtn.innerText = 'Dispatching...';

        try {
            const response = await fetch(`${API_BASE}/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                statusMsg.innerText = 'Analysis dispatched successfully.';
                statusMsg.className = 'status-msg success';
                showToast('Email sent!', 'success');
            } else {
                throw new Error('Dispatch failed');
            }
        } catch (error) {
            statusMsg.innerText = 'Failed to dispatch report.';
            statusMsg.className = 'status-msg error';
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerText = 'Dispatch via Gmail';
        }
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

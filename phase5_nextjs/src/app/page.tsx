'use client';

import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8000/api';

interface Theme {
  name: string;
  description: string;
  status?: string;
  impact?: string;
}

interface PulseData {
  top_themes: Theme[];
  quotes: string[];
  action_ideas: string[];
  total_reviews: number;
  review_limit?: number;
  time_range?: number;
  total_reviews_analyzed?: number;
  timestamp?: string;
  analysis_status?: 'success' | 'failed';
  error_message?: string;
  summary?: string;
  draft_email?: string;
  engine?: string;
}

interface Review {
  text: string;
  rating: number;
  date: string;
}

interface SystemStatus {
  reviewCount: number;
  lastAnalysisDate: string;
  status: string;
  isProcessing?: boolean;
  progressLabel?: string;
  review_limit?: number;
  time_range?: number;
}

export default function BrandedDashboard() {
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [emailForm, setEmailForm] = useState({ name: '', email: '' });
  const [sortBy, setSortBy] = useState<'date' | 'rating'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // New Filter & Pagination State
  const [timeRange, setTimeRange] = useState('8'); // weeks
  const [limit, setLimit] = useState(75);
  const [page, setPage] = useState(0);
  const itemsPerPage = 10;
  const hasSynced = useRef(false);

  useEffect(() => {
    fetchPulse();
    fetchStatus();
  }, []);

  // Reset sync flag when a new analysis starts
  useEffect(() => {
    if (analyzing || status?.isProcessing) {
      hasSynced.current = false;
    }
  }, [analyzing, status?.isProcessing]);

  // Update UI filters to match pulse metadata once loaded (Initial or After Analysis)
  useEffect(() => {
    if (pulse && !analyzing && !(status?.isProcessing) && !hasSynced.current) {
      if (pulse.review_limit) {
        setLimit(Number(pulse.review_limit));
      }
      if (pulse.time_range !== undefined) {
        const weeksFromPulse = Math.round(Number(pulse.time_range) / 7);
        if (weeksFromPulse > 0 || pulse.time_range === 0) {
          setTimeRange(weeksFromPulse.toString());
        }
      }
      hasSynced.current = true;
    }
  }, [pulse, analyzing, status?.isProcessing]);

  useEffect(() => {
    fetchReviews();
    setPage(0); // Reset page on filter change
  }, [timeRange, limit]);

  const fetchPulse = async () => {
    try {
      const res = await fetch(`${API_BASE}/pulse?t=${Date.now()}`);
      if (res.ok) setPulse(await res.json());
    } catch (err) { console.error('Pulse fetch failed'); }
  };

  const fetchReviews = async () => {
    try {
      const days = timeRange === 'all' ? 0 : parseInt(timeRange) * 7;
      const res = await fetch(`${API_BASE}/reviews?limit=${limit}&days=${days}`);
      if (res.ok) setReviews(await res.json());
    } catch (err) { console.error('Reviews fetch failed'); }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) setStatus(await res.json());
    } catch (err) { console.error('Status fetch failed'); }
  };

  const handleTrigger = async () => {
    setAnalyzing(true);
    try {
      const days = timeRange === 'all' ? 0 : parseInt(timeRange) * 7;
      await fetch(`${API_BASE}/trigger`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, days })
      });
      // Polling useEffect below will handle the refresh when backend is ready
    } catch (err) { setAnalyzing(false); }
  };

  const handlePreview = async () => {
    try {
      const res = await fetch(`${API_BASE}/preview`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm)
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
        setShowPreview(true);
      } else {
        alert("Pulse analysis not found. Run analysis first.");
      }
    } catch (err) { alert("Preview failed"); }
  };

  const deliverPulse = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatching(true);
    try {
      await fetch(`${API_BASE}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm),
      });
      alert('Pulse Delivered!');
    } catch (err) { alert('Delivery failed'); }
    finally { setDispatching(false); }
  };
  
  // 2. Real-time Status Polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (analyzing || status?.isProcessing) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/status`);
          if (res.ok) {
            const data = await res.json();
            setStatus(data);
            if (!data.isProcessing && (analyzing || status?.isProcessing)) {
              setAnalyzing(false);
              // Force direct re-fetch + cache bust to clear stale state
              const timestamp = Date.now();
              const pulseRes = await fetch(`${API_BASE}/pulse?t=${timestamp}`);
              if (pulseRes.ok) setPulse(await pulseRes.json());
              
              await fetchReviews();
              await fetchStatus();
            }
          }
        } catch (e) {
          console.error('Polling failed');
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [analyzing, status?.isProcessing]);

  const toggleSort = (field: 'date' | 'rating') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Dynamic Segments from Top Themes
  const themeCount = pulse?.top_themes?.length || 0;
  const colors = ['#3b82f6', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#06b6d4', '#facc15'];
  const segments = pulse?.top_themes?.map((t, i) => ({
    color: colors[i % colors.length],
    offset: (i * 100) / themeCount,
    length: 100 / themeCount
  })) || [];

  return (
    <div className="dashboard-wrapper animate-fade">
      {/* 1. Branded Header */}
      <header className="branding-header">
        <div className="brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </div>
          <div className="brand-info">
            <h1>INDMONEY PULSE</h1>
            <p>INSTITUTIONAL SENTIMENT INTELLIGENCE</p>
          </div>
        </div>
        <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
          {pulse && pulse.analysis_status === 'failed' && (
            <div style={{fontSize: '0.65rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)'}}>
               🚨 Analysis Error: {pulse.error_message || 'Rate Limit Exceeded'}
            </div>
          )}

          {pulse && (Number(limit) !== Number(pulse.review_limit || 0) || (Number(timeRange) * 7) !== Number(pulse.time_range || 0)) && (
            <div style={{fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.2)', transition: 'all 0.3s ease'}}>
               {analyzing || status?.isProcessing ? `⚡ ${status?.progressLabel || 'Syncing...'}` : '⚠️ Pulse out of sync with Filters'}
            </div>
          )}
          <div className="status-badge">
            <div className="status-dot"></div>
            {status?.status === 'online' ? 'System Active' : 'System Offline'}
          </div>
        </div>
      </header>

      {/* 2. Insight Command Center */}
      <section className="card" style={{position: 'relative', overflow: 'visible', padding: '20px 24px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
          <p style={{fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700'}}>
             INSIGHT COMMAND CENTER
          </p>

        </div>

        <div style={{display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start'}}>
          <div className="logic-group" style={{flex: '1', minWidth: '200px'}}>
            <span className="logic-label" style={{fontSize: '0.6rem', color: '#64748b', marginBottom: '6px', display: 'block'}}>Time Range</span>
            <select 
              className="logic-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              style={{width: '100%', height: '40px'}}
            >
              <option value="8">Last 8 Weeks (Global)</option>
              <option value="4">Last 4 Weeks (Recent)</option>
              <option value="0">All Time (Legacy)</option>
            </select>
          </div>

          <div className="logic-group" style={{flex: '1', minWidth: '200px'}}>
            <span className="logic-label" style={{fontSize: '0.6rem', color: '#64748b', marginBottom: '6px', display: 'block'}}>Insight Depth</span>
            <select 
              className="logic-select"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              style={{width: '100%', height: '40px'}}
            >
              <option value="75">Quick (75 Reviews)</option>
              <option value="150">Standard (150 Reviews)</option>
            </select>
            {limit > reviews.length && !analyzing && (
              <p style={{fontSize: '0.55rem', color: '#3b82f6', marginTop: '6px', fontWeight: '500'}}>
                ✦ System will fetch additional reviews
              </p>
            )}
          </div>

          <div style={{flex: '0.5', minWidth: '220px', paddingTop: '22px'}}>
            <button 
              onClick={handleTrigger} 
              className={`btn ${pulse && Number(limit) === Number(pulse.review_limit || 0) && (Number(timeRange) * 7) === Number(pulse.time_range || 0) ? 'btn-outline' : 'btn-blue'}`}
              disabled={analyzing || status?.isProcessing} 
              style={{width: '100%', height: '40px', fontWeight: '600', letterSpacing: '0.02em', opacity: (analyzing || status?.isProcessing) ? 0.7 : 1}}
              title="Intelligence refresh consumes Groq API tokens. Only refresh if data is out of sync."
            >
              {analyzing || status?.isProcessing 
                ? (status?.progressLabel || 'Refreshing Intelligence...') 
                : (pulse && Number(limit) === Number(pulse.review_limit || 0) && (Number(timeRange) * 7) === Number(pulse.time_range || 0) 
                    ? 'Intelligence is Synced' 
                    : 'Refresh Intelligence')}
            </button>

          </div>

        </div>
      </section>

      {/* 3. Communication Bar */}
      <form onSubmit={deliverPulse} className="card comm-bar">
        <div className="comm-input-wrapper">
          <input 
            type="email" 
            className="comm-input" 
            placeholder="Stakeholder Email" 
            value={emailForm.email}
            onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
            required 
          />
        </div>
        <button type="button" onClick={handlePreview} className="btn btn-outline">Generate Email Preview</button>
        <button type="submit" className="btn btn-orange" disabled={dispatching}>
          {dispatching ? 'Delivering...' : 'Deliver Pulse'}
        </button>
      </form>

      {/* 3.5 Draft Email Preview (NEW) */}
      {pulse?.draft_email && (
        <section className="card animate-fade" style={{marginBottom: '24px', background: '#1c212b', border: '1px dashed #3b82f6'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
            <div className="discovery-title" style={{margin: 0}}>
              <span>Intelligence Email Draft</span>
              <span style={{fontSize: '0.6rem', color: '#3b82f6', letterSpacing: '0.05em'}}>READY TO SYNDICATE</span>
            </div>
            <button 
              onClick={() => {
                if (pulse.draft_email) {
                   navigator.clipboard.writeText(pulse.draft_email);
                   alert("Email draft copied to clipboard!");
                }
              }}
              style={{fontSize: '0.65rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'}}
            >
              Copy Draft
            </button>
          </div>
          <div style={{fontSize: '0.75rem', lineHeight: '1.6', color: '#94a3b8', background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #1e293b', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace'}}>
            {pulse.draft_email}
          </div>
        </section>
      )}

      {/* 2.5 Executive Intelligence Brief (NEW) */}
      {pulse?.summary && (
        <section className="card animate-fade" style={{marginBottom: '24px', borderLeft: '4px solid #3b82f6'}}>
          <div className="discovery-title" style={{marginBottom: '12px'}}>
            <span>Executive Briefing</span>
            <span style={{fontSize: '0.6rem', color: '#3b82f6', letterSpacing: '0.05em'}}>STRATEGIC SUMMARY</span>
          </div>
          <p style={{fontSize: '0.85rem', lineHeight: '1.6', color: '#e2e8f0', whiteSpace: 'pre-wrap'}}>
            {pulse.summary}
          </p>
        </section>
      )}

      {/* 4. Main Discovery Grid */}
      <div className="main-grid">
        {/* Left: Clusters */}
        <section className="card">
          <div className="discovery-title">
            <span>Discovery Clusters</span>
            <span style={{color: '#a855f7'}}>Impact Analysis</span>
          </div>
          {segments.length > 0 ? (
            <>
              <div className="donut-container">
                <svg className="donut-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1c212b" strokeWidth="12" />
                  {segments.slice(0, 3).map((s, i) => (
                    <circle 
                      key={i}
                      cx="50" cy="50" r="40" 
                      fill="transparent" 
                      stroke={s.color} 
                      strokeWidth="12" 
                      strokeDasharray={`${s.length} ${100 - s.length}`} 
                      strokeDashoffset={-s.offset} 
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                <div style={{position: 'absolute', textAlign: 'center'}}>
                  <div style={{fontSize: '1.5rem', fontWeight: '700'}}>{pulse?.total_reviews_analyzed || 0}</div>
                  <div style={{fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase'}}>of {pulse?.review_limit || 100} Analyzed</div>
                </div>
              </div>
              <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {pulse?.top_themes.slice(0, 3).map((t, i) => (
                   <div key={i} style={{fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '8px'}}>
                      <div style={{width: '6px', height: '6px', borderRadius: '50%', background: segments[i].color}}></div>
                      <span style={{color: '#fff', fontWeight: '500'}}>{t.name}</span>
                   </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem'}}>
              No themes extracted. Run analysis to populate.
            </div>
          )}
        </section>

        {/* Center: Signal Extraction */}
        <section className="card">
          <div className="discovery-title">
            <span>Signal Extraction</span>
            <span style={{fontSize: '0.6rem', background: '#a855f7', color: '#fff', padding: '2px 8px', borderRadius: '4px'}}>LATEST SIGNALS</span>
          </div>
          <div className="signal-list">
            {(pulse?.quotes || []).length > 0 ? (
              pulse?.quotes.slice(0, 3).map((q, i) => (
                <div key={i} className="signal-card" style={{borderLeftColor: segments[i % segments.length]?.color || '#a855f7', padding: '16px'}}>
                  <p className="signal-text">"{q}"</p>
                </div>
              ))
            ) : (
              <div style={{color: '#94a3b8', fontSize: '0.8rem', paddingTop: '20px'}}>No recent signals extracted.</div>
            )}
          </div>
        </section>

        {/* Right: Strategic Actions */}
        <section className="card">
          <div className="discovery-title">
            <span>Strategic Action Pulse</span>
            <span style={{fontSize: '0.6rem', background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: '4px'}}>PRIORITY</span>
          </div>
          <div className="action-list">
            {(pulse?.action_ideas || []).length > 0 ? (
              pulse?.action_ideas.slice(0, 3).map((idea, i) => (
                <div key={i} className="action-card">
                  <span className="action-icon">✦</span>
                  <p className="action-text">{idea}</p>
                </div>
              ))
            ) : (
              <div style={{color: '#94a3b8', fontSize: '0.8rem', paddingTop: '20px'}}>No action ideas generated yet.</div>
            )}
          </div>
        </section>
      </div>

      {/* 5. Feedback Stream */}
      <section className="card" style={{padding: '0'}}>
        <div style={{padding: '24px 24px 0 24px'}}>
           <p style={{fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600'}}>
             VIEW PROCESSED DATA
           </p>
        </div>
        <div style={{padding: '12px 24px 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
           <div>
             <h2 style={{fontSize: '0.9rem', fontWeight: '600'}}>LIVE FEEDBACK STREAM</h2>
             <p style={{fontSize: '0.6rem', color: '#94a3b8', marginTop: '4px'}}>
               SHOWING {page * itemsPerPage + 1}-{Math.min((page + 1) * itemsPerPage, reviews.length)} OF {reviews.length} 
             </p>
           </div>
           <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
              <span style={{fontSize: '0.7rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                Sorted by {sortBy === 'date' ? 'Date' : 'Rating'}
              </span>
              <div style={{display: 'flex', gap: '4px'}}>
                 <button onClick={() => setPage(Math.max(0, page - 1))} className="btn-pagination" disabled={page === 0}>←</button>
                 <button onClick={() => setPage(Math.min(Math.ceil(reviews.length / itemsPerPage) - 1, page + 1))} className="btn-pagination" disabled={(page + 1) * itemsPerPage >= reviews.length}>→</button>
              </div>
           </div>
        </div>
        <div className="stream-header" style={{cursor: 'pointer', userSelect: 'none'}}>
           <span onClick={() => toggleSort('rating')} style={{color: sortBy === 'rating' ? '#fff' : 'inherit'}}>
             Sentiment {sortBy === 'rating' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
           </span>
           <span>Content</span>
           <span onClick={() => toggleSort('date')} style={{textAlign: 'right', color: sortBy === 'date' ? '#fff' : 'inherit'}}>
             Posted {sortBy === 'date' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
           </span>
        </div>
        <div className="stream-body">
           {[...reviews]
             .sort((a, b) => {
               if (sortBy === 'date') {
                 const timeA = new Date(a.date).getTime();
                 const timeB = new Date(b.date).getTime();
                 return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
               } else {
                 return sortOrder === 'desc' ? b.rating - a.rating : a.rating - b.rating;
               }
             })
             .slice(page * itemsPerPage, (page + 1) * itemsPerPage)
             .map((r, i) => (
               <div key={i} className="stream-row">
                  <span className="sentiment-dot">★ {r.rating.toFixed(1)}</span>
                  <span style={{color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={r.text}>{r.text}</span>
                  <span className="date-label">{new Date(r.date || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
               </div>
             ))}
        </div>
      </section>

      {/* 6. Email Preview Modal */}
      {showPreview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, 
          background: 'rgba(2, 6, 23, 0.95)', display: 'flex', 
          justifyContent: 'center', alignItems: 'center', padding: '20px'
        }}>
           <div style={{
             width: '100%', maxWidth: '800px', height: '90vh', 
             background: '#1c212b', borderRadius: '16px', display: 'flex', 
             flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden'
           }}>
             <div style={{
               padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)', 
               display: 'flex', justifyContent: 'space-between', alignItems: 'center'
             }}>
               <h3 style={{fontSize: '0.9rem', fontWeight: '800', letterSpacing: '0.05em'}}>EMAIL DISPATCH PREVIEW</h3>
               <button 
                 onClick={() => setShowPreview(false)}
                 style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem'}}
               >✕</button>
             </div>
             <iframe 
               srcDoc={previewHtml} 
               style={{width: '100%', flex: 1, border: 'none', background: '#020617'}}
               title="Email Preview"
             />
             <div style={{padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center'}}>
               <p style={{fontSize: '0.65rem', color: '#94a3b8'}}>This is a visual simulation of the "Independent Intelligence" Pulse report.</p>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}

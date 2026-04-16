import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = '/api';
const PAGE_SIZE = 10;
const AUTO_REFRESH_MS = 30000;

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padLeft2()}:${String(s).padLeft2()}`;
}

// Polyfill for padLeft2
String.prototype.padLeft2 = function () {
  return this.padStart(2, '0');
};

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortId(id) {
  if (!id) return '—';
  return id.slice(0, 8).toUpperCase();
}

export default function App() {
  const [recordings, setRecordings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [stats, setStats] = useState({ total_recordings: 0, total_duration_seconds: 0, total_file_size_bytes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchRecordings = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/recordings`, { params: { page, limit: PAGE_SIZE } }),
        axios.get(`${API_BASE}/recordings/stats`),
      ]);
      setRecordings(recRes.data.recordings);
      setPagination(recRes.data.pagination);
      setStats(statsRes.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Erro ao carregar gravações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings(currentPage);
  }, [currentPage, fetchRecordings]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecordings(currentPage);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [currentPage, fetchRecordings]);

  const handleDelete = async (id, filename) => {
    if (!window.confirm(`Deletar gravação ${shortId(id)} (${filename})?\n\nEsta ação não pode ser desfeita.`)) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API_BASE}/recordings/${id}`);
      fetchRecordings(currentPage);
    } catch (err) {
      alert(err?.response?.data?.error || 'Erro ao deletar gravação');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePlay = (id) => {
    window.open(`${API_BASE}/recordings/${id}/audio`, '_blank');
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalDurationFormatted = (() => {
    const total = parseInt(stats.total_duration_seconds, 10) || 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  })();

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <span className="header-icon">🔦</span>
            <h1 className="header-title">Admin — Lanterna Educacional</h1>
          </div>
          <div className="header-right">
            <span className="refresh-info">
              Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => fetchRecordings(currentPage)}
              disabled={loading}
            >
              {loading ? 'Carregando…' : '↻ Atualizar'}
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-value">{stats.total_recordings}</div>
            <div className="stat-label">Total de Gravações</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalDurationFormatted}</div>
            <div className="stat-label">Duração Total</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatBytes(parseInt(stats.total_file_size_bytes, 10))}</div>
            <div className="stat-label">Espaço Utilizado</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{pagination.totalPages}</div>
            <div className="stat-label">Páginas</div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            <strong>Erro:</strong> {error}
            <button className="btn btn-small btn-danger" onClick={() => fetchRecordings(currentPage)}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* Table */}
        <div className="table-container">
          <div className="table-header-bar">
            <h2 className="table-title">Gravações</h2>
            <span className="table-count">
              {pagination.total} registro{pagination.total !== 1 ? 's' : ''} no total
            </span>
          </div>

          {loading && recordings.length === 0 ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Carregando gravações…</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎙️</div>
              <p>Nenhuma gravação encontrada.</p>
              <p className="empty-sub">Use o aplicativo Flutter para enviar gravações.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Arquivo</th>
                    <th>Data/Hora (Gravação)</th>
                    <th>Data/Hora (Upload)</th>
                    <th>Duração</th>
                    <th>Tamanho</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <span className="id-badge" title={rec.id}>
                          {shortId(rec.id)}
                        </span>
                      </td>
                      <td>
                        <span className="filename" title={rec.filename}>
                          {rec.original_name || rec.filename}
                        </span>
                      </td>
                      <td>{formatDateTime(rec.recorded_at)}</td>
                      <td>{formatDateTime(rec.uploaded_at)}</td>
                      <td>
                        {rec.duration != null
                          ? formatDuration(rec.duration)
                          : '—'}
                      </td>
                      <td>{formatBytes(rec.file_size)}</td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn btn-small btn-play"
                            onClick={() => handlePlay(rec.id)}
                            title="Ouvir gravação"
                          >
                            ▶ Ouvir
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleDelete(rec.id, rec.original_name || rec.filename)}
                            disabled={deletingId === rec.id}
                            title="Deletar gravação"
                          >
                            {deletingId === rec.id ? '…' : '✕ Deletar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || loading}
              >
                « Primeira
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                ‹ Anterior
              </button>

              <div className="page-numbers">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - currentPage) <= 2)
                  .map((p) => (
                    <button
                      key={p}
                      className={`btn btn-small ${p === currentPage ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handlePageChange(p)}
                      disabled={loading}
                    >
                      {p}
                    </button>
                  ))}
              </div>

              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === pagination.totalPages || loading}
              >
                Próxima ›
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePageChange(pagination.totalPages)}
                disabled={currentPage === pagination.totalPages || loading}
              >
                Última »
              </button>

              <span className="page-info">
                Página {currentPage} de {pagination.totalPages}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Lanterna Educacional — Painel Administrativo · Auto-atualiza a cada 30 segundos</p>
      </footer>
    </div>
  );
}

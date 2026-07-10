import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Search, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  X, 
  Copy, 
  ExternalLink, 
  Loader2, 
  ArrowRight,
  Filter,
  RefreshCw,
  Lock,
  Unlock,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Alertas {
  zeroFotos: boolean;
  urgente48h: boolean;
  stale24h: boolean;
  imagemRepetida: boolean;
}

interface TrackerItem {
  avaliacaoId: string;
  portalId: string | null;
  tecnico: string;
  login: string;
  certificacao: string;
  dataAvaliacao: string;
  statusAvaliacao: string;
  portalStatus: string;
  prazo: string | null;
  diasRestantes: number;
  quantidadeMissoes: number;
  fotosEsperadas: number;
  fotosEnviadas: number;
  ultimaAtividade: string | null;
  statusIa: string;
  alertas: Alertas;
  repeatedCount: number;
}

export default function PortalAcompanhamento() {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackerItem[]>([]);
  
  // Filters & Search
  const [searchInputValue, setSearchInputValue] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<string>('todos');
  
  // Date Filters
  const [dateOption, setDateOption] = useState<string>('proximos_30');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);

  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const calculateRange = (option: string) => {
    const today = new Date();
    switch (option) {
      case 'hoje':
        return { start: getLocalDateString(today), end: getLocalDateString(today) };
      case 'proximos_7':
        return { start: getLocalDateString(today), end: getLocalDateString(addDays(today, 6)) };
      case 'proximos_15':
        return { start: getLocalDateString(today), end: getLocalDateString(addDays(today, 14)) };
      case 'proximos_30':
        return { start: getLocalDateString(today), end: getLocalDateString(addDays(today, 29)) };
      case 'todos':
      default:
        return { start: null, end: null };
    }
  };

  const [appliedDateRange, setAppliedDateRange] = useState<{ start: string | null; end: string | null }>(() => calculateRange('proximos_30'));

  // Format YYYY-MM-DD back to human-friendly format
  const formatDateLocal = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Portal Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchTrackerData = async (
    silent = false,
    start: string | null = null,
    end: string | null = null
  ) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      let url = '/api/evidencias/portais-tracker';
      if (start && end) {
        url += `?dataInicio=${start}&dataFim=${end}`;
      }
      
      const res = await apiFetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error('Erro na requisição ao servidor');
      }
      const json = await res.json() as any;
      if (json.success) {
        setData(json.tracker || []);
      } else {
        throw new Error(json.error || 'Falha ao buscar dados');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // ignore aborted request
      }
      setError(err.message || 'Erro de conexão.');
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const range = calculateRange('proximos_30');
    fetchTrackerData(false, range.start, range.end);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Debounced Search Term Handler
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInputValue);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInputValue]);

  const handleDateOptionChange = (option: string) => {
    setDateOption(option);
    setDateValidationError(null);
    if (option !== 'personalizado') {
      const range = calculateRange(option);
      setAppliedDateRange(range);
      fetchTrackerData(false, range.start, range.end);
    } else {
      if (!customStartDate) setCustomStartDate(getLocalDateString(new Date()));
      if (!customEndDate) setCustomEndDate(getLocalDateString(addDays(new Date(), 29)));
    }
  };

  const handleApplyCustomRange = () => {
    setDateValidationError(null);
    if (!customStartDate || !customEndDate) {
      setDateValidationError("Por favor, preencha ambas as datas.");
      return;
    }
    
    const startObj = new Date(customStartDate + 'T00:00:00');
    const endObj = new Date(customEndDate + 'T00:00:00');
    
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
      setDateValidationError("Por favor, insira datas válidas.");
      return;
    }
    
    if (customStartDate > customEndDate) {
      setDateValidationError("A data inicial não pode ser maior que a data final.");
      return;
    }
    
    const range = { start: customStartDate, end: customEndDate };
    setAppliedDateRange(range);
    fetchTrackerData(false, range.start, range.end);
  };

  const handleClearCustomRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setDateValidationError(null);
    setDateOption('proximos_30');
    const range = calculateRange('proximos_30');
    setAppliedDateRange(range);
    fetchTrackerData(false, range.start, range.end);
  };

  const handlePortalAction = async (avaliacaoId: string, action: 'reopen' | 'close') => {
    setActionLoading(avaliacaoId);
    try {
      const res = await apiFetch('/api/evidencias/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avaliacaoId,
          action,
          expiraEmDays: 3,
          reabertoPor: localStorage.getItem('claro_cq_selecionado') ? JSON.parse(localStorage.getItem('claro_cq_selecionado') || '{}').nome : 'CQ/Analista'
        })
      });
      if (res.ok) {
        const json = await res.json() as any;
        if (json.success) {
          showToast(action === 'reopen' ? 'Portal reaberto com sucesso!' : 'Portal encerrado/bloqueado com sucesso!', 'success');
          await fetchTrackerData(true, appliedDateRange.start, appliedDateRange.end);
        } else {
          showToast(json.error || 'Erro ao alterar o portal', 'error');
        }
      } else {
        showToast('Falha na resposta do servidor', 'error');
      }
    } catch (err) {
      showToast('Erro ao atualizar portal', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Filter application
  const filteredData = data.filter((item) => {
    // Search match
    const searchMatch = 
      item.tecnico.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.login.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.certificacao.toLowerCase().includes(searchTerm.toLowerCase());

    if (!searchMatch) return false;

    // Filter type match
    const isClosedAval = ['APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW'].includes(String(item.statusAvaliacao).toUpperCase());
    const isClosedPortal = !['LIBERADO', 'EM_ENVIO'].includes(String(item.portalStatus).toUpperCase());

    switch (selectedFilter) {
      case 'sem_fotos':
        return item.fotosEnviadas === 0;
      case 'incompleto':
        return item.fotosEnviadas > 0 && item.fotosEnviadas < item.fotosEsperadas;
      case 'completo':
        return item.fotosEnviadas >= item.fotosEsperadas && item.fotosEsperadas > 0;
      case 'aguardando_ia':
        return item.statusIa === 'AGUARDANDO_IA';
      case 'revisao':
        return item.statusIa === 'REVISAO_NECESSARIA';
      case 'proximo':
        return item.alertas.urgente48h;
      case 'encerrado':
        return isClosedAval || isClosedPortal;
      default:
        return true;
    }
  });

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-screen text-left" id="portal-tracker-container">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition-all animate-bounce ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
            <Layers size={12} className="text-claro-red" /> Gestão de Evidências Digitais
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Acompanhamento do Portal Técnico</h1>
          <p className="text-xs text-slate-500">Monitore em tempo real o envio de fotos pelos técnicos em campo e auditorias de IA.</p>
        </div>

        <button
          onClick={() => fetchTrackerData(true, appliedDateRange.start, appliedDateRange.end)}
          disabled={refreshing}
          className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 text-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Sincronizando...' : 'Atualizar Dados'}
        </button>
      </div>

      {/* Grid Summary Info widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Sem Fotos Enviadas</span>
          <h2 className="text-xl font-black text-slate-900 mt-1">
            {data.filter(i => i.fotosEnviadas === 0).length} <span className="text-xs text-rose-600 font-bold">crítico</span>
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Urgente (&lt; 48 Horas)</span>
          <h2 className="text-xl font-black text-amber-600 mt-1">
            {data.filter(i => i.alertas.urgente48h).length}
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Revisão Necessária IA</span>
          <h2 className="text-xl font-black text-red-600 mt-1">
            {data.filter(i => i.statusIa === 'REVISAO_NECESSARIA').length}
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Imagens Duplicadas</span>
          <h2 className="text-xl font-black text-rose-700 mt-1">
            {data.filter(i => i.alertas.imagemRepetida).length} <span className="text-xs text-rose-500 font-bold">alertas</span>
          </h2>
        </div>
      </div>

      {/* Filter and Search Bar Row */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por técnico, login ou certificação..."
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all text-slate-800"
            />
            {searchInputValue && (
              <button onClick={() => setSearchInputValue('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Quick Date Filters - Horizontal scroll on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1 shrink-0">
              <Clock size={10} className="text-red-600" /> Período da Avaliação:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'hoje', label: 'Hoje' },
                { id: 'proximos_7', label: 'Próximos 7 dias' },
                { id: 'proximos_15', label: 'Próximos 15 dias' },
                { id: 'proximos_30', label: 'Próximos 30 dias' },
                { id: 'personalizado', label: 'Período personalizado' },
                { id: 'todos', label: 'Todos' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleDateOptionChange(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer shrink-0 ${
                    dateOption === opt.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Picker Block if selected */}
        {dateOption === 'personalizado' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-end gap-3.5">
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500">Data Inicial</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setDateValidationError(null);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500">Data Final</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setDateValidationError(null);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplyCustomRange}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Aplicar
                </button>
                <button
                  onClick={handleClearCustomRange}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-lg transition-colors cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            </div>

            {dateValidationError && (
              <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                <AlertCircle size={12} />
                {dateValidationError}
              </p>
            )}
          </div>
        )}

        {/* Status Filters scrollable buttons */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Filter size={10} /> Status das Evidências:
          </span>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'sem_fotos', label: 'Sem Fotos' },
            { id: 'incompleto', label: 'Envio Incompleto' },
            { id: 'completo', label: 'Completo' },
            { id: 'aguardando_ia', label: 'Aguardando IA' },
            { id: 'revisao', label: 'Revisão Necessária' },
            { id: 'proximo', label: 'Certificação Próxima' },
            { id: 'encerrado', label: 'Encerrado' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer shrink-0 ${
                selectedFilter === f.id
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / Grid Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin mb-3" />
          <p className="text-xs text-slate-500 font-bold">Carregando painel de acompanhamento...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h3 className="text-sm font-black text-slate-800">Falha ao carregar tracker</h3>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
          <button 
            onClick={() => fetchTrackerData(false, appliedDateRange.start, appliedDateRange.end)} 
            className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl transition-all"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
          <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-3 animate-pulse" />
          <h3 className="text-sm font-black text-slate-800">Nenhum portal localizado</h3>
          <p className="text-xs text-slate-500 mt-1">Nenhum item corresponde aos critérios de pesquisa ou filtros aplicados no período.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-slate-400 text-[10px] uppercase font-black tracking-wide flex flex-col sm:flex-row sm:justify-between px-1 gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span>Resultados: {filteredData.length} avaliações localizadas</span>
              {appliedDateRange.start && appliedDateRange.end && (
                <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full normal-case text-[9px]">
                  • exibindo de {formatDateLocal(appliedDateRange.start)} até {formatDateLocal(appliedDateRange.end)}
                </span>
              )}
              {!appliedDateRange.start && (
                <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full normal-case text-[9px]">
                  • exibindo todo o período
                </span>
              )}
            </div>
            <span>Estabilidade da Rede: 100% OK</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredData.map((item) => {
              const isClosed = ['APROVADA', 'APROVADO', 'REPROVADA', 'REPROVADO', 'CANCELADA', 'CANCELADO', 'NO_SHOW', 'ENCERRADO_APROVADO', 'ENCERRADO_REPROVADO', 'ENCERRADO_CANCELADO', 'ENCERRADO_NOSHOW', 'EXPIRADO'].includes(String(item.statusAvaliacao).toUpperCase()) || !['LIBERADO', 'EM_ENVIO'].includes(String(item.portalStatus).toUpperCase());
              
              // Copy Portal URL link
              const directPortalUrl = `${window.location.origin}/portal-tecnico`;

              return (
                <div 
                  key={item.avaliacaoId}
                  className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 relative overflow-hidden transition-all hover:shadow-md ${
                    item.alertas.urgente48h ? 'border-amber-200 bg-amber-50/5' : 'border-slate-200'
                  }`}
                >
                  {/* Highlights Border */}
                  {item.alertas.zeroFotos && (
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" title="Sem fotos enviadas" />
                  )}
                  {item.alertas.urgente48h && !item.alertas.zeroFotos && (
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 animate-pulse" title="Certificação urgente" />
                  )}

                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="inline-block px-1.5 py-0.5 bg-red-50 text-claro-red text-[9px] font-black rounded uppercase border border-red-100 mb-1.5">
                        {item.certificacao}
                      </span>
                      <h3 className="text-sm font-black text-slate-900 truncate" title={item.tecnico}>{item.tecnico}</h3>
                      <p className="text-[10px] text-slate-500 font-bold">Login: <span className="font-mono text-slate-700">{item.login}</span></p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        isClosed 
                          ? 'bg-slate-100 text-slate-600 border-slate-200' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isClosed ? 'Encerrado' : 'Ativo / Liberado'}
                      </span>
                      <div className="text-[9px] font-black text-slate-400 mt-1.5">
                        Aval: <strong className="text-slate-600">{item.statusAvaliacao}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Highlights Alert Section */}
                  {(item.alertas.zeroFotos || item.alertas.urgente48h || item.alertas.stale24h || item.alertas.imagemRepetida) && (
                    <div className="bg-rose-50/40 border border-rose-100/60 p-3 rounded-xl space-y-1.5">
                      <span className="text-[9px] font-black text-rose-800 uppercase tracking-wider block">Destaques Críticos:</span>
                      
                      <div className="flex flex-col gap-1 text-[10px] font-medium">
                        {item.alertas.zeroFotos && (
                          <span className="text-rose-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-rose-600 rounded-full animate-ping shrink-0" />
                            <strong>Atenção:</strong> 0 fotos enviadas até o momento!
                          </span>
                        )}
                        {item.alertas.urgente48h && (
                          <span className="text-amber-700 flex items-center gap-1">
                            <Clock size={11} className="text-amber-500 shrink-0" />
                            <strong>Urgente:</strong> Certificação em menos de 48 horas! ({new Date(item.dataAvaliacao).toLocaleDateString('pt-BR')})
                          </span>
                        )}
                        {item.alertas.stale24h && (
                          <span className="text-slate-600 flex items-center gap-1">
                            <AlertTriangle size={11} className="text-slate-400 shrink-0" />
                            <strong>Ocioso:</strong> Sem novas atualizações por mais de 24 horas.
                          </span>
                        )}
                        {item.alertas.imagemRepetida && (
                          <span className="text-red-700 flex items-center gap-1">
                            <AlertCircle size={11} className="text-red-600 shrink-0" />
                            <strong>Alerta Duplicado:</strong> {item.repeatedCount} imagens repetidas detectadas pela IA!
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Information Details Row */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Envio de Fotos:</span>
                      <strong className={`text-xs ${item.fotosEnviadas >= item.fotosEsperadas && item.fotosEsperadas > 0 ? 'text-emerald-600 font-black' : 'text-slate-700 font-bold'}`}>
                        {item.fotosEnviadas} de {item.fotosEsperadas} fotos
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Prazo / Expiração:</span>
                      <strong className="text-slate-700 font-bold flex items-center gap-1">
                        {item.prazo ? new Date(item.prazo).toLocaleDateString('pt-BR') : 'Sem limite'}
                        {item.prazo && (
                          <span className="text-[10px] text-slate-400">({item.diasRestantes}d restantes)</span>
                        )}
                      </strong>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Última Atividade:</span>
                      <strong className="text-slate-600 font-medium">
                        {item.ultimaAtividade ? (
                          `${new Date(item.ultimaAtividade).toLocaleDateString('pt-BR')} ${new Date(item.ultimaAtividade).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`
                        ) : (
                          'Nenhuma registrada'
                        )}
                      </strong>
                    </div>
                  </div>

                  {/* IA Feedback Status badge */}
                  <div className="flex items-center justify-between text-[11px] p-2 bg-slate-50 border border-slate-150/60 rounded-xl">
                    <span className="text-slate-500 font-medium">Auditoria Geral IA:</span>
                    <span className={`font-black uppercase flex items-center gap-1 ${
                      item.statusIa === 'COMPLETO_APROVADO' 
                        ? 'text-emerald-700' 
                        : item.statusIa === 'REVISAO_NECESSARIA'
                        ? 'text-red-700 font-extrabold'
                        : item.statusIa === 'AGUARDANDO_IA'
                        ? 'text-blue-700'
                        : 'text-slate-500'
                    }`}>
                      {item.statusIa === 'COMPLETO_APROVADO' && <CheckCircle size={11} />}
                      {item.statusIa === 'REVISAO_NECESSARIA' && <AlertTriangle size={11} />}
                      {item.statusIa.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                    {/* Share fixed access link instruction */}
                    <div className="flex-1 flex gap-1 items-center">
                      <input
                        type="text"
                        readOnly
                        value={directPortalUrl}
                        className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg font-mono text-[9px] text-slate-500 outline-none"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(directPortalUrl);
                          showToast('Link do portal copiado!', 'success');
                        }}
                        className="p-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg cursor-pointer"
                        title="Copiar link único do portal técnico"
                      >
                        <Copy size={12} />
                      </button>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      {/* Live view test */}
                      <a
                        href="/portal-tecnico"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <span>Acessar</span>
                        <ExternalLink size={10} />
                      </a>

                      {/* Lock / Unlock portal actions */}
                      {actionLoading === item.avaliacaoId ? (
                        <button disabled className="py-1 px-3 bg-slate-100 text-slate-400 rounded-lg text-[11px] font-bold flex items-center justify-center">
                          <Loader2 size={11} className="animate-spin" />
                        </button>
                      ) : isClosed ? (
                        <button
                          onClick={() => handlePortalAction(item.avaliacaoId, 'reopen')}
                          className="py-1 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Unlock size={10} />
                          Reabrir Portal
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePortalAction(item.avaliacaoId, 'close')}
                          className="py-1 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Lock size={10} />
                          Bloquear Uploads
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

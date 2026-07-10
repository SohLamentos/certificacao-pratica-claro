import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Upload, 
  Camera, 
  Video, 
  Clock, 
  User, 
  MapPin, 
  Building, 
  Calendar, 
  Cpu, 
  Sparkles, 
  HelpCircle, 
  ChevronRight, 
  ShieldCheck, 
  MessageSquare,
  History,
  FileText,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Smartphone,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Avaliacao, AvaliacaoStatus } from '../types';
import { apiFetch } from '../lib/api';
import IAEvidenceUploader from './IAEvidenceUploader';

interface CertificacaoIAViewProps {
  evaluation: Avaliacao;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

interface Evidence {
  id: string | number;
  certificacao_id: string | number;
  etapa: string;
  tipo_arquivo: string;
  url_arquivo?: string;
  arquivo_url?: string;
  status_ia: string;
  resultado_ia: string;
  confianca_ia: number;
  justificativa_ia: string;
  decisao_cq: 'APROVADO' | 'REPROVADO' | 'REQUISITAR_NOVA' | null;
  observacao_cq: string;
  created_at: string;
  updated_at: string;
  tamanho_original?: number;
  tamanho_final?: number;
  largura?: number;
  altura?: number;
  ia_hash_arquivo?: string;
  ia_modelo?: string;
  ia_custo_estimado?: number;
  ia_analisado_em?: string;
  ia_origem?: string;
  imagem_repetida?: number | boolean;
  imagem_repetida_alerta?: string;
  imagem_repetida_certificacao_id?: string;
  imagem_repetida_tecnico_id?: string;
  risco_reuso?: string;
}

interface AuditLog {
  id: string | number;
  certificacao_id: string | number;
  evidencia_id: string | number;
  acao: string;
  payload: string;
  usuario_id: string;
  created_at: string;
}

const MANDATORY_STAGES = [
  "Identificação do técnico",
  "Evidência da instalação física",
  "Evidência da ONT/equipamento",
  "Evidência dos níveis de sinal",
  "Evidência do Wi-Fi configurado",
  "Evidência de organização/acabamento",
  "Evidência final com cliente/local"
];

export default function CertificacaoIAView({ 
  evaluation, 
  onBack, 
  onRefresh, 
  showToast 
}: CertificacaoIAViewProps) {
  
  const [evidencias, setEvidencias] = useState<Evidence[]>([]);
  const [auditorias, setAuditorias] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<string>(MANDATORY_STAGES[0]);
  
  // Form states for CQ decision
  const [decisaoCq, setDecisaoCq] = useState<'APROVADO' | 'REPROVADO' | 'REQUISITAR_NOVA' | ''>('');
  const [observacaoCq, setObservacaoCq] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Human feedback learning states
  const [usarFeedback, setUsarFeedback] = useState(true);
  const [motivoDivergencia, setMotivoDivergencia] = useState('');

  // Portal de Evidências do Técnico states
  const [portalData, setPortalData] = useState<any>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [updatingPortal, setUpdatingPortal] = useState(false);

  const fetchPortalDetails = async () => {
    setLoadingPortal(true);
    try {
      const res = await apiFetch(`/api/evidencias/portal?avaliacaoId=${evaluation.id}`);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setPortalData(data.portal);
        }
      }
    } catch (err) {
      console.error("Error fetching portal details:", err);
    } finally {
      setLoadingPortal(false);
    }
  };

  const handlePortalAction = async (action: 'reopen' | 'close') => {
    setUpdatingPortal(true);
    try {
      const res = await apiFetch('/api/evidencias/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avaliacaoId: evaluation.id,
          action,
          expiraEmDays: 3,
          reabertoPor: localStorage.getItem('claro_cq_selecionado') ? JSON.parse(localStorage.getItem('claro_cq_selecionado') || '{}').nome : 'CQ/Analista'
        })
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          showToast(action === 'reopen' ? 'Portal reaberto com sucesso!' : 'Portal encerrado com sucesso!', 'success');
          await fetchPortalDetails();
        } else {
          showToast(data.error || 'Erro na alteração do portal', 'error');
        }
      } else {
        showToast('Falha na requisição ao servidor', 'error');
      }
    } catch (err) {
      showToast('Erro ao atualizar portal', 'error');
    } finally {
      setUpdatingPortal(false);
    }
  };

  const handleAnalyzeIA = async () => {
    if (!activeEvidence || !activeEvidence.id) return;
    setIsAnalyzing(true);
    try {
      const profile = localStorage.getItem('claro_cq_profile') || 'tecnico';
      let user_id = 'tecnico-user';
      let user_nome = 'Técnico';

      if (profile === 'cq') {
        const saved = localStorage.getItem('claro_cq_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      } else if (profile === 'analista') {
        const saved = localStorage.getItem('claro_analista_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      } else {
        const saved = localStorage.getItem('claro_tecnico_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      }

      let response = await apiFetch('/api/ia/evidencias/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidencia_id: activeEvidence.id,
          usuario_id: user_id,
          perfil_usuario: profile,
          usuario_nome: user_nome
        })
      });
      let resData = await response.json() as any;

      if (response.ok && resData.requires_confirmation) {
        // Exibir confirmação
        const confirmed = window.confirm("Esta análise pode consumir créditos de IA. Deseja continuar?");
        if (!confirmed) {
          showToast('Análise cancelada pelo usuário.', 'info');
          setIsAnalyzing(false);
          return;
        }

        // Refazer chamada com confirmado_pago = true
        response = await apiFetch('/api/ia/evidencias/analisar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evidencia_id: activeEvidence.id,
            confirmado_pago: true,
            usuario_id: user_id,
            perfil_usuario: profile,
            usuario_nome: user_nome
          })
        });
        resData = await response.json() as any;
      }

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Falha ao analisar com IA.');
      }

      showToast(resData.reused ? 'Análise recuperada de cache (Custo Zero)!' : 'Análise realizada com sucesso pela IA!', 'success');
      await fetchEvidenciasData();
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Erro ao executar análise IA.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchEvidenciasData = async () => {
    try {
      const res = await apiFetch(`/api/ia/evidencias?certificacao_id=${evaluation.id}`);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          setEvidencias(data.evidencias || []);
          setAuditorias(data.auditoria || []);
        }
      }
    } catch (err) {
      console.error('Error fetching evidence data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchEvidenciasData();
    fetchPortalDetails();
  }, [evaluation.id]);

  // Handle active stage change to prefill current CQ decisions
  const activeEvidence = evidencias.find(e => e.etapa === activeStage);
  
  const iaApprovedLive = activeEvidence?.resultado_ia === 'APROVADO' || activeEvidence?.status_ia === 'APROVADO_IA' || activeEvidence?.status_ia === 'CONFORME';
  const iaReprovedLive = activeEvidence?.resultado_ia === 'REPROVADO' || activeEvidence?.status_ia === 'REPROVADO_IA' || activeEvidence?.status_ia === 'NAO_CONFORME';
  const isDivergentLive = activeEvidence && decisaoCq && (
    (iaApprovedLive && (decisaoCq === 'REPROVADO' || decisaoCq === 'REQUISITAR_NOVA')) ||
    (iaReprovedLive && decisaoCq === 'APROVADO')
  );

  useEffect(() => {
    if (activeEvidence) {
      setDecisaoCq(activeEvidence.decisao_cq || '');
      setObservacaoCq(activeEvidence.observacao_cq || '');
    } else {
      setDecisaoCq('');
      setObservacaoCq('');
    }
    setMotivoDivergencia('');
    setUsarFeedback(true);
  }, [activeStage, activeEvidence]);

  const handleSaveDecision = async () => {
    if (!activeEvidence) {
      showToast('Nenhuma evidência enviada para esta etapa ainda.', 'error');
      return;
    }
    if (!decisaoCq) {
      showToast('Selecione uma decisão válida para salvar.', 'error');
      return;
    }

    // Require CQ observation if risk is ALTO or CRITICO and they try to approve
    if (decisaoCq === 'APROVADO' && (activeEvidence.risco_reuso === 'ALTO' || activeEvidence.risco_reuso === 'CRITICO')) {
      if (!observacaoCq || observacaoCq.trim() === '') {
        showToast('Observação obrigatória para itens aprovados com risco ALTO ou CRÍTICO.', 'error');
        return;
      }
    }

    const iaApproved = activeEvidence.resultado_ia === 'APROVADO' || activeEvidence.status_ia === 'APROVADO_IA' || activeEvidence.status_ia === 'CONFORME';
    const iaReproved = activeEvidence.resultado_ia === 'REPROVADO' || activeEvidence.status_ia === 'REPROVADO_IA' || activeEvidence.status_ia === 'NAO_CONFORME';
    const isDivergent = (iaApproved && (decisaoCq === 'REPROVADO' || decisaoCq === 'REQUISITAR_NOVA')) || (iaReproved && decisaoCq === 'APROVADO');

    if (isDivergent && usarFeedback) {
      if (!motivoDivergencia.trim()) {
        showToast('Por favor, informe o motivo da divergência para treinar a IA.', 'error');
        return;
      }
    }

    setSavingDecision(true);
    try {
      const profile = localStorage.getItem('claro_cq_profile') || 'tecnico';
      let user_id = 'tecnico-user';
      let user_nome = 'Técnico';

      if (profile === 'cq') {
        const saved = localStorage.getItem('claro_cq_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      } else if (profile === 'analista') {
        const saved = localStorage.getItem('claro_analista_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      } else {
        const saved = localStorage.getItem('claro_tecnico_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
            user_nome = u.nome || user_nome;
          } catch (e) {}
        }
      }

      const payload = {
        id: activeEvidence.id,
        certificacao_id: evaluation.id,
        etapa: activeStage,
        is_cq_decision: true,
        decisao_cq: decisaoCq,
        observacao_cq: observacaoCq,
        usuario_id: user_id,
        perfil_usuario: profile,
        usuario_nome: user_nome
      };

      const res = await apiFetch('/api/ia/evidencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Save learning feedback if divergent and checked
        if (isDivergent && usarFeedback) {
          try {
            const fbPayload = {
              evidencia_id: activeEvidence.id,
              etapa: activeStage,
              resultado_original_ia: `Resultado: ${activeEvidence.resultado_ia || activeEvidence.status_ia}. Justificativa: ${activeEvidence.justificativa_ia || 'N/A'}`,
              resultado_final_cq: decisaoCq,
              motivo_divergencia: motivoDivergencia,
              usar_como_exemplo: 1,
              usuario_id: user_id,
              perfil_usuario: profile
            };

            await apiFetch('/api/ia/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fbPayload)
            });
          } catch (fbErr) {
            console.error('Failed to save learning feedback:', fbErr);
          }
        }

        showToast('Decisão do CQ salva com sucesso!', 'success');
        setMotivoDivergencia('');
        await fetchEvidenciasData();
        await onRefresh();
      } else {
        showToast('Erro ao salvar decisão no servidor.', 'error');
      }
    } catch (err) {
      console.error('Failed to save CQ decision:', err);
      showToast('Erro de rede ao salvar decisão.', 'error');
    } finally {
      setSavingDecision(false);
    }
  };

  // Helper to format date relative or clean
  const formatDateStr = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  // Helper to check if there is a divergence between IA suggestion and CQ decision
  const checkDivergence = (ev: Evidence) => {
    if (!ev.decisao_cq) return false;
    const iaApproved = ev.resultado_ia === 'APROVADO' || ev.status_ia === 'APROVADO_IA' || ev.status_ia === 'CONFORME';
    const iaReproved = ev.resultado_ia === 'REPROVADO' || ev.status_ia === 'REPROVADO_IA' || ev.status_ia === 'NAO_CONFORME';
    
    if (iaApproved && (ev.decisao_cq === 'REPROVADO' || ev.decisao_cq === 'REQUISITAR_NOVA')) return true;
    if (iaReproved && ev.decisao_cq === 'APROVADO') return true;
    return false;
  };

  // Render evaluation status badge beautifully
  const renderStatusBadge = (status: AvaliacaoStatus) => {
    switch (status) {
      case 'AGENDADA':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"><Clock size={12} /> Agendada</span>;
      case 'EM_ANDAMENTO':
      case 'EM ANDAMENTO':
        return <span className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"><Sparkles className="animate-spin text-amber-600" size={12} /> Em Progresso</span>;
      case 'AGUARDANDO_REVISAO_CQ':
      case 'FINALIZADA':
        return <span className="bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"><AlertCircle size={12} /> Revisão CQ Pendente</span>;
      case 'APROVADA':
      case 'Concluída':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"><CheckCircle size={12} /> Aprovada</span>;
      case 'REPROVADA':
        return <span className="bg-rose-100 text-rose-800 border border-rose-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5"><XCircle size={12} /> Reprovada</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 border border-slate-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">{status}</span>;
    }
  };

  const getIaStatusColor = (status: string) => {
    switch (status) {
      case 'CONFORME': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'NAO_CONFORME': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'REVISAO_HUMANA': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'EM_ANALISE': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header Navigation bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-claro-border shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-2xl hover:bg-slate-100 border border-slate-100 transition-colors cursor-pointer text-slate-600"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-100 text-claro-red text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded">IA ASSISTIDA</span>
              <h1 className="text-lg font-black text-slate-800 tracking-tight">
                Certificação Assistida por IA
              </h1>
            </div>
            <p className="text-slate-500 text-xs">
              Envio e análise de evidências fotográficas e de vídeo com verificação automatizada.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {renderStatusBadge(evaluation.status as any)}
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metadata Header & Audit Trails */}
        <div className="space-y-6 lg:col-span-1">
          {/* Header metadata card */}
          <div className="bg-white rounded-3xl border border-claro-border p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Dados do Técnico & Agendamento</h3>
            
            <div className="grid grid-cols-1 gap-3.5 text-xs">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
                <User size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-slate-500 font-medium">Colaborador Avaliado</p>
                  <strong className="text-slate-800 text-sm font-extrabold">{evaluation.nomeTecnico}</strong>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">Matrícula: {evaluation.matricula}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
                <Building size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-slate-500 font-medium">Empresa & Base</p>
                  <strong className="text-slate-800 font-bold">{evaluation.empresa}</strong>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium mt-0.5">
                    <MapPin size={10} /> {evaluation.cidadeBase}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
                <Cpu size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-slate-500 font-medium">Tipo de Certificação</p>
                  <strong className="text-claro-red font-black text-sm">{evaluation.tipoCertificacao}</strong>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">Avaliador Resp: {evaluation.nomeCQ}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
                <Calendar size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-slate-500 font-medium">Data Agendada</p>
                  <strong className="text-slate-800 font-bold">{formatDateStr(evaluation.data)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Portal de Evidências do Técnico Panel */}
          <div className="bg-white rounded-3xl border border-claro-border p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={14} className="text-claro-red" /> Portal do Técnico
              </h3>
              {portalData && (
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                  portalData.status === 'LIBERADO' || portalData.status === 'EM_ENVIO'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {portalData.status.replace('_', ' ')}
                </span>
              )}
            </div>

            {loadingPortal ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
              </div>
            ) : portalData ? (
              <div className="space-y-4 text-xs">
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Permite ao técnico de campo enviar as evidências de forma antecipada pelo celular.
                </p>

                {/* Link display and copy */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold block">Link de Acesso Único:</span>
                  <div className="flex gap-1.5">
                    <input 
                      type="text" 
                      readOnly 
                      value={portalData.portalUrl} 
                      className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg font-mono text-[10px] text-slate-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(portalData.portalUrl);
                        showToast('Link copiado para a área de transferência!', 'success');
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg shrink-0 cursor-pointer transition-colors"
                      title="Copiar Link"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={portalData.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-center flex items-center justify-center gap-1.5 border border-slate-200 transition-colors text-xs"
                  >
                    <span>Testar</span>
                    <ExternalLink size={12} />
                  </a>

                  {updatingPortal ? (
                    <button disabled className="flex-1 py-2 px-3 bg-slate-100 text-slate-400 font-bold rounded-xl flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </button>
                  ) : portalData.status === 'LIBERADO' || portalData.status === 'EM_ENVIO' ? (
                    <button
                      type="button"
                      onClick={() => handlePortalAction('close')}
                      className="flex-1 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-100 transition-colors cursor-pointer text-xs"
                    >
                      Bloquear
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePortalAction('reopen')}
                      className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl border border-emerald-100 transition-colors cursor-pointer text-xs"
                    >
                      Reabrir
                    </button>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 space-y-1 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/60">
                  <div className="flex justify-between">
                    <span>Expira em:</span>
                    <strong className="text-slate-600 font-bold">{new Date(portalData.expiraEm).toLocaleDateString('pt-BR')}</strong>
                  </div>
                  {portalData.ultimoAcessoEm && (
                    <div className="flex justify-between">
                      <span>Último acesso:</span>
                      <strong className="text-slate-600 font-bold">{new Date(portalData.ultimoAcessoEm).toLocaleDateString('pt-BR')} às {new Date(portalData.ultimoAcessoEm).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Nenhum dado do portal localizado.</p>
            )}
          </div>

          {/* Audit Trail Timeline */}
          <div className="bg-white rounded-3xl border border-claro-border p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <History size={14} /> Histórico de Auditoria
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black">{auditorias.length} logs</span>
            </div>

            <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
              {auditorias.length === 0 ? (
                <div className="text-center py-6 text-slate-400 space-y-1.5">
                  <Clock size={20} className="mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">Nenhuma atividade registrada.</p>
                </div>
              ) : (
                auditorias.map((log) => {
                  let payloadObj: any = {};
                  try { payloadObj = JSON.parse(log.payload); } catch {}
                  
                  return (
                    <div key={log.id} className="relative pl-5 border-l-2 border-slate-100 last:border-0 pb-3">
                      <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-slate-300"></div>
                      <div className="text-[11px]">
                        <div className="flex items-center justify-between text-slate-400 font-bold">
                          <span>{log.usuario_id}</span>
                          <span>{formatDateStr(log.created_at).split(' ')[1] || log.created_at.substring(11, 16)}</span>
                        </div>
                        <p className="text-slate-700 font-semibold mt-0.5">
                          {log.acao === 'UPLOAD_EVIDENCIA' ? (
                            <span className="text-blue-600">Enviou evidência de "{payloadObj.etapa}" ({payloadObj.tipo_arquivo})</span>
                          ) : (
                            <span className="text-purple-600">CQ decidiu: {payloadObj.decisao_cq} em "{payloadObj.etapa}"</span>
                          )}
                        </p>
                        {payloadObj.observacao_cq && (
                          <p className="text-slate-400 italic text-[10px] mt-0.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                            Obs: "{payloadObj.observacao_cq}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Columns: Evidence Steps List & Details view */}
        <div className="space-y-6 lg:col-span-2">
          {/* Evidências da Certificação Box */}
          <div className="bg-white rounded-3xl border border-claro-border p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-md font-extrabold text-slate-800 tracking-tight">
                  Evidências da Certificação
                </h2>
                <p className="text-xs text-slate-500">
                  A certificação exige 7 evidências de conformidade técnica para análise da IA e do CQ.
                </p>
              </div>
              <div className="text-right text-xs">
                <span className="font-extrabold text-claro-red">
                  {evidencias.length} de 7
                </span>
                <span className="text-slate-400"> enviadas</span>
              </div>
            </div>

            {/* Stages Grid / Horizontal selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {MANDATORY_STAGES.map((stage, idx) => {
                const ev = evidencias.find(e => e.etapa === stage);
                const isSelected = activeStage === stage;
                
                let iconColor = 'text-slate-400 bg-slate-100';
                let borderStyle = 'border-slate-100';
                
                if (ev) {
                  if (ev.decisao_cq === 'APROVADO') {
                    iconColor = 'bg-emerald-100 text-emerald-600';
                    borderStyle = 'border-emerald-200 bg-emerald-50/20';
                  } else if (ev.decisao_cq === 'REPROVADO') {
                    iconColor = 'bg-rose-100 text-rose-600';
                    borderStyle = 'border-rose-200 bg-rose-50/20';
                  } else if (ev.decisao_cq === 'REQUISITAR_NOVA') {
                    iconColor = 'bg-amber-100 text-amber-600';
                    borderStyle = 'border-amber-200 bg-amber-50/20';
                  } else {
                    iconColor = 'bg-blue-100 text-blue-600';
                    borderStyle = 'border-blue-200 bg-blue-50/20';
                  }
                }

                if (isSelected) {
                  borderStyle += ' ring-2 ring-red-500/10 border-claro-red bg-red-50/10';
                }

                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setActiveStage(stage)}
                    className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${borderStyle}`}
                  >
                    <div className={`p-1.5 rounded-xl text-xs font-black ${iconColor}`}>
                      {ev ? (
                        ev.decisao_cq === 'APROVADO' ? <CheckCircle size={14} /> :
                        ev.decisao_cq === 'REPROVADO' ? <XCircle size={14} /> :
                        ev.decisao_cq === 'REQUISITAR_NOVA' ? <AlertTriangle size={14} /> : <FileText size={14} />
                      ) : idx + 1}
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">
                        {stage}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {ev ? (ev.decisao_cq || 'Enviado') : 'Pendente'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Stage Detail/Actions Box */}
            <div className="bg-slate-50/70 border border-slate-100 p-5 rounded-2xl space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Etapa Selecionada</h4>
                  <strong className="text-sm font-extrabold text-slate-800">{activeStage}</strong>
                </div>
              </div>

              {/* Display of Uploaded Evidence details */}
              {activeEvidence ? (
                <div className="space-y-5">
                  <IAEvidenceUploader
                    key={activeStage}
                    certificacaoId={evaluation.id}
                    etapa={activeStage}
                    existingEvidence={activeEvidence}
                    onUploadSuccess={async () => {
                      await fetchEvidenciasData();
                      await onRefresh();
                    }}
                    onDeleteSuccess={async () => {
                      await fetchEvidenciasData();
                      await onRefresh();
                    }}
                    showToast={showToast}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    {/* Left Column: Image preview */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Visualização Ampliada</p>
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm aspect-video bg-black flex items-center justify-center">
                        <img 
                          src={activeEvidence.url_arquivo || activeEvidence.arquivo_url} 
                          alt={activeEvidence.etapa} 
                          referrerPolicy="no-referrer"
                          className="object-cover w-full h-full"
                        />
                        <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white font-mono">
                          {activeEvidence.tipo_arquivo.toUpperCase()}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium px-1">
                        <span>Enviado: {formatDateStr(activeEvidence.created_at)}</span>
                      </div>

                      {/* LGPD & Retention Transparency Footer */}
                      <div className="mt-4 bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 flex items-start gap-2.5 text-[10px] text-slate-500 leading-relaxed shadow-sm">
                        <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-700 block font-semibold mb-0.5">Políticas de Privacidade &amp; LGPD (Auditoria Cega)</strong>
                          Esta imagem técnica é protegida por anonimização e armazenada exclusivamente para fins de auditoria de qualidade. Por conformidade com a LGPD e políticas de privacidade, esta evidência será <strong>excluída permanentemente</strong> e de forma automática do servidor de arquivos após o prazo máximo de <strong>30 dias</strong> após o encerramento desta avaliação.
                        </div>
                      </div>
                    </div>

                    {/* Right Column: IA Analysis & CQ decisions */}
                    <div className="space-y-4">
                      {/* IA Analysis Results Box */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Cpu size={12} className="text-slate-400" /> Inteligência Artificial
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${getIaStatusColor(activeEvidence.status_ia)}`}>
                            {activeEvidence.status_ia.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Cost, cache and fraud risk badges */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {activeEvidence.ia_origem === 'AUTOMATICA' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              IA Automática Gratuita
                            </span>
                          )}
                          {activeEvidence.ia_origem === 'MANUAL' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                              IA Manual
                            </span>
                          )}
                          {activeEvidence.ia_origem === 'CACHE' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                              Análise Reaproveitada
                            </span>
                          )}
                          {(activeEvidence.imagem_repetida === 1 || activeEvidence.imagem_repetida === true) && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Imagem Repetida
                            </span>
                          )}
                          {(activeEvidence.risco_reuso === 'ALTO' || activeEvidence.risco_reuso === 'CRITICO') && (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border animate-pulse ${
                              activeEvidence.risco_reuso === 'CRITICO' 
                                ? 'bg-red-50 text-red-700 border-red-200' 
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              Risco {activeEvidence.risco_reuso}
                            </span>
                          )}
                        </div>

                        {/* Visual warning for duplicate images */}
                        {(activeEvidence.imagem_repetida === 1 || activeEvidence.imagem_repetida === true) && (
                          <div className={`p-3 rounded-xl border flex items-start gap-2 ${
                            activeEvidence.risco_reuso === 'CRITICO' 
                              ? 'bg-red-50/60 border-red-200 text-red-800' 
                              : activeEvidence.risco_reuso === 'ALTO'
                                ? 'bg-rose-50/60 border-rose-200 text-rose-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}>
                            <ShieldAlert size={16} className={`flex-shrink-0 mt-0.5 ${
                              activeEvidence.risco_reuso === 'CRITICO' 
                                ? 'text-red-600' 
                                : activeEvidence.risco_reuso === 'ALTO'
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                            }`} />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold">
                                {activeEvidence.risco_reuso === 'CRITICO' 
                                  ? 'Risco Crítico de Reuso / Possível Fraude' 
                                  : activeEvidence.risco_reuso === 'ALTO'
                                    ? 'Risco Alto de Reuso / Possível Fraude'
                                    : 'Aviso: Imagem Repetida'}
                              </p>
                              <p className="text-[10px] leading-relaxed">
                                {activeEvidence.imagem_repetida_alerta || 'Atenção: esta imagem já foi usada em outra certificação/técnico.'}
                              </p>
                            </div>
                          </div>
                        )}

                        {activeEvidence.status_ia === 'PENDENTE' ? (
                          <div className="py-2 space-y-3">
                            <p className="text-slate-500 text-xs">
                              A Inteligência Artificial não analisou este item automaticamente para conter custos. Clique no botão abaixo para rodar a auditoria inteligente.
                            </p>
                            <button
                              type="button"
                              onClick={handleAnalyzeIA}
                              disabled={isAnalyzing}
                              className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 size={14} className="animate-spin text-white" />
                                  <span>Analisando com IA...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} className="text-white animate-pulse" />
                                  <span>Analisar com IA</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <p className="text-slate-700 font-bold text-xs">{activeEvidence.resultado_ia}</p>
                              <p className="text-slate-500 text-xs leading-snug">{activeEvidence.justificativa_ia}</p>
                            </div>

                            {activeEvidence.confianca_ia !== null && activeEvidence.confianca_ia !== undefined && (() => {
                              const pct = Math.round(activeEvidence.confianca_ia * 100 > 100 ? activeEvidence.confianca_ia : activeEvidence.confianca_ia * 100);
                              let classification = { text: 'Alta Confiança', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
                              if (pct < 50) {
                                classification = { text: 'Revisão Obrigatória', color: 'bg-rose-100 text-rose-800 border-rose-200 font-bold' };
                              } else if (pct < 70) {
                                classification = { text: 'Baixa Confiança', color: 'bg-orange-50 text-orange-700 border-orange-100' };
                              } else if (pct < 90) {
                                classification = { text: 'Média Confiança', color: 'bg-amber-50 text-amber-700 border-amber-100' };
                              }
                              return (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400 font-bold">Nível de Confiança:</span>
                                    <span className={`px-1.5 py-0.5 rounded border text-[9px] ${classification.color}`}>
                                      {classification.text}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-grow bg-slate-100 h-2 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${pct < 50 ? 'bg-rose-500' : pct < 70 ? 'bg-orange-500' : pct < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                                        style={{ width: `${pct}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500">
                                      {pct}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Additional technical audit fields */}
                            <div className="border-t border-slate-100 pt-2 mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono text-slate-400">
                              <div>
                                <span className="text-slate-500 font-bold">Modelo:</span> {activeEvidence.ia_modelo || 'N/A'}
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold">Custo:</span> {activeEvidence.ia_custo_estimado !== undefined ? `US$ ${activeEvidence.ia_custo_estimado.toFixed(4)}` : 'US$ 0.0000'}
                              </div>
                              <div className="col-span-2 truncate">
                                <span className="text-slate-500 font-bold">Hash:</span> {activeEvidence.ia_hash_arquivo || 'N/A'}
                              </div>
                              {activeEvidence.ia_analisado_em && (
                                <div className="col-span-2">
                                  <span className="text-slate-500 font-bold">Analisado em:</span> {new Date(activeEvidence.ia_analisado_em).toLocaleString('pt-BR')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CQ Evaluation Box */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck size={12} className="text-slate-400" /> Decisão do CQ / Analista
                          </span>
                          {activeEvidence.decisao_cq && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                              activeEvidence.decisao_cq === 'APROVADO' ? 'bg-emerald-100 text-emerald-800' :
                              activeEvidence.decisao_cq === 'REPROVADO' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {activeEvidence.decisao_cq}
                            </span>
                          )}
                        </div>

                        {/* Divergence alert */}
                        {checkDivergence(activeEvidence) && (
                          <div className="flex items-start gap-1.5 p-2 bg-red-50 border border-red-200 text-red-800 rounded-xl text-[10px] font-bold leading-tight">
                            <AlertTriangle size={12} className="text-claro-red mt-0.5 flex-shrink-0" />
                            <div>
                              DIVERGÊNCIA CQ VS IA DETECTADA
                              <p className="font-normal text-[9px] text-red-600 mt-0.5">A Inteligência Artificial sugeriu {activeEvidence.status_ia} mas o CQ avaliou de forma diferente.</p>
                            </div>
                          </div>
                        )}

                        {/* CQ Options */}
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { id: 'APROVADO', label: 'Aprovar', color: 'border-emerald-200 hover:bg-emerald-50/50 text-emerald-700', activeColor: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/10' },
                              { id: 'REPROVADO', label: 'Reprovar', color: 'border-rose-200 hover:bg-rose-50/50 text-rose-700', activeColor: 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/10' },
                              { id: 'REQUISITAR_NOVA', label: 'Nova Evid.', color: 'border-amber-200 hover:bg-amber-50/50 text-amber-700', activeColor: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/10' }
                            ].map((opt) => {
                              const isSel = decisaoCq === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setDecisaoCq(opt.id as any)}
                                  className={`py-1.5 border rounded-xl text-[11px] font-bold text-center cursor-pointer transition-all ${
                                    isSel ? opt.activeColor : opt.color + ' bg-white'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <MessageSquare size={10} /> Observação do CQ
                            </label>
                            <textarea
                              value={observacaoCq}
                              onChange={(e) => setObservacaoCq(e.target.value)}
                              placeholder="Adicione uma justificativa ou observação técnica sobre o item..."
                              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 min-h-[60px]"
                            />
                          </div>

                          {isDivergentLive && (
                            <div className="p-3 bg-violet-50/70 border border-violet-100 rounded-2xl space-y-2.5">
                              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-violet-800">
                                <Sparkles size={12} className="text-violet-600 animate-pulse" />
                                APRENDIZADO ASSISTIDO POR IA
                              </div>
                              <p className="text-[10px] text-violet-600 leading-relaxed font-medium">
                                Você divergiu da recomendação da IA. Salvar esta correção ajuda a treinar a Inteligência Artificial e melhora futuras análises desta etapa ("{activeStage}").
                              </p>
                              
                              <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                                <input
                                  type="checkbox"
                                  checked={usarFeedback}
                                  onChange={(e) => setUsarFeedback(e.target.checked)}
                                  className="rounded border-violet-300 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5"
                                />
                                <span className="text-[10px] font-black text-violet-700 uppercase tracking-wider">Usar como exemplo futuro</span>
                              </label>

                              {usarFeedback && (
                                <div className="space-y-1 pt-0.5">
                                  <span className="text-[9px] font-bold text-violet-500 uppercase tracking-wider block">
                                    Motivo da divergência (Obrigatório)
                                  </span>
                                  <textarea
                                    value={motivoDivergencia}
                                    onChange={(e) => setMotivoDivergencia(e.target.value)}
                                    placeholder="Explique por que a IA errou para que o modelo aprenda com o seu feedback técnico..."
                                    className="w-full text-xs p-2 bg-white border border-violet-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-400 min-h-[50px] placeholder-violet-300 text-violet-900"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleSaveDecision}
                            disabled={savingDecision || !decisaoCq}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider"
                          >
                            {savingDecision ? 'Salvando...' : 'Gravar Decisão'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <IAEvidenceUploader
                  key={activeStage}
                  certificacaoId={evaluation.id}
                  etapa={activeStage}
                  onUploadSuccess={async () => {
                    await fetchEvidenciasData();
                    await onRefresh();
                  }}
                  onDeleteSuccess={async () => {
                    await fetchEvidenciasData();
                    await onRefresh();
                  }}
                  showToast={showToast}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Save, 
  X, 
  HelpCircle,
  Sparkles,
  Info,
  Filter,
  BarChart2,
  TrendingUp,
  DollarSign,
  History,
  FileText,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface IARule {
  id: string;
  tipo_certificacao: string | null;
  categoria?: string | null;
  checklist_item?: string | null;
  titulo: string;
  descricao: string | null;
  regra?: string | null; // criteria in knowledge_base
  prioridade?: number; // weight/priority in knowledge_base
  ativo: number | boolean;
  criado_por?: string;
  atualizado_por?: string;
  created_at?: string;
  updated_at?: string;
  // Fallbacks for compatibility with ia_regras_itens
  etapa?: string;
  criterios_conformidade?: string | null;
  criterios_nao_conformidade?: string | null;
  exemplos_conformes?: string | null;
  exemplos_nao_conformes?: string | null;
  peso?: number;
}

interface RuleVersion {
  id: string;
  knowledge_id: string;
  versao: number;
  alteracao: string;
  usuario: string;
  created_at: string;
}

interface Certificacao {
  id: number | string;
  nome: string;
}

interface DashboardMetrics {
  metrics: {
    total: number;
    confirmations: number;
    corrections: number;
    accuracy: number;
    avgConfidence: number;
  };
  confidenceStats: {
    high: number;
    medium: number;
    low: number;
    review: number;
  };
  financials: {
    estimatedHumanCost: number;
    actualIaCostBRL: number;
    actualIaCostUSD: number;
    netSavings: number;
    roi: number;
  };
  divergencesByStage: Array<{
    etapa: string;
    corrections: number;
  }>;
  suggestions: Array<{
    id: string;
    checklist_item: string;
    mensagem: string;
    status: string;
    created_at: string;
  }>;
  recentHistory: Array<{
    id: string;
    modelo: string;
    confidence: number;
    resultado: string;
    tempo_processamento: number;
    certificacao: string;
    checklist: string;
    cq_confirmou: number;
    cq_corrigiu: number;
    created_at: string;
  }>;
}

const ETAPAS_MOCK = [
  "Identificação do técnico",
  "Evidência da instalação física",
  "Evidência da ONT/equipamento",
  "Evidência dos níveis de sinal",
  "Evidência do Wi-Fi configurado",
  "Evidência de organização/acabamento",
  "Evidência final com cliente/local"
];

export default function IARulesConfig() {
  const [activeTab, setActiveTab] = useState<'rules' | 'feedback' | 'metrics'>('rules');
  const [rules, setRules] = useState<IARule[]>([]);
  const [ruleVersions, setRuleVersions] = useState<RuleVersion[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<Certificacao[]>([]);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [filterEtapa, setFilterEtapa] = useState('');
  const [filterCert, setFilterCert] = useState('');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTipoCert, setFormTipoCert] = useState('');
  const [formEtapa, setFormEtapa] = useState(ETAPAS_MOCK[0]);
  const [formCategoria, setFormCategoria] = useState('Instalação Física');
  const [formTitulo, setFormTitulo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formRegra, setFormRegra] = useState('');
  const [formPrioridade, setFormPrioridade] = useState(3);
  const [formAtivo, setFormAtivo] = useState(true);
  const [formMotivoAlteracao, setFormMotivoAlteracao] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchRules = async () => {
    try {
      setIsLoading(true);
      // Fetch from new versioned Knowledge Base API
      const res = await apiFetch('/api/ia/knowledge_base?versions=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRules(data.rules || []);
          setRuleVersions(data.versions || []);
        }
      }
    } catch (err) {
      console.error("Error fetching Knowledge Base rules:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFeedbacks = async () => {
    try {
      setIsFeedbackLoading(true);
      const res = await apiFetch('/api/ia/feedback');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFeedbacks(data.feedback || []);
        }
      }
    } catch (err) {
      console.error("Error fetching feedback training:", err);
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  const fetchCertifications = async () => {
    try {
      const res = await apiFetch('/api/certificacoes');
      if (res.ok) {
        const data = await res.json();
        setCertifications(data || []);
      }
    } catch (err) {
      console.error("Error fetching certifications:", err);
    }
  };

  const fetchDashboardMetrics = async () => {
    try {
      setIsDashboardLoading(true);
      const res = await apiFetch('/api/ia/dashboard');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDashboard(data);
        }
      }
    } catch (err) {
      console.error("Error fetching IA dashboard metrics:", err);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchCertifications();
    fetchFeedbacks();
    fetchDashboardMetrics();
  }, []);

  const handleToggleFeedbackActive = async (fb: any) => {
    try {
      const newValue = fb.usar_como_exemplo === 1 ? 0 : 1;
      const res = await apiFetch('/api/ia/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fb.id, usar_como_exemplo: newValue })
      });
      if (res.ok) {
        showToastMsg("Configuração de exemplo atualizada!");
        fetchFeedbacks();
        fetchDashboardMetrics();
      } else {
        showToastMsg("Erro ao atualizar exemplo.", "error");
      }
    } catch (err) {
      console.error("Error updating feedback status:", err);
      showToastMsg("Erro de conexão.", "error");
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm("Deseja realmente remover este feedback do treinamento futuro da IA?")) return;
    try {
      const res = await apiFetch(`/api/ia/feedback?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToastMsg("Feedback de treinamento removido com sucesso!");
        fetchFeedbacks();
        fetchDashboardMetrics();
      } else {
        showToastMsg("Erro ao remover feedback.", "error");
      }
    } catch (err) {
      console.error("Error deleting feedback:", err);
      showToastMsg("Erro de conexão.", "error");
    }
  };

  const handleResolveSuggestion = async (id: string) => {
    try {
      const res = await apiFetch('/api/ia/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'RESOLVIDO' })
      });
      if (res.ok) {
        showToastMsg("Sugestão marcada como resolvida!");
        fetchDashboardMetrics();
      } else {
        showToastMsg("Erro ao resolver sugestão.", "error");
      }
    } catch (err) {
      console.error("Error resolving suggestion:", err);
      showToastMsg("Erro de conexão.", "error");
    }
  };

  const showToastMsg = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormTipoCert('');
    setFormEtapa(ETAPAS_MOCK[0]);
    setFormCategoria('Instalação Física');
    setFormTitulo('');
    setFormDescricao('');
    setFormRegra('');
    setFormPrioridade(3);
    setFormAtivo(true);
    setFormMotivoAlteracao('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: any) => {
    setEditingId(rule.id);
    setFormTipoCert(rule.tipo_certificacao || '');
    setFormEtapa(rule.checklist_item || rule.etapa || ETAPAS_MOCK[0]);
    setFormCategoria(rule.categoria || 'Instalação Física');
    setFormTitulo(rule.titulo || '');
    setFormDescricao(rule.descricao || '');
    setFormRegra(rule.regra || rule.criterios_conformidade || '');
    setFormPrioridade(rule.prioridade || rule.peso || 3);
    setFormAtivo(rule.ativo === 1 || rule.ativo === true);
    setFormMotivoAlteracao('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitulo.trim() || !formTipoCert) {
      showToastMsg("Título e Tipo de Certificação são obrigatórios.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const CQInfo = localStorage.getItem('claro_cq_selecionado');
      let author = 'sistema';
      if (CQInfo) {
        try {
          const u = JSON.parse(CQInfo);
          author = u.nome || author;
        } catch {}
      }

      const payload = {
        id: editingId,
        tipo_certificacao: formTipoCert,
        categoria: formCategoria,
        checklist_item: formEtapa,
        titulo: formTitulo.trim(),
        descricao: formDescricao.trim() || null,
        regra: formRegra.trim() || null,
        prioridade: Number(formPrioridade) || 3,
        ativo: formAtivo ? 1 : 0,
        usuario_id: author,
        perfil_usuario: 'cq',
        motivo_alteracao: formMotivoAlteracao.trim() || (editingId ? "Atualização de regras de conformidade" : "Criação inicial de regras")
      };

      const method = editingId ? 'PUT' : 'POST';
      const response = await apiFetch('/api/ia/knowledge_base', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg(editingId ? `Regra atualizada (v${data.version || 2}) com sucesso!` : "Regra criada e versionada (v1) com sucesso!", "success");
        setIsModalOpen(false);
        resetForm();
        fetchRules();
        fetchDashboardMetrics();
      } else {
        showToastMsg(data.error || "Erro ao salvar regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão com o servidor.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (rule: any) => {
    try {
      const CQInfo = localStorage.getItem('claro_cq_selecionado');
      let author = 'sistema';
      if (CQInfo) {
        try {
          const u = JSON.parse(CQInfo);
          author = u.nome || author;
        } catch {}
      }

      const updatedAtivo = (rule.ativo === 1 || rule.ativo === true) ? 0 : 1;
      const response = await apiFetch('/api/ia/knowledge_base', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rule,
          ativo: updatedAtivo,
          usuario_id: author,
          perfil_usuario: 'cq',
          motivo_alteracao: `Toggled active status to ${updatedAtivo ? 'Ativo' : 'Inativo'}`
        })
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg(`Regra ${updatedAtivo ? 'ativada' : 'inativada'} com sucesso! Nova versão v${data.version} gerada.`, "success");
        fetchRules();
        fetchDashboardMetrics();
      } else {
        showToastMsg(data.error || "Erro ao alterar status da regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão.", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente desativar esta regra da Base de Conhecimento? O histórico de versões será preservado.")) {
      return;
    }

    try {
      const CQInfo = localStorage.getItem('claro_cq_selecionado');
      let author = 'sistema';
      if (CQInfo) {
        try {
          const u = JSON.parse(CQInfo);
          author = u.nome || author;
        } catch {}
      }

      // Calls DELETE which toggles ativo=0 and inserts a desativação version
      const response = await apiFetch(`/api/ia/knowledge_base?id=${encodeURIComponent(id)}&usuario_id=${encodeURIComponent(author)}&perfil_usuario=cq`, {
        method: 'DELETE'
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg("Regra desativada com sucesso! Histórico de versões mantido.", "success");
        fetchRules();
        fetchDashboardMetrics();
      } else {
        showToastMsg(data.error || "Erro ao desativar regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão.", "error");
    }
  };

  // Filter implementation
  const filteredRules = rules.filter(r => {
    const checklist_item = r.checklist_item || r.etapa || '';
    const matchesEtapa = !filterEtapa || checklist_item === filterEtapa;
    const matchesCert = !filterCert || r.tipo_certificacao === filterCert;
    return matchesEtapa && matchesCert;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-left">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-xs font-bold transition-all duration-300 animate-slide-up ${
          toast.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-slate-900 rounded-3xl text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 select-none pointer-events-none">
          <Cpu size={160} />
        </div>
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-claro-red rounded-lg text-white">
              <Sparkles size={16} />
            </span>
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Inteligência Artificial Autoevolutiva</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Base de Conhecimento & Auditoria</h1>
          <p className="text-slate-300 text-xs max-w-xl">
            Gerencie as regras de conformidade da IA com versionamento estrito e sem código fixo. 
            Acompanhe a assertividade, o ROI e as correções do CQ para autoevolução contínua.
          </p>
        </div>
        {activeTab === 'rules' && (
          <button
            onClick={handleOpenCreate}
            className="md:self-center bg-claro-red hover:bg-red-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 active:scale-[0.98] cursor-pointer"
          >
            <Plus size={15} />
            <span>Nova Diretriz / Regra</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'rules' 
              ? 'border-claro-red text-claro-red' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Base de Conhecimento (D1)
        </button>
        <button
          onClick={() => setActiveTab('feedback')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'feedback' 
              ? 'border-violet-600 text-violet-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Feedback de Aprendizado
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'metrics' 
              ? 'border-emerald-600 text-emerald-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Métricas & Performance (BI)
        </button>
      </div>

      {/* Tab Context Banners */}
      {activeTab === 'rules' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs leading-relaxed">
          <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Governança Baseada em D1 e Versionamento Estrito</p>
            <p className="text-slate-600">
              Nunca sobrescreva diretrizes técnicas. Cada alteração gera uma nova versão auditável em <code>knowledge_versions</code>. 
              As regras cadastradas orientam a análise da IA em tempo real e servem como fonte oficial de conhecimento.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'feedback' && (
        <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl flex items-start gap-3 text-violet-950 text-xs leading-relaxed">
          <Sparkles size={16} className="text-violet-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Aprendizado Contínuo com Exemplos Reais</p>
            <p className="text-violet-800">
              Quando a IA diverge do critério humano e o CQ realiza uma correção, registramos este caso. 
              Os feedbacks marcados como ativos alimentam o prompt contextual em formato Few-Shot (In-Context Learning), reduzindo falsos positivos.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-950 text-xs leading-relaxed">
          <TrendingUp size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Observabilidade, Métricas de IA e Sugestões do Sistema</p>
            <p className="text-emerald-800">
              Monitore a assertividade, o tempo de resposta, o ROI financeiro em relação à auditoria tradicional e a distribuição de confiança da IA.
              O sistema detecta etapas com altos índices de correção humana e sugere ajustes de regras automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Main Tab Render Switch */}
      {activeTab === 'feedback' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Feedback Filter Section */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 text-violet-800 text-xs font-extrabold uppercase">
              <Filter size={14} />
              <span>Filtrar Exemplos por Etapa</span>
            </div>
            <select
              value={filterEtapa}
              onChange={(e) => setFilterEtapa(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">Todas as Etapas</option>
              {ETAPAS_MOCK.map(etapa => (
                <option key={etapa} value={etapa}>{etapa}</option>
              ))}
            </select>
          </div>

          {isFeedbackLoading ? (
            <div className="py-20 text-center space-y-2 text-violet-500 text-xs">
              <Sparkles className="mx-auto animate-spin text-violet-400" size={32} />
              <p className="font-bold">Carregando exemplos de treinamento...</p>
            </div>
          ) : feedbacks.filter(fb => !filterEtapa || fb.etapa === filterEtapa).length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Sparkles className="mx-auto text-violet-300" size={40} />
              <div className="space-y-1">
                <p className="text-slate-800 font-bold text-xs">Nenhum feedback de aprendizado encontrado</p>
                <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                  Exemplos de feedback de treinamento são gerados automaticamente sempre que o CQ corrige uma divergência da Inteligência Artificial.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-black">
                    <th className="px-5 py-3 text-left">Etapa da Auditoria</th>
                    <th className="px-5 py-3 text-left">Divergência (IA vs CQ)</th>
                    <th className="px-5 py-3 text-left">Motivo Técnico / Correção</th>
                    <th className="px-5 py-3 text-center">Usar no Prompt</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {feedbacks
                    .filter(fb => !filterEtapa || fb.etapa === filterEtapa)
                    .map((fb) => {
                      const isAtivo = fb.usar_como_exemplo === 1;
                      return (
                        <tr key={fb.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4 font-bold text-slate-800 min-w-[150px]">
                            {fb.etapa}
                          </td>
                          <td className="px-5 py-4 max-w-xs">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="bg-red-50 text-claro-red border border-red-200 px-1.5 py-0.5 rounded font-black">
                                  IA: {fb.resultado_original_ia?.split('. Justificativa:')[0] || fb.resultado_original_ia}
                                </span>
                                <span className="text-slate-400 font-bold">&rarr;</span>
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-black">
                                  CQ: {fb.resultado_final_cq}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 max-w-xs md:max-w-md text-slate-600 font-medium">
                            {fb.motivo_divergencia}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => handleToggleFeedbackActive(fb)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors select-none cursor-pointer ${
                                isAtivo
                                  ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100/70'
                                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isAtivo ? 'bg-violet-500' : 'bg-slate-400'}`} />
                              {isAtivo ? 'Exemplo Ativo' : 'Pausado'}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleDeleteFeedback(fb.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover Exemplo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Filter Section */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-extrabold uppercase">
              <Filter size={14} />
              <span>Filtros Base de Conhecimento</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <select
                value={filterEtapa}
                onChange={(e) => setFilterEtapa(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-claro-red"
              >
                <option value="">Todas as Etapas</option>
                {ETAPAS_MOCK.map(etapa => (
                  <option key={etapa} value={etapa}>{etapa}</option>
                ))}
              </select>
              <select
                value={filterCert}
                onChange={(e) => setFilterCert(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-claro-red"
              >
                <option value="">Todas as Certificações</option>
                {certifications.map(cert => (
                  <option key={cert.id} value={cert.nome}>{cert.nome}</option>
                ))}
              </select>
              {(filterEtapa || filterCert) && (
                <button
                  onClick={() => { setFilterEtapa(''); setFilterCert(''); }}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-xl text-[10px] font-bold text-slate-700 cursor-pointer"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* Rules Table */}
          {isLoading ? (
            <div className="py-20 text-center space-y-2 text-slate-500 text-xs">
              <Cpu className="mx-auto animate-spin text-slate-300" size={32} />
              <p className="font-bold">Carregando diretrizes da Base de Conhecimento...</p>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <HelpCircle className="mx-auto text-slate-300" size={40} />
              <div className="space-y-1">
                <p className="text-slate-800 font-bold text-xs">Nenhuma regra da Base de Conhecimento encontrada</p>
                <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                  Crie uma nova regra de conformidade para a Base de Conhecimento clicando no botão no topo direito.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-black">
                    <th className="px-5 py-3 text-left">Título / Categoria</th>
                    <th className="px-5 py-3 text-left">Requisitos / Critérios da IA</th>
                    <th className="px-5 py-3 text-center">Peso</th>
                    <th className="px-5 py-3 text-center">Histórico</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredRules.map((rule) => {
                    const isRuleAtivo = rule.ativo === 1 || rule.ativo === true;
                    const checklist_item = rule.checklist_item || rule.etapa || '';
                    const ruleRegra = rule.regra || rule.criterios_conformidade || '';
                    
                    // Filter versions for this rule
                    const ruleHistory = ruleVersions.filter(v => v.knowledge_id === rule.id);
                    const currentVersionNum = ruleHistory.length > 0 ? Math.max(...ruleHistory.map(h => h.versao)) : 1;

                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 max-w-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-slate-100 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded font-extrabold text-slate-500 uppercase">
                                {rule.categoria || 'Geral'}
                              </span>
                              <span className="bg-red-50 border border-red-100 text-[9px] px-1.5 py-0.5 rounded font-black text-claro-red">
                                v{currentVersionNum}
                              </span>
                            </div>
                            <p className="font-bold text-slate-800 leading-tight">{rule.titulo}</p>
                            {rule.descricao && (
                              <p className="text-slate-400 text-[10px] leading-relaxed line-clamp-1">{rule.descricao}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 max-w-sm">
                          <div className="space-y-1">
                            <p className="text-[11px] text-slate-600 font-medium leading-relaxed line-clamp-2">
                              {ruleRegra || <span className="italic text-slate-400">Nenhum critério técnico cadastrado.</span>}
                            </p>
                            <div className="flex flex-wrap gap-1 text-[9px] text-slate-400 font-bold">
                              <span>Checklist: <strong className="text-slate-600">{checklist_item}</strong></span>
                              <span>&bull;</span>
                              <span className="text-claro-red">{rule.tipo_certificacao || 'Global'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-extrabold text-slate-700 text-sm">
                          {rule.prioridade || rule.peso || 3}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md">
                            <History size={10} /> {ruleHistory.length || 1} alt
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => handleToggleActive(rule)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors select-none cursor-pointer ${
                              isRuleAtivo
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isRuleAtivo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isRuleAtivo ? 'Ativo' : 'Inativo'}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(rule)}
                              className="p-1.5 text-slate-500 hover:text-claro-dark hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Editar Regra"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(rule.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Desativar Regra"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {isDashboardLoading ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center space-y-2 text-slate-500 text-xs">
              <Sparkles className="mx-auto animate-spin text-emerald-500" size={32} />
              <p className="font-bold">Calculando indicadores de assertividade e economia em tempo real...</p>
            </div>
          ) : !dashboard ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center text-slate-500 text-xs">
              Sem dados de telemetria da IA disponíveis no momento. Realize análises primeiro.
            </div>
          ) : (
            <>
              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 text-left">
                  <div className="p-3 bg-slate-50 rounded-xl text-slate-600">
                    <Cpu size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Total de Análises IA</p>
                    <p className="text-xl font-black text-slate-800">{dashboard.metrics.total}</p>
                    <p className="text-[10px] text-slate-400">Registrados em histórico</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 text-left">
                  <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                    <CheckCircle size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Acurácia (Assertividade)</p>
                    <p className="text-xl font-black text-emerald-700">{dashboard.metrics.accuracy}%</p>
                    <p className="text-[10px] text-slate-500 font-bold">{dashboard.metrics.confirmations} confirmações CQ</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 text-left">
                  <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                    <XCircle size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Divergências do CQ</p>
                    <p className="text-xl font-black text-rose-700">{dashboard.metrics.corrections}</p>
                    <p className="text-[10px] text-slate-500 font-bold">Correções com calibragem</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 text-left">
                  <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                    <Sparkles size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Confiança Média</p>
                    <p className="text-xl font-black text-amber-700">{dashboard.metrics.avgConfidence}%</p>
                    <p className="text-[10px] text-slate-400">Geral por modelo</p>
                  </div>
                </div>
              </div>

              {/* Economy Section & Confidence Brackets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Financial Dashboard - Estimativa de Custo vs Humano */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-500 rounded-lg text-white">
                        <DollarSign size={16} />
                      </span>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Indicadores Financeiros & ROI</h3>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                      ROI: {dashboard.financials.roi}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="space-y-1 border-r border-slate-800">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Custo Tradicional</p>
                      <strong className="block text-sm text-slate-200">R$ {dashboard.financials.estimatedHumanCost.toFixed(2)}</strong>
                      <p className="text-[9px] text-slate-500">Auditoria Humana</p>
                    </div>
                    <div className="space-y-1 border-r border-slate-800">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Custo IA (Real)</p>
                      <strong className="block text-sm text-slate-200">R$ {dashboard.financials.actualIaCostBRL.toFixed(2)}</strong>
                      <p className="text-[9px] text-slate-500">Free/Paid Pro</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-emerald-400 font-bold uppercase">Economia Líquida</p>
                      <strong className="block text-base text-emerald-400 font-black">R$ {dashboard.financials.netSavings.toFixed(2)}</strong>
                      <p className="text-[9px] text-emerald-500/80">Retornado ao caixa</p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-800/50 rounded-xl space-y-1.5 text-[10px] leading-relaxed text-slate-400">
                    <p className="font-bold text-slate-300 flex items-center gap-1">
                      <TrendingUp size={12} className="text-emerald-400" /> Como é calculado o ROI?
                    </p>
                    <p>
                      Comparamos o custo total se cada auditoria física custasse R$ 15,00 contra o custo operacional real de IA (onde a maioria corre sob a infraestrutura gratuita da Cloudflare).
                      Esta otimização já economizou mais de <strong>R$ {dashboard.financials.netSavings.toFixed(2)}</strong> para o caixa operacional.
                    </p>
                  </div>
                </div>

                {/* Confidence Distribution */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 text-left">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                      <BarChart2 size={16} />
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Faixas de Precisão & Confiança</h3>
                  </div>

                  <div className="space-y-3 pt-1">
                    {/* High */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-600">Alta Confiança (90% - 100%)</span>
                        <span className="text-emerald-600">{dashboard.confidenceStats.high} análises</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(dashboard.confidenceStats.high / (dashboard.metrics.total || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                    {/* Medium */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-600">Média Confiança (70% - 89%)</span>
                        <span className="text-amber-600">{dashboard.confidenceStats.medium} análises</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(dashboard.confidenceStats.medium / (dashboard.metrics.total || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                    {/* Low */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-600">Baixa Confiança (50% - 69%)</span>
                        <span className="text-orange-600">{dashboard.confidenceStats.low} análises</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${(dashboard.confidenceStats.low / (dashboard.metrics.total || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                    {/* Review required */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-600">Revisão Obrigatória (&lt; 50%)</span>
                        <span className="text-rose-600">{dashboard.confidenceStats.review} análises</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-rose-500 h-full rounded-full" style={{ width: `${(dashboard.confidenceStats.review / (dashboard.metrics.total || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Automated Suggestions and Recent Log */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Suggestions list */}
                <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                        <AlertTriangle size={15} />
                      </span>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Sugestões de Calibragem</h3>
                    </div>
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-bold text-slate-500">
                      {dashboard.suggestions.filter(s => s.status === 'PENDENTE').length} pendentes
                    </span>
                  </div>

                  <div className="space-y-3 overflow-y-auto max-h-[300px] pt-1">
                    {dashboard.suggestions.filter(s => s.status === 'PENDENTE').length === 0 ? (
                      <div className="py-12 text-center space-y-1 text-slate-400 text-[11px]">
                        <CheckCircle className="mx-auto text-emerald-500" size={32} />
                        <p className="font-bold text-slate-700">Tudo equilibrado!</p>
                        <p>Nenhuma etapa com correções excessivas detectadas.</p>
                      </div>
                    ) : (
                      dashboard.suggestions
                        .filter(s => s.status === 'PENDENTE')
                        .map(s => (
                          <div key={s.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-left text-[11px] relative">
                            <span className="bg-red-50 text-claro-red px-1.5 py-0.5 rounded font-bold text-[9px]">
                              Item: {s.checklist_item}
                            </span>
                            <p className="text-slate-600 font-medium leading-relaxed">{s.mensagem}</p>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[9px] text-slate-400">{new Date(s.created_at).toLocaleDateString()}</span>
                              <button
                                onClick={() => handleResolveSuggestion(s.id)}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-[9px] border border-emerald-100 cursor-pointer"
                              >
                                Marcar como Lida
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Audit History Log */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 text-left">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-slate-50 rounded-lg text-slate-600">
                      <FileText size={15} />
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Histórico de Decisões e Auditoria (D1)</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[9px] font-black">
                          <th className="px-4 py-2.5 text-left">Data/Hora</th>
                          <th className="px-4 py-2.5 text-left">Modelo</th>
                          <th className="px-4 py-2.5 text-left">Certificação / Etapa</th>
                          <th className="px-4 py-2.5 text-center">IA Res</th>
                          <th className="px-4 py-2.5 text-center">Confia</th>
                          <th className="px-4 py-2.5 text-right">Humano (CQ)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dashboard.recentHistory.map(h => (
                          <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 text-slate-400 font-mono whitespace-nowrap">
                              {new Date(h.created_at).toLocaleTimeString('pt-BR')}
                            </td>
                            <td className="px-4 py-2 text-slate-500 truncate max-w-[80px]">
                              {h.modelo}
                            </td>
                            <td className="px-4 py-2">
                              <p className="font-bold text-slate-700 leading-tight truncate max-w-[150px]">{h.certificacao}</p>
                              <p className="text-[9px] text-slate-400 truncate max-w-[150px]">{h.checklist}</p>
                            </td>
                            <td className="px-4 py-2 text-center font-bold text-slate-700">
                              {h.resultado}
                            </td>
                            <td className="px-4 py-2 text-center font-bold text-amber-600">
                              {h.confidence}%
                            </td>
                            <td className="px-4 py-2 text-right font-medium">
                              {h.cq_corrigiu === 1 ? (
                                <span className="text-rose-600 font-extrabold bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">Corrigido</span>
                              ) : h.cq_confirmou === 1 ? (
                                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Confirmado</span>
                              ) : (
                                <span className="text-slate-400">Pendente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-left">
                <Cpu size={16} className="text-claro-red animate-pulse" />
                <h2 className="text-sm font-black text-slate-800">
                  {editingId ? "Revisar/Editar Regra na Base de Conhecimento" : "Nova Regra / Diretriz de Conhecimento (D1)"}
                </h2>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex-grow overflow-y-auto p-6 space-y-4 text-xs text-left">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stage Selection */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Item de Checklist / Etapa <span className="text-red-500">*</span></label>
                  <select
                    value={formEtapa}
                    onChange={(e) => setFormEtapa(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  >
                    {ETAPAS_MOCK.map(etapa => (
                      <option key={etapa} value={etapa}>{etapa}</option>
                    ))}
                  </select>
                </div>

                {/* Certification Type Binding */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Tipo de Certificação <span className="text-red-500">*</span></label>
                  <select
                    value={formTipoCert}
                    onChange={(e) => setFormTipoCert(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  >
                    <option value="">-- Escolha a Certificação Vinculada --</option>
                    {certifications.map(cert => (
                      <option key={cert.id} value={cert.nome}>{cert.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Categoria de Rede</label>
                  <select
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  >
                    <option value="Instalação Física">Instalação Física</option>
                    <option value="Configuração Óptica (GPON)">Configuração Óptica (GPON)</option>
                    <option value="HFC Coaxial">HFC Coaxial</option>
                    <option value="Wi-Fi / Redes">Wi-Fi / Redes</option>
                    <option value="Organização e Estética">Organização e Estética</option>
                    <option value="Invisível / Fibra">Invisível / Fibra</option>
                  </select>
                </div>

                {/* Priority */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Nível de Importância / Prioridade (1 a 5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formPrioridade}
                    onChange={(e) => setFormPrioridade(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Título Curto da Diretriz <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="Ex: Botão de escada obrigatório"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Resumo da Exigência Técnica</label>
                <textarea
                  rows={2}
                  placeholder="Descreva resumidamente a exigência e o rigor técnico que a IA deve avaliar..."
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800 resize-none"
                />
              </div>

              {/* Strict Rule Instructions */}
              <div className="space-y-1">
                <label className="block font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle size={12} /> Regra de Avaliação da IA (Prompting de Rigor)
                </label>
                <textarea
                  rows={4}
                  placeholder="Insira a regra lógica exata para a IA. Ex: Aprovado se houver conector mecânico verde esticado sem folgas. Reprovado se o cabo estiver dobrado com folgas ou LEDs vermelhos acesos..."
                  value={formRegra}
                  onChange={(e) => setFormRegra(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-slate-800 text-[11px] leading-relaxed resize-none"
                />
              </div>

              {/* Change justification (Mandatory for editing) */}
              {editingId && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <label className="block font-bold text-amber-800 flex items-center gap-1">
                    <History size={12} /> Justificativa da Alteração / Log da Versão <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Calibragem da regra após correção de falsos positivos pelo CQ."
                    value={formMotivoAlteracao}
                    onChange={(e) => setFormMotivoAlteracao(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold text-slate-800"
                  />
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="rule-active"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  className="w-4 h-4 text-claro-red border-slate-300 rounded-sm focus:ring-claro-red cursor-pointer"
                />
                <label htmlFor="rule-active" className="font-bold text-slate-700 cursor-pointer select-none">
                  Diretriz Ativa (A IA aplicará esta regra imediatamente na próxima análise)
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-claro-red hover:bg-red-600 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-red-600/10 cursor-pointer disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{isSaving ? "Salvando e Versionando..." : "Salvar & Registrar Versão"}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

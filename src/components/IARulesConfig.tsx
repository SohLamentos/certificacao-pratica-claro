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
  Filter
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface IARule {
  id: string;
  tipo_certificacao: string | null;
  etapa: string;
  titulo: string;
  descricao: string | null;
  criterios_conformidade: string | null;
  criterios_nao_conformidade: string | null;
  exemplos_conformes: string | null;
  exemplos_nao_conformes: string | null;
  peso: number;
  ativo: number | boolean;
  created_at?: string;
  updated_at?: string;
}

interface Certificacao {
  id: number | string;
  nome: string;
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
  const [activeTab, setActiveTab] = useState<'rules' | 'feedback'>('rules');
  const [rules, setRules] = useState<IARule[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<Certificacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [filterEtapa, setFilterEtapa] = useState('');
  const [filterCert, setFilterCert] = useState('');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTipoCert, setFormTipoCert] = useState('');
  const [formEtapa, setFormEtapa] = useState(ETAPAS_MOCK[0]);
  const [formTitulo, setFormTitulo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formCriteriosConf, setFormCriteriosConf] = useState('');
  const [formCriteriosNaoConf, setFormCriteriosNaoConf] = useState('');
  const [formExemplosConf, setFormExemplosConf] = useState('');
  const [formExemplosNaoConf, setFormExemplosNaoConf] = useState('');
  const [formPeso, setFormPeso] = useState(1);
  const [formAtivo, setFormAtivo] = useState(true);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchRules = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/ia/regras');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRules(data.rules || []);
        }
      }
    } catch (err) {
      console.error("Error fetching IA rules:", err);
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

  useEffect(() => {
    fetchRules();
    fetchCertifications();
    fetchFeedbacks();
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
      } else {
        showToastMsg("Erro ao remover feedback.", "error");
      }
    } catch (err) {
      console.error("Error deleting feedback:", err);
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
    setFormTitulo('');
    setFormDescricao('');
    setFormCriteriosConf('');
    setFormCriteriosNaoConf('');
    setFormExemplosConf('');
    setFormExemplosNaoConf('');
    setFormPeso(1);
    setFormAtivo(true);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: IARule) => {
    setEditingId(rule.id);
    setFormTipoCert(rule.tipo_certificacao || '');
    setFormEtapa(rule.etapa);
    setFormTitulo(rule.titulo);
    setFormDescricao(rule.descricao || '');
    setFormCriteriosConf(rule.criterios_conformidade || '');
    setFormCriteriosNaoConf(rule.criterios_nao_conformidade || '');
    setFormExemplosConf(rule.exemplos_conformes || '');
    setFormExemplosNaoConf(rule.exemplos_nao_conformes || '');
    setFormPeso(rule.peso || 1);
    setFormAtivo(rule.ativo === 1 || rule.ativo === true);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitulo.trim() || !formEtapa) {
      showToastMsg("Título e Etapa são obrigatórios.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        id: editingId,
        tipo_certificacao: formTipoCert || null,
        etapa: formEtapa,
        titulo: formTitulo.trim(),
        descricao: formDescricao.trim() || null,
        criterios_conformidade: formCriteriosConf.trim() || null,
        criterios_nao_conformidade: formCriteriosNaoConf.trim() || null,
        exemplos_conformes: formExemplosConf.trim() || null,
        exemplos_nao_conformes: formExemplosNaoConf.trim() || null,
        peso: Number(formPeso) || 1,
        ativo: formAtivo ? 1 : 0
      };

      const method = editingId ? 'PUT' : 'POST';
      const response = await apiFetch('/api/ia/regras', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg(editingId ? "Regra atualizada com sucesso!" : "Regra criada com sucesso!", "success");
        setIsModalOpen(false);
        resetForm();
        fetchRules();
      } else {
        showToastMsg(data.error || "Erro ao salvar regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão com o servidor.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (rule: IARule) => {
    try {
      const updatedAtivo = (rule.ativo === 1 || rule.ativo === true) ? 0 : 1;
      const response = await apiFetch('/api/ia/regras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rule,
          ativo: updatedAtivo
        })
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg(`Regra ${updatedAtivo ? 'ativada' : 'inativada'} com sucesso!`, "success");
        fetchRules();
      } else {
        showToastMsg(data.error || "Erro ao alterar status da regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão.", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir esta regra? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/ia/regras?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      const data = await response.json() as any;
      if (response.ok && data.success) {
        showToastMsg("Regra excluída com sucesso!", "success");
        fetchRules();
      } else {
        showToastMsg(data.error || "Erro ao excluir regra.", "error");
      }
    } catch (err: any) {
      showToastMsg(err.message || "Erro de conexão.", "error");
    }
  };

  // Filter implementation
  const filteredRules = rules.filter(r => {
    const matchesEtapa = !filterEtapa || r.etapa === filterEtapa;
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
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Inteligência Artificial</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Configuração da IA</h1>
          <p className="text-slate-300 text-xs max-w-xl">
            Ensine os critérios de conformidade e reprovação diretamente para a IA de Auditoria. 
            Defina o comportamento e o rigor exigido para cada tipo de imagem sem alterar nenhuma linha de código.
          </p>
        </div>
        {activeTab === 'rules' && (
          <button
            onClick={handleOpenCreate}
            className="md:self-center bg-claro-red hover:bg-red-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 active:scale-[0.98] cursor-pointer"
          >
            <Plus size={15} />
            <span>Adicionar Nova Regra</span>
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
          Regras de Conformidade
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
      </div>

      {/* Info Warning Card */}
      {activeTab === 'rules' ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs leading-relaxed">
          <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Como funciona a auditoria dinâmica?</p>
            <p className="text-slate-600">
              Ao carregar ou analisar uma imagem, o sistema buscará todas as regras ativas específicas para aquela 
              etapa e tipo de certificação. Estas regras são convertidas dinamicamente em instruções detalhadas de 
              análise que orientam o modelo de inteligência artificial. A IA aplica essas regras de forma rigorosa, 
              mas o veredito final sempre passa pela revisão do CQ.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl flex items-start gap-3 text-violet-950 text-xs leading-relaxed">
          <Sparkles size={16} className="text-violet-600 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <p className="font-bold">Aprendizado Contínuo Baseado em Feedback Humano (Few-Shot Prompting)</p>
            <p className="text-violet-800">
              Quando analistas do CQ discordam e corrigem as decisões da IA, essas correções podem ser salvas como exemplos de treinamento. 
              A cada nova análise, os exemplos aprovados da mesma etapa são injetados automaticamente no prompt da IA como referência técnica (In-Context Learning). 
              Desta forma, a IA aprende com os erros anteriores e calibra seu critério de qualidade ao longo do tempo.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'feedback' ? (
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
              <Sparkles className="mx-auto text-violet-300 animate-pulse" size={40} />
              <div className="space-y-1">
                <p className="text-slate-800 font-bold text-xs">Nenhum feedback de aprendizado encontrado</p>
                <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                  Exemplos de feedback de treinamento são criados automaticamente quando o CQ avalia uma evidência de forma diferente da Inteligência Artificial.
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
                              {fb.resultado_original_ia?.includes('Justificativa:') && (
                                <p className="text-[10px] text-slate-400 italic line-clamp-2">
                                  {fb.resultado_original_ia.split('Justificativa: ')[1]}
                                </p>
                              )}
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
      ) : (
        /* Filter and Table Container */
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Filter Section */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-extrabold uppercase">
              <Filter size={14} />
              <span>Filtros Rápidos</span>
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
              <p className="font-bold">Carregando regras da IA...</p>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <HelpCircle className="mx-auto text-slate-300" size={40} />
              <div className="space-y-1">
                <p className="text-slate-800 font-bold text-xs">Nenhuma regra da IA encontrada</p>
                <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                  Não há regras configuradas para os filtros selecionados. Crie uma nova regra de conformidade clicando no botão acima.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-black">
                    <th className="px-5 py-3 text-left">Título / Descrição</th>
                    <th className="px-5 py-3 text-left">Escopo da Regra</th>
                    <th className="px-5 py-3 text-center">Peso</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredRules.map((rule) => {
                    const isRuleAtivo = rule.ativo === 1 || rule.ativo === true;
                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 max-w-xs md:max-w-md">
                          <div className="space-y-1">
                            <p className="font-bold text-slate-800 leading-tight">{rule.titulo}</p>
                            {rule.descricao ? (
                              <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2">{rule.descricao}</p>
                            ) : (
                              <p className="text-slate-400 italic text-[10px]">Sem descrição técnica.</p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                                {rule.etapa}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold">
                              {rule.tipo_certificacao ? (
                                <span className="text-claro-red">Certificação: {rule.tipo_certificacao}</span>
                              ) : (
                                <span className="text-emerald-600">Aplicação Global</span>
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-extrabold text-slate-700 text-sm">
                          {rule.peso}
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
                              title="Excluir Regra"
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

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scale-up">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-claro-red animate-pulse" />
                <h2 className="text-sm font-black text-slate-800">
                  {editingId ? "Editar Regra de Auditoria" : "Nova Regra de Auditoria da IA"}
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
            <form onSubmit={handleSave} className="flex-grow overflow-y-auto p-6 space-y-4 text-xs">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Stage Selection */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Etapa da Evidência <span className="text-red-500">*</span></label>
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
                  <label className="block font-bold text-slate-700">Vincular a Certificação (Opcional)</label>
                  <select
                    value={formTipoCert}
                    onChange={(e) => setFormTipoCert(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  >
                    <option value="">Aplica globalmente para esta Etapa</option>
                    {certifications.map(cert => (
                      <option key={cert.id} value={cert.nome}>{cert.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Título Curto da Regra <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="Ex: Verificar LEDs do modem"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Descrição/Instruções Gerais</label>
                <textarea
                  rows={2}
                  placeholder="Explique o que esta regra avalia em termos gerais na foto..."
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800 resize-none"
                />
              </div>

              {/* Conformity criteria & non-conformity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 flex items-center gap-1 text-emerald-700">
                    <CheckCircle size={12} /> Critérios de Conformidade (Aprovar)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Quais detalhes visuais garantem a aprovação do item..."
                    value={formCriteriosConf}
                    onChange={(e) => setFormCriteriosConf(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-800 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 flex items-center gap-1 text-rose-700">
                    <XCircle size={12} /> Critérios de Não-Conformidade (Reprovar)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Quais falhas técnicas exigem a reprovação do item..."
                    value={formCriteriosNaoConf}
                    onChange={(e) => setFormCriteriosNaoConf(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 font-semibold text-slate-800 resize-none"
                  />
                </div>
              </div>

              {/* Conforme examples vs non-conforme examples */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Exemplos Conformes (Sucesso)</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Foto nítida mostrando LED PON aceso estável em verde..."
                    value={formExemplosConf}
                    onChange={(e) => setFormExemplosConf(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-300 font-semibold text-slate-800 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Exemplos Não-Conformes (Reprova)</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Modem apagado, cabo óptico dobrado com ângulo acentuado..."
                    value={formExemplosNaoConf}
                    onChange={(e) => setFormExemplosNaoConf(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-300 font-semibold text-slate-800 resize-none"
                  />
                </div>
              </div>

              {/* Weight & Active Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Importância / Peso da Regra (1 a 5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formPeso}
                    onChange={(e) => setFormPeso(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-claro-red font-semibold text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-2 md:pt-6">
                  <input
                    type="checkbox"
                    id="rule-active"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="w-4 h-4 text-claro-red border-slate-300 rounded-sm focus:ring-claro-red cursor-pointer"
                  />
                  <label htmlFor="rule-active" className="font-bold text-slate-700 cursor-pointer select-none">
                    Ativo (IA aplicará esta regra imediatamente)
                  </label>
                </div>
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
                  <span>{isSaving ? "Salvando..." : "Salvar Regra"}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

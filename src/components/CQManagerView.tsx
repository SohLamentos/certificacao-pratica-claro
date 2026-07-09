import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, User, MapPin, Check, X, ShieldAlert, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CQ } from '../types';
import { apiFetch } from '../lib/api';

interface CQManagerViewProps {
  onBack: () => void;
  evaluations: any[];
}

export default function CQManagerView({ onBack, evaluations }: CQManagerViewProps) {
  const [cqsState, setCqsState] = useState<CQ[]>([]);
  const cqs = Array.isArray(cqsState) ? cqsState : [];
  const setCqs = (val: any) => {
    setCqsState(Array.isArray(val) ? val : []);
  };
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [nome, setNome] = useState('');
  const [perfil, setPerfil] = useState<'CQ' | 'Analista'>('CQ');
  const [cidadeBase, setCidadeBase] = useState('');
  const [status, setStatus] = useState<'Ativo' | 'Inativo'>('Ativo');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchCQs = async () => {
    try {
      const res = await apiFetch('/api/cqs');
      if (res.ok) {
        const data = await res.json();
        setCqs(data);
      }
    } catch (e) {
      console.error('Failed to fetch cqs', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchCQs();
      setIsLoading(false);
    };
    init();

    const handleRealtimeEvent = (e: Event) => {
      const event = (e as CustomEvent).detail;
      if (event.type === 'AVALIADOR_DELETADO') {
        setCqs(prev => prev.filter(cq => String(cq.id) !== String(event.avaliadorId)));
      } else if (event.type === 'AVALIADOR_ATUALIZADO') {
        setCqs(prev => prev.map(cq => 
          String(cq.id) === String(event.avaliadorId) ? { ...cq, status: event.status } : cq
        ));
      }
    };
    window.addEventListener('realtime-cq-event', handleRealtimeEvent);
    return () => window.removeEventListener('realtime-cq-event', handleRealtimeEvent);
  }, []);

  const resetForm = () => {
    setNome('');
    setPerfil('CQ');
    setCidadeBase('');
    setStatus('Ativo');
    setErrors({});
    setEditingId(null);
    setIsEditing(false);
  };

  const handleStartCreate = (profileType: 'CQ' | 'Analista') => {
    resetForm();
    setPerfil(profileType);
    setIsEditing(true);
  };

  const handleStartEdit = (cq: CQ) => {
    setErrors({});
    setEditingId(cq.id);
    setNome(cq.nome);
    setPerfil(cq.perfil || 'CQ');
    setCidadeBase(cq.cidadeBase);
    setStatus(cq.status);
    setIsEditing(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!nome.trim()) newErrors.nome = 'Nome do avaliador é obrigatório';
    if (!cidadeBase.trim()) newErrors.cidadeBase = 'Cidade/Base é obrigatória';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const now = new Date().toISOString();
    setIsSaving(true);

    try {
      if (editingId) {
        // Edit existing CQ in database
        const updatedCQ = {
          nome: nome.trim(),
          perfil,
          cidadeBase: cidadeBase.trim(),
          status,
          updatedAt: now
        };

        const res = await apiFetch(`/api/cqs/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCQ)
        });

        if (res.ok) {
          await fetchCQs();
          resetForm();
        } else {
          alert('Erro ao atualizar avaliador.');
        }
      } else {
        // Create new CQ in database
        const newCQ: CQ = {
          id: 'cq-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          nome: nome.trim(),
          perfil,
          cidadeBase: cidadeBase.trim(),
          status,
          createdAt: now,
          updatedAt: now,
        };

        const res = await apiFetch('/api/cqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCQ)
        });

        if (res.ok) {
          await fetchCQs();
          resetForm();
        } else {
          alert('Erro ao criar novo avaliador.');
        }
      }
    } catch (err) {
      console.error('Error saving CQ:', err);
      alert('Erro de rede ao salvar avaliador.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const targetCQ = cqs.find(cq => cq.id === id);
    if (!targetCQ) return;

    const hasLinkedActiveEval = evaluations.some(e => 
      e.nomeCQ === targetCQ.nome && 
      (e.status === 'AGENDADA' || e.status === 'EM ANDAMENTO')
    );

    if (hasLinkedActiveEval) {
      alert("Este avaliador possui avaliações vinculadas. Inative o avaliador em vez de excluir.");
      return;
    }

    if (window.confirm("Deseja realmente excluir este avaliador?")) {
      setIsSaving(true);
      try {
        const res = await apiFetch(`/api/cqs/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          setCqs(prev => prev.filter(cq => cq.id !== id));
          await fetchCQs();
        } else {
          alert('Erro ao excluir avaliador.');
        }
      } catch (err) {
        console.error('Error deleting CQ:', err);
        alert('Erro ao conectar ao servidor para excluir.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSimulateCQs = async () => {
    const names = ['André Luis', 'Gabriela Santos', 'Fabrício Costa', 'Patrícia Oliveira'];
    const bases = ['Porto Alegre - Base Sul', 'Belo Horizonte - Base Centro', 'Salvador - Base Norte', 'Curitiba - Base Sul'];
    const profiles: ('CQ' | 'Analista')[] = ['CQ', 'Analista'];
    const randIdx = Math.floor(Math.random() * names.length);
    const randProfile = profiles[Math.floor(Math.random() * profiles.length)];
    
    const newCQ: CQ = {
      id: 'cq-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      nome: names[randIdx] + (randProfile === 'CQ' ? ' (CQ)' : ' (Analista)'),
      perfil: randProfile,
      cidadeBase: bases[randIdx],
      status: 'Ativo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/cqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCQ)
      });
      if (res.ok) {
        await fetchCQs();
      } else {
        alert('Erro ao simular avaliador.');
      }
    } catch (e) {
      console.error('Error simulating CQ:', e);
      alert('Erro ao simular avaliador.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto px-4 py-3 space-y-4 animate-fade-in text-left" id="cq-manager-view">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="flex items-center space-x-1 text-slate-500 hover:text-claro-dark transition-colors font-bold text-xs py-1 px-2 -ml-2 rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          id="btn-cq-manager-back"
        >
          <ArrowLeft size={16} />
          <span>Voltar</span>
        </button>

        {!isEditing && (
          <button
            onClick={handleSimulateCQs}
            type="button"
            disabled={isSaving || isLoading}
            className="flex items-center space-x-1 text-[10px] bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded-md transition-colors cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <RefreshCw size={11} className="animate-spin text-amber-500" /> : <Sparkles size={11} className="text-amber-500" />}
            <span>Simular Avaliador</span>
          </button>
        )}
      </div>

      {/* View Title */}
      <div className="border-b border-slate-200 pb-2">
        <h2 className="text-xl font-extrabold text-claro-dark tracking-tight leading-none">
          Gerenciar Avaliadores
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          Cadastre, edite e gerencie os avaliadores responsáveis pelas certificações práticas.
        </p>
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          /* Create / Edit Form Card */
          <motion.div
            key="cq-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-2xl border border-claro-border p-4 shadow-sm space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase text-claro-dark tracking-wider">
                {editingId ? 'Editar Cadastro de Avaliador' : `Cadastrar Novo ${perfil}`}
              </h3>
              <button
                onClick={resetForm}
                disabled={isSaving}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              {/* Nome */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-wider">
                  Nome Completo <span className="text-claro-red">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User size={14} />
                  </div>
                  <input
                    type="text"
                    disabled={isSaving}
                    placeholder="Nome do avaliador"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs transition-all focus:outline-none focus:ring-2 disabled:opacity-60 disabled:bg-slate-50 ${
                      errors.nome 
                        ? 'border-red-400 focus:ring-red-100 focus:border-red-500' 
                        : 'border-slate-200 focus:ring-red-500/10 focus:border-claro-red'
                    }`}
                  />
                </div>
                {errors.nome && <p className="text-[10px] text-red-500 font-bold">{errors.nome}</p>}
              </div>

              {/* Perfil */}
              <div className="space-y-1.5">
                <span className="block text-[10px] font-black text-slate-700 uppercase tracking-wider">
                  Perfil <span className="text-claro-red">*</span>
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setPerfil('CQ')}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      perfil === 'CQ'
                        ? 'bg-red-600 border-red-600 text-white shadow-sm font-extrabold'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <span>CQ</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setPerfil('Analista')}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      perfil === 'Analista'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm font-extrabold'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <span>Analista</span>
                  </button>
                </div>
              </div>

              {/* Cidade/Base */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-wider">
                  Cidade / Base <span className="text-claro-red">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MapPin size={14} />
                  </div>
                  <input
                    type="text"
                    disabled={isSaving}
                    placeholder="Ex: São Paulo - Base Leste"
                    value={cidadeBase}
                    onChange={(e) => setCidadeBase(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs transition-all focus:outline-none focus:ring-2 disabled:opacity-60 disabled:bg-slate-50 ${
                      errors.cidadeBase 
                        ? 'border-red-400 focus:ring-red-100 focus:border-red-500' 
                        : 'border-slate-200 focus:ring-red-500/10 focus:border-claro-red'
                    }`}
                  />
                </div>
                {errors.cidadeBase && <p className="text-[10px] text-red-500 font-bold">{errors.cidadeBase}</p>}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <span className="block text-[10px] font-black text-slate-700 uppercase tracking-wider">
                  Status
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setStatus('Ativo')}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      status === 'Ativo'
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Check size={12} className={status === 'Ativo' ? 'stroke-[3]' : ''} />
                    <span>Ativo</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setStatus('Inativo')}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      status === 'Inativo'
                        ? 'bg-slate-600 border-slate-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <X size={12} className={status === 'Inativo' ? 'stroke-[3]' : ''} />
                    <span>Inativo</span>
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 font-medium leading-tight">
                  Avaliadores inativos não são carregados na tela de agendamento de avaliação.
                </p>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="flex-1 py-2 border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs transition-all shadow-sm text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 bg-claro-red hover:bg-red-700 text-white font-extrabold rounded-lg text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving && <RefreshCw size={12} className="animate-spin" />}
                  <span>{isSaving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Salvar Cadastro')}</span>
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* List Card & Actions */
          <motion.div
            key="cq-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {/* Two Add Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleStartCreate('CQ')}
                disabled={isSaving || isLoading}
                className="py-2.5 bg-claro-red hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-lg text-xs transition-all duration-150 shadow-sm flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                <span>+ Adicionar CQ</span>
              </button>
              <button
                onClick={() => handleStartCreate('Analista')}
                disabled={isSaving || isLoading}
                className="py-2.5 bg-claro-red hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-lg text-xs transition-all duration-150 shadow-sm flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                <span>+ Adicionar Analista</span>
              </button>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-claro-border shadow-sm overflow-hidden divide-y divide-slate-100">
              <div className="p-3 bg-slate-50/50 flex justify-between items-center border-b border-slate-100">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Lista de Avaliadores cadastrados
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded-full">
                  {cqs.length} Total
                </span>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <RefreshCw className="animate-spin text-claro-red" size={24} />
                  <p className="text-xs font-semibold text-slate-500">Carregando avaliadores do banco...</p>
                </div>
              ) : cqs.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="mx-auto w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center border border-slate-100">
                    <User size={18} className="opacity-60" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700">Nenhum avaliador cadastrado</h4>
                    <p className="text-[10px] text-slate-400 font-medium max-w-xs mx-auto mt-0.5">
                      Adicione um novo avaliador utilizando os botões acima para agendar avaliações.
                    </p>
                  </div>
                </div>
              ) : (
                cqs.map((cq) => (
                  <div key={cq.id} className="p-3 hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                    <div className="space-y-1 max-w-[70%]">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-800 text-xs leading-tight">
                          {cq.nome}
                        </span>
                        
                        {/* Profile and Status Badges */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cq.perfil === 'CQ' ? (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                              <span>🟥</span>
                              <span>CQ</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                              <span>🟦</span>
                              <span>ANALISTA</span>
                            </span>
                          )}

                          {cq.status === 'Ativo' ? (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span>🟢</span>
                              <span>ATIVO</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              <span>🔘</span>
                              <span>INATIVO</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 text-slate-400 text-[10px] mt-0.5">
                        <MapPin size={10} />
                        <span className="font-semibold">{cq.cidadeBase}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-0.5">
                      <button
                        onClick={() => handleStartEdit(cq)}
                        disabled={isSaving || isLoading}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Editar Avaliador"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(cq.id)}
                        disabled={isSaving || isLoading}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Excluir Avaliador"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

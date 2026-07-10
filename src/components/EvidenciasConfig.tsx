import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Search, 
  Filter, 
  Loader2, 
  AlertTriangle, 
  ChevronRight, 
  Image, 
  FileImage, 
  ArrowLeft, 
  Settings2,
  Camera,
  Upload,
  Eye,
  CheckCircle2,
  ListTodo,
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileCheck,
  ShieldCheck
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface Certificacao {
  id: number;
  nome: string;
  descricao?: string;
  cor?: string;
  icone?: string;
  ativa: number;
}

interface Missao {
  id: string;
  certificacao_id: number;
  nome: string;
  descricao?: string;
  orientacao_foto?: string;
  grupo_evidencia?: string;
  quantidade_minima: number;
  quantidade_maxima: number;
  obrigatoria: number;
  ordem: number;
  ativa: number;
  permite_camera: number;
  permite_galeria: number;
  prompt_ia_especifico?: string;
  exemplo_correto_r2_key?: string;
  exemplo_incorreto_r2_key?: string;
  total_itens?: number;
}

interface ChecklistItem {
  id: number;
  certificacao_id: number;
  grupo_id: number;
  ordem: number;
  descricao: string;
  critico: number;
  obrigatorio: number;
  ativo: number;
  grupo_nome?: string;
}

interface ItemMapping {
  item_id: number;
  tipo_validacao: string;
  peso_ia: number;
  confirmacao_cq_obrigatoria: number;
  ativo: number;
}

async function processAndCompressImage(file: File): Promise<{ base64: string; size: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1200; // Optimize for examples

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        const sizeInBytes = Math.round((compressedBase64.length * 3) / 4);

        resolve({
          base64: compressedBase64,
          size: sizeInBytes,
          width,
          height
        });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function EvidenciasConfig() {
  const [certificacoes, setCertificacoes] = useState<Certificacao[]>([]);
  const [selectedCertId, setSelectedCertId] = useState<number | null>(null);
  const [missoes, setMissoes] = useState<Missao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingMissao, setEditingMissao] = useState<Missao | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    orientacao_foto: '',
    grupo_evidencia: 'Instalação Física',
    quantidade_minima: 1,
    quantidade_maxima: 1,
    obrigatoria: true,
    permite_camera: true,
    permite_galeria: true,
    prompt_ia_especifico: '',
  });

  // Mappings State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingMissao, setMappingMissao] = useState<Missao | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<ItemMapping[]>([]);
  const [mappingSearch, setMappingSearch] = useState('');

  // Duplication State
  const [showDuplicationModal, setShowDuplicationModal] = useState(false);
  const [duplicatingMissao, setDuplicatingMissao] = useState<Missao | null>(null);
  const [targetCertId, setTargetCertId] = useState<number | null>(null);

  // Examples Upload State
  const [uploadingExampleType, setUploadingExampleType] = useState<'correto' | 'incorreto' | null>(null);

  useEffect(() => {
    loadCertifications();
  }, []);

  useEffect(() => {
    if (selectedCertId !== null) {
      loadMissions(selectedCertId);
    } else {
      setMissoes([]);
    }
  }, [selectedCertId]);

  const loadCertifications = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/certificacoes');
      const data = await res.json() as any;
      const list = Array.isArray(data) ? data : (data.data || []);
      const activeList = list.filter((c: any) => c.ativa === 1);
      setCertificacoes(activeList);
      if (activeList.length > 0) {
        setSelectedCertId(activeList[0].id);
      }
    } catch (err) {
      setErrorMsg("Falha ao carregar certificações.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMissions = async (certId: number) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/certificacoes/${certId}/missoes`);
      const data = await res.json() as any;
      if (data.success) {
        setMissoes(data.data || []);
      } else {
        setMissoes([]);
        setErrorMsg(data.error || "Erro ao carregar missões.");
      }
    } catch (err) {
      setErrorMsg("Erro de rede ao carregar missões.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingMissao(null);
    setFormData({
      nome: '',
      descricao: '',
      orientacao_foto: '',
      grupo_evidencia: 'Instalação Física',
      quantidade_minima: 1,
      quantidade_maxima: 1,
      obrigatoria: true,
      permite_camera: true,
      permite_galeria: true,
      prompt_ia_especifico: '',
    });
    setErrorMsg(null);
    setShowFormModal(true);
  };

  const handleOpenEditModal = (m: Missao) => {
    setEditingMissao(m);
    setFormData({
      nome: m.nome,
      descricao: m.descricao || '',
      orientacao_foto: m.orientacao_foto || '',
      grupo_evidencia: m.grupo_evidencia || 'Instalação Física',
      quantidade_minima: m.quantidade_minima,
      quantidade_maxima: m.quantidade_maxima,
      obrigatoria: m.obrigatoria === 1,
      permite_camera: m.permite_camera !== 0,
      permite_galeria: m.permite_galeria !== 0,
      prompt_ia_especifico: m.prompt_ia_especifico || '',
    });
    setErrorMsg(null);
    setShowFormModal(true);
  };

  const handleSaveMissao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCertId) return;

    if (!formData.nome.trim()) {
      setErrorMsg("O nome da missão é obrigatório.");
      return;
    }
    if (!formData.descricao.trim()) {
      setErrorMsg("A descrição é obrigatória.");
      return;
    }
    if (formData.quantidade_minima < 0) {
      setErrorMsg("A quantidade mínima não pode ser negativa.");
      return;
    }
    if (formData.quantidade_maxima < formData.quantidade_minima) {
      setErrorMsg("A quantidade máxima deve ser maior ou igual à quantidade mínima.");
      return;
    }
    if (formData.obrigatoria && formData.quantidade_minima < 1) {
      setErrorMsg("Se a missão é obrigatória, a quantidade mínima deve ser de pelo menos 1.");
      return;
    }

    setIsActionLoading(true);
    setErrorMsg(null);

    try {
      const isEdit = !!editingMissao;
      const url = isEdit 
        ? `/api/missoes-evidencias/${editingMissao.id}`
        : `/api/certificacoes/${selectedCertId}/missoes`;

      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        ordem: isEdit ? editingMissao.ordem : (missoes.length > 0 ? Math.max(...missoes.map(m => m.ordem)) + 1 : 1),
        ativa: isEdit ? editingMissao.ativa : 1,
        created_by: 'analista',
        updated_by: 'analista',
      };

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json() as any;

      if (data.success) {
        setSuccessMsg(isEdit ? "Missão atualizada com sucesso!" : "Nova missão criada com sucesso!");
        setShowFormModal(false);
        loadMissions(selectedCertId);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setErrorMsg(data.error || "Erro ao salvar missão.");
      }
    } catch (err) {
      setErrorMsg("Falha ao salvar a missão.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteMissao = async (m: Missao) => {
    if (!selectedCertId) return;
    if (!confirm(`Tem certeza que deseja excluir ou desativar a missão "${m.nome}"?`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await apiFetch(`/api/missoes-evidencias/${m.id}?user=analista`, {
        method: 'DELETE'
      });
      const data = await res.json() as any;

      if (data.success) {
        alert(data.message || "Ação concluída com sucesso.");
        loadMissions(selectedCertId);
      } else {
        alert(data.error || "Erro ao executar exclusão.");
      }
    } catch (err) {
      alert("Erro ao tentar excluir a missão.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleMissaoAtiva = async (m: Missao) => {
    if (!selectedCertId) return;
    setIsActionLoading(true);
    try {
      const res = await apiFetch(`/api/missoes-evidencias/${m.id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: m.nome,
          descricao: m.descricao,
          orientacao_foto: m.orientacao_foto,
          grupo_evidencia: m.grupo_evidencia,
          quantidade_minima: m.quantidade_minima,
          quantidade_maxima: m.quantidade_maxima,
          obrigatoria: m.obrigatoria === 1,
          ordem: m.ordem,
          ativa: m.ativa === 1 ? 0 : 1,
          permite_camera: m.permite_camera,
          permite_galeria: m.permite_galeria,
          prompt_ia_especifico: m.prompt_ia_especifico,
          updated_by: 'analista'
        })
      });
      const data = await res.json() as any;
      if (data.success) {
        setSuccessMsg(m.ativa === 1 ? "Missão desativada com sucesso!" : "Missão reativada com sucesso!");
        loadMissions(selectedCertId);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        alert(data.error || "Erro ao alternar status.");
      }
    } catch (err) {
      alert("Falha de rede ao alternar status.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    if (!selectedCertId) return;
    const newMissions = [...missoes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newMissions.length) return;

    // Swap
    const temp = newMissions[index];
    newMissions[index] = newMissions[targetIndex];
    newMissions[targetIndex] = temp;

    // Assign new orders
    const updatedOrders = newMissions.map((m, i) => ({
      id: m.id,
      ordem: i + 1
    }));

    setMissoes(newMissions.map((m, i) => ({ ...m, ordem: i + 1 })));

    try {
      const res = await apiFetch('/api/missoes-evidencias/ordem', {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: updatedOrders, user: 'analista' })
      });
      const data = await res.json() as any;
      if (!data.success) {
        alert(data.error || "Erro ao salvar ordenação.");
        loadMissions(selectedCertId);
      }
    } catch (err) {
      alert("Erro ao sincronizar ordenação.");
      loadMissions(selectedCertId);
    }
  };

  // Mappings
  const handleOpenMappingModal = async (m: Missao) => {
    setMappingMissao(m);
    setIsActionLoading(true);
    setMappingSearch('');
    try {
      const res = await apiFetch(`/api/missoes-evidencias/${m.id}/itens`);
      const data = await res.json() as any;
      if (data.success) {
        setChecklistItems(data.items || []);
        setSelectedMappings(data.mappings || []);
        setShowMappingModal(true);
      } else {
        alert(data.error || "Falha ao carregar itens de mapeamento.");
      }
    } catch (err) {
      alert("Erro de rede ao buscar mapeamentos.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleItemSelection = (item: ChecklistItem) => {
    const exists = selectedMappings.find(m => m.item_id === item.id);
    if (exists) {
      setSelectedMappings(selectedMappings.filter(m => m.item_id !== item.id));
    } else {
      setSelectedMappings([...selectedMappings, {
        item_id: item.id,
        tipo_validacao: 'IMAGEM',
        peso_ia: 1.0,
        confirmacao_cq_obrigatoria: 1,
        ativo: 1
      }]);
    }
  };

  const handleUpdateMappingField = (itemId: number, field: keyof ItemMapping, value: any) => {
    setSelectedMappings(selectedMappings.map(m => {
      if (m.item_id === itemId) {
        return {
          ...m,
          [field]: field === 'confirmacao_cq_obrigatoria' || field === 'ativo' ? (value ? 1 : 0) : value
        };
      }
      return m;
    }));
  };

  const handleSaveMappings = async () => {
    if (!mappingMissao || !selectedCertId) return;
    setIsActionLoading(true);

    try {
      const res = await apiFetch(`/api/missoes-evidencias/${mappingMissao.id}/itens`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: selectedMappings,
          user: 'analista'
        })
      });
      const data = await res.json() as any;
      if (data.success) {
        setSuccessMsg("Vínculos com o checklist salvos!");
        setShowMappingModal(false);
        loadMissions(selectedCertId);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        alert(data.error || "Falha ao salvar vínculos.");
      }
    } catch (err) {
      alert("Erro de rede ao salvar vínculos.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Duplication
  const handleOpenDuplicationModal = (m: Missao) => {
    setDuplicatingMissao(m);
    setTargetCertId(null);
    setShowDuplicationModal(true);
  };

  const handleSaveDuplication = async () => {
    if (!duplicatingMissao || !targetCertId) return;
    setIsActionLoading(true);

    try {
      const res = await apiFetch(`/api/missoes-evidencias/${duplicatingMissao.id}/duplicar`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCertificacaoId: targetCertId,
          user: 'analista'
        })
      });
      const data = await res.json() as any;

      if (data.success) {
        setShowDuplicationModal(false);
        const newMissaoId = data.data.id;
        
        // Let the user know it was duplicated and prompt for mapping remapping
        if (confirm("Missão duplicada com sucesso! Deseja vincular/mapear os itens do checklist da certificação de destino agora?")) {
          // Select target certification and open mapping modal for the new mission
          setSelectedCertId(targetCertId);
          setTimeout(async () => {
            // Find the duplicated mission in the newly loaded list
            const resNew = await apiFetch(`/api/certificacoes/${targetCertId}/missoes`);
            const dataNew = await resNew.json() as any;
            if (dataNew.success) {
              const duplicated = (dataNew.data || []).find((x: any) => x.id === newMissaoId);
              if (duplicated) {
                handleOpenMappingModal(duplicated);
              }
            }
          }, 600);
        } else {
          setSelectedCertId(targetCertId);
        }
      } else {
        alert(data.error || "Erro ao duplicar missão.");
      }
    } catch (err) {
      alert("Falha de rede ao duplicar missão.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Upload/Remove Examples
  const handleExampleUpload = async (file: File, type: 'correto' | 'incorreto') => {
    if (!editingMissao || !selectedCertId) return;
    setUploadingExampleType(type);

    try {
      const processed = await processAndCompressImage(file);
      const res = await apiFetch('/api/missoes-evidencias/upload-exemplo', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'upload',
          certificacaoId: selectedCertId,
          missaoId: editingMissao.id,
          tipoExemplo: type,
          arquivo_base64: processed.base64,
          mime_type: 'image/jpeg',
          user: 'analista'
        })
      });
      const data = await res.json() as any;

      if (data.success) {
        alert(`Foto de exemplo ${type} enviada!`);
        // Update local editing state
        setEditingMissao({
          ...editingMissao,
          [type === 'correto' ? 'exemplo_correto_r2_key' : 'exemplo_incorreto_r2_key']: data.r2_key
        });
        loadMissions(selectedCertId);
      } else {
        alert(data.error || "Falha ao enviar foto de exemplo.");
      }
    } catch (err) {
      alert("Erro ao processar imagem.");
    } finally {
      setUploadingExampleType(null);
    }
  };

  const handleExampleRemove = async (type: 'correto' | 'incorreto') => {
    if (!editingMissao || !selectedCertId) return;
    if (!confirm(`Remover foto de exemplo ${type}?`)) return;
    setUploadingExampleType(type);

    try {
      const res = await apiFetch('/api/missoes-evidencias/upload-exemplo', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'remove',
          certificacaoId: selectedCertId,
          missaoId: editingMissao.id,
          tipoExemplo: type,
          user: 'analista'
        })
      });
      const data = await res.json() as any;

      if (data.success) {
        alert(`Foto de exemplo ${type} removida!`);
        setEditingMissao({
          ...editingMissao,
          [type === 'correto' ? 'exemplo_correto_r2_key' : 'exemplo_incorreto_r2_key']: undefined
        });
        loadMissions(selectedCertId);
      } else {
        alert(data.error || "Falha ao remover foto.");
      }
    } catch (err) {
      alert("Erro ao remover imagem.");
    } finally {
      setUploadingExampleType(null);
    }
  };

  // Group items for rendering
  const itemsByGroup: Record<string, ChecklistItem[]> = {};
  checklistItems.forEach(item => {
    const group = item.grupo_nome || "Sem Grupo";
    if (!itemsByGroup[group]) itemsByGroup[group] = [];
    itemsByGroup[group].push(item);
  });

  const filteredMissions = missoes.filter(m => {
    const term = searchTerm.toLowerCase();
    return m.nome.toLowerCase().includes(term) || 
           (m.descricao && m.descricao.toLowerCase().includes(term)) ||
           (m.grupo_evidencia && m.grupo_evidencia.toLowerCase().includes(term));
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6" id="evidencias-config-container">
      
      {/* Upper Navigation/Header */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
              <Settings2 className="w-5 h-5 text-red-500 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Configurar Portal de Evidências</h1>
              <p className="text-xs text-slate-500">Controle missões de fotos, regras de validação por IA e vínculos com o checklist</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Certification Filter */}
          <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedCertId || ''}
              onChange={(e) => setSelectedCertId(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              {certificacoes.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-red-500" />
            Nova Missão
          </button>
        </div>
      </div>

      {/* Messages Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {/* Main Board */}
      <div className="bg-white border border-slate-150 rounded-2xl overflow-hidden shadow-sm">
        
        {/* Board Search Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar missões..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-250 focus:border-slate-400 rounded-xl text-sm placeholder-slate-400 outline-none transition-all"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Mostrando {filteredMissions.length} missões
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <p className="text-xs text-slate-500">Carregando missões da certificação...</p>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Image className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Nenhuma missão encontrada</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Esta certificação ainda não possui missões configuradas ou não correspondem ao filtro de busca.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">Ordem</th>
                  <th className="py-3.5 px-4">Missão / Descrição</th>
                  <th className="py-3.5 px-4 w-32">Grupo Evidência</th>
                  <th className="py-3.5 px-4 w-28 text-center">Fotos (Mín-Máx)</th>
                  <th className="py-3.5 px-4 w-28 text-center">Obrigatória</th>
                  <th className="py-3.5 px-4 w-32 text-center">Itens Checklist</th>
                  <th className="py-3.5 px-4 w-24 text-center">Status</th>
                  <th className="py-3.5 px-4 w-44 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {filteredMissions.map((m, index) => (
                  <tr key={m.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-4 px-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => handleReorder(index, 'up')}
                          disabled={index === 0}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30 cursor-pointer"
                          title="Subir Ordem"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{m.ordem}</span>
                        <button
                          onClick={() => handleReorder(index, 'down')}
                          disabled={index === filteredMissions.length - 1}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30 cursor-pointer"
                          title="Descer Ordem"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-4 max-w-sm">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          {m.nome}
                          {(m.exemplo_correto_r2_key || m.exemplo_incorreto_r2_key) && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-red-50 text-[9px] font-bold text-red-600 border border-red-100/50" title="Possui fotos de exemplo">
                              <Eye className="w-3 h-3 mr-0.5" /> Exemplos
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-500 leading-normal line-clamp-2">{m.descricao}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-700">
                      {m.grupo_evidencia || "Geral"}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-slate-800">
                      {m.quantidade_minima} - {m.quantidade_maxima}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.obrigatoria === 1 
                          ? 'bg-red-50 text-red-600 border border-red-100/40' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200/40'
                      }`}>
                        {m.obrigatoria === 1 ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleOpenMappingModal(m)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                      >
                        <ListTodo className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>{m.total_itens || 0} vínculos</span>
                      </button>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggleMissaoAtiva(m)}
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          m.ativa === 1 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/40' 
                            : 'bg-rose-50 text-rose-600 border border-rose-100/40'
                        }`}
                        title={m.ativa === 1 ? "Clique para desativar" : "Clique para reativar"}
                      >
                        {m.ativa === 1 ? 'Ativa' : 'Inativa'}
                      </button>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(m)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                          title="Editar Missão"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDuplicationModal(m)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                          title="Duplicar Missão"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMissao(m)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Excluir Missão"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FORM MODAL (New / Edit) */}
      <AnimatePresence>
        {showFormModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-2xl w-full max-w-3xl relative flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {editingMissao ? "Editar Missão de Evidência" : "Nova Missão de Evidência"}
                  </h3>
                  <p className="text-xs text-slate-500">Preencha os dados e configure as regras desta missão</p>
                </div>
                <button
                  onClick={() => setShowFormModal(false)}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveMissao} className="p-6 overflow-y-auto space-y-4 flex-1">
                
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="font-semibold leading-relaxed">{errorMsg}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nome */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-500">Nome da Missão *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Conectorização Técnica"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>

                  {/* Grupo Evidência */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-500">Grupo de Evidência</label>
                    <input
                      type="text"
                      placeholder="Ex: Instalação Física, Processos, Sinal"
                      value={formData.grupo_evidencia}
                      onChange={(e) => setFormData({ ...formData, grupo_evidencia: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500">Descrição / Objetivo *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Descreva claramente o que o técnico deve evidenciar nesta missão."
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all resize-none"
                    />
                  </div>

                  {/* Orientação da Foto */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500">Orientação Técnica de Como Fotografar</label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Fotografe bem de perto (macrofoco) mostrando o conector finalizado na NAP com boa iluminação."
                      value={formData.orientacao_foto}
                      onChange={(e) => setFormData({ ...formData, orientacao_foto: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all resize-none"
                    />
                  </div>

                  {/* Quantidade Mínima */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-500">Qtd Mínima de Fotos *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formData.quantidade_minima}
                      onChange={(e) => setFormData({ ...formData, quantidade_minima: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>

                  {/* Quantidade Máxima */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-500">Qtd Máxima de Fotos *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={formData.quantidade_maxima}
                      onChange={(e) => setFormData({ ...formData, quantidade_maxima: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>

                  {/* Checkboxes Config */}
                  <div className="space-y-2 md:col-span-2 bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <span className="block text-xs font-bold uppercase text-slate-500 mb-2">Opções de Captura e Regras</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center space-x-2.5 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.obrigatoria}
                          onChange={(e) => setFormData({ ...formData, obrigatoria: e.target.checked })}
                          className="rounded text-red-600 focus:ring-red-500 w-4.5 h-4.5 border-slate-300"
                        />
                        <span className="font-bold">Obrigatória</span>
                      </label>

                      <label className="flex items-center space-x-2.5 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.permite_camera}
                          onChange={(e) => setFormData({ ...formData, permite_camera: e.target.checked })}
                          className="rounded text-red-600 focus:ring-red-500 w-4.5 h-4.5 border-slate-300"
                        />
                        <span>Permite Câmera</span>
                      </label>

                      <label className="flex items-center space-x-2.5 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.permite_galeria}
                          onChange={(e) => setFormData({ ...formData, permite_galeria: e.target.checked })}
                          className="rounded text-red-600 focus:ring-red-500 w-4.5 h-4.5 border-slate-300"
                        />
                        <span>Permite Galeria</span>
                      </label>
                    </div>
                  </div>

                  {/* Prompt IA Específico */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-red-500" />
                      Instruções / Prompt Específico para IA
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Instruções adicionais de detecção de IA específicas desta foto de missão. Se em branco, usa o prompt padrão seguro."
                      value={formData.prompt_ia_especifico}
                      onChange={(e) => setFormData({ ...formData, prompt_ia_especifico: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all font-mono text-xs leading-normal"
                    />
                  </div>
                </div>

                {/* Secure Examples (Section 7) ONLY WHEN EDITING */}
                {editingMissao && (
                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Image className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-bold uppercase text-slate-500">Exemplos Visuais de Foto (Opcional - R2)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Correto */}
                      <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Foto de Exemplo Correto (OK)</span>
                          <p className="text-[10px] text-slate-400">Mostrado como referência de boa prática para os técnicos.</p>
                        </div>

                        {editingMissao.exemplo_correto_r2_key ? (
                          <div className="relative group rounded-xl overflow-hidden border border-emerald-250">
                            <img
                              src={`/api/ia/evidencias/file?key=${encodeURIComponent(editingMissao.exemplo_correto_r2_key)}`}
                              alt="Exemplo Correto"
                              className="w-full h-32 object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <button
                                type="button"
                                onClick={() => handleExampleRemove('correto')}
                                disabled={uploadingExampleType !== null}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                              >
                                {uploadingExampleType === 'correto' ? 'Removendo...' : 'Excluir Exemplo'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="border-2 border-dashed border-emerald-200 bg-emerald-50/10 rounded-xl py-6 px-4 flex flex-col items-center justify-center cursor-pointer hover:bg-emerald-50/30 transition-all text-emerald-600">
                            <Upload className="w-5 h-5 mb-1 shrink-0" />
                            <span className="text-xs font-semibold">Enviar Foto Correta</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleExampleUpload(e.target.files[0], 'correto');
                                }
                              }}
                              disabled={uploadingExampleType !== null}
                            />
                          </label>
                        )}
                      </div>

                      {/* Incorreto */}
                      <div className="bg-rose-50/40 border border-rose-100 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">Foto de Exemplo Incorreto (ERRO)</span>
                          <p className="text-[10px] text-slate-400">Mostrado como referência de falha de conectorização ou erro.</p>
                        </div>

                        {editingMissao.exemplo_incorreto_r2_key ? (
                          <div className="relative group rounded-xl overflow-hidden border border-rose-250">
                            <img
                              src={`/api/ia/evidencias/file?key=${encodeURIComponent(editingMissao.exemplo_incorreto_r2_key)}`}
                              alt="Exemplo Incorreto"
                              className="w-full h-32 object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <button
                                type="button"
                                onClick={() => handleExampleRemove('incorreto')}
                                disabled={uploadingExampleType !== null}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                              >
                                {uploadingExampleType === 'incorreto' ? 'Removendo...' : 'Excluir Exemplo'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="border-2 border-dashed border-rose-200 bg-rose-50/10 rounded-xl py-6 px-4 flex flex-col items-center justify-center cursor-pointer hover:bg-rose-50/30 transition-all text-rose-600">
                            <Upload className="w-5 h-5 mb-1 shrink-0" />
                            <span className="text-xs font-semibold">Enviar Foto Incorreta</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleExampleUpload(e.target.files[0], 'incorreto');
                                }
                              }}
                              disabled={uploadingExampleType !== null}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </form>

              {/* Form Actions Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMissao}
                  disabled={isActionLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Missão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHECKLIST MAPPINGS MODAL */}
      <AnimatePresence>
        {showMappingModal && mappingMissao && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-2xl w-full max-w-4xl relative flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                    <ListTodo className="w-5 h-5 text-red-500" />
                    Vincular Itens do Checklist
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mapeie quais itens do checklist pertencem à missão <strong className="text-slate-800">"{mappingMissao.nome}"</strong>
                  </p>
                </div>
                
                <div className="flex items-center space-x-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-center">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filtrar itens..."
                    value={mappingSearch}
                    onChange={(e) => setMappingSearch(e.target.value)}
                    className="bg-transparent text-xs text-slate-700 outline-none w-36 sm:w-44"
                  />
                </div>
              </div>

              {/* Items List Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <span className="font-semibold">Contador de vínculos selecionados:</span>
                  <span className="bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded-full border border-red-100/50">
                    {selectedMappings.length} itens selecionados
                  </span>
                </div>

                <div className="space-y-6">
                  {Object.keys(itemsByGroup).map(groupName => {
                    // Filter items inside this group by mappingSearch
                    const items = itemsByGroup[groupName].filter(it => 
                      it.descricao.toLowerCase().includes(mappingSearch.toLowerCase())
                    );

                    if (items.length === 0) return null;

                    return (
                      <div key={groupName} className="space-y-2">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg border-l-4 border-red-500">
                          {groupName}
                        </h4>

                        <div className="divide-y divide-slate-100 border border-slate-150 rounded-2xl overflow-hidden bg-white">
                          {items.map(it => {
                            const mapping = selectedMappings.find(m => m.item_id === it.id);
                            const isSelected = !!mapping;

                            return (
                              <div key={it.id} className={`p-4 transition-all ${isSelected ? 'bg-red-50/15' : ''}`}>
                                <div className="flex items-start gap-3 justify-between">
                                  <label className="flex items-start gap-2.5 cursor-pointer select-none flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleItemSelection(it)}
                                      className="rounded text-red-600 focus:ring-red-500 w-4.5 h-4.5 border-slate-300 mt-0.5"
                                    />
                                    <div>
                                      <p className="text-sm font-bold text-slate-800 leading-snug">{it.descricao}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Item ID: {it.id} • Ordem: {it.ordem}</p>
                                    </div>
                                  </label>

                                  {isSelected && mapping && (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-xs">
                                      {/* Tipo Validação */}
                                      <div className="space-y-1">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400">Validação</span>
                                        <select
                                          value={mapping.tipo_validacao}
                                          onChange={(e) => handleUpdateMappingField(it.id, 'tipo_validacao', e.target.value)}
                                          className="bg-slate-50 border border-slate-250 rounded px-2 py-1 font-semibold text-slate-700 outline-none"
                                        >
                                          <option value="IMAGEM">IMAGEM</option>
                                          <option value="HIBRIDO">HÍBRIDO</option>
                                        </select>
                                      </div>

                                      {/* Peso IA */}
                                      <div className="space-y-1">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400">Peso IA</span>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          max="10"
                                          value={mapping.peso_ia}
                                          onChange={(e) => handleUpdateMappingField(it.id, 'peso_ia', parseFloat(e.target.value))}
                                          className="w-14 bg-slate-50 border border-slate-250 rounded px-2 py-1 text-center font-semibold text-slate-700 outline-none"
                                        />
                                      </div>

                                      {/* Confirmação CQ obrigatória */}
                                      <label className="flex items-center space-x-1.5 self-end sm:self-center cursor-pointer pt-3 sm:pt-0">
                                        <input
                                          type="checkbox"
                                          checked={mapping.confirmacao_cq_obrigatoria === 1}
                                          onChange={(e) => handleUpdateMappingField(it.id, 'confirmacao_cq_obrigatoria', e.target.checked)}
                                          className="rounded text-red-600 focus:ring-red-500 w-4 h-4 border-slate-300"
                                        />
                                        <span className="text-[11px] font-medium text-slate-600">Requer CQ</span>
                                      </label>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Mapping Actions Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMappingModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMappings}
                  disabled={isActionLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Vínculos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DUPLICATION MODAL */}
      <AnimatePresence>
        {showDuplicationModal && duplicatingMissao && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-2xl w-full max-w-md relative flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Duplicar Configuração</h3>
                  <p className="text-xs text-slate-500">Copia a missão de evidências para outra certificação</p>
                </div>
                <button
                  onClick={() => setShowDuplicationModal(false)}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 leading-relaxed">
                  <p>A missão <strong className="text-slate-800">"{duplicatingMissao.nome}"</strong> será copiada com todos os parâmetros (orientação, fotos mín/máx, regras, prompts).</p>
                  <p className="text-red-500 font-bold mt-1.5">Aviso: Os vínculos do checklist não serão copiados devido a IDs de certificação incompatíveis. Você será guiado para vinculá-los manualmente após a cópia.</p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase text-slate-500">Selecione a Certificação de Destino</label>
                  <select
                    value={targetCertId || ''}
                    onChange={(e) => setTargetCertId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-250 focus:border-slate-450 rounded-xl text-sm outline-none transition-all cursor-pointer"
                  >
                    <option value="">-- Escolher certificação --</option>
                    {certificacoes
                      .filter(c => c.id !== duplicatingMissao.certificacao_id)
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDuplicationModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveDuplication}
                  disabled={isActionLoading || !targetCertId}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Duplicar e Remapear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

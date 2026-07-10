import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  CheckCircle, 
  AlertCircle, 
  Upload, 
  Loader2, 
  ShieldCheck, 
  FileCheck, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  Check, 
  RefreshCw,
  Clock
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface PortalTecnicoProps {
  token?: string;
}

interface Mission {
  id: string;
  certificacao_id: number;
  nome: string;
  descricao: string;
  orientacao_foto: string;
  grupo_evidencia: string;
  quantidade_minima: number;
  quantidade_maxima: number;
  obrigatoria: number;
  ordem: number;
}

interface Evidence {
  id: string;
  portal_id: string;
  avaliacao_id: string;
  missao_id: string;
  r2_key: string;
  status: string;
  repetida: number;
  enviada_em: string;
}

interface PortalState {
  id: string;
  status: string;
  liberadoEm: string;
  expira_em: string;
  encerradoEm: string | null;
  encerradoMotivo: string | null;
}

interface EvaluationState {
  id: string;
  nomeTecnico: string;
  matricula: string;
  empresa: string;
  cidadeBase: string;
  certificacaoNome: string;
}

interface ActivePortalOption {
  portalId: string;
  token: string;
  status: string;
  expiraEm: string;
  avaliacaoId: string;
  nomeTecnico: string;
  matricula: string;
  certificacaoNome: string;
  dataAvaliacao: string;
  empresa: string;
  cidadeBase: string;
  fotosEnviadas: number;
  totalMissoes: number;
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
        const maxDimension = 1600; // high quality limit

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

        // Compress as JPEG at 0.8 quality (strips EXIF metadata automatically)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
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

export default function PortalTecnico({ token }: PortalTecnicoProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sessionHash, setSessionHash] = useState<string>('');
  const [matriculaInput, setMatriculaInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // For tokenless access list of active evaluations
  const [activePortals, setActivePortals] = useState<ActivePortalOption[]>([]);
  const [showSelectionScreen, setShowSelectionScreen] = useState<boolean>(false);
  const [selectedPortalToken, setSelectedPortalToken] = useState<string>('');

  // Portal data
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(null);
  const [missoes, setMissoes] = useState<Mission[]>([]);
  const [evidencias, setEvidencias] = useState<Evidence[]>([]);
  
  // UI States
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [uploadingMissionId, setUploadingMissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState<boolean>(false);

  // Load portal data
  const loadPortalDataForToken = async (currentToken: string, currentSessionHash?: string, silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/evidencias/portal/${currentToken}`);
      if (!res.ok) {
        const err = await res.json() as any;
        setErrorMsg(err.error || "Erro ao carregar o portal.");
        setIsLoading(false);
        return;
      }
      const data = await res.json() as any;
      setPortal(data.portal);
      setEvaluation(data.evaluation);
      setMissoes(data.missoes);
      setEvidencias(data.evidencias);
      setSelectedPortalToken(currentToken);

      // Auto-expand first pending mission
      if (data.missoes && data.missoes.length > 0) {
        const uploadedIds = (data.evidencias || []).map((e: any) => e.missao_id);
        const firstPending = data.missoes.find((m: any) => !uploadedIds.includes(m.id));
        if (firstPending) {
          setExpandedMission(firstPending.id);
        } else {
          setExpandedMission(data.missoes[0].id);
        }
      }

      if (currentSessionHash) {
        setSessionHash(currentSessionHash);
        localStorage.setItem(`portal_session_${currentToken}`, currentSessionHash);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Falha na conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      // If a token is provided in the URL directly, we load it
      loadPortalDataForToken(token);
      
      const savedSession = localStorage.getItem(`portal_session_${token}`);
      if (savedSession) {
        setIsAuthenticated(true);
        setSessionHash(savedSession);
      }
    } else {
      // Tokenless flow: wait for manual login
      setIsLoading(false);
    }
  }, [token]);

  // Handle Login (Token-free `/portal-tecnico` flow)
  const handleVerifyIdentityTokenless = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matriculaInput.trim()) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/evidencias/portal/login', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: matriculaInput.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json() as any;
        setErrorMsg(data.error || "Matrícula inválida ou nenhuma avaliação ativa encontrada.");
        setIsVerifying(false);
        return;
      }

      const data = await res.json() as any;
      setSessionHash(data.sessionHash);
      
      if (data.portals && data.portals.length === 1) {
        // Only one active portal -> auto-redirect/auto-load
        const singlePortal = data.portals[0];
        setSelectedPortalToken(singlePortal.token);
        setIsAuthenticated(true);
        await loadPortalDataForToken(singlePortal.token, data.sessionHash);
      } else if (data.portals && data.portals.length > 1) {
        // Multiple active portals -> show selection list
        setActivePortals(data.portals);
        setShowSelectionScreen(true);
      } else {
        setErrorMsg("Nenhuma avaliação ativa encontrada.");
      }
    } catch (err) {
      setErrorMsg("Falha ao validar login.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Legacy / Token-specific Login
  const handleVerifyIdentityToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matriculaInput.trim() || !token) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch(`/api/evidencias/portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          matricula: matriculaInput.trim()
        })
      });

      if (!res.ok) {
        const data = await res.json() as any;
        setErrorMsg(data.error || "Matrícula incorreta para este link.");
        setIsVerifying(false);
        return;
      }

      const data = await res.json() as any;
      setIsAuthenticated(true);
      setSessionHash(data.sessionHash);
      setSelectedPortalToken(token);
      localStorage.setItem(`portal_session_${token}`, data.sessionHash);
    } catch (err) {
      setErrorMsg("Falha ao validar identidade.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle image upload per mission
  const handleFileUpload = async (missionId: string, file: File) => {
    const currentToken = token || selectedPortalToken;
    if (!currentToken) return;

    setUploadingMissionId(missionId);
    setErrorMsg(null);

    try {
      // 1. Process and compress client-side (strips EXIF automatically)
      const processed = await processAndCompressImage(file);

      // 2. Upload Base64 bytes
      const res = await apiFetch(`/api/evidencias/portal/${currentToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          missaoId: missionId,
          arquivo_base64: processed.base64,
          mime_type: "image/jpeg",
          tamanho_original: file.size,
          tamanho_final: processed.size,
          largura: processed.width,
          altura: processed.height,
          sessionHash
        })
      });

      if (!res.ok) {
        const err = await res.json() as any;
        alert(err.error || "Falha ao enviar arquivo.");
        return;
      }

      // Reload evidences silently
      await loadPortalDataForToken(currentToken, undefined, true);
    } catch (err) {
      console.error(err);
      alert("Falha ao processar e enviar imagem.");
    } finally {
      setUploadingMissionId(null);
    }
  };

  // Handle final submit
  const handleFinalizePortal = async () => {
    if (submitting) return;
    const currentToken = token || selectedPortalToken;
    if (!currentToken) return;

    // Check if there are mandatory pending missions
    const uploadedIds = evidencias.map(e => e.missao_id);
    const pendingMandatory = missoes.filter(m => m.obrigatoria && !uploadedIds.includes(m.id));

    if (pendingMandatory.length > 0) {
      alert(`Você precisa enviar as fotos de todas as missões obrigatórias antes de finalizar.`);
      return;
    }

    if (!confirm("Tem certeza que deseja finalizar e enviar as evidências? Após finalizar, você não poderá realizar novos envios.")) {
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch(`/api/evidencias/portal/${currentToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize"
        })
      });

      if (!res.ok) {
        const err = await res.json() as any;
        setErrorMsg(err.error || "Falha ao finalizar portal.");
        setSubmitting(false);
        return;
      }

      setShowSuccessScreen(true);
      await loadPortalDataForToken(currentToken, undefined, true);
    } catch (err) {
      setErrorMsg("Erro ao finalizar o portal de envio.");
    } finally {
      setSubmitting(false);
    }
  };

  // Render Loader
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4" id="portal-loader">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">Carregando Portal de Evidências...</p>
      </div>
    );
  }

  // Render Multi-Evaluation Selection Screen
  if (showSelectionScreen && activePortals.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 sm:p-6" id="portal-selection">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-6">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600" />
          
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center border border-red-800/40 mb-3">
              <ShieldCheck className="w-6 h-6 text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-center">Suas Avaliações Ativas</h1>
            <p className="text-xs text-slate-400 text-center mt-1">Selecione para qual avaliação deseja enviar fotos:</p>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {activePortals.map((p) => (
              <button
                key={p.portalId}
                onClick={() => {
                  loadPortalDataForToken(p.token, sessionHash);
                  setIsAuthenticated(true);
                  setShowSelectionScreen(false);
                }}
                className="w-full text-left bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-red-600 p-4 rounded-xl transition-all block group relative"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="px-2 py-0.5 bg-red-950 text-red-400 border border-red-900/30 text-[10px] font-black rounded uppercase">
                    {p.certificacaoNome}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    {new Date(p.dataAvaliacao).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-white group-hover:text-red-400 transition-colors">
                  {p.nomeTecnico}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  Empresa: <strong className="text-slate-300 font-bold">{p.empresa}</strong>
                </p>
                <p className="text-[10px] text-slate-400">
                  Cidade: <strong className="text-slate-300 font-bold">{p.cidadeBase}</strong>
                </p>
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex justify-between items-center text-[10px]">
                  <span className="text-slate-500">Progresso de Fotos:</span>
                  <span className="text-emerald-400 font-bold">{p.fotosEnviadas} enviadas</span>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setShowSelectionScreen(false);
              setIsAuthenticated(false);
              setMatriculaInput('');
            }}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors text-center cursor-pointer"
          >
            Voltar para o Login
          </button>
        </div>
      </div>
    );
  }

  // Render Error if there is a blocking message and not logged in
  if (errorMsg && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6 text-center" id="portal-error">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">Erro de Acesso</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">{errorMsg}</p>
        <button 
          onClick={() => {
            setErrorMsg(null);
            setIsAuthenticated(false);
            setMatriculaInput('');
          }}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Voltar e Tentar Novamente
        </button>
      </div>
    );
  }

  // Verification / Login View (Enter matrícula)
  if (!isAuthenticated) {
    const isTokenFlow = !!token;
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 sm:p-6" id="portal-verification">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600" />
          
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center border border-red-800/40 mb-3">
              <ShieldCheck className="w-6 h-6 text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-center">Portal de Evidências Claro</h1>
            <p className="text-xs text-slate-400 text-center mt-1">
              {isTokenFlow ? 'Validação de Acesso para o Técnico' : 'Digite seu login de acesso'}
            </p>
          </div>

          <form onSubmit={isTokenFlow ? handleVerifyIdentityToken : handleVerifyIdentityTokenless} className="space-y-4">
            <div>
              <label htmlFor="matricula-input" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Seu login / matrícula (Ex: TR551234)
              </label>
              <input 
                id="matricula-input"
                type="text"
                placeholder="Ex: TR551234"
                value={matriculaInput}
                onChange={(e) => setMatriculaInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-xl text-base text-white placeholder-slate-600 outline-none transition-all uppercase"
                disabled={isVerifying}
                autoFocus
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-800/40 p-3 rounded-xl" id="verification-error">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200 font-medium leading-relaxed">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !matriculaInput.trim()}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/10 active:scale-98 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando avaliações...
                </>
              ) : (
                <>
                  Acessar Portal
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 leading-normal">
              Acesso exclusivo para envio antecipado de evidências Claro de campo.
              Segurança e integridade garantidas pelas diretrizes da LGPD.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine portal statuses & locks
  const isPortalClosed = portal?.status !== "LIBERADO" && portal?.status !== "EM_ENVIO";
  const expDate = portal ? new Date(portal.expira_em) : new Date();
  const daysLeft = portal ? Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  // Checklist counts
  const uploadedEvs = evidencias || [];
  const uploadedIds = uploadedEvs.map(e => e.missao_id);
  const mandatoryMissions = missoes.filter(m => m.obrigatoria);
  const totalMandatoryUploaded = mandatoryMissions.filter(m => uploadedIds.includes(m.id)).length;
  const totalMandatory = mandatoryMissions.length;
  const isFullyComplete = totalMandatoryUploaded === totalMandatory;

  // Render Success Screen if finalized
  if (showSuccessScreen || portal?.status === "EVIDENCIAS_ENVIADAS") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 sm:p-6 text-center" id="portal-success">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
          
          <div className="w-16 h-16 rounded-full bg-emerald-950 flex items-center justify-center border border-emerald-800/40 mb-4 mx-auto animate-bounce">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>

          <h1 className="text-xl font-bold mb-2 text-white">Evidências Enviadas com Sucesso!</h1>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            Obrigado, <strong>{evaluation?.nomeTecnico}</strong>! Suas fotos foram comprimidas de forma segura e enviadas para análise técnica.
          </p>

          <div className="bg-slate-950/60 rounded-xl p-4 text-left border border-slate-800/60 mb-6 space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Status do Portal:</span>
              <strong className="text-emerald-400 uppercase font-bold">Enviado para Auditoria</strong>
            </div>
            <div className="flex justify-between">
              <span>Certificação:</span>
              <strong className="text-slate-200">{evaluation?.certificacaoNome}</strong>
            </div>
            <div className="flex justify-between">
              <span>Data de Envio:</span>
              <strong className="text-slate-200">{new Date().toLocaleDateString('pt-BR')}</strong>
            </div>
          </div>

          <div className="flex gap-2">
            {!token && (
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setShowSuccessScreen(false);
                  setMatriculaInput('');
                  setPortal(null);
                  setEvaluation(null);
                }}
                className="flex-1 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Voltar ao Início
              </button>
            )}
            <p className="text-xs text-slate-500 py-2 flex-1">
              Você já pode fechar esta página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" id="portal-dashboard">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center font-black text-white text-base">
              C
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">Portal de Evidências</h1>
              <p className="text-[10px] text-slate-400 font-medium">Claro Controle de Qualidade</p>
            </div>
          </div>

          {portal && (
            <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-full border border-slate-800 text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-red-500" />
              <span>{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-5 space-y-4">
        {/* Tech and Evaluation Metadata Card */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start mb-2.5">
            <span className="inline-block px-2 py-0.5 rounded-md bg-red-950 border border-red-900/30 text-[10px] font-bold text-red-500 uppercase tracking-wider">
              {evaluation?.certificacaoNome}
            </span>
            {!token && (
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setPortal(null);
                  setEvaluation(null);
                  setMatriculaInput('');
                }}
                className="text-[10px] text-slate-400 hover:text-white font-medium underline"
              >
                Sair / Outra Avaliação
              </button>
            )}
          </div>
          
          <h2 className="text-base font-bold text-white leading-tight">{evaluation?.nomeTecnico}</h2>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-400">
            <div>
              <span className="block text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Matrícula</span>
              <strong className="text-slate-200">{evaluation?.matricula}</strong>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Empresa Partner</span>
              <strong className="text-slate-200">{evaluation?.empresa}</strong>
            </div>
            <div className="col-span-2 pt-1.5">
              <span className="block text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Cidade e Base</span>
              <strong className="text-slate-200">{evaluation?.cidadeBase}</strong>
            </div>
          </div>
        </div>

        {/* Read-Only Status Banner if locked/expired */}
        {isPortalClosed && (
          <div className="bg-amber-950/30 border border-amber-800/40 p-4 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-300">Envios Bloqueados</h4>
              <p className="text-[11px] text-amber-200/80 leading-normal mt-0.5">
                {portal?.encerradoMotivo || "Este portal foi finalizado ou expirou."}
              </p>
            </div>
          </div>
        )}

        {/* Progress Tracker Widget */}
        {!isPortalClosed && (
          <div className="bg-slate-900 border border-slate-800/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white">Seu progresso de envios</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {totalMandatoryUploaded} de {totalMandatory} fotos obrigatórias enviadas
              </p>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 font-bold text-xs text-red-500 flex items-center gap-1.5">
                <span>{Math.round((totalMandatoryUploaded / (totalMandatory || 1)) * 100)}%</span>
                {isFullyComplete && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </div>
            </div>
          </div>
        )}

        {/* List of Missions */}
        <div className="space-y-3">
          <h3 className="text-xs uppercase font-bold text-slate-400 tracking-wider">Suas Missões Técnicas</h3>

          {missoes.map((m) => {
            const hasUpload = uploadedIds.includes(m.id);
            const ev = evidencias.find(e => e.missao_id === m.id);
            const isExpanded = expandedMission === m.id;
            
            return (
              <div 
                key={m.id}
                className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all duration-200 ${
                  hasUpload ? 'border-emerald-950' : 'border-slate-800'
                }`}
              >
                {/* Header of Accordion */}
                <button
                  type="button"
                  onClick={() => setExpandedMission(isExpanded ? null : m.id)}
                  className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-800/30 transition-all outline-none"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${
                      hasUpload 
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/40' 
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}>
                      {hasUpload ? (
                        <Check className="w-4 h-4 text-emerald-400 font-black" />
                      ) : (
                        <span className="text-xs font-black">{m.ordem}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        {m.nome}
                        {m.obrigatoria === 1 && (
                          <span className="text-[9px] bg-red-950 text-red-400 px-1.5 py-0.2 rounded border border-red-900/30">Obrigatória</span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{m.descricao}</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {/* Content of Accordion */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-800/60 pt-3 space-y-3">
                    {/* Guidance Alert */}
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/50">
                      <span className="text-[9px] uppercase tracking-wide text-red-500 font-bold block mb-1">Como Fotografar:</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-medium">{m.orientacao_foto}</p>
                    </div>

                    {/* Previews / Upload Area */}
                    {hasUpload && ev ? (
                      <div className="relative group rounded-xl overflow-hidden border border-slate-800">
                        <img 
                          src={`/api/ia/evidencias/file?key=${encodeURIComponent(ev.r2_key)}`}
                          alt="Evidência Técnica"
                          className="w-full h-44 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-slate-950/80 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider">Foto Enviada</span>
                          <span className="text-[10px] text-slate-300 leading-tight">
                            Status: {ev.status === 'APROVADO' ? '✓ Aprovada pela IA' : ev.status === 'REJEITADO' ? '✗ Rejeitada' : '⚡ Aguardando Auditoria'}
                          </span>
                          
                          {!isPortalClosed && (
                            <label className="mt-3.5 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-center rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all">
                              <Camera className="w-3.5 h-3.5" />
                              Substituir Foto
                              <input 
                                type="file" 
                                accept="image/jpeg,image/png,image/webp" 
                                capture="environment"
                                className="hidden" 
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleFileUpload(m.id, e.target.files[0]);
                                  }
                                }}
                                disabled={uploadingMissionId !== null}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ) : (
                      !isPortalClosed && (
                        <div className="flex flex-col gap-3">
                          {/* Main Camera trigger button */}
                          <label className="py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs text-center cursor-pointer flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-98">
                            <Camera className="w-6 h-6 animate-pulse" />
                            <span>TIRAR FOTO / ABRIR CÂMERA</span>
                            <input 
                              type="file" 
                              accept="image/jpeg,image/png,image/webp" 
                              capture="environment"
                              className="hidden" 
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleFileUpload(m.id, e.target.files[0]);
                                }
                              }}
                              disabled={uploadingMissionId !== null}
                            />
                          </label>

                          {/* Or Standard upload trigger for files */}
                          <div className="border-2 border-dashed border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center bg-slate-950/20">
                            <Upload className="w-5 h-5 text-slate-500 mb-1" />
                            <p className="text-[10px] text-slate-500 mb-2">Arraste a foto ou selecione do dispositivo</p>
                            <label className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors">
                              Selecionar Arquivo
                              <input 
                                type="file" 
                                accept="image/jpeg,image/png,image/webp" 
                                className="hidden" 
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleFileUpload(m.id, e.target.files[0]);
                                  }
                                }}
                                disabled={uploadingMissionId !== null}
                              />
                            </label>
                          </div>
                        </div>
                      )
                    )}

                    {/* Loader overlay during upload processing */}
                    {uploadingMissionId === m.id && (
                      <div className="flex items-center justify-center gap-2 bg-slate-950/75 p-3 rounded-xl border border-slate-800/50">
                        <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                        <p className="text-xs text-red-400 font-semibold">Comprimindo e enviando foto de forma segura...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Persistent Sticky Footer with Finalize action */}
      {!isPortalClosed && (
        <footer className="bg-slate-900 border-t border-slate-800 p-4 sticky bottom-0 z-40 shadow-xl">
          <div className="max-w-xl mx-auto flex flex-col gap-2">
            <button
              onClick={handleFinalizePortal}
              disabled={submitting || !isFullyComplete}
              className={`w-full py-3.5 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer ${
                isFullyComplete 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/10' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finalizando envio...
                </>
              ) : (
                <>
                  Finalizar e Enviar Evidências
                  <FileCheck className="w-4 h-4" />
                </>
              )}
            </button>
            {!isFullyComplete && (
              <p className="text-[10px] text-slate-500 text-center leading-normal">
                Adicione fotos em todas as <strong>{totalMandatory} missões obrigatórias</strong> para habilitar a finalização do portal.
              </p>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, ImageIcon, Loader2, AlertTriangle, Check, Trash2, ShieldAlert } from 'lucide-react';
import { compressImage, CompressionResult } from '../lib/imageCompression';
import { apiFetch } from '../lib/api';

interface IAEvidenceUploaderProps {
  key?: any;
  certificacaoId: string | number;
  etapa: string;
  existingEvidence?: any;
  onUploadSuccess: (evidencia: any, avaliacaoStatus?: string) => void;
  onDeleteSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function IAEvidenceUploader({
  certificacaoId,
  etapa,
  existingEvidence,
  onUploadSuccess,
  onDeleteSuccess,
  showToast
}: IAEvidenceUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Pending compression result
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleFile = async (file: File) => {
    if (isCompressing || isUploading) {
      showToast('Já existe um processo de envio ou compressão ativo para este item.', 'info');
      return;
    }
    setErrorMsg(null);
    setCompressionResult(null);

    // Limit original: 10 MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMsg('O arquivo excede o limite máximo permitido de 10 MB.');
      showToast('O arquivo excede o limite de 10 MB.', 'error');
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Formato inválido. Selecione uma foto JPG, JPEG, PNG ou WEBP.');
      showToast('Formato de arquivo inválido.', 'error');
      return;
    }

    setIsCompressing(true);
    try {
      const result = await compressImage(file);
      setCompressionResult(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar e comprimir imagem.');
      showToast(err.message || 'Erro ao comprimir imagem.', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCompressing || isUploading) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (isCompressing || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleUpload = async () => {
    if (!compressionResult) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const base64Str = await blobToBase64(compressionResult.blob);

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
      
      const response = await apiFetch('/api/ia/evidencias/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificacao_id: String(certificacaoId),
          etapa,
          arquivo_base64: base64Str,
          mime_type: compressionResult.mimeType,
          tamanho_original: compressionResult.originalSize,
          tamanho_final: compressionResult.finalSize,
          largura: compressionResult.width,
          altura: compressionResult.height,
          usuario_id: user_id,
          perfil_usuario: profile,
          usuario_nome: user_nome
        })
      });

      const resData = await response.json() as any;

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Falha ao enviar evidência para o servidor.');
      }

      showToast('Evidência enviada com sucesso!', 'success');
      setCompressionResult(null);
      onUploadSuccess(resData.evidencia, resData.avaliacaoStatus);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar upload da evidência.');
      showToast(err.message || 'Erro ao enviar evidência.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEvidence || !existingEvidence.id) return;

    if (!window.confirm('Tem certeza que deseja excluir esta evidência?')) {
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const profile = localStorage.getItem('claro_cq_profile') || 'tecnico';
      let user_id = 'tecnico-user';

      if (profile === 'cq') {
        const saved = localStorage.getItem('claro_cq_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
          } catch (e) {}
        }
      } else if (profile === 'analista') {
        const saved = localStorage.getItem('claro_analista_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
          } catch (e) {}
        }
      } else {
        const saved = localStorage.getItem('claro_tecnico_selecionado');
        if (saved) {
          try {
            const u = JSON.parse(saved);
            user_id = u.id || user_id;
          } catch (e) {}
        }
      }

      const queryParams = `?usuario_id=${encodeURIComponent(user_id)}&perfil_usuario=${encodeURIComponent(profile)}`;
      const response = await apiFetch(`/api/ia/evidencias/${existingEvidence.id}${queryParams}`, {
        method: 'DELETE'
      });

      const resData = await response.json() as any;

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Falha ao excluir evidência.');
      }

      showToast('Evidência excluída com sucesso!', 'success');
      onDeleteSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir evidência.');
      showToast(err.message || 'Erro ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Render a nice view if an evidence already exists
  if (existingEvidence) {
    const hasCQDecision = existingEvidence.decisao_cq && existingEvidence.decisao_cq.trim() !== '';
    return (
      <div className="border border-slate-100 bg-slate-50/50 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0">
            <img 
              src={existingEvidence.arquivo_url || existingEvidence.url_arquivo} 
              alt={etapa} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{etapa}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                existingEvidence.status_ia === 'CONFORME' 
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' 
                  : existingEvidence.status_ia === 'NAO_CONFORME' 
                  ? 'bg-rose-50 text-rose-600 border border-rose-200/50' 
                  : 'bg-amber-50 text-amber-600 border border-amber-200/50'
              }`}>
                IA: {existingEvidence.status_ia || 'PENDENTE'}
              </span>
              
              {hasCQDecision && (
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  existingEvidence.decisao_cq === 'APROVADA' || existingEvidence.decisao_cq === 'Aprovar' || existingEvidence.decisao_cq === 'APROVADO'
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-rose-500 text-white'
                }`}>
                  CQ: {existingEvidence.decisao_cq}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Final: {formatSize(existingEvidence.tamanho_final || 0)} | {existingEvidence.largura || 0}x{existingEvidence.altura || 0}px
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          {!hasCQDecision ? (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              title="Excluir evidência"
            >
              {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
            </button>
          ) : (
            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-100">
              <ShieldAlert size={12} className="text-slate-400" />
              Validado pelo CQ
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Label/Title for empty uploader state */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{etapa}</span>
        <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">Pendente</span>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (isCompressing || isUploading) return;
          fileInputRef.current?.click();
        }}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center gap-2 min-h-[140px] select-none ${
          isCompressing || isUploading
            ? 'border-slate-100 bg-slate-50/50 cursor-not-allowed opacity-60 pointer-events-none'
            : isDragActive 
            ? 'border-claro-red bg-red-50/10 cursor-pointer' 
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleChange}
          disabled={isCompressing || isUploading}
        />

        {isCompressing ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="text-claro-red animate-spin" />
            <p className="text-xs font-bold text-slate-700 animate-pulse">Comprimindo imagem...</p>
            <p className="text-[10px] text-slate-400">Otimizando dimensões e qualidade</p>
          </div>
        ) : compressionResult ? (
          <div className="w-full flex flex-col md:flex-row items-center gap-4 text-left" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex-shrink-0">
              <img 
                src={compressionResult.previewUrl} 
                alt="Preview comprimido" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex-grow space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon size={14} className="text-emerald-500" />
                Imagem pronta para envio
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium block">Tamanho Original</span>
                  <span className="text-xs font-bold text-slate-500 line-through">
                    {formatSize(compressionResult.originalSize)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium block font-bold text-emerald-600">Comprimido (WebP)</span>
                  <span className="text-xs font-extrabold text-emerald-600 flex items-center gap-1">
                    {formatSize(compressionResult.finalSize)}
                    <span className="text-[9px] font-medium text-emerald-500 bg-emerald-50 px-1 py-0.2 rounded">
                      -{Math.round((1 - compressionResult.finalSize / compressionResult.originalSize) * 100)}%
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
              <button
                type="button"
                onClick={() => {
                  setCompressionResult(null);
                  setErrorMsg(null);
                }}
                className="flex-1 md:flex-initial px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 md:flex-initial px-4 py-2 text-xs font-extrabold text-white bg-claro-red hover:bg-red-600 rounded-xl shadow-md shadow-red-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-red-50 text-claro-red rounded-2xl group-hover:scale-105 transition-transform duration-150">
              <Upload size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Clique para selecionar ou arraste o arquivo</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Suporta JPG, JPEG, PNG, WEBP (até 10 MB)</p>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}
    </div>
  );
}

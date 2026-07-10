import React from 'react';
import { ShieldCheck, Printer, Download, Eye, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface DocumentoPrivacidadeProps {
  onClose?: () => void;
  token?: string;
  avaliacaoId?: string;
  sessionHash?: string;
}

export default function DocumentoPrivacidade({ onClose, token, avaliacaoId, sessionHash }: DocumentoPrivacidadeProps) {
  React.useEffect(() => {
    // Log visualizado event
    const logVisualized = async () => {
      try {
        await apiFetch('/api/evidencias/portal/privacy-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'visualizar',
            token,
            avaliacaoId,
            sessionHash
          })
        });
      } catch (err) {
        console.error("Failed to log privacy doc visualization:", err);
      }
    };
    logVisualized();
  }, [token, avaliacaoId, sessionHash]);

  const handleDownloadPDF = async () => {
    try {
      // Log baixado event
      await apiFetch('/api/evidencias/portal/privacy-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'baixar',
          token,
          avaliacaoId,
          sessionHash
        })
      });
    } catch (err) {
      console.error("Failed to log privacy doc download:", err);
    }
    // Native print / save as PDF trigger
    window.print();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full mx-auto p-6 sm:p-8 space-y-6 text-slate-300 relative print:bg-white print:text-slate-900 print:border-none print:shadow-none" id="privacy-policy-document">
      {/* Top Controls (Hidden in print) */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-4 print:hidden">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-red-500 w-6 h-6" />
          <h2 className="text-base font-bold text-white uppercase tracking-wide">Segurança e Privacidade das Evidências</h2>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownloadPDF}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download PDF ou Imprimir"
          >
            <Printer size={15} />
            <span>PDF / Imprimir</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Printable Area */}
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 print:max-h-none print:overflow-visible">
        {/* Document Header */}
        <div className="text-center pb-4 border-b border-slate-800/40 print:border-slate-300">
          <h1 className="text-lg font-black text-white print:text-black uppercase">Documento de Segurança e Diretrizes de Privacidade de Evidências</h1>
          <p className="text-xs text-slate-400 mt-1 print:text-slate-600">Claro Controle de Qualidade • Versão do Termo: v1.0.0</p>
        </div>

        {/* Content of 20 Sections */}
        <div className="space-y-5 text-xs sm:text-sm leading-relaxed text-slate-300 print:text-slate-800">
          
          <section>
            <h3 className="font-bold text-white print:text-black mb-1">1. Finalidade das Imagens</h3>
            <p>
              Todas as fotografias técnicas enviadas têm como finalidade única e exclusiva validar e auditar a qualidade técnica da instalação física do serviço. Não há outra finalidade administrativa ou processual.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">2. Quais Dados São Utilizados</h3>
            <p>
              São coletadas apenas as imagens fotográficas dos equipamentos e instalações, bem como informações técnicas acessórias associadas ao arquivo (resolução da foto, tamanho em bytes e data de envio).
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">3. Quem Pode Acessar</h3>
            <p>
              O acesso às evidências fotográficas é restrito aos Analistas Credenciados do Controle de Qualidade (CQ) para auditoria e validação de conformidade técnica, e ao modelo automatizado de IA técnica do projeto.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">4. Quem Não Pode Acessar</h3>
            <p>
              Terceiros não credenciados, outros técnicos não vinculados à avaliação, clientes finais ou departamentos de marketing, vendas e comercial estão estritamente proibidos de acessar qualquer imagem de auditoria.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">5. R2 Privado</h3>
            <p>
              Os arquivos originais são armazenados no serviço Cloudflare R2 Privado, mantido sob chaves de acesso rigorosas e restrito a conexões autorizadas. O bucket nunca é público.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">6. Segurança com HTTPS</h3>
            <p>
              Toda a transferência de arquivos, desde a captura no dispositivo do técnico até o servidor, ocorre obrigatoriamente através de canais seguros criptografados usando protocolo seguro HTTPS (TLS 1.3).
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">7. Hash de Integridade SHA-256</h3>
            <p>
              Após a compressão no celular, é calculado o hash criptográfico SHA-256 da imagem. Esse hash serve para garantir a integridade absoluta da evidência técnica e serve para detectar reenvios ou fraudes sem necessidade de análise visual humana constante.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">8. Assinatura Digital da Imagem</h3>
            <p>
              Todas as mídias são assinadas no servidor com um código HMAC seguro usando a chave secreta de assinatura técnica da Claro. Isso impede falsificações ou adulterações de arquivos fora do sistema.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">9. Auditoria Completa de Acessos</h3>
            <p>
              Qualquer visualização, upload, tentativa de acesso ou análise por IA é registrada com timestamp exato, IP mascarado, login do usuário e evento associado para fins de trilha de auditoria e segurança cibernética.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">10. Análise por IA Opcional</h3>
            <p>
              A análise automatizada de conformidade por Inteligência Artificial é opcional e configurada por demanda. Ela opera estritamente sob comando direto dos Analistas e CQ, avaliando apenas se os parâmetros técnicos foram cumpridos.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">11. Não Utilização para Fins de Marketing</h3>
            <p>
              Fica terminantemente proibido o uso de qualquer evidência fotográfica técnica para fins promocionais, marketing, publicidade, portfólios ou divulgação interna e externa de marcas.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">12. Proibição de Compartilhamento Público</h3>
            <p>
              Nenhuma evidência fotográfica coletada será compartilhada com o público, redes sociais, provedores de armazenamento terceiros ou indexadores de pesquisa pública.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">13. Prazo de Retenção de 30 Dias</h3>
            <p>
              Após o encerramento ou finalização do status da avaliação prática (status: Aprovado, Reprovado, Cancelado ou No Show), inicia-se o período de contagem de retenção técnica. Todos os arquivos são elegíveis para expiração.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">14. Exclusão Automática Definitiva</h3>
            <p>
              Em exatos 30 dias após a conclusão da avaliação, as imagens originais, previews protegidos, thumbnails e caches de servidor associados à avaliação técnica são excluídos permanentemente de forma automatizada do storage R2.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">15. Manutenção de Registros Técnicos Necessários</h3>
            <p>
              Após a remoção das imagens do storage R2, o sistema manterá apenas os metadados técnicos necessários (como o ID da avaliação, histórico de status e log de auditoria anonymizado) em conformidade com as obrigações regulatórias da Claro.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">16. Orientações para Evitar Coleta de Dados Pessoais</h3>
            <p>
              O técnico é orientado a ajustar o enquadramento da câmera para focar apenas nas conexões, cabos e equipamentos. Deve-se evitar enquadrar pessoas, crianças, documentos pessoais (RG, CPF, CNH), placas de carros e endereços residenciais completos.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">17. Canal Interno de Dúvidas e Remoção Antecipada</h3>
            <p>
              Caso o técnico identifique que enviou por engano uma foto com dados confidenciais ou rostos, ele pode acionar imediatamente o CQ através do canal interno de suporte técnico ou enviar um e-mail de requisição para remoção e reenvio da evidência técnica.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">18. Versão do Documento</h3>
            <p>
              Este documento corresponde à versão 1.0.0 de Diretrizes de Segurança de Evidências Práticas e atende integralmente à LGPD (Lei Geral de Proteção de Dados - Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">19. Data de Vigência</h3>
            <p>
              As presentes políticas e salvaguardas técnicas entram em vigência imediata a partir de 10 de Julho de 2026 para todas as novas avaliações técnicas cadastradas.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-white print:text-black mb-1">20. Histórico de Revisão</h3>
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40 mt-1 print:border-slate-300">
              <table className="w-full text-left text-[11px] text-slate-400 table-auto print:text-slate-800">
                <thead>
                  <tr className="border-b border-slate-800/60 font-semibold text-slate-300 print:text-slate-900">
                    <th className="pb-1.5">Versão</th>
                    <th className="pb-1.5">Data</th>
                    <th className="pb-1.5">Alteração</th>
                    <th className="pb-1.5">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-800/20">
                    <td className="py-1">v1.0.0</td>
                    <td className="py-1">10/07/2026</td>
                    <td className="py-1">Criação inicial da política de fotos e diretrizes LGPD.</td>
                    <td className="py-1">DPO Claro CQ</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

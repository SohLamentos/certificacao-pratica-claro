import { Avaliacao } from '../types';

/**
 * Retorna o status da certificação após salvar a nota teórica.
 */
export function getStatusAfterNotaTeorica(avaliacao: Partial<Avaliacao>): 'AGENDADA' | 'EM_ANDAMENTO' | 'REPROVADA' {
  const nota = avaliacao.notaTeorica;
  if (nota === undefined || nota === null) {
    return 'AGENDADA';
  }
  return nota >= 7 ? 'EM_ANDAMENTO' : 'REPROVADA';
}

/**
 * Retorna o status após concluir o checklist prático (baseado no resultado).
 */
export function getStatusAfterChecklist(resultadoStatus: string): 'APROVADA' | 'REPROVADA' {
  return resultadoStatus === 'APROVADO' ? 'APROVADA' : 'REPROVADA';
}

/**
 * Verifica se a certificação ainda está aberta/pendente para execução pelo CQ.
 */
export function isCertificacaoAbertaParaCQ(avaliacao: Avaliacao): boolean {
  const norm = getNormalizedStatus(avaliacao);
  return norm === 'AGENDADA' || norm === 'EM_ANDAMENTO';
}

/**
 * Verifica se a certificação está concluída (aprovada ou reprovada).
 */
export function isCertificacaoConcluida(avaliacao: Avaliacao): boolean {
  const norm = getNormalizedStatus(avaliacao);
  return norm === 'APROVADA' || norm === 'REPROVADA';
}

/**
 * Retorna o status normalizado (resolve estados legados/antigos).
 */
export function getNormalizedStatus(avaliacao: Avaliacao): 'AGENDADA' | 'EM_ANDAMENTO' | 'APROVADA' | 'REPROVADA' {
  const status = avaliacao.status;
  
  if (status === 'FINALIZADA' || status === 'Concluída' as any) {
    // Se for reprovado de alguma forma (resultado prático ou nota teórica menor que 7)
    if (avaliacao.resultado?.resultado === 'REPROVADO') {
      return 'REPROVADA';
    }
    if (avaliacao.notaTeorica !== undefined && avaliacao.notaTeorica !== null && avaliacao.notaTeorica < 7) {
      return 'REPROVADA';
    }
    return 'APROVADA';
  }
  
  if (status === 'Rascunho' as any || status === 'EM ANDAMENTO' as any || status === 'EM_AND_AMENTO' as any || status === 'EM_ANDAMENTO') {
    return 'EM_ANDAMENTO';
  }
  
  if (status === 'REPROVADA') {
    return 'REPROVADA';
  }
  
  if (status === 'APROVADA') {
    return 'APROVADA';
  }
  
  return 'AGENDADA';
}

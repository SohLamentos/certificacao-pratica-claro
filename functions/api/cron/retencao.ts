import { initDb, Env, jsonResponse } from '../_db';
import { Logger } from '../_logger';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const nowStr = new Date().toISOString();

    Logger.info(`[CRON] Iniciando rotina de exclusão por política de retenção. Data atual: ${nowStr}`);

    let bucket: any = null;
    if (env.EVIDENCIAS_BUCKET && typeof env.EVIDENCIAS_BUCKET.delete === 'function') {
      bucket = env.EVIDENCIAS_BUCKET;
    }

    if (!bucket) {
      Logger.error("[CRON] Serviço de Armazenamento R2 não configurado (EVIDENCIAS_BUCKET). Ignorando exclusão física.");
    }

    const report = {
      ia_evidencias_processed: 0,
      ia_evidencias_deleted: 0,
      ia_evidencias_ref_decremented: 0,
      evidencias_processed: 0,
      evidencias_deleted: 0,
      evidencias_ref_decremented: 0,
      errors: [] as string[]
    };

    // 1. Process ia_evidencias
    // Find all records where retencao_ate is past now and not already marked as excluded
    const iaQuery = `
      SELECT id, certificacao_id, etapa, arquivo_key, ia_hash_arquivo 
      FROM ia_evidencias 
      WHERE retencao_ate <= ? AND (arquivo_excluido IS NULL OR arquivo_excluido = 0)
    `;
    const { results: iaExpired } = await env.DB.prepare(iaQuery).bind(nowStr).all();

    for (const ev of (iaExpired || [])) {
      report.ia_evidencias_processed++;
      const id = ev.id;
      const key = ev.arquivo_key;
      const hash = ev.ia_hash_arquivo;

      let r2Deleted = 0;
      let refDecremented = false;

      if (key && bucket) {
        try {
          if (hash) {
            // Check reference count
            const refRow = await env.DB.prepare(
              "SELECT ref_count FROM image_ref_counts WHERE image_hash = ?"
            ).bind(hash).first() as { ref_count: number } | null;

            if (refRow) {
              const newRefCount = Math.max(0, refRow.ref_count - 1);
              await env.DB.prepare(
                "UPDATE image_ref_counts SET ref_count = ? WHERE image_hash = ?"
              ).bind(newRefCount, hash).run();

              if (newRefCount === 0) {
                // Delete physically from R2
                await bucket.delete(key);
                await env.DB.prepare(
                  "DELETE FROM image_ref_counts WHERE image_hash = ?"
                ).bind(hash).run();
                r2Deleted = 1;
                report.ia_evidencias_deleted++;
                Logger.info(`[CRON] Arquivo R2 ${key} excluído fisicamente (ref_count atingiu 0).`);
              } else {
                refDecremented = true;
                report.ia_evidencias_ref_decremented++;
                Logger.info(`[CRON] ref_count para hash ${hash} decrementado para ${newRefCount}. Arquivo R2 não excluído.`);
              }
            } else {
              // Delete physically if no ref_count tracker is found
              await bucket.delete(key);
              r2Deleted = 1;
              report.ia_evidencias_deleted++;
              Logger.info(`[CRON] Arquivo R2 ${key} excluído fisicamente (sem tracker ref_count).`);
            }
          } else {
            // Delete physically if no hash is recorded
            await bucket.delete(key);
            r2Deleted = 1;
            report.ia_evidencias_deleted++;
            Logger.info(`[CRON] Arquivo R2 ${key} excluído fisicamente (sem hash registrado).`);
          }
        } catch (bucketErr: any) {
          const errMsg = `Erro ao deletar arquivo ${key} do R2: ${bucketErr.message || bucketErr}`;
          Logger.error(`[CRON] ${errMsg}`);
          report.errors.push(errMsg);
        }
      }

      // Update D1 record for ia_evidencias
      try {
        await env.DB.prepare(`
          UPDATE ia_evidencias 
          SET arquivo_excluido = 1,
              arquivo_excluido_em = ?,
              arquivo_exclusao_motivo = 'Exclusão automática por política de retenção de 30 dias',
              r2_deleted = ?,
              thumbnail_deleted = 1,
              updated_at = ?
          WHERE id = ?
        `).bind(nowStr, r2Deleted, nowStr, id).run();

        // Log audit event: EVIDENCIA_RETENCAO_EXCLUIDO
        await env.DB.prepare(`
          INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
          VALUES (?, ?, 'EVIDENCIA_RETENCAO_EXCLUIDO', ?, 'sistema', 'sistema', '')
        `).bind(
          ev.certificacao_id,
          id,
          JSON.stringify({
            etapa: ev.etapa,
            arquivo_key: key,
            ia_hash_arquivo: hash,
            r2_deleted: r2Deleted,
            ref_decremented: refDecremented,
            motivo: 'Exclusão automática por política de retenção de 30 dias'
          })
        ).run();

      } catch (dbErr: any) {
        const errMsg = `Erro ao atualizar registro D1 para ia_evidencias ${id}: ${dbErr.message || dbErr}`;
        Logger.error(`[CRON] ${errMsg}`);
        report.errors.push(errMsg);
      }
    }

    // 2. Process evidencias (Technician Portal)
    const evQuery = `
      SELECT id, avaliacao_id, missao_id, r2_key, image_hash 
      FROM evidencias 
      WHERE retencao_ate <= ? AND (arquivo_excluido IS NULL OR arquivo_excluido = 0)
    `;
    const { results: evExpired } = await env.DB.prepare(evQuery).bind(nowStr).all();

    for (const ev of (evExpired || [])) {
      report.evidencias_processed++;
      const id = ev.id;
      const key = ev.r2_key;
      const hash = ev.image_hash;

      let r2Deleted = 0;
      let refDecremented = false;

      if (key && bucket) {
        try {
          if (hash) {
            // Check reference count
            const refRow = await env.DB.prepare(
              "SELECT ref_count FROM image_ref_counts WHERE image_hash = ?"
            ).bind(hash).first() as { ref_count: number } | null;

            if (refRow) {
              const newRefCount = Math.max(0, refRow.ref_count - 1);
              await env.DB.prepare(
                "UPDATE image_ref_counts SET ref_count = ? WHERE image_hash = ?"
              ).bind(newRefCount, hash).run();

              if (newRefCount === 0) {
                // Delete physically from R2
                await bucket.delete(key);
                await env.DB.prepare(
                  "DELETE FROM image_ref_counts WHERE image_hash = ?"
                ).bind(hash).run();
                r2Deleted = 1;
                report.evidencias_deleted++;
                Logger.info(`[CRON] Portal R2 ${key} excluído fisicamente (ref_count atingiu 0).`);
              } else {
                refDecremented = true;
                report.evidencias_ref_decremented++;
                Logger.info(`[CRON] ref_count para hash ${hash} decrementado para ${newRefCount}. Arquivo R2 não excluído.`);
              }
            } else {
              // Delete physically if no ref_count tracker is found
              await bucket.delete(key);
              r2Deleted = 1;
              report.evidencias_deleted++;
              Logger.info(`[CRON] Portal R2 ${key} excluído fisicamente (sem tracker ref_count).`);
            }
          } else {
            // Delete physically if no hash is recorded
            await bucket.delete(key);
            r2Deleted = 1;
            report.evidencias_deleted++;
            Logger.info(`[CRON] Portal R2 ${key} excluído fisicamente (sem hash registrado).`);
          }
        } catch (bucketErr: any) {
          const errMsg = `Erro ao deletar arquivo ${key} do R2: ${bucketErr.message || bucketErr}`;
          Logger.error(`[CRON] ${errMsg}`);
          report.errors.push(errMsg);
        }
      }

      // Update D1 record for evidencias
      try {
        await env.DB.prepare(`
          UPDATE evidencias 
          SET arquivo_excluido = 1,
              arquivo_excluido_em = ?,
              arquivo_exclusao_motivo = 'Exclusão automática por política de retenção de 30 dias',
              r2_deleted = ?,
              thumbnail_deleted = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(nowStr, r2Deleted, id).run();

        // Log audit event in ia_auditoria
        await env.DB.prepare(`
          INSERT INTO ia_auditoria (certificacao_id, evidencia_id, acao, payload, usuario_id, perfil_usuario, login_hash)
          VALUES (?, ?, 'EVIDENCIA_PORTAL_RETENCAO_EXCLUIDO', ?, 'sistema', 'sistema', '')
        `).bind(
          ev.avaliacao_id,
          id,
          JSON.stringify({
            missao_id: ev.missao_id,
            r2_key: key,
            image_hash: hash,
            r2_deleted: r2Deleted,
            ref_decremented: refDecremented,
            motivo: 'Exclusão automática por política de retenção de 30 dias'
          })
        ).run();

      } catch (dbErr: any) {
        const errMsg = `Erro ao atualizar registro D1 para evidencias ${id}: ${dbErr.message || dbErr}`;
        Logger.error(`[CRON] ${errMsg}`);
        report.errors.push(errMsg);
      }
    }

    Logger.info(`[CRON] Rotina de exclusão concluída. Relatório: ${JSON.stringify(report)}`);

    return jsonResponse({
      success: true,
      timestamp: nowStr,
      report
    });
  } catch (error: any) {
    Logger.error(`[CRON] Falha grave na rotina de exclusão: ${error.message || error}`);
    return jsonResponse({
      success: false,
      error: error.message || String(error)
    }, 500);
  }
};

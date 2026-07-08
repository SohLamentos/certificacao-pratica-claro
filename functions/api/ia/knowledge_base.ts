import { initDb, Env, jsonResponse } from '../_db';

// RBAC: Roles allowed to perform write operations on Knowledge Base: admin, cq
function checkRBAC(perfil: string): boolean {
  if (!perfil) return false;
  const p = perfil.toLowerCase().trim();
  return p === 'admin' || p === 'cq';
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const showVersions = url.searchParams.get("versions") === "true";
    const certType = url.searchParams.get("tipo_certificacao");

    let query = "SELECT * FROM knowledge_base";
    const params: any[] = [];

    if (certType) {
      query += " WHERE tipo_certificacao = ?";
      params.push(certType);
    }
    query += " ORDER BY created_at DESC";

    const rulesRes = await env.DB.prepare(query).bind(...params).all();
    const rules = rulesRes.results || [];

    if (showVersions) {
      const versionsRes = await env.DB.prepare("SELECT * FROM knowledge_versions ORDER BY versao DESC").all();
      const versions = versionsRes.results || [];
      return jsonResponse({
        success: true,
        rules,
        versions
      });
    }

    return jsonResponse({
      success: true,
      rules
    });
  } catch (err: any) {
    console.error("GET knowledge_base error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao buscar regras da Base de Conhecimento." }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;

    const {
      tipo_certificacao,
      categoria,
      checklist_item,
      titulo,
      descricao,
      regra,
      prioridade,
      ativo,
      usuario_id,
      perfil_usuario
    } = body;

    const finalPerfil = perfil_usuario || 'cq';
    if (!checkRBAC(finalPerfil)) {
      return jsonResponse({
        success: false,
        error: "Acesso negado. Apenas perfis Admin ou CQ podem criar regras na Base de Conhecimento."
      }, 403);
    }

    if (!titulo || !tipo_certificacao) {
      return jsonResponse({ success: false, error: "Título e Tipo de Certificação são obrigatórios." }, 400);
    }

    const id = crypto.randomUUID();
    const isAtivo = (ativo === false || ativo === 0) ? 0 : 1;
    const rulePrioridade = typeof prioridade === 'number' ? prioridade : 1;
    const user = usuario_id || 'sistema';
    const now = new Date().toISOString();

    // Insert into knowledge_base
    await env.DB.prepare(`
      INSERT INTO knowledge_base (
        id, tipo_certificacao, categoria, checklist_item, titulo, descricao, regra, prioridade, ativo, criado_por, atualizado_por, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      tipo_certificacao,
      categoria || null,
      checklist_item || null,
      titulo,
      descricao || null,
      regra || null,
      rulePrioridade,
      isAtivo,
      user,
      user,
      now,
      now
    ).run();

    // Insert version 1 into knowledge_versions
    await env.DB.prepare(`
      INSERT INTO knowledge_versions (
        id, knowledge_id, versao, alteracao, usuario, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      id,
      1,
      'Criação inicial da regra',
      user,
      now
    ).run();

    return jsonResponse({ success: true, id });
  } catch (err: any) {
    console.error("POST knowledge_base error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao criar regra na Base de Conhecimento." }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const body = await request.json() as any;

    const {
      id,
      tipo_certificacao,
      categoria,
      checklist_item,
      titulo,
      descricao,
      regra,
      prioridade,
      ativo,
      usuario_id,
      perfil_usuario,
      motivo_alteracao
    } = body;

    const finalPerfil = perfil_usuario || 'cq';
    if (!checkRBAC(finalPerfil)) {
      return jsonResponse({
        success: false,
        error: "Acesso negado. Apenas perfis Admin ou CQ podem alterar a Base de Conhecimento."
      }, 403);
    }

    if (!id || !titulo || !tipo_certificacao) {
      return jsonResponse({ success: false, error: "ID, Título e Tipo de Certificação são obrigatórios." }, 400);
    }

    // Fetch existing rule to verify and calculate version
    const existing = await env.DB.prepare("SELECT * FROM knowledge_base WHERE id = ?").bind(id).first() as any;
    if (!existing) {
      return jsonResponse({ success: false, error: "Regra não encontrada na Base de Conhecimento." }, 404);
    }

    // Get current version count to increment
    const verCheck = await env.DB.prepare("SELECT COUNT(*) as cnt FROM knowledge_versions WHERE knowledge_id = ?").bind(id).first() as any;
    const nextVersion = (verCheck ? verCheck.cnt : 0) + 1;

    const isAtivo = (ativo === false || ativo === 0) ? 0 : 1;
    const rulePrioridade = typeof prioridade === 'number' ? prioridade : 1;
    const user = usuario_id || 'sistema';
    const now = new Date().toISOString();
    const changeLog = motivo_alteracao || `Alteração dos campos da regra para versão ${nextVersion}`;

    // Update knowledge_base
    await env.DB.prepare(`
      UPDATE knowledge_base
      SET tipo_certificacao = ?,
          categoria = ?,
          checklist_item = ?,
          titulo = ?,
          descricao = ?,
          regra = ?,
          prioridade = ?,
          ativo = ?,
          atualizado_por = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      tipo_certificacao,
      categoria || null,
      checklist_item || null,
      titulo,
      descricao || null,
      regra || null,
      rulePrioridade,
      isAtivo,
      user,
      now,
      id
    ).run();

    // Insert new record in knowledge_versions
    await env.DB.prepare(`
      INSERT INTO knowledge_versions (
        id, knowledge_id, versao, alteracao, usuario, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      id,
      nextVersion,
      changeLog,
      user,
      now
    ).run();

    return jsonResponse({ success: true, version: nextVersion });
  } catch (err: any) {
    console.error("PUT knowledge_base error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao atualizar regra na Base de Conhecimento." }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const user = url.searchParams.get('usuario_id') || 'sistema';
    const perfil = url.searchParams.get('perfil_usuario') || 'cq';

    if (!checkRBAC(perfil)) {
      return jsonResponse({
        success: false,
        error: "Acesso negado. Apenas perfis Admin ou CQ podem desativar ou excluir regras da Base de Conhecimento."
      }, 403);
    }

    if (!id) {
      return jsonResponse({ success: false, error: "ID é obrigatório." }, 400);
    }

    const existing = await env.DB.prepare("SELECT * FROM knowledge_base WHERE id = ?").bind(id).first() as any;
    if (!existing) {
      return jsonResponse({ success: false, error: "Regra não encontrada na Base de Conhecimento." }, 404);
    }

    const now = new Date().toISOString();

    // Instead of hard deleting, we toggle active status to 0 to preserve audit log, or delete if requested explicitly
    const forceDelete = url.searchParams.get('force') === 'true';

    if (forceDelete) {
      await env.DB.prepare("DELETE FROM knowledge_base WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM knowledge_versions WHERE knowledge_id = ?").bind(id).run();
      return jsonResponse({ success: true, message: "Regra e histórico excluídos permanentemente." });
    } else {
      // Toggle active status to 0
      await env.DB.prepare(`
        UPDATE knowledge_base
        SET ativo = 0, atualizado_por = ?, updated_at = ?
        WHERE id = ?
      `).bind(user, now, id).run();

      const verCheck = await env.DB.prepare("SELECT COUNT(*) as cnt FROM knowledge_versions WHERE knowledge_id = ?").bind(id).first() as any;
      const nextVersion = (verCheck ? verCheck.cnt : 0) + 1;

      await env.DB.prepare(`
        INSERT INTO knowledge_versions (
          id, knowledge_id, versao, alteracao, usuario, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        id,
        nextVersion,
        'Desativação administrativa da regra',
        user,
        now
      ).run();

      return jsonResponse({ success: true, message: "Regra desativada com sucesso. Histórico preservado.", version: nextVersion });
    }
  } catch (err: any) {
    console.error("DELETE knowledge_base error:", err);
    return jsonResponse({ success: false, error: err.message || "Erro ao desativar regra na Base de Conhecimento." }, 500);
  }
};

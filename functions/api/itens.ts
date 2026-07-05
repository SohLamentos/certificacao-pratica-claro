import { initDb, Env, jsonResponse } from './_db';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const url = new URL(request.url);
    const certificacao = url.searchParams.get("certificacao");
    const certificacaoId = url.searchParams.get("certificacaoId");

    let query = `
      SELECT i.*, c.nome as certificacao_nome, g.nome as grupo_nome
      FROM itens i
      LEFT JOIN certificacoes c ON i.certificacao_id = c.id
      LEFT JOIN grupos g ON i.grupo_id = g.id
    `;
    const bindParams: any[] = [];
    const conditions: string[] = [];

    if (certificacao) {
      conditions.push("(c.nome = ? OR c.id = ?)");
      bindParams.push(certificacao, certificacao);
    } else if (certificacaoId) {
      conditions.push("(c.id = ? OR c.nome = ?)");
      bindParams.push(certificacaoId, certificacaoId);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY i.ordem ASC";

    const { results } = await env.DB.prepare(query).bind(...bindParams).all();

    const mapped = results.map((row: any) => ({
      id: row.id,
      certificacao: row.certificacao_nome || String(row.certificacao_id),
      grupo: row.grupo_nome || String(row.grupo_id),
      ordem: row.ordem,
      descricao: row.descricao,
      critico: row.critico === 1,
      obrigatorio: row.obrigatorio === 1,
      ativo: row.ativo === 1
    }));

    return jsonResponse(mapped);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await initDb(env.DB);
    const data = await request.json() as any;

    // Resolve certificacao
    let certId: number | null = null;
    const certRow = await env.DB.prepare("SELECT id FROM certificacoes WHERE nome = ?").bind(data.certificacao).first();
    if (certRow) {
      certId = (certRow as any).id;
    }

    // Resolve grupo
    let grupoId: number | null = null;
    if (certId) {
      const grupoRow = await env.DB.prepare("SELECT id FROM grupos WHERE nome = ? AND certificacao_id = ?").bind(data.grupo || '', certId).first();
      if (grupoRow) {
        grupoId = (grupoRow as any).id;
      }
    }

    if (!certId && data.certificacao) {
      const insertCert = await env.DB.prepare(
        "INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, 1)"
      ).bind(data.certificacao, '', 'CQ ou Analista', '#E30613', 'Cpu').run();
      certId = insertCert.meta?.last_row_id || (insertCert as any).lastRowId || null;
    }

    if (certId && !grupoId && data.grupo) {
      const insertGrupo = await env.DB.prepare(
        "INSERT INTO grupos (nome, certificacao_id) VALUES (?, ?)"
      ).bind(data.grupo, certId).run();
      grupoId = insertGrupo.meta?.last_row_id || (insertGrupo as any).lastRowId || null;
    }

    const result = await env.DB.prepare(
      "INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      certId,
      grupoId,
      Number(data.ordem) || 0,
      data.descricao,
      data.critico ? 1 : 0,
      data.obrigatorio ? 1 : 0,
      data.ativo ? 1 : 0
    ).run();

    const lastId = result.meta?.last_row_id || (result as any).lastRowId;

    return jsonResponse({ success: true, id: lastId });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
      route: request.url
    }, 500);
  }
};


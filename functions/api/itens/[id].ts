import { initDb, Env } from '../_db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  try {
    await initDb(env.DB);
    const idStr = params.id as string;
    const id = parseInt(idStr, 10);

    if (isNaN(id)) {
      return Response.json({
        success: false,
        error: "Invalid or missing ID",
        route: request.url
      }, { status: 400 });
    }

    if (request.method === 'PUT') {
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

      await env.DB.prepare(
        "UPDATE itens SET certificacao_id = ?, grupo_id = ?, ordem = ?, descricao = ?, critico = ?, obrigatorio = ?, ativo = ? WHERE id = ?"
      ).bind(
        certId,
        grupoId,
        Number(data.ordem) || 0,
        data.descricao,
        data.critico ? 1 : 0,
        data.obrigatorio ? 1 : 0,
        data.ativo ? 1 : 0,
        id
      ).run();

      return Response.json({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM itens WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    return Response.json({
      success: false,
      error: "Method not allowed",
      route: request.url
    }, { status: 405 });

  } catch (error) {
    return Response.json({
      success: false,
      error: String(error),
      route: request.url
    }, { status: 500 });
  }
};

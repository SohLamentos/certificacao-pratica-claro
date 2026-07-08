import { DBSchema } from '../schema/db_schema';
import { Logger } from '../_logger';

export async function runInitialMigration(db: D1Database): Promise<void> {
  // Check if tables already exist
  try {
    const tableCheck = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='certificacoes'"
    ).first();
    
    if (tableCheck) {
      // Already initialized
      return;
    }
  } catch (err) {
    // Continue and try to create
  }

  Logger.info("Iniciando migração inicial do banco de dados D1...");

  // 1. Create Tables
  for (const table of DBSchema) {
    const colDefs = table.columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTOINCREMENT';
      if (col.nullable === false) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    });

    const createQuery = `CREATE TABLE IF NOT EXISTS ${table.tableName} (${colDefs.join(', ')})`;
    await db.prepare(createQuery).run();
  }

  // Create Indexes for optimized querying
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_avaliacoes_data ON avaliacoes(data)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON avaliacoes(status)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_evidencias_cert ON ia_evidencias(certificacao_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_evidencias_hash ON ia_evidencias(ia_hash_arquivo)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ia_auditoria_cert ON ia_auditoria(certificacao_id)").run();

  // 2. Seed 'certificacoes'
  const defaultCerts = [
    {
      nome: 'GPON Veterano',
      descricao: 'Avaliação prática periódica para técnicos veteranos em tecnologia de fibra óptica GPON.',
      perfil_permitido: 'Apenas CQ',
      cor: '#E30613',
      icone: 'Cpu',
      ativa: 1
    },
    {
      nome: 'GPON Capacitação',
      descricao: 'Auditoria de capacitação técnica inicial para novos técnicos em rede óptica GPON.',
      perfil_permitido: 'Apenas Analista',
      cor: '#FFB800',
      icone: 'Wifi',
      ativa: 1
    },
    {
      nome: 'HFC Capacitação',
      descricao: 'Auditoria de padrões e conformidades para redes coaxiais (HFC) e decodificadores.',
      perfil_permitido: 'CQ ou Analista',
      cor: '#00A859',
      icone: 'Tv',
      ativa: 1
    }
  ];

  for (const cert of defaultCerts) {
    await db.prepare(
      "INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(cert.nome, cert.descricao, cert.perfil_permitido, cert.cor, cert.icone, cert.ativa).run();
  }

  // 3. Seed 'avaliadores'
  const defaultEvaluators = [
    { nome: 'Pedro Henrique Santos', perfil: 'cq', cidade_base: 'São Paulo - Base Leste', status: 'ATIVO', ativo: 1 },
    { nome: 'Luiza Maria Souza', perfil: 'analista', cidade_base: 'Campinas - Base Sul', status: 'ATIVO', ativo: 1 },
    { name: 'Gisele Oliveira Prado', perfil: 'cq', cidade_base: 'Rio de Janeiro - Base Centro', status: 'INATIVO', ativo: 0 }
  ];

  for (const av of defaultEvaluators) {
    const parts = (av.cidade_base || '').split(' - ');
    const cidade = parts[0] || '';
    const base = parts[1] || '';
    await db.prepare(
      "INSERT INTO avaliadores (nome, perfil, cidade, base, cidade_base, ativo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(av.nome, av.perfil, cidade, base, av.cidade_base, av.ativo, av.status).run();
  }

  // 4. Seed 'tecnicos'
  const defaultTecnicos = [
    { nome: 'Marcos Vinícius Silva', matricula: 'TR551234', empresa: 'Claro S/A (Próprio)', cidade_base: 'São Paulo - Base Leste' },
    { nome: 'Ana Clara Oliveira', matricula: 'TR884321', empresa: 'Icomon Tecnologia', cidade_base: 'São Paulo - Base Leste' },
    { nome: 'Gabriel Henrique Santos', matricula: 'TR992211', empresa: 'Serede S/A', cidade_base: 'São Paulo - Base Leste' }
  ];

  for (const t of defaultTecnicos) {
    await db.prepare(
      "INSERT INTO tecnicos (nome, matricula, empresa, cidade_base, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(t.nome, t.matricula, t.empresa, t.cidade_base).run();
  }

  // Get mapped certification IDs
  const certsRows = await db.prepare("SELECT id, nome FROM certificacoes").all();
  const certsMap = new Map<string, number>();
  certsRows.results.forEach((row: any) => {
    certsMap.set(row.nome, row.id);
  });

  // 5. Seed 'grupos'
  const groupsList = [
    { nome: 'Processos', cert: 'GPON Veterano' },
    { nome: 'Instalação Física', cert: 'GPON Veterano' },
    { nome: 'Processos', cert: 'GPON Capacitação' },
    { nome: 'Instalação Física', cert: 'GPON Capacitação' },
    { nome: 'Decodificador', cert: 'GPON Capacitação' },
    { nome: 'Banda Larga', cert: 'GPON Capacitação' },
    { nome: 'Telefone', cert: 'GPON Capacitação' },
    { nome: 'Aplicativos', cert: 'GPON Capacitação' },
    { nome: 'Atendimento Consultivo / TNPS', cert: 'GPON Capacitação' },
    { nome: 'Processos', cert: 'HFC Capacitação' },
    { nome: 'Instalação Física', cert: 'HFC Capacitação' },
    { nome: 'Decodificador', cert: 'HFC Capacitação' },
    { nome: 'Banda Larga', cert: 'HFC Capacitação' },
    { nome: 'Telefone', cert: 'HFC Capacitação' },
    { nome: 'Aplicativos', cert: 'HFC Capacitação' },
    { nome: 'Atendimento Consultivo / TNPS', cert: 'HFC Capacitação' }
  ];

  for (const g of groupsList) {
    const certId = certsMap.get(g.cert);
    if (certId) {
      await db.prepare("INSERT INTO grupos (nome, certificacao_id) VALUES (?, ?)")
        .bind(g.nome, certId)
        .run();
    }
  }

  // Get mapped groups
  const groupsRows = await db.prepare("SELECT id, nome, certificacao_id FROM grupos").all();
  const groupsMap = new Map<string, number>();
  groupsRows.results.forEach((row: any) => {
    groupsMap.set(`${row.certificacao_id}_${row.nome}`, row.id);
  });

  // 6. Seed 'itens' (checklist questions)
  const defaultGponVeteranoRaw = [
    { pergunta: 'Utilizou a caneta de limpeza? (Conector, Power Meter, Porta da NAP)', critico: false, grupo: 'Processos' },
    { pergunta: 'Realizou medição de sinal na NAP? (Uso correto do Power Meter / configuração correta)', critico: false, grupo: 'Processos' },
    { pergunta: 'Confecção de Conectores Correta - Fibra Cinza (utilizou as ferramentas e gabaritos adequadamente)?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Identificou o cabo corretamente? (Poste/Cordoalha)', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Confecção de Conectores Correta - Fibra Branca (utilizou as ferramentas e gabaritos adequadamente)?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Identificou o cabo corretamente? (MDU)', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Identificou o andar da NAP em que foi instalada?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a acomodação correta na NAP? (Poste/Cordoalha)', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a acomodação correta na NAP? (MDU)', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a passagem do cabo óptico corretamente? (FLECHA, SDO, SDA e SRDO)', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a montagem corretamente e explicou a regra de aplicação da PTO?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a acomodação correta na ONT? (Utilizou a fita autofusão no conector)', critico: false, grupo: 'Instalação Física' },
  ];

  const defaultGponCapacitacaoRaw = [
    { pergunta: 'Atualizou o status no PDA (Rota para início)?', critico: false, grupo: 'Processos' },
    { pergunta: 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', critico: false, grupo: 'Processos' },
    { pergunta: 'Informou o código de segurança quando solicitado?', critico: false, grupo: 'Processos' },
    { pergunta: 'Confirmou com o cliente os produtos antes de entrar na residência?', critico: false, grupo: 'Processos' },
    { pergunta: 'Explicou ao cliente sobre a utilização do propé?', critico: false, grupo: 'Processos' },
    { pergunta: 'Confirmou o local de instalação dos equipamentos?', critico: false, grupo: 'Processos' },
    { pergunta: 'Combinou com o cliente a passagem do cabo e os possíveis furos?', critico: false, grupo: 'Processos' },
    { pergunta: 'Realizou APR e ativou o botão escada através do App Técnico Nota 10?', critico: false, grupo: 'Processos' },
    { pergunta: 'Confecção de Conectores Correta (utilizou as ferramentas adequadamente)?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Instalou Autofusão / Protetor no Conector?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou medição de sinal na NAP?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Instalou corretamente o ECAM na NAP?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Identificou corretamente o cabo?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou a cintagem do poste?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Realizou corretamente a passagem do cabo óptico (AGF, SRDO, SDO etc.)?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Instalou corretamente o PTO?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Explicou ao cliente sobre a fragilidade do cordão óptico?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou reset de fábrica e instalação do decoder via Wi-Fi 5 GHz?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Verificou se o decoder possui Status e IP corretamente?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Configurou e explicou a utilização básica do controle remoto?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Retirou bloqueio por idade e alterou senha de compra?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Configurou corretamente TV e Decoder (HDMI, resolução, formato de exibição e sistema de áudio)?', critico: true, grupo: 'Decodificador' },
    { pergunta: 'Explicou os recursos de gravação (Agendar gravação)?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Demonstrou o Replay TV?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Explicou a função Autodesligar?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Apresentou o App Claro TV+ ao cliente?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Confecção do Conector RJ45 está correta?', critico: true, grupo: 'Banda Larga' },
    { pergunta: 'Definiu corretamente o local da ONT e analisou a cobertura Wi-Fi?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Acessou as propriedades da ONT e explicou sobre senha forte?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Configurou corretamente o Wi-Fi (Band Steering e Redes 2.4 e 5 GHz)?', critico: true, grupo: 'Banda Larga' },
    { pergunta: 'Explicou ao cliente sobre a rede IoT?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Informou sobre compatibilidade dos dispositivos?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Realizou teste de velocidade?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Verificou os níveis TX e RX pela ONT ou niveis.virtua.com.br?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Confecção dos conectores RJ11 está correta?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Explicou Claro Fone, Serviços Inteligentes e Portabilidade?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Confirmou o funcionamento do Claro Fone informando o número?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Confirmou que o firmware está atualizado?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Solicitou documento e realizou upload na OS Digital?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Preencheu corretamente a Ordem de Serviço Digital e coletou assinatura?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Finalizou o atendimento no PDA e lançou os materiais utilizados?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Informou os canais de Autoatendimento (Minha Claro, WhatsApp e Site)?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Realizou a Autoinspeção?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Informou sobre o TNPS e solicitou a avaliação?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
    { pergunta: 'Explicou corretamente as notas do TNPS?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
  ];

  const defaultHfcCapacitacaoRaw = [
    { pergunta: 'Atualizou o status no PDA (Rota para início)?', critico: false, grupo: 'Processos' },
    { pergunta: 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', critico: false, grupo: 'Processos' },
    { pergunta: 'Informou o código de segurança quando solicitado?', critico: false, grupo: 'Processos' },
    { pergunta: 'Confirmou com o cliente os produtos a serem instalados antes de entrar na residência?', critico: false, grupo: 'Processos' },
    { pergunta: 'Explicou ao cliente sobre a utilização do pro-pé?', critico: false, grupo: 'Processos' },
    { pergunta: 'Confirmou com o cliente o local de instalação dos equipamentos?', critico: false, grupo: 'Processos' },
    { pergunta: 'Combinou com o cliente a passagem do cabo e as paredes que seriam furadas?', critico: false, grupo: 'Processos' },
    { pergunta: 'Realizou a APR e ativou o botão escada através do APP Técnico Nota 10 antes do trabalho em altura?', critico: false, grupo: 'Processos' },
    { pergunta: 'Realizou corretamente a confecção dos conectores utilizando as ferramentas adequadas?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Efetuou a medição de sinal (CA e CB)?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Utilizou corretamente o anel de vedação?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Identificou corretamente o cabo?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Realizou corretamente a cintagem do poste e a amarração?', critico: true, grupo: 'Instalação Física' },
    { pergunta: 'Instalou corretamente o Cable Isolator?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Aplicou corretamente o torque nas conexões do MDU, passivos e equipamentos?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Explicou corretamente a importância do Mini Isolator?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Executou corretamente a distribuição do sinal do cabo coaxial?', critico: false, grupo: 'Instalação Física' },
    { pergunta: 'Efetuou o reset de fábrica do decoder e realizou a configuration da base?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Todos os pontos de TV ficaram com níveis de sinal dentro do padrão?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Configurou e explicou a utilização do controle remoto?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Retirou o bloqueio por idade e alterou a senha de compra?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Configurou corretamente TV e Decoder (HDMI, resolução, formato e áudio)?', critico: true, grupo: 'Decodificador' },
    { pergunta: 'Explicou o NOW demonstrando conteúdos gratuitos?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Explicou os recursos de gravação?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Demonstrou o Replay TV?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Explicou a função Auto Hit?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Explicou a função Autodesligar?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Realizou o Valida Retorno?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Apresentou o App Claro TV+ e explicou cadastro e acesso?', critico: false, grupo: 'Decodificador' },
    { pergunta: 'Confeccionou corretamente o conector RJ45?', critico: true, grupo: 'Banda Larga' },
    { pergunta: 'Definiu corretamente o local do eMTA e analisou a potência do Wi-Fi?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Acessou as propriedades do eMTA e explicou sobre senha forte?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Configurou corretamente o Wi-Fi (Band Steering e redes 2.4 e 5 GHz)?', critico: true, grupo: 'Banda Larga' },
    { pergunta: 'Explicou sobre a rede IoT?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Informou sobre compatibilidade dos dispositivos do cliente?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Realizou teste de velocidade pelo Brasil Banda Larga/Speedtest?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Verificou TX/RX/SNR pelo site niveis.virtua.com.br?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Verificou TX/RX/SNR pela página interna do eMTA?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', critico: false, grupo: 'Banda Larga' },
    { pergunta: 'Realizou atendimento consultivo apresentando opções de contratação?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Confeccionou corretamente os conectores telefônicos RJ11?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Explicou os Serviços Inteligentes Claro Fone e Portabilidade?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Confirmou o funcionamento do Claro Fone informando o número ao cliente?', critico: false, grupo: 'Telefone' },
    { pergunta: 'Confirmou que o firmware dos equipamentos está atualizado?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Solicitou documento e realizou upload na OS Digital?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Preencheu corretamente a Ordem de Serviço Digital e coletou a assinatura do cliente?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Finalizou o atendimento no PDA e lançou corretamente os materiais?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Informou sobre os canais de autoatendimento (Minha Claro, WhatsApp e Site)?', critico: false, grupo: 'Aplicativos' },
    { pergunta: 'Realizou a autoinspeção?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
    { pergunta: 'Informou sobre o TNPS e solicitou a avaliação do cliente?', critico: false, grupo: 'Atendimento Consultivo / TNPS' }
  ];

  const stmtItens = db.prepare(
    "INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)"
  );

  // GPON Veterano Items
  const gponVetId = certsMap.get('GPON Veterano')!;
  for (let i = 0; i < defaultGponVeteranoRaw.length; i++) {
    const x = defaultGponVeteranoRaw[i];
    const grupoId = groupsMap.get(`${gponVetId}_${x.grupo}`)!;
    await stmtItens.bind(gponVetId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
  }

  // GPON Capacitação Items
  const gponCapId = certsMap.get('GPON Capacitação')!;
  for (let i = 0; i < defaultGponCapacitacaoRaw.length; i++) {
    const x = defaultGponCapacitacaoRaw[i];
    const grupoId = groupsMap.get(`${gponCapId}_${x.grupo}`)!;
    await stmtItens.bind(gponCapId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
  }

  // HFC Capacitação Items
  const hfcCapId = certsMap.get('HFC Capacitação')!;
  for (let i = 0; i < defaultHfcCapacitacaoRaw.length; i++) {
    const x = defaultHfcCapacitacaoRaw[i];
    const grupoId = groupsMap.get(`${hfcCapId}_${x.grupo}`)!;
    await stmtItens.bind(hfcCapId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
  }

  // 7. Seed LGPD Config
  const defaultLgpdConfigs = [
    { nome_chave: 'anonymize_images', habilitado: 1, descricao: 'Habilita remoção automática de metadados EXIF/GPS das evidências antes de enviar para análise de IA.' },
    { nome_chave: 'hide_personal_data', habilitado: 1, descricao: 'Restringe rigorosamente o envio de CPF, matrícula, nome ou qualquer dado pessoal do técnico/cliente para o provedor de IA.' },
    { nome_chave: 'audit_link_active', habilitado: 1, descricao: 'Garante o registro de hash e identificador único de usuário internamente para auditorias de conformidade com a LGPD.' }
  ];

  for (const conf of defaultLgpdConfigs) {
    await db.prepare(
      "INSERT INTO ia_lgpd_config (nome_chave, habilitado, descricao) VALUES (?, ?, ?)"
    ).bind(conf.nome_chave, conf.habilitado, conf.descricao).run();
  }

  Logger.info("Migração inicial concluída com sucesso!");
}

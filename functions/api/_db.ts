export interface Env {
  DB: D1Database;
  RealtimeHub: any;
}

async function checkAndMigrateSchema(db: D1Database) {
  let shouldDrop = false;
  try {
    const info = await db.prepare("PRAGMA table_info(certificacoes)").all();
    if (info && info.results && info.results.length > 0) {
      const idCol = info.results.find((col: any) => col.name === 'id');
      if (idCol && (idCol.type === 'TEXT' || idCol.type === 'text')) {
        shouldDrop = true;
      }
    }
  } catch (e) {
    // Table might not exist yet
  }

  if (shouldDrop) {
    await db.prepare("DROP TABLE IF EXISTS respostas").run();
    await db.prepare("DROP TABLE IF EXISTS avaliacoes").run();
    await db.prepare("DROP TABLE IF EXISTS itens").run();
    await db.prepare("DROP TABLE IF EXISTS grupos").run();
    await db.prepare("DROP TABLE IF EXISTS certificacoes").run();
    await db.prepare("DROP TABLE IF EXISTS avaliadores").run();
    await db.prepare("DROP TABLE IF EXISTS tecnicos").run();
  }
}

export async function initCertificacoes(db: D1Database) {
  await checkAndMigrateSchema(db);

  // Ensure table certificacoes exists
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS certificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      perfil_permitido TEXT NOT NULL,
      cor TEXT,
      icone TEXT,
      ativa INTEGER NOT NULL DEFAULT 1
    )
  `).run();

  // Seed certificacoes if empty
  const certCountRes = await db.prepare("SELECT COUNT(*) as count FROM certificacoes").first();
  const certCount = (certCountRes as any)?.count || 0;
  if (certCount === 0) {
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
  }
}

let dbInitialized = false;

export async function initDb(db: D1Database) {
  if (dbInitialized) {
    return;
  }

  // 1. Initialize Certificacoes
  await initCertificacoes(db);

  // 2. Initialize Grupos
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      certificacao_id INTEGER NOT NULL
    )
  `).run();

  // 3. Initialize Itens
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificacao_id INTEGER NOT NULL,
      grupo_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      critico INTEGER NOT NULL DEFAULT 0,
      obrigatorio INTEGER NOT NULL DEFAULT 1,
      ativo INTEGER NOT NULL DEFAULT 1
    )
  `).run();

  // 4. Initialize Avaliadores
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS avaliadores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL,
      cidade TEXT,
      base TEXT,
      cidade_base TEXT,
      ativo INTEGER DEFAULT 1,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 5. Initialize Tecnicos
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tecnicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      matricula TEXT NOT NULL UNIQUE,
      empresa TEXT NOT NULL,
      cidade_base TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 6. Initialize Avaliacoes
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico_id INTEGER,
      nome_tecnico TEXT NOT NULL,
      matricula TEXT NOT NULL,
      empresa TEXT NOT NULL,
      cidade_base TEXT NOT NULL,
      avaliador_id INTEGER,
      nome_cq TEXT NOT NULL,
      data TEXT NOT NULL,
      certificacao_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      resultado TEXT,
      observacao TEXT,
      nota_teorica REAL,
      nota_pratica REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7. Initialize Respostas
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS respostas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      resposta TEXT NOT NULL
    )
  `).run();

  // 8. Create Indexes
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_avaliacoes_data ON avaliacoes(data)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON avaliacoes(status)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_avaliacoes_certificacao_id ON avaliacoes(certificacao_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_itens_certificacao_id ON itens(certificacao_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_itens_grupo_id ON itens(grupo_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_grupos_certificacao_id ON grupos(certificacao_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_tecnicos_matricula ON tecnicos(matricula)").run();

  // Seed avaliadores if empty
  const avCountRes = await db.prepare("SELECT COUNT(*) as count FROM avaliadores").first();
  const avCount = (avCountRes as any)?.count || 0;
  if (avCount === 0) {
    const defaultAvaliadores = [
      {
        nome: 'Pedro Henrique Santos',
        perfil: 'CQ',
        cidade_base: 'São Paulo - Base Leste',
        status: 'ATIVO'
      },
      {
        nome: 'Juliana Mendes Silva',
        perfil: 'CQ',
        cidade_base: 'Campinas - Base Norte',
        status: 'ATIVO'
      },
      {
        nome: 'Rodrigo Antunes Costa',
        perfil: 'CQ',
        cidade_base: 'Rio de Janeiro - Base Sul',
        status: 'INATIVO'
      },
      {
        nome: 'Thiago Anderson',
        perfil: 'Analista',
        cidade_base: 'São Paulo - Base Centro',
        status: 'ATIVO'
      }
    ];

    for (const av of defaultAvaliadores) {
      const parts = (av.cidade_base || '').split(' - ');
      const cidade = parts[0] || '';
      const base = parts[1] || '';
      const statusUpper = av.status;
      const ativoVal = statusUpper === 'ATIVO' ? 1 : 0;

      await db.prepare(
        "INSERT INTO avaliadores (nome, perfil, cidade, base, cidade_base, ativo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).bind(av.nome, av.perfil, cidade, base, av.cidade_base, ativoVal, statusUpper).run();
    }
  }

  // Seed tecnicos if empty
  const tecCountRes = await db.prepare("SELECT COUNT(*) as count FROM tecnicos").first();
  const tecCount = (tecCountRes as any)?.count || 0;
  if (tecCount === 0) {
    const defaultTecnicos = [
      {
        nome: 'Marcos Vinícius Silva',
        matricula: 'TR551234',
        empresa: 'Claro S/A (Próprio)',
        cidade_base: 'São Paulo - Base Leste'
      },
      {
        nome: 'Ana Clara Oliveira',
        matricula: 'TR884321',
        empresa: 'Icomon Tecnologia',
        cidade_base: 'São Paulo - Base Leste'
      },
      {
        nome: 'Gabriel Henrique Santos',
        matricula: 'TR992211',
        empresa: 'Serede S/A',
        cidade_base: 'São Paulo - Base Leste'
      }
    ];

    for (const tec of defaultTecnicos) {
      await db.prepare(
        "INSERT INTO tecnicos (nome, matricula, empresa, cidade_base, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).bind(tec.nome, tec.matricula, tec.empresa, tec.cidade_base).run();
    }
  }

  // Seed grupos and itens if empty
  const itemsCountRes = await db.prepare("SELECT COUNT(*) as count FROM itens").first();
  const itemsCount = (itemsCountRes as any)?.count || 0;
  if (itemsCount === 0) {
    // Get the mapping of certificacao name -> id
    const certsRows = await db.prepare("SELECT id, nome FROM certificacoes").all();
    const certsMap = new Map<string, number>();
    certsRows.results.forEach((row: any) => {
      certsMap.set(row.nome, row.id);
    });

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

    // Retrieve all groups to map
    const groupsRows = await db.prepare("SELECT id, nome, certificacao_id FROM grupos").all();
    const groupsMap = new Map<string, number>();
    groupsRows.results.forEach((row: any) => {
      groupsMap.set(`${row.certificacao_id}_${row.nome}`, row.id);
    });

    const defaultGponVeteranoRaw = [
      { id: 1, pergunta: 'Utilizou a caneta de limpeza? (Conector, Power Meter, Porta da NAP)', critico: false, grupo: 'Processos' },
      { id: 2, pergunta: 'Realizou medição de sinal na NAP? (Uso correto do Power Meter / configuração correta)', critico: false, grupo: 'Processos' },
      { id: 3, pergunta: 'Confecção de Conectores Correta - Fibra Cinza (utilizou as ferramentas e gabaritos adequadamente)?', critico: true, grupo: 'Instalação Física' },
      { id: 4, pergunta: 'Identificou o cabo corretamente? (Poste/Cordoalha)', critico: false, grupo: 'Instalação Física' },
      { id: 5, pergunta: 'Confecção de Conectores Correta - Fibra Branca (utilizou as ferramentas e gabaritos adequadamente)?', critico: true, grupo: 'Instalação Física' },
      { id: 6, pergunta: 'Identificou o cabo corretamente? (MDU)', critico: false, grupo: 'Instalação Física' },
      { id: 7, pergunta: 'Identificou o andar da NAP em que foi instalada?', critico: false, grupo: 'Instalação Física' },
      { id: 8, pergunta: 'Realizou a acomodação correta na NAP? (Poste/Cordoalha)', critico: true, grupo: 'Instalação Física' },
      { id: 9, pergunta: 'Realizou a acomodação correta na NAP? (MDU)', critico: true, grupo: 'Instalação Física' },
      { id: 10, pergunta: 'Realizou a passagem do cabo óptico corretamente? (FLECHA, SDO, SDA e SRDO)', critico: false, grupo: 'Instalação Física' },
      { id: 11, pergunta: 'Realizou a montagem corretamente e explicou a regra de aplicação da PTO?', critico: false, grupo: 'Instalação Física' },
      { id: 12, pergunta: 'Realizou a acomodação correta na ONT? (Utilizou a fita autofusão no conector)', critico: false, grupo: 'Instalação Física' },
    ];

    const defaultGponCapacitacaoRaw = [
      { id: 101, pergunta: 'Atualizou o status no PDA (Rota para início)?', critico: false, grupo: 'Processos' },
      { id: 102, pergunta: 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', critico: false, grupo: 'Processos' },
      { id: 103, pergunta: 'Informou o código de segurança quando solicitado?', critico: false, grupo: 'Processos' },
      { id: 104, pergunta: 'Confirmou com o cliente os produtos antes de entrar na residência?', critico: false, grupo: 'Processos' },
      { id: 105, pergunta: 'Explicou ao cliente sobre a utilização do propé?', critico: false, grupo: 'Processos' },
      { id: 106, pergunta: 'Confirmou o local de instalação dos equipamentos?', critico: false, grupo: 'Processos' },
      { id: 107, pergunta: 'Combinou com o cliente a passagem do cabo e os possíveis furos?', critico: false, grupo: 'Processos' },
      { id: 108, pergunta: 'Realizou APR e ativou o botão escada através do App Técnico Nota 10?', critico: false, grupo: 'Processos' },
      { id: 109, pergunta: 'Confecção de Conectores Correta (utilizou as ferramentas adequadamente)?', critico: true, grupo: 'Instalação Física' },
      { id: 110, pergunta: 'Instalou Autofusão / Protetor no Conector?', critico: false, grupo: 'Instalação Física' },
      { id: 111, pergunta: 'Realizou medição de sinal na NAP?', critico: false, grupo: 'Instalação Física' },
      { id: 112, pergunta: 'Instalou corretamente o ECAM na NAP?', critico: false, grupo: 'Instalação Física' },
      { id: 113, pergunta: 'Identificou corretamente o cabo?', critico: false, grupo: 'Instalação Física' },
      { id: 114, pergunta: 'Realizou a cintagem do poste?', critico: true, grupo: 'Instalação Física' },
      { id: 115, pergunta: 'Realizou corretamente a passagem do cabo óptico (AGF, SRDO, SDO etc.)?', critico: false, grupo: 'Instalação Física' },
      { id: 116, pergunta: 'Instalou corretamente o PTO?', critico: false, grupo: 'Instalação Física' },
      { id: 117, pergunta: 'Explicou ao cliente sobre a fragilidade do cordão óptico?', critico: false, grupo: 'Instalação Física' },
      { id: 118, pergunta: 'Realizou reset de fábrica e instalação do decoder via Wi-Fi 5 GHz?', critico: false, grupo: 'Decodificador' },
      { id: 119, pergunta: 'Verificou se o decoder possui Status e IP corretamente?', critico: false, grupo: 'Decodificador' },
      { id: 120, pergunta: 'Configurou e explicou a utilização básica do controle remoto?', critico: false, grupo: 'Decodificador' },
      { id: 121, pergunta: 'Retirou bloqueio por idade e alterou senha de compra?', critico: false, grupo: 'Decodificador' },
      { id: 122, pergunta: 'Configurou corretamente TV e Decoder (HDMI, resolução, formato de exibição e sistema de áudio)?', critico: true, grupo: 'Decodificador' },
      { id: 123, pergunta: 'Explicou os recursos de gravação (Agendar gravação)?', critico: false, grupo: 'Decodificador' },
      { id: 124, pergunta: 'Demonstrou o Replay TV?', critico: false, grupo: 'Decodificador' },
      { id: 125, pergunta: 'Explicou a função Autodesligar?', critico: false, grupo: 'Decodificador' },
      { id: 126, pergunta: 'Apresentou o App Claro TV+ ao cliente?', critico: false, grupo: 'Decodificador' },
      { id: 127, pergunta: 'Confecção do Conector RJ45 está correta?', critico: true, grupo: 'Banda Larga' },
      { id: 128, pergunta: 'Definiu corretamente o local da ONT e analisou a cobertura Wi-Fi?', critico: false, grupo: 'Banda Larga' },
      { id: 129, pergunta: 'Acessou as propriedades da ONT e explicou sobre senha forte?', critico: false, grupo: 'Banda Larga' },
      { id: 130, pergunta: 'Configurou corretamente o Wi-Fi (Band Steering e Redes 2.4 e 5 GHz)?', critico: true, grupo: 'Banda Larga' },
      { id: 131, pergunta: 'Explicou ao cliente sobre a rede IoT?', critico: false, grupo: 'Banda Larga' },
      { id: 132, pergunta: 'Informou sobre compatibilidade dos dispositivos?', critico: false, grupo: 'Banda Larga' },
      { id: 133, pergunta: 'Realizou teste de velocidade?', critico: false, grupo: 'Banda Larga' },
      { id: 134, pergunta: 'Verificou os níveis TX e RX pela ONT ou niveis.virtua.com.br?', critico: false, grupo: 'Banda Larga' },
      { id: 135, pergunta: 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', critico: false, grupo: 'Banda Larga' },
      { id: 136, pergunta: 'Confecção dos conectores RJ11 está correta?', critico: false, grupo: 'Telefone' },
      { id: 137, pergunta: 'Explicou Claro Fone, Serviços Inteligentes e Portabilidade?', critico: false, grupo: 'Telefone' },
      { id: 138, pergunta: 'Confirmou o funcionamento do Claro Fone informando o número?', critico: false, grupo: 'Telefone' },
      { id: 139, pergunta: 'Confirmou que o firmware está atualizado?', critico: false, grupo: 'Aplicativos' },
      { id: 140, pergunta: 'Solicitou documento e realizou upload na OS Digital?', critico: false, grupo: 'Aplicativos' },
      { id: 141, pergunta: 'Preencheu corretamente a Ordem de Serviço Digital e coletou assinatura?', critico: false, grupo: 'Aplicativos' },
      { id: 142, pergunta: 'Finalizou o atendimento no PDA e lançou os materiais utilizados?', critico: false, grupo: 'Aplicativos' },
      { id: 143, pergunta: 'Informou os canais de Autoatendimento (Minha Claro, WhatsApp e Site)?', critico: false, grupo: 'Aplicativos' },
      { id: 144, pergunta: 'Realizou a Autoinspeção?', critico: false, grupo: 'Aplicativos' },
      { id: 145, pergunta: 'Informou sobre o TNPS e solicitou a avaliação?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
      { id: 146, pergunta: 'Explicou corretamente as notas do TNPS?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
    ];

    const defaultHfcCapacitacaoRaw = [
      { id: 201, pergunta: 'Atualizou o status no PDA (Rota para início)?', critico: false, grupo: 'Processos' },
      { id: 202, pergunta: 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', critico: false, grupo: 'Processos' },
      { id: 203, pergunta: 'Informou o código de segurança quando solicitado?', critico: false, grupo: 'Processos' },
      { id: 204, pergunta: 'Confirmou com o cliente os produtos a serem instalados antes de entrar na residência?', critico: false, grupo: 'Processos' },
      { id: 205, pergunta: 'Explicou ao cliente sobre a utilização do pro-pé?', critico: false, grupo: 'Processos' },
      { id: 206, pergunta: 'Confirmou com o cliente o local de instalação dos equipamentos?', critico: false, grupo: 'Processos' },
      { id: 207, pergunta: 'Combinou com o cliente a passagem do cabo e as paredes que seriam furadas?', critico: false, grupo: 'Processos' },
      { id: 208, pergunta: 'Realizou a APR e ativou o botão escada através do APP Técnico Nota 10 antes do trabalho em altura?', critico: false, grupo: 'Processos' },
      { id: 209, pergunta: 'Realizou corretamente a confecção dos conectores utilizando as ferramentas adequadas?', critico: true, grupo: 'Instalação Física' },
      { id: 210, pergunta: 'Efetuou a medição de sinal (CA e CB)?', critico: false, grupo: 'Instalação Física' },
      { id: 211, pergunta: 'Utilizou corretamente o anel de vedação?', critico: false, grupo: 'Instalação Física' },
      { id: 212, pergunta: 'Identificou corretamente o cabo?', critico: false, grupo: 'Instalação Física' },
      { id: 213, pergunta: 'Realizou corretamente a cintagem do poste e a amarração?', critico: true, grupo: 'Instalação Física' },
      { id: 214, pergunta: 'Instalou corretamente o Cable Isolator?', critico: false, grupo: 'Instalação Física' },
      { id: 215, pergunta: 'Aplicou corretamente o torque nas conexões do MDU, passivos e equipamentos?', critico: false, grupo: 'Instalação Física' },
      { id: 216, pergunta: 'Explicou corretamente a importância do Mini Isolator?', critico: false, grupo: 'Instalação Física' },
      { id: 217, pergunta: 'Executou corretamente a distribuição do sinal do cabo coaxial?', critico: false, grupo: 'Instalação Física' },
      { id: 218, pergunta: 'Efetuou o reset de fábrica do decoder e realizou a configuration da base?', critico: false, grupo: 'Decodificador' },
      { id: 219, pergunta: 'Todos os pontos de TV ficaram com níveis de sinal dentro do padrão?', critico: false, grupo: 'Decodificador' },
      { id: 220, pergunta: 'Configurou e explicou a utilização do controle remoto?', critico: false, grupo: 'Decodificador' },
      { id: 221, pergunta: 'Retirou o bloqueio por idade e alterou a senha de compra?', critico: false, grupo: 'Decodificador' },
      { id: 222, pergunta: 'Configurou corretamente TV e Decoder (HDMI, resolução, formato e áudio)?', critico: true, grupo: 'Decodificador' },
      { id: 223, pergunta: 'Explicou o NOW demonstrando conteúdos gratuitos?', critico: false, grupo: 'Decodificador' },
      { id: 224, pergunta: 'Explicou os recursos de gravação?', critico: false, grupo: 'Decodificador' },
      { id: 225, pergunta: 'Demonstrou o Replay TV?', critico: false, grupo: 'Decodificador' },
      { id: 226, pergunta: 'Explicou a função Auto Hit?', critico: false, grupo: 'Decodificador' },
      { id: 227, pergunta: 'Explicou a função Autodesligar?', critico: false, grupo: 'Decodificador' },
      { id: 228, pergunta: 'Realizou o Valida Retorno?', critico: false, grupo: 'Decodificador' },
      { id: 229, pergunta: 'Apresentou o App Claro TV+ e explicou cadastro e acesso?', critico: false, grupo: 'Decodificador' },
      { id: 230, pergunta: 'Confeccionou corretamente o conector RJ45?', critico: true, grupo: 'Banda Larga' },
      { id: 231, pergunta: 'Definiu corretamente o local do eMTA e analisou a potência do Wi-Fi?', critico: false, grupo: 'Banda Larga' },
      { id: 232, pergunta: 'Acessou as propriedades do eMTA e explicou sobre senha forte?', critico: false, grupo: 'Banda Larga' },
      { id: 233, pergunta: 'Configurou corretamente o Wi-Fi (Band Steering e redes 2.4 e 5 GHz)?', critico: true, grupo: 'Banda Larga' },
      { id: 234, pergunta: 'Explicou sobre a rede IoT?', critico: false, grupo: 'Banda Larga' },
      { id: 235, pergunta: 'Informou sobre compatibilidade dos dispositivos do cliente?', critico: false, grupo: 'Banda Larga' },
      { id: 236, pergunta: 'Realizou teste de velocidade pelo Brasil Banda Larga/Speedtest?', critico: false, grupo: 'Banda Larga' },
      { id: 237, pergunta: 'Verificou TX/RX/SNR pelo site niveis.virtua.com.br?', critico: false, grupo: 'Banda Larga' },
      { id: 238, pergunta: 'Verificou TX/RX/SNR pela página interna do eMTA?', critico: false, grupo: 'Banda Larga' },
      { id: 239, pergunta: 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', critico: false, grupo: 'Banda Larga' },
      { id: 240, pergunta: 'Realizou atendimento consultivo apresentando opções de contratação?', critico: false, grupo: 'Telefone' },
      { id: 241, pergunta: 'Confeccionou corretamente os conectores telefônicos RJ11?', critico: false, grupo: 'Telefone' },
      { id: 242, pergunta: 'Explicou os Serviços Inteligentes Claro Fone e Portabilidade?', critico: false, grupo: 'Telefone' },
      { id: 243, pergunta: 'Confirmou o funcionamento do Claro Fone informando o número ao cliente?', critico: false, grupo: 'Telefone' },
      { id: 244, pergunta: 'Confirmou que o firmware dos equipamentos está atualizado?', critico: false, grupo: 'Aplicativos' },
      { id: 245, pergunta: 'Solicitou documento e realizou upload na OS Digital?', critico: false, grupo: 'Aplicativos' },
      { id: 246, pergunta: 'Preencheu corretamente a Ordem de Serviço Digital e coletou a assinatura do cliente?', critico: false, grupo: 'Aplicativos' },
      { id: 247, pergunta: 'Finalizou o atendimento no PDA e lançou corretamente os materiais?', critico: false, grupo: 'Aplicativos' },
      { id: 248, pergunta: 'Informou sobre os canais de autoatendimento (Minha Claro, WhatsApp e Site)?', critico: false, grupo: 'Aplicativos' },
      { id: 249, pergunta: 'Realizou a autoinspeção?', critico: false, grupo: 'Atendimento Consultivo / TNPS' },
      { id: 250, pergunta: 'Informou sobre o TNPS e solicitou a avaliação do cliente?', critico: false, grupo: 'Atendimento Consultivo / TNPS' }
    ];

    const stmt = db.prepare(
      "INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)"
    );

    // GPON Veterano
    for (let i = 0; i < defaultGponVeteranoRaw.length; i++) {
      const x = defaultGponVeteranoRaw[i];
      const certId = certsMap.get('GPON Veterano')!;
      const grupoId = groupsMap.get(`${certId}_${x.grupo}`)!;
      await stmt.bind(certId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
    // GPON Capacitação
    for (let i = 0; i < defaultGponCapacitacaoRaw.length; i++) {
      const x = defaultGponCapacitacaoRaw[i];
      const certId = certsMap.get('GPON Capacitação')!;
      const grupoId = groupsMap.get(`${certId}_${x.grupo}`)!;
      await stmt.bind(certId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
    // HFC Capacitação
    for (let i = 0; i < defaultHfcCapacitacaoRaw.length; i++) {
      const x = defaultHfcCapacitacaoRaw[i];
      const certId = certsMap.get('HFC Capacitação')!;
      const grupoId = groupsMap.get(`${certId}_${x.grupo}`)!;
      await stmt.bind(certId, grupoId, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
  }

  // Seed avaliacoes if empty
  const evalCountRes = await db.prepare("SELECT COUNT(*) as count FROM avaliacoes").first();
  const evalCount = (evalCountRes as any)?.count || 0;
  if (evalCount === 0) {
    // Get mappings to use
    const certsRows = await db.prepare("SELECT id, nome FROM certificacoes").all();
    const certsMap = new Map<string, number>();
    certsRows.results.forEach((row: any) => {
      certsMap.set(row.nome, row.id);
    });

    const itemsRows = await db.prepare("SELECT id, certificacao_id, ordem FROM itens").all();
    const itemsMap = new Map<string, number>();
    itemsRows.results.forEach((row: any) => {
      itemsMap.set(`${row.certificacao_id}_${row.ordem}`, row.id);
    });

    const getOrdemFromOldItemId = (oldId: number, certName: string): number => {
      if (certName === 'GPON Veterano') {
        return oldId;
      } else if (certName === 'GPON Capacitação') {
        return oldId - 100;
      } else {
        return oldId - 200;
      }
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const seedEvals = [
      {
        tecnico_id: 1,
        nome_tecnico: 'Marcos Vinícius Silva',
        matricula: 'TR551234',
        empresa: 'Claro S/A (Próprio)',
        cidade_base: 'São Paulo - Base Leste',
        avaliador_id: 1,
        nome_cq: 'Pedro Henrique Santos',
        data: '2026-06-25',
        certificacao_nome: 'GPON Veterano',
        status: 'Concluída',
        resultado: JSON.stringify({
          totalAvaliado: 12,
          acertos: 11,
          nota: 9.2,
          resultado: 'APROVADO',
          itensNaoRealizados: [12],
          itensCriticosNaoRealizados: []
        }),
        observacao: 'Iniciou com boa postura técnica.',
        nota_teorica: 9.0,
        nota_pratica: 9.2,
        createdAt: '2026-06-25T10:30:00.000Z',
        updatedAt: '2026-06-25T11:15:00.000Z',
        responses: {
          1: 'Fez',
          2: 'Fez',
          3: 'Fez',
          4: 'Fez',
          5: 'Fez',
          6: 'Fez',
          7: 'Fez',
          8: 'Fez',
          9: 'Fez',
          10: 'Fez',
          11: 'Fez',
          12: 'NaoFez'
        }
      },
      {
        tecnico_id: 2,
        nome_tecnico: 'Ana Clara Oliveira',
        matricula: 'TR884321',
        empresa: 'Icomon Tecnologia',
        cidade_base: 'São Paulo - Base Leste',
        avaliador_id: 1,
        nome_cq: 'Pedro Henrique Santos',
        data: todayStr,
        certificacao_nome: 'GPON Capacitação',
        status: 'Rascunho',
        resultado: null,
        observacao: '',
        nota_teorica: null,
        nota_pratica: null,
        createdAt: '2026-07-01T14:22:00.000Z',
        updatedAt: '2026-07-01T14:22:00.000Z',
        responses: {}
      },
      {
        tecnico_id: 3,
        nome_tecnico: 'Gabriel Henrique Santos',
        matricula: 'TR992211',
        empresa: 'Serede S/A',
        cidade_base: 'São Paulo - Base Leste',
        avaliador_id: 1,
        nome_cq: 'Pedro Henrique Santos',
        data: todayStr,
        certificacao_nome: 'HFC Capacitação',
        status: 'Concluída',
        resultado: null,
        observacao: '',
        nota_teorica: null,
        nota_pratica: null,
        createdAt: '2026-07-03T09:00:00.000Z',
        updatedAt: '2026-07-03T09:12:00.000Z',
        responses: {}
      }
    ];

    const stmtCorrect = db.prepare(
      `INSERT INTO avaliacoes (
        tecnico_id, nome_tecnico, matricula, empresa, cidade_base, 
        avaliador_id, nome_cq, data, certificacao_id, status, resultado, 
        observacao, nota_teorica, nota_pratica, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const e of seedEvals) {
      const certId = certsMap.get(e.certificacao_nome)!;
      await stmtCorrect.bind(
        e.tecnico_id, e.nome_tecnico, e.matricula, e.empresa, e.cidade_base,
        e.avaliador_id, e.nome_cq, e.data, certId, e.status, e.resultado,
        e.observacao, e.nota_teorica, e.nota_pratica, e.createdAt, e.updatedAt
      ).run();

      // Retrieve generated eval ID
      const lastIdRes = await db.prepare("SELECT last_insert_rowid() as id").first();
      const evalId = (lastIdRes as any)?.id;

      if (evalId) {
        for (const [oldIdStr, resVal] of Object.entries(e.responses)) {
          const oldId = parseInt(oldIdStr, 10);
          const ordem = getOrdemFromOldItemId(oldId, e.certificacao_nome);
          const itemId = itemsMap.get(`${certId}_${ordem}`);
          if (itemId) {
            await db.prepare(
              "INSERT INTO respostas (avaliacao_id, item_id, resposta) VALUES (?, ?, ?)"
            ).bind(evalId, itemId, resVal).run();
          }
        }
      }
    }
  }

  dbInitialized = true;
}

export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}


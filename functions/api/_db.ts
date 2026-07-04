export interface Env {
  DB: D1Database;
}

export async function initDb(db: D1Database) {
  // Create tables if they don't exist
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS certificacoes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      perfilPermitido TEXT NOT NULL,
      cor TEXT,
      icone TEXT,
      ativa INTEGER NOT NULL DEFAULT 1
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS itens (
      id INTEGER PRIMARY KEY,
      certificacao TEXT NOT NULL,
      grupo TEXT NOT NULL,
      ordem INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      critico INTEGER NOT NULL DEFAULT 0,
      obrigatorio INTEGER NOT NULL DEFAULT 1,
      ativo INTEGER NOT NULL DEFAULT 1
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS avaliacoes (
      id TEXT PRIMARY KEY,
      nomeTecnico TEXT NOT NULL,
      matricula TEXT NOT NULL,
      empresa TEXT NOT NULL,
      cidadeBase TEXT NOT NULL,
      nomeCQ TEXT NOT NULL,
      data TEXT NOT NULL,
      tipoCertificacao TEXT NOT NULL,
      status TEXT NOT NULL,
      checklistResponses TEXT NOT NULL,
      resultado TEXT,
      observacao TEXT,
      notaTeorica REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cqs (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL,
      cidadeBase TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run();

  // Check if certificacoes table is empty
  const certCountRes = await db.prepare("SELECT COUNT(*) as count FROM certificacoes").first();
  const certCount = (certCountRes as any)?.count || 0;
  if (certCount === 0) {
    const defaultCerts = [
      {
        id: 'gpon-veterano',
        nome: 'GPON Veterano',
        descricao: 'Avaliação prática periódica para técnicos veteranos em tecnologia de fibra óptica GPON.',
        perfilPermitido: 'Apenas CQ',
        cor: '#E30613',
        icone: 'Cpu',
        ativa: 1
      },
      {
        id: 'gpon-capacitacao',
        nome: 'GPON Capacitação',
        descricao: 'Auditoria de capacitação técnica inicial para novos técnicos em rede óptica GPON.',
        perfilPermitido: 'Apenas Analista',
        cor: '#FFB800',
        icone: 'Wifi',
        ativa: 1
      },
      {
        id: 'hfc-capacitacao',
        nome: 'HFC Capacitação',
        descricao: 'Auditoria de padrões e conformidades para redes coaxiais (HFC) e decodificadores.',
        perfilPermitido: 'CQ ou Analista',
        cor: '#00A859',
        icone: 'Tv',
        ativa: 1
      }
    ];

    for (const cert of defaultCerts) {
      await db.prepare(
        "INSERT INTO certificacoes (id, nome, descricao, perfilPermitido, cor, icone, ativa) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(cert.id, cert.nome, cert.descricao, cert.perfilPermitido, cert.cor, cert.icone, cert.ativa).run();
    }
  }

  // Check if cqs table is empty
  const cqCountRes = await db.prepare("SELECT COUNT(*) as count FROM cqs").first();
  const cqCount = (cqCountRes as any)?.count || 0;
  if (cqCount === 0) {
    const defaultCQs = [
      {
        id: 'cq-1',
        nome: 'Pedro Henrique Santos',
        perfil: 'CQ',
        cidadeBase: 'São Paulo - Base Leste',
        status: 'Ativo'
      },
      {
        id: 'cq-2',
        nome: 'Juliana Mendes Silva',
        perfil: 'CQ',
        cidadeBase: 'Campinas - Base Norte',
        status: 'Ativo'
      },
      {
        id: 'cq-3',
        nome: 'Rodrigo Antunes Costa',
        perfil: 'CQ',
        cidadeBase: 'Rio de Janeiro - Base Sul',
        status: 'Inativo'
      },
      {
        id: 'cq-4',
        nome: 'Thiago Anderson',
        perfil: 'Analista',
        cidadeBase: 'São Paulo - Base Centro',
        status: 'Ativo'
      }
    ];

    for (const cq of defaultCQs) {
      const now = new Date().toISOString();
      await db.prepare(
        "INSERT INTO cqs (id, nome, perfil, cidadeBase, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(cq.id, cq.nome, cq.perfil, cq.cidadeBase, cq.status, now, now).run();
    }
  }

  // Check if itens table is empty
  const itemsCountRes = await db.prepare("SELECT COUNT(*) as count FROM itens").first();
  const itemsCount = (itemsCountRes as any)?.count || 0;
  if (itemsCount === 0) {
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
      { id: 218, pergunta: 'Efetuou o reset de fábrica do decoder e realizou a configuração da base?', critico: false, grupo: 'Decodificador' },
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
      "INSERT INTO itens (id, certificacao, grupo, ordem, descricao, critico, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    );

    // GPON Veterano
    for (let i = 0; i < defaultGponVeteranoRaw.length; i++) {
      const x = defaultGponVeteranoRaw[i];
      await stmt.bind(x.id, 'GPON Veterano', x.grupo, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
    // GPON Capacitação
    for (let i = 0; i < defaultGponCapacitacaoRaw.length; i++) {
      const x = defaultGponCapacitacaoRaw[i];
      await stmt.bind(x.id, 'GPON Capacitação', x.grupo, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
    // HFC Capacitação
    for (let i = 0; i < defaultHfcCapacitacaoRaw.length; i++) {
      const x = defaultHfcCapacitacaoRaw[i];
      await stmt.bind(x.id, 'HFC Capacitação', x.grupo, i + 1, x.pergunta, x.critico ? 1 : 0, x.critico ? 1 : 0).run();
    }
  }

  // Check if avaliacoes table is empty
  const evalCountRes = await db.prepare("SELECT COUNT(*) as count FROM avaliacoes").first();
  const evalCount = (evalCountRes as any)?.count || 0;
  if (evalCount === 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    const seedEvals = [
      {
        id: 'seed-1',
        nomeTecnico: 'Marcos Vinícius Silva',
        matricula: 'TR551234',
        empresa: 'Claro S/A (Próprio)',
        cidadeBase: 'São Paulo - Base Leste',
        nomeCQ: 'Pedro Henrique Santos',
        data: '2026-06-25',
        tipoCertificacao: 'GPON Veterano',
        status: 'Concluída',
        checklistResponses: JSON.stringify({
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
        }),
        resultado: JSON.stringify({
          totalAvaliado: 12,
          acertos: 11,
          nota: 9.2,
          resultado: 'APROVADO',
          itensNaoRealizados: [12],
          itensCriticosNaoRealizados: []
        }),
        observacao: 'Iniciou com boa postura técnica.',
        notaTeorica: 9.0,
        createdAt: '2026-06-25T10:30:00.000Z',
        updatedAt: '2026-06-25T11:15:00.000Z'
      },
      {
        id: 'seed-2',
        nomeTecnico: 'Ana Clara Oliveira',
        matricula: 'TR884321',
        empresa: 'Icomon Tecnologia',
        cidadeBase: 'São Paulo - Base Leste',
        nomeCQ: 'Pedro Henrique Santos',
        data: todayStr,
        tipoCertificacao: 'GPON Capacitação',
        status: 'Rascunho',
        checklistResponses: JSON.stringify({}),
        resultado: null,
        observacao: '',
        notaTeorica: null,
        createdAt: '2026-07-01T14:22:00.000Z',
        updatedAt: '2026-07-01T14:22:00.000Z'
      },
      {
        id: 'seed-3',
        nomeTecnico: 'Gabriel Henrique Santos',
        matricula: 'TR992211',
        empresa: 'Serede S/A',
        cidadeBase: 'São Paulo - Base Leste',
        nomeCQ: 'Pedro Henrique Santos',
        data: todayStr,
        tipoCertificacao: 'HFC Capacitação',
        status: 'Concluída',
        checklistResponses: JSON.stringify({}),
        resultado: null,
        observacao: '',
        notaTeorica: null,
        createdAt: '2026-07-03T09:00:00.000Z',
        updatedAt: '2026-07-03T09:12:00.000Z'
      }
    ];

    const stmt = db.prepare(
      "INSERT INTO avaliacoes (id, nomeTecnico, matricula, empresa, cidadeBase, nomeCQ, data, tipoCertificacao, status, checklistResponses, resultado, observacao, notaTeorica, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const e of seedEvals) {
      await stmt.bind(
        e.id, e.nomeTecnico, e.matricula, e.empresa, e.cidadeBase, e.nomeCQ, e.data, e.tipoCertificacao, e.status, e.checklistResponses, e.resultado, e.observacao, e.notaTeorica, e.createdAt, e.updatedAt
      ).run();
    }
  }
}

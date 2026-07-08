-- 1. Create Tables
CREATE TABLE IF NOT EXISTS certificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  perfil_permitido TEXT NOT NULL,
  cor TEXT,
  icone TEXT,
  ativa INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grupos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  certificacao_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificacao_id INTEGER NOT NULL,
  grupo_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  critico INTEGER DEFAULT 0,
  obrigatorio INTEGER DEFAULT 1,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS avaliadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL,
  cidade TEXT,
  base TEXT,
  cidade_base TEXT,
  ativo INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT NOT NULL,
  empresa TEXT NOT NULL,
  cidade_base TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id TEXT PRIMARY KEY,
  tecnico_id INTEGER,
  nome_tecnico TEXT NOT NULL,
  matricula TEXT NOT NULL,
  empresa TEXT NOT NULL,
  cidade_base TEXT NOT NULL,
  avaliador_id INTEGER,
  nome_cq TEXT NOT NULL,
  data TEXT NOT NULL,
  certificacao_id INTEGER,
  status TEXT NOT NULL,
  resultado TEXT,
  observacao TEXT,
  nota_teorica REAL,
  nota_pratica REAL,
  modo_certificacao TEXT DEFAULT 'TRADICIONAL',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  resposta TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ia_evidencias (
  id TEXT PRIMARY KEY,
  certificacao_id TEXT NOT NULL,
  etapa TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_key TEXT NOT NULL,
  status_ia TEXT DEFAULT 'PENDENTE',
  resultado_ia TEXT,
  justificativa_ia TEXT,
  confianca_ia REAL,
  decisao_cq TEXT,
  observacao_cq TEXT,
  ia_modelo TEXT,
  ia_custo_estimado REAL DEFAULT 0.0,
  ia_hash_arquivo TEXT,
  image_signature TEXT,
  ia_origem TEXT DEFAULT 'AUTOMATICA',
  imagem_repetida INTEGER DEFAULT 0,
  imagem_repetida_alerta TEXT,
  risco_reuso TEXT DEFAULT 'BAIXO',
  usuario_upload_id TEXT,
  perfil_upload TEXT,
  login_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ia_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificacao_id TEXT NOT NULL,
  evidencia_id TEXT,
  acao TEXT NOT NULL,
  payload TEXT NOT NULL,
  usuario_id TEXT,
  perfil_usuario TEXT,
  login_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ia_regras_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_certificacao TEXT NOT NULL,
  etapa TEXT NOT NULL,
  regras_texto TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ia_feedback_treinamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidencia_id TEXT NOT NULL,
  image_hash TEXT,
  resultado_ia TEXT,
  resultado_cq TEXT,
  correcao_cq TEXT,
  motivo_cq TEXT,
  checklist_item TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  etapa TEXT,
  resultado_original_ia TEXT,
  resultado_final_cq TEXT,
  motivo_divergencia TEXT,
  usar_como_exemplo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ia_lgpd_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_chave TEXT NOT NULL,
  habilitado INTEGER DEFAULT 1,
  descricao TEXT
);

CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  evento TEXT NOT NULL,
  usuario_id TEXT,
  perfil TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS image_ref_counts (
  image_hash TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  ref_count INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ia_analises_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidencia_id TEXT NOT NULL,
  ia_model TEXT,
  ia_prompt_version TEXT,
  ia_requested_by TEXT,
  ia_requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ia_status TEXT,
  ia_tokens_estimated INTEGER,
  ia_result_json TEXT,
  ia_error_code TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  value INTEGER,
  expires_at INTEGER
);

-- Indexes for optimized querying
CREATE INDEX IF NOT EXISTS idx_avaliacoes_data ON avaliacoes(data);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON avaliacoes(status);
CREATE INDEX IF NOT EXISTS idx_ia_evidencias_cert ON ia_evidencias(certificacao_id);
CREATE INDEX IF NOT EXISTS idx_ia_evidencias_hash ON ia_evidencias(ia_hash_arquivo);
CREATE INDEX IF NOT EXISTS idx_ia_auditoria_cert ON ia_auditoria(certificacao_id);

-- 2. Seed Default 'certificacoes'
INSERT INTO certificacoes (nome, descricao, perfil_permitido, cor, icone, ativa) VALUES 
('GPON Veterano', 'Avaliação prática periódica para técnicos veteranos em tecnologia de fibra óptica GPON.', 'Apenas CQ', '#E30613', 'Cpu', 1),
('GPON Capacitação', 'Auditoria de capacitação técnica inicial para novos técnicos em rede óptica GPON.', 'Apenas Analista', '#FFB800', 'Wifi', 1),
('HFC Capacitação', 'Auditoria de padrões e conformidades para redes coaxiais (HFC) e decodificadores.', 'CQ ou Analista', '#00A859', 'Tv', 1);

-- 3. Seed Default 'avaliadores'
INSERT INTO avaliadores (nome, perfil, cidade, base, cidade_base, ativo, status) VALUES 
('Pedro Henrique Santos', 'cq', 'São Paulo', 'Base Leste', 'São Paulo - Base Leste', 1, 'ATIVO'),
('Luiza Maria Souza', 'analista', 'Campinas', 'Base Sul', 'Campinas - Base Sul', 1, 'ATIVO'),
('Gisele Oliveira Prado', 'cq', 'Rio de Janeiro', 'Base Centro', 'Rio de Janeiro - Base Centro', 0, 'INATIVO');

-- 4. Seed Default 'tecnicos'
INSERT INTO tecnicos (nome, matricula, empresa, cidade_base) VALUES 
('Marcos Vinícius Silva', 'TR551234', 'Claro S/A (Próprio)', 'São Paulo - Base Leste'),
('Ana Clara Oliveira', 'TR884321', 'Icomon Tecnologia', 'São Paulo - Base Leste'),
('Gabriel Henrique Santos', 'TR992211', 'Serede S/A', 'São Paulo - Base Leste');

-- 5. Seed Default 'grupos'
INSERT INTO grupos (nome, certificacao_id) VALUES 
('Processos', 1),
('Instalação Física', 1),
('Processos', 2),
('Instalação Física', 2),
('Decodificador', 2),
('Banda Larga', 2),
('Telefone', 2),
('Aplicativos', 2),
('Atendimento Consultivo / TNPS', 2),
('Processos', 3),
('Instalação Física', 3),
('Decodificador', 3),
('Banda Larga', 3),
('Telefone', 3),
('Aplicativos', 3),
('Atendimento Consultivo / TNPS', 3);

-- 6. Seed Default 'itens' (checklist questions)
-- GPON Veterano Items (certificacao_id = 1)
INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES 
(1, 1, 1, 'Utilizou a caneta de limpeza? (Conector, Power Meter, Porta da NAP)', 0, 0, 1),
(1, 1, 2, 'Realizou medição de sinal na NAP? (Uso correto do Power Meter / configuração correta)', 0, 0, 1),
(1, 2, 3, 'Confecção de Conectores Correta - Fibra Cinza (utilizou as ferramentas e gabaritos adequadamente)?', 1, 1, 1),
(1, 2, 4, 'Identificou o cabo corretamente? (Poste/Cordoalha)', 0, 0, 1),
(1, 2, 5, 'Confecção de Conectores Correta - Fibra Branca (utilizou as ferramentas e gabaritos adequadamente)?', 1, 1, 1),
(1, 2, 6, 'Identificou o cabo corretamente? (MDU)', 0, 0, 1),
(1, 2, 7, 'Identificou o andar da NAP em que foi instalada?', 0, 0, 1),
(1, 2, 8, 'Realizou a acomodação correta na NAP? (Poste/Cordoalha)', 1, 1, 1),
(1, 2, 9, 'Realizou a acomodação correta na NAP? (MDU)', 1, 1, 1),
(1, 2, 10, 'Realizou a passagem do cabo óptico corretamente? (FLECHA, SDO, SDA e SRDO)', 0, 0, 1),
(1, 2, 11, 'Realizou la montagem corretamente e explicou a regra de aplicação da PTO?', 0, 0, 1),
(1, 2, 12, 'Realizou a acomodação correta na ONT? (Utilizou a fita autofusão no conector)', 0, 0, 1);

-- GPON Capacitação Items (certificacao_id = 2)
INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES 
(2, 3, 1, 'Atualizou o status no PDA (Rota para início)?', 0, 0, 1),
(2, 3, 2, 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', 0, 0, 1),
(2, 3, 3, 'Informou o código de segurança quando solicitado?', 0, 0, 1),
(2, 3, 4, 'Confirmou com o cliente os produtos antes de entrar na residência?', 0, 0, 1),
(2, 3, 5, 'Explicou ao cliente sobre a utilização do propé?', 0, 0, 1),
(2, 3, 6, 'Confirmou o local de instalação dos equipamentos?', 0, 0, 1),
(2, 3, 7, 'Combinou com o cliente a passagem do cabo e os possíveis furos?', 0, 0, 1),
(2, 3, 8, 'Realizou APR e ativou o botão escada através do App Técnico Nota 10?', 0, 0, 1),
(2, 4, 9, 'Confecção de Conectores Correta (utilizou as ferramentas adequadamente)?', 1, 1, 1),
(2, 4, 10, 'Instalou Autofusão / Protetor no Conector?', 0, 0, 1),
(2, 4, 11, 'Realizou medição de sinal na NAP?', 0, 0, 1),
(2, 4, 12, 'Instalou corretamente o ECAM na NAP?', 0, 0, 1),
(2, 4, 13, 'Identificou corretamente o cabo?', 0, 0, 1),
(2, 4, 14, 'Realizou a cintagem do poste?', 1, 1, 1),
(2, 4, 15, 'Realizou corretamente a passagem do cabo óptico (AGF, SRDO, SDO etc.)?', 0, 0, 1),
(2, 4, 16, 'Instalou corretamente o PTO?', 0, 0, 1),
(2, 4, 17, 'Explicou ao cliente sobre a fragilidade do cordão óptico?', 0, 0, 1),
(2, 5, 18, 'Realizou reset de fábrica e instalação do decoder via Wi-Fi 5 GHz?', 0, 0, 1),
(2, 5, 19, 'Verificou se o decoder possui Status e IP corretamente?', 0, 0, 1),
(2, 5, 20, 'Configurou e explicou a utilização básica do controle remoto?', 0, 0, 1),
(2, 5, 21, 'Retirou bloqueio por idade e alterou senha de compra?', 0, 0, 1),
(2, 5, 22, 'Configurou corretamente TV e Decoder (HDMI, resolução, formato de exibição e sistema de áudio)?', 1, 1, 1),
(2, 5, 23, 'Explicou os recursos de gravação (Agendar gravação)?', 0, 0, 1),
(2, 5, 24, 'Demonstrou o Replay TV?', 0, 0, 1),
(2, 5, 25, 'Explicou a função Autodesligar?', 0, 0, 1),
(2, 5, 26, 'Apresentou o App Claro TV+ ao cliente?', 0, 0, 1),
(2, 6, 27, 'Confecção do Conector RJ45 está correta?', 1, 1, 1),
(2, 6, 28, 'Definiu corretamente o local da ONT e analisou a cobertura Wi-Fi?', 0, 0, 1),
(2, 6, 29, 'Acessou as propriedades da ONT e explicou sobre senha forte?', 0, 0, 1),
(2, 6, 30, 'Configurou corretamente o Wi-Fi (Band Steering e Redes 2.4 e 5 GHz)?', 1, 1, 1),
(2, 6, 31, 'Explicou ao cliente sobre a rede IoT?', 0, 0, 1),
(2, 6, 32, 'Informou sobre compatibilidade dos dispositivos?', 0, 0, 1),
(2, 6, 33, 'Realizou teste de velocidade?', 0, 0, 1),
(2, 6, 34, 'Verificou os níveis TX e RX pela ONT ou niveis.virtua.com.br?', 0, 0, 1),
(2, 6, 35, 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', 0, 0, 1),
(2, 7, 36, 'Confecção dos conectores RJ11 está correta?', 0, 0, 1),
(2, 7, 37, 'Explicou Claro Fone, Serviços Inteligentes e Portabilidade?', 0, 0, 1),
(2, 7, 38, 'Confirmou o funcionamento do Claro Fone informando o número?', 0, 0, 1),
(2, 8, 39, 'Confirmou que o firmware está atualizado?', 0, 0, 1),
(2, 8, 40, 'Solicitou documento e realizou upload na OS Digital?', 0, 0, 1),
(2, 8, 41, 'Preencheu corretamente a Ordem de Serviço Digital e coletou assinatura?', 0, 0, 1),
(2, 8, 42, 'Finalizou o atendimento no PDA e lançou os materiais utilizados?', 0, 0, 1),
(2, 8, 43, 'Informou os canais de Autoatendimento (Minha Claro, WhatsApp e Site)?', 0, 0, 1),
(2, 8, 44, 'Realizou a Autoinspeção?', 0, 0, 1),
(2, 9, 45, 'Informou sobre o TNPS e solicitou a avaliação?', 0, 0, 1),
(2, 9, 46, 'Explicou corretamente as notas do TNPS?', 0, 0, 1);

-- HFC Capacitação Items (certificacao_id = 3)
INSERT INTO itens (certificacao_id, grupo_id, ordem, descricao, critico, obrigatorio, ativo) VALUES 
(3, 10, 1, 'Atualizou o status no PDA (Rota para início)?', 0, 0, 1),
(3, 10, 2, 'Se apresentou ao cliente e verificou se ele recebeu a mensagem via aplicativo?', 0, 0, 1),
(3, 10, 3, 'Informou o código de segurança quando solicitado?', 0, 0, 1),
(3, 10, 4, 'Confirmou com o cliente os produtos a serem instalados antes de entrar na residência?', 0, 0, 1),
(3, 10, 5, 'Explicou ao cliente sobre a utilização do pro-pé?', 0, 0, 1),
(3, 10, 6, 'Confirmou com o cliente o local de instalação dos equipamentos?', 0, 0, 1),
(3, 10, 7, 'Combinou com o cliente a passagem do cabo e as paredes que seriam furadas?', 0, 0, 1),
(3, 10, 8, 'Realizou a APR e ativou o botão escada através do APP Técnico Nota 10 antes do trabalho em altura?', 0, 0, 1),
(3, 11, 9, 'Realizou corretamente a confecção dos conectores utilizando as ferramentas adequadas?', 1, 1, 1),
(3, 11, 10, 'Efetuou a medição de sinal (CA e CB)?', 0, 0, 1),
(3, 11, 11, 'Utilizou corretamente o anel de vedação?', 0, 0, 1),
(3, 11, 12, 'Identificou corretamente o cabo?', 0, 0, 1),
(3, 11, 13, 'Realizou corretamente a cintagem do poste e a amarração?', 1, 1, 1),
(3, 11, 14, 'Instalou corretamente o Cable Isolator?', 0, 0, 1),
(3, 11, 15, 'Aplicou corretamente o torque nas conexões do MDU, passivos e equipamentos?', 0, 0, 1),
(3, 11, 16, 'Explicou corretamente a importância do Mini Isolator?', 0, 0, 1),
(3, 11, 17, 'Executou corretamente a distribuição do sinal do cabo coaxial?', 0, 0, 1),
(3, 12, 18, 'Efetuou o reset de fábrica do decoder e realizou a configuration da base?', 0, 0, 1),
(3, 12, 19, 'Todos os pontos de TV ficaram com níveis de sinal dentro do padrão?', 0, 0, 1),
(3, 12, 20, 'Configurou e explicou a utilização do controle remoto?', 0, 0, 1),
(3, 12, 21, 'Retirou o bloqueio por idade e alterou a senha de compra?', 0, 0, 1),
(3, 12, 22, 'Configurou corretamente TV e Decoder (HDMI, resolução, formato e áudio)?', 1, 1, 1),
(3, 12, 23, 'Explicou o NOW demonstrando conteúdos gratuitos?', 0, 0, 1),
(3, 12, 24, 'Explicou os recursos de gravação?', 0, 0, 1),
(3, 12, 25, 'Demonstrou o Replay TV?', 0, 0, 1),
(3, 12, 26, 'Explicou a função Auto Hit?', 0, 0, 1),
(3, 12, 27, 'Explicou a função Autodesligar?', 0, 0, 1),
(3, 12, 28, 'Realizou o Valida Retorno?', 0, 0, 1),
(3, 12, 29, 'Apresentou o App Claro TV+ e explicou cadastro e acesso?', 0, 0, 1),
(3, 13, 30, 'Confeccionou corretamente o conector RJ45?', 1, 1, 1),
(3, 13, 31, 'Definiu corretamente o local do eMTA e analisou a potência do Wi-Fi?', 0, 0, 1),
(3, 13, 32, 'Acessou as propriedades do eMTA e explicou sobre senha forte?', 0, 0, 1),
(3, 13, 33, 'Configurou corretamente o Wi-Fi (Band Steering e redes 2.4 e 5 GHz)?', 1, 1, 1),
(3, 13, 34, 'Explicou sobre a rede IoT?', 0, 0, 1),
(3, 13, 35, 'Informou sobre compatibilidade dos dispositivos do cliente?', 0, 0, 1),
(3, 13, 36, 'Realizou teste de velocidade pelo Brasil Banda Larga/Speedtest?', 0, 0, 1),
(3, 13, 37, 'Verificou TX/RX/SNR pelo site niveis.virtua.com.br?', 0, 0, 1),
(3, 13, 38, 'Verificou TX/RX/SNR pela página interna do eMTA?', 0, 0, 1),
(3, 13, 39, 'Realizou teste de velocidade e cobertura Wi-Fi junto ao cliente?', 0, 0, 1),
(3, 14, 40, 'Realizou atendimento consultivo apresentando opções de contratação?', 0, 0, 1),
(3, 14, 41, 'Confeccionou corretamente os conectores telefônicos RJ11?', 0, 0, 1),
(3, 14, 42, 'Explicou os Serviços Inteligentes Claro Fone e Portabilidade?', 0, 0, 1),
(3, 14, 43, 'Confirmou o funcionamento do Claro Fone informando o número ao cliente?', 0, 0, 1),
(3, 15, 44, 'Confirmou que o firmware dos equipamentos está atualizado?', 0, 0, 1),
(3, 15, 45, 'Solicitou documento e realizou upload na OS Digital?', 0, 0, 1),
(3, 15, 46, 'Preencheu corretamente a Ordem de Serviço Digital e coletou a assinatura do cliente?', 0, 0, 1),
(3, 15, 47, 'Finalizou o atendimento no PDA e lançou corretamente os materiais?', 0, 0, 1),
(3, 15, 48, 'Informou sobre os canais de autoatendimento (Minha Claro, WhatsApp e Site)?', 0, 0, 1),
(3, 16, 49, 'Realizou a autoinspeção?', 0, 0, 1),
(3, 16, 50, 'Informou sobre o TNPS e solicitou a avaliação do cliente?', 0, 0, 1);

-- 7. Seed LGPD Config
INSERT INTO ia_lgpd_config (nome_chave, habilitado, descricao) VALUES 
('anonymize_images', 1, 'Habilita remoção automática de metadados EXIF/GPS das evidências antes de enviar para análise de IA.'),
('hide_personal_data', 1, 'Restringe rigorosamente o envio de CPF, matrícula, nome ou qualquer dado pessoal do técnico/cliente para o provedor de IA.'),
('audit_link_active', 1, 'Garante o registro de hash e identificador único de usuário internamente para auditorias de conformidade com a LGPD.');

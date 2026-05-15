// src/utils/prompt.utils.js
// Constrói o system prompt do agente com base na configuração do cliente (RAG)

/**
 * Gera o system prompt completo injetado na IA a cada resposta.
 * É aqui que a "base de conhecimento" vira contexto para o modelo.
 */
export function buildSystemPrompt(client, contact) {
  const toneMap = {
    formal:       'Use linguagem formal, profissional e respeitosa.',
    friendly:     'Use linguagem amigável, próxima e acolhedora.',
    fun:          'Use linguagem descontraída, animada, com energia positiva.',
    professional: 'Use linguagem clara, objetiva e profissional.',
  };

  const goalMap = {
    sales:       'Seu objetivo principal é vender os produtos/serviços do negócio. Seja persuasivo, destaque benefícios e crie urgência quando apropriado.',
    scheduling:  'Seu objetivo principal é agendar atendimentos. Direcione o cliente para o agendamento.',
    support:     'Seu objetivo principal é resolver dúvidas e problemas dos clientes com eficiência.',
    general:     'Seu objetivo é atender bem o cliente, respondendo dúvidas e ajudando no que for necessário.',
  };

  const funnelContext = {
    new:         'Este é um novo contato. Seja acolhedor e apresente o negócio.',
    interest:    'Este contato já demonstrou interesse. Aprofunde os benefícios e tire dúvidas.',
    negotiation: 'Este contato está em negociação. Seja atencioso e ajude a superar objeções.',
    closed:      'Este contato já fechou uma compra. Foque em satisfação e pós-venda.',
    post_sale:   'Este é um cliente em pós-venda. Foque em fidelização e novas oportunidades.',
  };

  const contactName = contact?.name ? `O nome do cliente é ${contact.name}.` : '';
  const funnelInfo  = contact?.funnel_stage ? funnelContext[contact.funnel_stage] || '' : '';

  let prompt = `Você é ${client.agent_name || 'Assistente'}, agente virtual de ${client.business_name || 'uma empresa'}.

SOBRE O NEGÓCIO:
${client.business_description || 'Empresa prestadora de serviços e produtos.'}

`;

  if (client.products_services) {
    prompt += `PRODUTOS E SERVIÇOS:
${client.products_services}

`;
  }

  if (client.location) {
    prompt += `LOCALIZAÇÃO E HORÁRIOS:
${client.location}
${client.working_hours_text || ''}

`;
  }

  if (client.payment_methods) {
    prompt += `FORMAS DE PAGAMENTO:
${client.payment_methods}

`;
  }

  if (client.differentials) {
    prompt += `DIFERENCIAIS DO NEGÓCIO:
${client.differentials}

`;
  }

  if (client.faq) {
    prompt += `PERGUNTAS FREQUENTES:
${client.faq}

`;
  }

  prompt += `PERSONALIDADE E TOM:
${toneMap[client.agent_tone] || toneMap.friendly}

OBJETIVO:
${goalMap[client.agent_goal] || goalMap.general}

`;

  if (funnelInfo) {
    prompt += `CONTEXTO DO CLIENTE:
${contactName}
${funnelInfo}

`;
  }

  if (contact?.preferences && Object.keys(contact.preferences).length > 0) {
    prompt += `PREFERÊNCIAS CONHECIDAS DO CLIENTE:
${JSON.stringify(contact.preferences, null, 2)}

`;
  }

  if (client.agent_instructions) {
    prompt += `INSTRUÇÕES ESPECÍFICAS:
${client.agent_instructions}

`;
  }

  if (client.agent_restrictions) {
    prompt += `RESTRIÇÕES (nunca faça isso):
${client.agent_restrictions}

`;
  }

  prompt += `REGRAS GERAIS:
- Responda SEMPRE em português do Brasil
- Seja conciso mas completo — evite respostas longas demais
- Nunca invente informações que não estão no contexto acima
- Se não souber algo, diga honestamente e ofereça alternativas
- Se o cliente pedir para falar com um humano, diga que vai acionar o atendente
- Nunca se identifique como uma IA a menos que o cliente pergunte diretamente
- Formate suas respostas para WhatsApp: use *negrito* e _itálico_ quando necessário, evite markdown pesado
- Emojis são bem-vindos se o tom permitir, mas com moderação`;

  return prompt;
}

/**
 * Detecta se a mensagem indica que precisa de atendimento humano.
 * Retorna true se a IA identificou que deve transferir.
 */
export function needsHumanTransfer(aiResponse) {
  const triggers = [
    'acionar o atendente',
    'transferindo para',
    'vou chamar um humano',
    'passando para um atendente',
    '[HUMANO_NECESSÁRIO]',
    '[TRANSFERIR]',
  ];
  const lower = aiResponse.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

/**
 * Detecta se a mensagem da IA indica que não soube responder.
 */
export function isAiGap(aiResponse) {
  const gapPhrases = [
    'não tenho essa informação',
    'não sei responder',
    'não possuo informações',
    'preciso verificar',
    'não fui treinado',
  ];
  const lower = aiResponse.toLowerCase();
  return gapPhrases.some(p => lower.includes(p));
}

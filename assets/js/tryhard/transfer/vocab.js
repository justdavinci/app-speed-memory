// Vocabulário das cenas.
//
// Tudo em português e tudo curto: o exercício mede percepção, não leitura.
// Os conjuntos são grandes o bastante para que dois blocos seguidos não
// pareçam o mesmo material, e estão separados por domínio para que uma família
// não empreste palavras de outra sem querer.

export const PRODUCTS = [
  'Arroz', 'Feijão', 'Café', 'Açúcar', 'Farinha', 'Óleo', 'Leite', 'Queijo',
  'Presunto', 'Manteiga', 'Iogurte', 'Suco', 'Água', 'Pão', 'Bolacha',
  'Macarrão', 'Molho', 'Atum', 'Sabão', 'Detergente', 'Papel', 'Esponja',
];

export const PEOPLE = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor',
  'Íris', 'João', 'Kelly', 'Lucas', 'Marina', 'Nuno', 'Olga', 'Paulo',
  'Rafa', 'Sofia', 'Tiago', 'Vera',
];

export const CITIES = [
  'Recife', 'Salvador', 'Curitiba', 'Manaus', 'Belém', 'Natal', 'Goiânia',
  'Vitória', 'Maceió', 'Fortaleza', 'Santos', 'Sorocaba', 'Uberaba', 'Bauru',
];

export const STATIONS = [
  'Praça', 'Mercado', 'Estádio', 'Museu', 'Parque', 'Terminal', 'Aeroporto',
  'Hospital', 'Faculdade', 'Porto', 'Feira', 'Bosque', 'Marina', 'Fórum',
];

export const OBJECTS = [
  'Caneca', 'Chave', 'Livro', 'Óculos', 'Relógio', 'Carteira', 'Fone',
  'Tesoura', 'Grampo', 'Pilha', 'Régua', 'Lápis', 'Bilhete', 'Cabo',
  'Moeda', 'Crachá', 'Vela', 'Frasco',
];

export const APP_ITEMS = [
  'Mensagens', 'Pedidos', 'Alertas', 'Relatórios', 'Contatos', 'Faturas',
  'Estoque', 'Rotas', 'Chamados', 'Arquivos', 'Backups', 'Convites',
  'Assinaturas', 'Downloads',
];

export const STATUSES = ['ativo', 'pausado', 'atrasado', 'concluído', 'pendente', 'cancelado'];
export const SHORT_STATES = ['ligado', 'desligado', 'aberto', 'fechado', 'cheio', 'vazio'];
export const PRIORITIES = ['baixa', 'média', 'alta', 'urgente'];
export const COLOR_NAMES = ['azul', 'verde', 'vermelho', 'amarelo', 'roxo', 'laranja'];

export const COLORS = {
  azul: '#3b82f6',
  verde: '#22c55e',
  vermelho: '#ef4444',
  amarelo: '#eab308',
  roxo: '#a855f7',
  laranja: '#f97316',
};

export const SECTIONS = ['Mercearia', 'Frios', 'Limpeza', 'Bebidas', 'Padaria', 'Higiene'];
export const DEPARTMENTS = ['Vendas', 'Suporte', 'Logística', 'Financeiro', 'Compras', 'Oficina'];
export const UNITS = ['kg', 'un', 'L', 'cx', 'pct'];

/** Paletas de apresentação, para o mesmo modelo nunca parecer o mesmo. */
export const PALETTES = ['claro', 'contraste', 'quente', 'frio'];

export function money(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function timeLabel(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function dateLabel(day, month) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function code(rng, length = 5) {
  const chars = 'ABCDEFGHJKLMNPRSTUVXZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(rng() * chars.length)];
  return out;
}

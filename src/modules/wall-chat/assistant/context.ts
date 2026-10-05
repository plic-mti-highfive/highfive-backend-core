/**
 * Contextualisation de l'assistant : choix de l'historique envoye au LLM.
 * Fonctions pures, sans I/O, pour etre testees sans base ni reseau.
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Estimation volontairement simple (~4 caracteres par token, plus une
 * surcharge fixe par message pour le role et les delimiteurs). Suffisante
 * pour tenir un budget ; un vrai tokenizer ajouterait une dependance pour
 * un gain de precision sans enjeu ici.
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 4) + 4;

export interface TruncationResult<T> {
  kept: T[];
  dropped: number;
}

/**
 * Garde les messages les plus recents, entiers, tant que le budget le permet.
 *
 * - on part du plus recent et on remonte ; on s'arrete au premier message qui
 *   ne rentre plus, pour que l'historique garde reste contigu (sauter un
 *   message trop long pour reprendre plus haut trouerait la conversation) ;
 * - un message n'est jamais coupe en deux ;
 * - le plus recent est toujours garde, meme s'il depasse a lui seul le
 *   budget : c'est celui auquel il faut repondre.
 *
 * `messages` est en ordre chronologique, et `kept` l'est aussi.
 */
export function truncateHistory<T extends { content: string }>(
  messages: T[],
  budgetTokens: number,
  maxMessages = Number.POSITIVE_INFINITY,
): TruncationResult<T> {
  const kept: T[] = [];
  let used = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content);
    const isNewest = kept.length === 0;
    if (!isNewest && (used + cost > budgetTokens || kept.length >= maxMessages))
      break;
    kept.unshift(messages[i]);
    used += cost;
  }

  return { kept, dropped: messages.length - kept.length };
}

export interface ProjectContext {
  title: string;
  description?: string;
}

export interface HistoryMessage {
  /** Nom affiche de l'auteur (pour que le modele distingue les personnes). */
  authorName: string;
  isAssistant: boolean;
  body: string;
}

const MAX_DESCRIPTION_CHARS = 600;

export const buildSystemPrompt = (project?: ProjectContext): string => {
  const lines = [
    "Tu es l'assistant IA de HighFive!, une plateforme de projets collaboratifs.",
    "Tu participes a la discussion de l'equipe d'un projet. Reponds en francais, en tutoyant, de facon concise et utile, sans emoji.",
    "Les messages des membres sont prefixes par leur nom. Appuie-toi sur l'historique fourni ; si tu ne sais pas, dis-le.",
  ];
  if (project) {
    lines.push('', `Projet : ${project.title}`);
    const description = project.description?.trim();
    if (description) {
      lines.push(
        `Description : ${
          description.length > MAX_DESCRIPTION_CHARS
            ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}...`
            : description
        }`,
      );
    }
  }
  return lines.join('\n');
};

export interface BuiltContext {
  turns: ChatTurn[];
  /** Messages d'historique effectivement envoyes (hors prompt systeme). */
  messageCount: number;
  droppedCount: number;
}

/**
 * Assemble le prompt : systeme (+ contexte projet), puis l'historique tronque
 * au budget restant une fois le prompt systeme deduit.
 */
export function buildContext(
  history: HistoryMessage[],
  options: {
    project?: ProjectContext;
    budgetTokens: number;
    maxMessages?: number;
  },
): BuiltContext {
  const system = buildSystemPrompt(options.project);
  const remaining = Math.max(0, options.budgetTokens - estimateTokens(system));

  const turns: ChatTurn[] = history.map((message) => ({
    role: message.isAssistant ? 'assistant' : 'user',
    content: message.isAssistant
      ? message.body
      : `${message.authorName} : ${message.body}`,
  }));

  const { kept, dropped } = truncateHistory(
    turns,
    remaining,
    options.maxMessages,
  );
  return {
    turns: [{ role: 'system', content: system }, ...kept],
    messageCount: kept.length,
    droppedCount: dropped,
  };
}

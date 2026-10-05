/**
 * Contrat partage avec le service canvas (`highfive-backend-canvas`).
 *
 * Ces types etaient jusqu'ici dans le paquet `@plic-mti-highfive/shared-types`,
 * supprime : un paquet publie pour trois interfaces obligeait a publier une
 * version a chaque changement de forme, des deux cotes, pour un couplage qui
 * ne concerne que deux fichiers. Ils sont desormais declares ici et la, a
 * l'identique — toute modification doit etre faite dans les deux depots.
 */

/** Jeton d'acces au document Hocuspocus, emis par le core, verifie par le canvas. */
export interface CanvasTokenPayload {
  userId: string;
  projectId: string;
  /**
   * Identifiant du document cote Hocuspocus. Distinct du projet : le canvas
   * valide le jeton contre le nom du document demande.
   */
  canvasId: string;
  role: 'admin' | 'editor' | 'viewer';
}

/** Nature semantique d'un element du Mur, apres traduction des shapes tldraw. */
export type CanvasElementKind = 'note' | 'text' | 'shape' | 'arrow' | 'drawing';

export interface CanvasElement {
  id: string;
  kind: CanvasElementKind;
  /** Texte porte par l'element (contenu d'un post-it, label d'une forme...). */
  text: string;
  /** Pour `shape` : rectangle, ellipse, diamond... */
  geo?: string;
  /** Pour `arrow` : texte des elements relies, quand la fleche est liee. */
  from?: string;
  to?: string;
}

export interface CanvasChatMessage {
  id: string;
  text: string;
  authorId: string;
  timestamp: number;
  /** Vrai pour une reponse de l'assistant IA injectee par le core. */
  isAssistant?: boolean;
}

/**
 * Message de chat publie par le canvas sur la file BullMQ `canvas_events`
 * (job `canvas_chat_message`). L'`id` est celui du message dans le Y.Doc.
 */
export interface CanvasChatJobData {
  id: string;
  text: string;
  authorId: string;
  canvasId: string;
  timestamp: number;
}

/**
 * Corps de `POST {CANVAS_URL}/canvas/:canvasId/chat` (interne, en-tete
 * `X-Internal-Secret`) : le core y renvoie la reponse de l'assistant pour
 * qu'elle rejoigne le chat du Y.Doc et soit diffusee aux clients connectes.
 * `id` rend l'injection idempotente.
 */
export interface CanvasAssistantChatInput {
  id: string;
  text: string;
  authorId: string;
  timestamp: number;
  isAssistant: true;
}

/**
 * Vue semantique d'un Mur, produite par le service canvas. Ni coordonnees ni
 * style : seul le sens est utile ici.
 */
export interface CanvasExport {
  canvasId: string;
  elements: CanvasElement[];
  chat: CanvasChatMessage[];
  /** Les traces au stylo n'ont pas de texte : on n'en garde que le volume. */
  drawingCount: number;
}

/** Tache proposee a partir du Mur. Rien n'est persiste avant acceptation. */
export interface ProposedTask {
  title: string;
  description: string;
  /** Elements du Mur qui ont motive la tache, pour que l'on puisse juger. */
  sourceHints: string[];
}

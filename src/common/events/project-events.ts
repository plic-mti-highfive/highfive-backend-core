/**
 * Evenements emis par les domaines Projets et Equipe, pour les domaines qui
 * en derivent un etat (aujourd'hui : le canal de projet, R-MSG3).
 *
 * Un evenement plutot qu'un appel direct : la messagerie depend deja des
 * projets (droits de lecture des pieces jointes), l'inverse fermerait une
 * boucle entre modules. Les emetteurs utilisent `emitAsync` : l'ecoute est
 * terminee quand la requete repond, et une ecoute en echec est journalisee
 * sans faire echouer l'action qui l'a declenchee.
 */

/** L'equipe a peut-etre change : arrivee, depart, exclusion, blocage... */
export const PROJECT_TEAM_CHANGED = 'project.team-changed';

/** Le projet est supprime (R-X3) : ce qui en derive disparait avec lui. */
export const PROJECT_DELETED = 'project.deleted';

export interface ProjectEvent {
  projectId: string;
}

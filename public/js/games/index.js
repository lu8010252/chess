import * as gomoku from './gomoku.js';
import * as xiangqi from './xiangqi.js';
import * as junqi from './junqi.js';
import * as chess from './chess.js';
import * as go from './go.js';
import * as checkers from './checkers.js';
import * as aeroplane from './aeroplane.js';

export const GAMES = [gomoku, xiangqi, junqi, chess, go, checkers, aeroplane];

export function getGame(id) {
  return GAMES.find(g => g.meta.id === id) || null;
}

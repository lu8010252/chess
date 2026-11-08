import * as gomoku from './gomoku.js';
import * as xiangqi from './xiangqi.js';
import * as junqi from './junqi.js';
import * as chess from './chess.js';
import * as go from './go.js';
import * as checkers from './checkers.js';
import * as g2048 from './g2048.js';
import * as klotski from './klotski.js';
import * as slide from './slide.js';

export const GAMES = [gomoku, xiangqi, junqi, chess, go, checkers, g2048, klotski, slide];

export function getGame(id) {
  return GAMES.find(g => g.meta.id === id) || null;
}

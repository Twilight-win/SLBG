/** 游戏注册表：新游戏只要在这里登记一行即可出现在游戏中心。 */

import rush from './rush.js';
import hold from './hold.js';
import trainer from './trainer.js';
import memory from './memory.js';
import puzzle from './puzzle.js';
import quest from './quest.js';

export const games = [rush, hold, trainer, memory, puzzle, quest];

export const gameById = Object.fromEntries(games.map((g) => [g.id, g]));

export const KIND_LABEL = {
  ai: 'AI 判定',
  knowledge: '知识挑战',
  train: '深度学习',
  collect: '数据共创',
};

export const KIND_COLOR = {
  ai: 'ai',
  knowledge: 'know',
  train: 'train',
  collect: 'collect',
};

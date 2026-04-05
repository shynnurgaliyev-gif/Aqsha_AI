import type { FastifyBaseLogger } from 'fastify';
import type { DbPool } from '@aqsha-ai/database';
import { matchGoalCommand } from './goal-command-matcher';
import {
  createGoal,
  findGoalByName,
  addSavingsToGoal,
  listGoals,
  deleteGoal,
} from './goal-repository';
import {
  formatGoalCreated,
  formatSavingsAdded,
  formatGoalProgress,
  formatGoalList,
  formatGoalDeleted,
  GOAL_NOT_FOUND,
  GOAL_ALREADY_EXISTS,
} from './goal-formatter';

/**
 * Handles savings goal commands.
 * Returns a response string if the text matched, or null to pass through.
 *
 * Supported commands:
 *   create      — "коплю на iPhone 500000" / "цель iPhone 500000"
 *   add_savings — "отложил на iPhone 50000" / "пополнил iPhone 50000"
 *   list        — "цели" / "мои цели"
 *   show        — "цель iPhone"
 *   delete      — "удали цель iPhone"
 */
export async function handleGoalCommand(
  text: string,
  userId: string,
  db: DbPool,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  const command = matchGoalCommand(text);
  if (!command) return null;

  if (command.type === 'list') {
    const goals = await listGoals(db, userId);
    logger.info({ userId, count: goals.length }, 'Goal list requested');
    return formatGoalList(goals);
  }

  if (command.type === 'create') {
    const result = await createGoal(db, userId, command.name, command.targetAmount);
    if (result === 'already_exists') {
      logger.info({ userId, name: command.name }, 'Goal already exists');
      return GOAL_ALREADY_EXISTS;
    }
    logger.info({ userId, name: result.name, targetAmount: result.targetAmount }, 'Goal created');
    return formatGoalCreated(result);
  }

  if (command.type === 'add_savings') {
    const goal = await findGoalByName(db, userId, command.nameQuery);
    if (!goal) {
      logger.info({ userId, nameQuery: command.nameQuery }, 'Goal not found for add_savings');
      return GOAL_NOT_FOUND;
    }
    const updated = await addSavingsToGoal(db, goal.id, userId, command.amount);
    logger.info({ userId, goalId: goal.id, amount: command.amount }, 'Savings added to goal');
    return formatSavingsAdded(updated, command.amount);
  }

  if (command.type === 'show') {
    const goal = await findGoalByName(db, userId, command.nameQuery);
    if (!goal) {
      logger.info({ userId, nameQuery: command.nameQuery }, 'Goal not found for show');
      return GOAL_NOT_FOUND;
    }
    return formatGoalProgress(goal);
  }

  if (command.type === 'delete') {
    const goal = await findGoalByName(db, userId, command.nameQuery);
    if (!goal) {
      logger.info({ userId, nameQuery: command.nameQuery }, 'Goal not found for delete');
      return GOAL_NOT_FOUND;
    }
    await deleteGoal(db, userId, goal.id);
    logger.info({ userId, goalId: goal.id }, 'Goal deleted');
    return formatGoalDeleted(goal.name);
  }

  return null;
}

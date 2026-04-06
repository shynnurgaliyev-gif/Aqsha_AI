export const RESET_CONFIRM_PROMPT =
  `⚠️ Вы собираетесь удалить ВСЕ доходы и расходы.\n\n` +
  `Это действие нельзя отменить.\n\n` +
  `Для подтверждения напишите:\n` +
  `УДАЛИТЬ`;

export const RESET_CANCELLED =
  `❌ Отменено. Ваши данные в безопасности.`;

export function RESET_SUCCESS(count: number): string {
  return (
    `✅ Готово! Удалено записей: ${count}.\n\n` +
    `История очищена. Можете начинать с чистого листа 🚀`
  );
}

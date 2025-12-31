-- Очистка активных звонков
-- Этот скрипт помечает все активные звонки как неактивные
-- и всех активных участников звонков как неактивных

-- Шаг 1: Помечаем все активные звонки как неактивные
UPDATE calls
SET is_active = FALSE, end_time = NOW()
WHERE is_active = TRUE;

-- Шаг 2: Помечаем всех активных участников звонков как неактивных
UPDATE call_participants
SET is_active = FALSE, leave_time = COALESCE(leave_time, NOW())
WHERE is_active = TRUE;

-- Шаг 3: Выводим информацию о количестве очищенных звонков
SELECT 'Очищено ' || COUNT(*) || ' активных звонков' AS result
FROM calls
WHERE end_time = NOW();

-- Шаг 4: Проверяем, что все звонки неактивны
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM calls WHERE is_active = TRUE)
        THEN 'ОШИБКА: Остались активные звонки!'
        ELSE 'Успешно: Все звонки неактивны'
    END AS status;

-- Шаг 5: Проверяем, что все участники звонков неактивны
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM call_participants WHERE is_active = TRUE)
        THEN 'ОШИБКА: Остались активные участники звонков!'
        ELSE 'Успешно: Все участники звонков неактивны'
    END AS status;
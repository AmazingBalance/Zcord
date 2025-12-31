package main

import (
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

// initLogging инициализирует систему логирования
func initLogging() {
	// Настраиваем логирование в файл
	logFile, err := os.OpenFile("golang.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("Error opening log file: %v", err)
	} else {
		log.SetOutput(logFile)
	}
	
	log.Println("Logging initialized")
	
	// Инициализируем логирование звонков
	if os.Getenv("ENABLE_CALL_LOGGING_SQL") == "1" {
		if err := InitCallLogging(); err != nil {
			log.Printf("Warning: Call logging initialization failed: %v", err)
		}
	} else {
		log.Println("Call logging SQL patch disabled (set ENABLE_CALL_LOGGING_SQL=1 to enable)")
	}
}

// InitCallLogging инициализирует систему логирования звонков
func InitCallLogging() error {
	log.Println("Initializing call logging system...")

	// Путь к SQL-файлу с исправлением
	sqlFilePath := filepath.Join(".", "fix_call_type_change.sql")

	// Читаем содержимое SQL-файла
	sqlBytes, err := ioutil.ReadFile(sqlFilePath)
	if err != nil {
		log.Printf("Error reading SQL file: %v", err)
		return err
	}

	sqlContent := string(sqlBytes)

	// Выполняем SQL-скрипт
	_, err = db.Exec(sqlContent)
	if err != nil {
		log.Printf("Error executing SQL script: %v", err)
		return err
	}

	log.Println("Call logging system initialized successfully")
	return nil
}

// LogWebRTC логирует сообщения, связанные с WebRTC, с префиксом
func logWebRTC(format string, v ...interface{}) {
	log.Printf("[WebRTC] "+format, v...)
}

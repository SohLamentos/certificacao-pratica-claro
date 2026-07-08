export enum LogLevel {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  AUDITORIA = "AUDITORIA"
}

export class Logger {
  static log(level: LogLevel, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const logObj = {
      timestamp,
      level,
      message,
      ...(meta ? { meta } : {})
    };

    const logStr = JSON.stringify(logObj);
    if (level === LogLevel.ERROR) {
      console.error(logStr);
    } else if (level === LogLevel.WARNING) {
      console.warn(logStr);
    } else {
      // console.info is used instead of console.log to ensure production-safe logs
      console.info(logStr);
    }
  }

  static info(message: string, meta?: any) {
    this.log(LogLevel.INFO, message, meta);
  }

  static warn(message: string, meta?: any) {
    this.log(LogLevel.WARNING, message, meta);
  }

  static error(message: string, meta?: any) {
    this.log(LogLevel.ERROR, message, meta);
  }

  static auditoria(message: string, meta?: any) {
    this.log(LogLevel.AUDITORIA, message, meta);
  }
}

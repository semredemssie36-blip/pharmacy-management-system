const format = (level, message, meta) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  return JSON.stringify(entry);
};

const logger = {
  info(message, meta) {
    console.log(format('info', message, meta));
  },
  warn(message, meta) {
    console.warn(format('warn', message, meta));
  },
  error(message, meta) {
    console.error(format('error', message, meta));
  },
};

export default logger;

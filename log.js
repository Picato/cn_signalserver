var logger = require('winston');

////loggly system
//var Loggly = require('winston-loggly').Loggly;
//var loggly_options={ subdomain: "mysubdomain", inputToken: "efake000-000d-000e-a000-xfakee000a00" }
//logger.add(Loggly, loggly_options);

//level & color
//logger.setLevels({ debug:0, info: 1, silly:2, warn: 3, error:4,});
logger.addColors({
  debug: 'green',
  info:  'cyan',
  silly: 'magenta',
  warn:  'yellow',
  error: 'red'
});

//transport - color console
logger.remove(logger.transports.Console);
//logger.add(logger.transports.Console, { level: 'debug', colorize:true });

//transport - file
logger.add(logger.transports.File, { filename: "conek_signal.log" });

module.exports = logger;

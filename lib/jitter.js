(function() {
  /*
    Jitter, a CoffeeScript compilation utility

    The latest version and documentation, can be found at:
    http://github.com/TrevorBurnham/Jitter

    Copyright (c) 2010 Trevor Burnham
    http://iterative.ly

    Based on command.coffee by Jeremy Ashkenas
    http://jashkenas.github.com/coffee-script/documentation/docs/command.html

    Growl notification code contributed by Andrey Tarantsov
    http://www.tarantsov.com/

    Permission is hereby granted, free of charge, to any person
    obtaining a copy of this software and associated documentation
    files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use,
    copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    OTHER DEALINGS IN THE SOFTWARE.
  */  var BANNER, CoffeeScript, baseSource, baseTarget, baseTest, compile, compileScript, compileScripts, die, exec, fs, isWatched, notifyGrowl, optionParser, options, optparse, parseOptions, path, print, puts, q, readScript, rootCompile, runTests, testFiles, usage, watchScript, writeJS, _ref;
  var __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  };
  fs = require('fs');
  path = require('path');
  optparse = require('./optparse');
  CoffeeScript = require('coffee-script');
  exec = require('child_process').exec;
  _ref = require('sys'), puts = _ref.puts, print = _ref.print;
  q = require('sink').q;
  BANNER = 'Jitter takes a directory of *.coffee files and recursively compiles\nthem to *.js files, preserving the original directory structure.\n\nJitter also watches for changes and automatically recompiles as\nneeded. It even detects new files, unlike the coffee utility.\n\nIf passed a test directory, it will run each test through node on\neach change.\n\nUsage:\n  jitter coffee-path js-path [test-path]';
  options = {};
  baseSource = baseTarget = baseTest = '';
  optionParser = null;
  isWatched = {};
  testFiles = [];
  exports.run = function() {
    options = parseOptions();
    if (!baseTarget) {
      return usage();
    }
    return compileScripts(options);
  };
  compileScripts = function(options) {
    var dir, dirs, name;
    dirs = {
      Source: baseSource,
      Target: baseTarget
    };
    if (baseTest) {
      dirs.Test = baseTest;
    }
    for (name in dirs) {
      dir = dirs[name];
      q(path.exists, dir, function(exists) {
        if (!exists) {
          return die("" + name + " directory '" + dir + "' does not exist.");
        } else if (!fs.statSync(dir).isDirectory()) {
          return die("" + name + " '" + dir + "' is a file; Jitter needs a directory.");
        }
      });
    }
    q(function() {
      return rootCompile(options);
    });
    q(runTests);
    return q(function() {
      puts('Watching for changes and new files. Press Ctrl+C to stop.');
      return setInterval(function() {
        return rootCompile(options);
      }, 500);
    });
  };
  compile = function(source, target, options) {
    var item, sourcePath, _i, _len, _ref, _results;
    _ref = fs.readdirSync(source);
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      item = _ref[_i];
      sourcePath = "" + source + "/" + item;
      if (item.indexOf(".#") === 0) {
        continue;
      }
      if (isWatched[sourcePath]) {
        continue;
      }
      _results.push(path.extname(sourcePath) === '.coffee' ? readScript(sourcePath, target, options) : fs.statSync(sourcePath).isDirectory() ? compile(sourcePath, target, options) : void 0);
    }
    return _results;
  };
  rootCompile = function(options) {
    compile(baseSource, baseTarget, options);
    if (baseTest) {
      return compile(baseTest, baseTest, options);
    }
  };
  readScript = function(source, target, options) {
    compileScript(source, target, options);
    puts('Compiled ' + source);
    return watchScript(source, target, options);
  };
  watchScript = function(source, target, options) {
    isWatched[source] = true;
    return fs.watchFile(source, {
      persistent: true,
      interval: 250
    }, function(curr, prev) {
      if (curr.mtime.getTime() === prev.mtime.getTime()) {
        return;
      }
      compileScript(source, target, options);
      puts('Recompiled ' + source);
      return q(runTests);
    });
  };
  compileScript = function(source, target, options) {
    var code, js;
    try {
      code = fs.readFileSync(source).toString();
      js = CoffeeScript.compile(code, {
        source: source,
        bare: options != null ? options.bare : void 0
      });
      return writeJS(source, js, target);
    } catch (err) {
      puts(err.message);
      return notifyGrowl(source, err.message);
    }
  };
  writeJS = function(source, js, target) {
    var base, dir, filename, jsPath;
    base = target === baseTest ? baseTest : baseSource;
    filename = path.basename(source, path.extname(source)) + '.js';
    dir = target + path.dirname(source).substring(base.length);
    jsPath = path.join(dir, filename);
    return q(exec, "mkdir -p " + dir, function() {
      fs.writeFileSync(jsPath, js);
      if (target === baseTest && __indexOf.call(testFiles, jsPath) < 0) {
        return testFiles.push(jsPath);
      }
    });
  };
  notifyGrowl = function(source, errMessage) {
    var args, basename, m, message;
    basename = source.replace(/^.*[\/\\]/, '');
    if (m = errMessage.match(/Parse error on line (\d+)/)) {
      message = "Parse error in " + basename + "\non line " + m[1] + ".";
    } else {
      message = "Error in " + basename + ".";
    }
    args = ['growlnotify', '-n', 'CoffeeScript', '-p', '2', '-t', "\"Compilation failed\"", '-m', "\"" + message + "\""];
    return exec(args.join(' '));
  };
  runTests = function() {
    var test, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = testFiles.length; _i < _len; _i++) {
      test = testFiles[_i];
      puts("running " + test);
      _results.push(exec("node " + test, function(error, stdout, stderr) {
        print(stdout);
        print(stderr);
        if (stderr) {
          return notifyGrowl(test, stderr);
        }
      }));
    }
    return _results;
  };
  parseOptions = function() {
    var arg, _ref;
    optionParser = new optparse.OptionParser([['-b', '--bare', 'compile without the top-level function wrapper']], BANNER);
    options = optionParser.parse(process.argv);
    _ref = (function() {
      var _results;
      _results = [];
      for (arg = 2; arg <= 4; arg++) {
        _results.push(options.arguments[arg] || '');
      }
      return _results;
    })(), baseSource = _ref[0], baseTarget = _ref[1], baseTest = _ref[2];
    if (/\/$/.test(baseSource)) {
      baseSource = baseSource.substr(0, baseSource.length - 1);
    }
    if (/\/$/.test(baseTarget)) {
      baseTarget = baseTarget.substr(0, baseTarget.length - 1);
    }
    return options;
  };
  usage = function() {
    puts(optionParser.help());
    return process.exit(0);
  };
  die = function(message) {
    puts(message);
    return process.exit(1);
  };
}).call(this);
